'use client';

import './CurvedLoop.scss';

import { type FC, type MutableRefObject, type PointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

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
}

export type MarqueePersistedState = {
  offset: number;
  direction: 'left' | 'right';
  spacing: number;
  initialized: boolean;
};

const DRAG_THRESHOLD_PX = 6;

const CurvedLoop: FC<CurvedLoopProps> = ({
  marqueeText = '',
  speed = 2,
  className,
  curveAmount = 400,
  direction = 'left',
  interactive = true,
  paused = false,
  onTap,
  persistedState
}) => {
  const text = useMemo(() => {
    const hasTrailing = /\s|\u00A0$/.test(marqueeText);
    return (hasTrailing ? marqueeText.replace(/\s+$/, '') : marqueeText) + '\u00A0';
  }, [marqueeText]);

  const measureRef = useRef<SVGTextElement | null>(null);
  const textPathRef = useRef<SVGTextPathElement | null>(null);
  const [spacing, setSpacing] = useState(() => persistedState?.current.spacing ?? 0);
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

  const totalText = spacing
    ? Array(Math.ceil(1800 / spacing) + 2)
        .fill(text)
        .join('')
    : text;
  const ready = spacing > 0;

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
    if (!wrap || !textPathRef.current) return;
    let value = next;
    while (value <= -wrap) value += wrap;
    while (value > 0) value -= wrap;
    offsetRef.current = value;
    if (persistedStateRef.current) {
      persistedStateRef.current.current.offset = value;
    }
    textPathRef.current.setAttribute('startOffset', `${value}px`);
  };

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && spacingRef.current > 0) {
      lastTsRef.current = 0;
      applyOffset(persistedStateRef.current?.current.offset ?? offsetRef.current);
    }
  }, [paused]);

  // Measure with the same class/styles as the visible text so loop seams stay accurate
  useEffect(() => {
    let cancelled = false;

    const measure = () => {
      if (cancelled || !measureRef.current) return;
      const next = measureRef.current.getComputedTextLength();
      if (next > 0) {
        setSpacing((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
      }
    };

    measure();
    const raf = requestAnimationFrame(measure);
    void document.fonts?.ready.then(measure);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [text, className]);

  // Restore saved offset on mount / spacing change — only default to 0 on first ever paint
  useEffect(() => {
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

    const step = (ts: number) => {
      if (pausedRef.current) {
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
    return () => cancelAnimationFrame(frame);
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
    if (!didDragRef.current && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      didDragRef.current = true;
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

  const endDrag = () => {
    if (!pointerActiveRef.current) return;
    if (interactive && !paused && !didDragRef.current) {
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
        visibility: ready ? 'visible' : 'hidden',
        cursor: interactive && !paused ? (dragging ? 'grabbing' : 'grab') : 'auto'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
    >
      <svg className="curved-loop-svg" viewBox="0 0 1440 120">
        <text
          ref={measureRef}
          className={className}
          style={{ visibility: 'hidden', opacity: 0, pointerEvents: 'none' }}
          {...{ xmlSpace: 'preserve' }}
        >
          {text}
        </text>
        <defs>
          <path id={pathId} d={pathD} fill="none" stroke="transparent" />
        </defs>
        {ready ? (
          <text fontWeight="bold" className={className} {...{ xmlSpace: 'preserve' }}>
            <textPath ref={textPathRef} href={`#${pathId}`} {...{ xmlSpace: 'preserve' }}>
              {totalText}
            </textPath>
          </text>
        ) : null}
      </svg>
    </div>
  );
};

export { CurvedLoop };
export type { CurvedLoopProps };
