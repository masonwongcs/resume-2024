'use client';

import './CurvedLoop.scss';

import {
  type FC,
  type MutableRefObject,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

interface CurvedLoopProps {
  marqueeText?: string;
  speed?: number;
  className?: string;
  curveAmount?: number;
  direction?: 'left' | 'right';
  interactive?: boolean;
  /** When true, freezes at the current offset (used to hold "Hi" through the intro) */
  paused?: boolean;
  /** Fired on tap/click when the pointer did not drag the marquee */
  onTap?: () => void;
  /** Persists offset/spacing across remounts (e.g. grid ↔ focus portal handoff) */
  persistedState?: MutableRefObject<MarqueePersistedState>;
  /**
   * Font size in SVG user units (viewBox space). Scales with the SVG, so grid ↔ focus
   * portal keeps the same relative size. Prefer this over CSS rem/vw/cqw.
   */
  fontSize?: number;
}

export type MarqueePersistedState = {
  offset: number;
  direction: 'left' | 'right';
  spacing: number;
  initialized: boolean;
};

/**
 * Word-level layout of one marquee cycle, measured once. The textPath only ever holds
 * the words covering the visible curve — re-laying out every glyph of every copy on
 * each startOffset change cost ~7ms/frame for ~2% visible text.
 */
type MarqueeWindowLayout = {
  /** Words with their trailing space — cut points stay on whitespace so shaping/bidi are unchanged */
  tokens: string[];
  /** Distance from the cycle start to each token, in SVG user units */
  starts: number[];
  widths: number[];
  pathLength: number;
};

const measureWindowLayout = (
  measureEl: SVGTextElement,
  pathEl: SVGPathElement,
  text: string
): MarqueeWindowLayout | null => {
  const tokens = text.match(/[^\s\u00A0]+[\s\u00A0]*|[\s\u00A0]+/g);
  if (!tokens?.length) return null;
  const starts: number[] = [];
  const widths: number[] = [];
  let charIndex = 0;
  let prevEnd = 0;
  try {
    for (const token of tokens) {
      const end = measureEl.getSubStringLength(0, charIndex + token.length);
      starts.push(prevEnd);
      widths.push(end - prevEnd);
      prevEnd = end;
      charIndex += token.length;
    }
  } catch {
    return null;
  }
  const pathLength = pathEl.getTotalLength();
  if (!(pathLength > 0) || !(prevEnd > 0)) return null;
  return { tokens, starts, widths, pathLength };
};

/** Index of the token under cycle distance `d` (0 ≤ d < spacing) */
const tokenIndexAt = (starts: number[], d: number) => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

const DRAG_THRESHOLD_PX = 6;
/** Touch: cancel tap sooner than marquee scrub so a canvas pan doesn't open focus. */
const TOUCH_TAP_CANCEL_PX = 8;
/** Touch needs more slop before the marquee claims the gesture as a scrub. */
const TOUCH_DRAG_THRESHOLD_PX = 14;

const CurvedLoop: FC<CurvedLoopProps> = ({
  marqueeText = '',
  speed = 2,
  className,
  curveAmount = 400,
  direction = 'left',
  interactive = true,
  paused = false,
  onTap,
  persistedState,
  fontSize = 96
}) => {
  const text = useMemo(() => {
    const hasTrailing = /\s|\u00A0$/.test(marqueeText);
    return (hasTrailing ? marqueeText.replace(/\s+$/, '') : marqueeText) + '\u00A0';
  }, [marqueeText]);

  const measureRef = useRef<SVGTextElement | null>(null);
  const textPathRef = useRef<SVGTextPathElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const windowLayoutRef = useRef<MarqueeWindowLayout | null>(null);
  /** First token currently in the textPath — content only changes when this does */
  const windowStartRef = useRef(-1);
  const textRef = useRef(text);
  textRef.current = text;
  const [spacing, setSpacing] = useState(() => {
    const saved = persistedState?.current;
    return saved?.initialized && saved.spacing > 0 ? saved.spacing : 0;
  });
  const [dragging, setDragging] = useState(false);
  const uid = useId();
  const pathId = `curve-${uid}`;
  const pathD = `M-100,40 Q500,${40 + curveAmount} 1540,40`;

  const dragRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const didDragRef = useRef(false);
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const lastXRef = useRef(0);
  const lastTsRef = useRef(0);
  const dirRef = useRef<'left' | 'right'>(persistedState?.current.direction ?? direction);
  const velRef = useRef(0);
  const offsetRef = useRef(persistedState?.current.offset ?? 0);
  const spacingRef = useRef(spacing);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const persistedStateRef = useRef(persistedState);

  const ready = spacing > 0;
  const showMarquee = ready || Boolean(persistedState?.current.initialized && persistedState.current.spacing > 0);

  useEffect(() => {
    persistedStateRef.current = persistedState;
  }, [persistedState]);

  useEffect(() => {
    dirRef.current = direction;
    if (persistedStateRef.current) {
      persistedStateRef.current.current.direction = direction;
    }
  }, [direction]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    spacingRef.current = spacing;
    if (spacing > 0 && persistedStateRef.current) {
      persistedStateRef.current.current.spacing = spacing;
    }
  }, [spacing]);

  const applyOffset = (next: number) => {
    const wrap = spacingRef.current;
    const textPath = textPathRef.current;
    if (!wrap || !textPath) return;
    let value = next;
    while (value <= -wrap) value += wrap;
    while (value > 0) value -= wrap;
    offsetRef.current = value;
    if (persistedStateRef.current) {
      persistedStateRef.current.current.offset = value;
    }

    if (!windowLayoutRef.current && measureRef.current && pathRef.current) {
      windowLayoutRef.current = measureWindowLayout(measureRef.current, pathRef.current, textRef.current);
      windowStartRef.current = -1;
    }
    const layout = windowLayoutRef.current;
    if (!layout) {
      // Measurement unavailable — fall back to enough full copies to cover the curve
      const fallback = Array(Math.ceil(1800 / wrap) + 2)
        .fill(textRef.current)
        .join('');
      if (textPath.textContent !== fallback) textPath.textContent = fallback;
      textPath.setAttribute('startOffset', `${value}px`);
      return;
    }

    // Path distance 0 sits at cycle distance -value
    const { tokens, starts, widths, pathLength } = layout;
    const first = tokenIndexAt(starts, Math.min(-value, wrap - 0.001));
    if (first !== windowStartRef.current) {
      windowStartRef.current = first;
      // Cover the first token (partly behind the path start) + the whole curve, wrapping cycles
      const needed = widths[first] + pathLength;
      let covered = 0;
      let i = first;
      let content = '';
      while (covered < needed) {
        content += tokens[i];
        covered += widths[i];
        i = (i + 1) % tokens.length;
      }
      content += tokens[i];
      textPath.textContent = content;
    }
    textPath.setAttribute('startOffset', `${value + starts[first]}px`);
  };

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && spacingRef.current > 0) {
      lastTsRef.current = 0;
      applyOffset(persistedStateRef.current?.current.offset ?? offsetRef.current);
    }
  }, [paused]);

  // Measure with the same class/styles as the visible text so loop seams stay accurate.
  // Quietly correct on resize — never clear spacing, so no blink.
  useEffect(() => {
    let cancelled = false;

    const measure = () => {
      if (cancelled || !measureRef.current) return;
      const next = measureRef.current.getComputedTextLength();
      if (next <= 0) return;
      // Fonts / size may have changed — re-measure word positions (also while paused)
      windowLayoutRef.current = null;
      if (spacingRef.current > 0 && Math.abs(spacingRef.current - next) <= 0.5) {
        applyOffset(offsetRef.current);
      }
      setSpacing((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
      const saved = persistedStateRef.current?.current;
      if (saved) {
        saved.spacing = next;
        saved.initialized = true;
      }
    };

    measure();
    const raf = requestAnimationFrame(measure);
    void document.fonts?.ready.then(measure);

    const svg = measureRef.current?.ownerSVGElement ?? null;
    const ro =
      typeof ResizeObserver !== 'undefined' && svg
        ? new ResizeObserver(() => {
            measure();
          })
        : null;
    if (ro && svg) ro.observe(svg);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [text, className, fontSize]);

  useEffect(() => {
    windowLayoutRef.current = null;
    if (spacingRef.current > 0) applyOffset(offsetRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curveAmount]);

  // Restore saved offset on mount / spacing change — only default to 0 on first ever paint.
  // Layout effect: the textPath content is written imperatively, so fill it before paint.
  useLayoutEffect(() => {
    if (!spacing) return;
    const saved = persistedStateRef.current?.current;
    if (saved?.initialized) {
      dirRef.current = saved.direction;
      applyOffset(saved.offset);
      return;
    }
    applyOffset(0);
    if (saved) saved.initialized = true;
  }, [spacing]);

  useEffect(() => {
    if (!spacing || !ready) return;

    let frame = 0;
    lastTsRef.current = 0;

    // Every startOffset write forces a full rendering frame — skip them while off-screen
    let onScreen = true;
    const svg = measureRef.current?.ownerSVGElement;
    const io =
      svg && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
          })
        : null;
    if (io && svg) io.observe(svg);

    const step = (ts: number) => {
      if (pausedRef.current || !onScreen) {
        lastTsRef.current = 0;
        frame = requestAnimationFrame(step);
        return;
      }

      const last = lastTsRef.current || ts;
      const dt = Math.min(32, ts - last) / 16.6667;
      lastTsRef.current = ts;

      if (!dragRef.current) {
        const delta = (dirRef.current === 'right' ? speedRef.current : -speedRef.current) * dt;
        applyOffset(offsetRef.current + delta);
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      io?.disconnect();
    };
  }, [spacing, ready]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || paused) return;
    e.stopPropagation();
    pointerActiveRef.current = true;
    didDragRef.current = false;
    dragRef.current = false;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    lastXRef.current = e.clientX;
    velRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || !pointerActiveRef.current) return;

    const dx = e.clientX - pointerDownPosRef.current.x;
    const dy = e.clientY - pointerDownPosRef.current.y;
    const dist = Math.hypot(dx, dy);
    const isTouch = e.pointerType === 'touch';
    const tapCancelPx = isTouch ? TOUCH_TAP_CANCEL_PX : DRAG_THRESHOLD_PX;
    const dragThresholdPx = isTouch ? TOUCH_DRAG_THRESHOLD_PX : DRAG_THRESHOLD_PX;

    if (!didDragRef.current && dist >= tapCancelPx) {
      didDragRef.current = true;
    }

    if (!dragRef.current && dist >= dragThresholdPx) {
      dragRef.current = true;
      setDragging(true);
    }

    if (!dragRef.current || !textPathRef.current) return;
    e.stopPropagation();
    const moveDx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    velRef.current = moveDx;
    applyOffset(offsetRef.current + moveDx);
  };

  const endPointer = (fireTap: boolean) => {
    if (!pointerActiveRef.current) return;
    if (fireTap && interactive && !paused && !didDragRef.current) {
      onTap?.();
    }
    pointerActiveRef.current = false;
    dragRef.current = false;
    didDragRef.current = false;
    setDragging(false);
    if (velRef.current !== 0) {
      dirRef.current = velRef.current > 0 ? 'right' : 'left';
      if (persistedStateRef.current) {
        persistedStateRef.current.current.direction = dirRef.current;
      }
    }
  };

  return (
    <div
      className="curved-loop-jacket"
      style={{
        visibility: showMarquee ? 'visible' : 'hidden',
        cursor: interactive && !paused ? (dragging ? 'grabbing' : 'grab') : 'auto'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => endPointer(true)}
      onPointerLeave={() => endPointer(false)}
      onPointerCancel={() => endPointer(false)}
    >
      <svg className="curved-loop-svg" viewBox="0 0 1440 120">
        <text
          ref={measureRef}
          className={className}
          fontSize={fontSize}
          style={{ visibility: 'hidden', opacity: 0, pointerEvents: 'none' }}
          {...{ xmlSpace: 'preserve' }}
        >
          {text}
        </text>
        <defs>
          <path ref={pathRef} id={pathId} d={pathD} fill="none" stroke="transparent" />
        </defs>
        {ready || Boolean(persistedState?.current.initialized && persistedState.current.spacing > 0) ? (
          <text fontSize={fontSize} fontWeight="bold" className={className} {...{ xmlSpace: 'preserve' }}>
            {/* Content is the visible word window, written by applyOffset — not React children */}
            <textPath ref={textPathRef} href={`#${pathId}`} {...{ xmlSpace: 'preserve' }} />
          </text>
        ) : null}
      </svg>
    </div>
  );
};

export { CurvedLoop };
export type { CurvedLoopProps };
