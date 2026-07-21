'use client';

import styles from './CoverFlow.module.scss';

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react';

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type PanInfo
} from 'motion/react';

type Direction = 'left' | 'right';

const AudioCtx: typeof AudioContext | null =
  typeof window !== 'undefined'
    ? ((window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ??
      null)
    : null;

function useTickAudio(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!enabled || !AudioCtx) return;
    const warm = () => {
      if (!ctxRef.current) ctxRef.current = new AudioCtx!();
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', warm, { once: true });
    return () => window.removeEventListener('pointerdown', warm);
  }, [enabled]);

  return useCallback(
    (direction: Direction, velocity = 1) => {
      if (!enabled || !AudioCtx) return;

      const getCtx = async () => {
        if (!ctxRef.current) ctxRef.current = new AudioCtx!();
        if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
        return ctxRef.current;
      };

      getCtx()
        .then((ctx) => {
          const t = ctx.currentTime;
          const vn = Math.min(Math.abs(velocity) / 300, 1);
          const peakGain = 0.28 * (0.55 + vn * 0.45);
          const freq = 1600 * (0.88 + vn * 0.24);
          const bodyDur = 0.022 - vn * 0.008;
          const clickDur = bodyDur * 0.3;
          const panStart = direction === 'left' ? 0.7 : -0.7;
          const panEnd = direction === 'left' ? -0.7 : 0.7;

          const panner = ctx.createStereoPanner();
          panner.pan.setValueAtTime(panStart, t);
          panner.pan.linearRampToValueAtTime(panEnd, t + bodyDur);
          panner.connect(ctx.destination);

          const bodyGain = ctx.createGain();
          bodyGain.gain.setValueAtTime(peakGain, t);
          bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + bodyDur);
          bodyGain.connect(panner);

          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = freq;
          filter.Q.value = 6;
          filter.connect(bodyGain);

          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq * 1.25, t);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.65, t + bodyDur);
          osc.connect(filter);
          osc.start(t);
          osc.stop(t + bodyDur);

          const nSamples = Math.max(1, Math.ceil(ctx.sampleRate * clickDur));
          const noiseBuf = ctx.createBuffer(1, nSamples, ctx.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < nSamples; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (nSamples * 0.2));
          }

          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(peakGain * 0.35, t);
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + clickDur);
          noiseGain.connect(panner);

          const noiseHp = ctx.createBiquadFilter();
          noiseHp.type = 'highpass';
          noiseHp.frequency.value = 2400;
          noiseHp.connect(noiseGain);

          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuf;
          noise.connect(noiseHp);
          noise.start(t);
          noise.stop(t + clickDur);
        })
        .catch(() => {});
    },
    [enabled]
  );
}

export interface CoverFlowItem {
  id: string | number;
  image: string;
  title: string;
  subtitle?: string;
}

export interface RenderImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className: string;
  draggable: boolean;
  sizes: string;
  priority?: boolean;
  loading?: 'eager' | 'lazy';
}

export interface CoverFlowProps {
  items: CoverFlowItem[];
  itemWidth?: number;
  itemHeight?: number;
  stackSpacing?: number;
  centerGap?: number;
  rotation?: number;
  initialIndex?: number;
  enableReflection?: boolean;
  enableClickToSnap?: boolean;
  enableScroll?: boolean;
  enableAudio?: boolean;
  /** When set, auto-advances while not dragging (grid card). */
  autoAdvanceMs?: number;
  showCaption?: boolean;
  /** Max cover width as a fraction of the container (default 0.78). */
  fitRatio?: number;
  /** Override fitRatio on coarse / narrow viewports. */
  mobileFitRatio?: number;
  /**
   * When the root is CSS-scaled (focus banner), divide pointer deltas by this
   * so drag/wheel feel match the unscaled grid face.
   */
  interactionScale?: number;
  scrollThreshold?: number;
  className?: string;
  onItemClick?: (item: CoverFlowItem, index: number) => void;
  onIndexChange?: (index: number) => void;
  renderImage?: (props: RenderImageProps) => ReactNode;
}

const defaultRenderImage = (props: RenderImageProps) => (
  <img
    src={props.src}
    alt={props.alt}
    width={props.width}
    height={props.height}
    className={props.className}
    draggable={props.draggable}
    sizes={props.sizes}
    loading={props.loading}
  />
);

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

export function CoverFlow({
  items,
  itemWidth = 400,
  itemHeight = 400,
  stackSpacing = 100,
  centerGap = 250,
  rotation = 50,
  initialIndex = 0,
  enableReflection = false,
  enableClickToSnap = true,
  enableScroll = true,
  enableAudio = false,
  autoAdvanceMs,
  showCaption = true,
  fitRatio = 0.78,
  mobileFitRatio,
  interactionScale = 1,
  scrollThreshold = 100,
  className,
  onItemClick,
  onIndexChange,
  renderImage
}: CoverFlowProps) {
  const safeInitial = clampIndex(initialIndex, items.length);
  const [activeIndex, setActiveIndex] = useState(safeInitial);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId().replace(/:/g, 'x');
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    // Match InfiniteCanvas mobile breakpoint (cell metrics use 480)
    const mql = window.matchMedia('(max-width: 480px), (pointer: coarse)');
    const apply = () => setIsMobile(mql.matches);
    apply();
    mql.addEventListener?.('change', apply);
    return () => mql.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsSafari(/^((?!chrome|android).)*safari/i.test(window.navigator.userAgent));
  }, []);

  const activeFitRatio = isMobile && mobileFitRatio != null ? mobileFitRatio : fitRatio;
  // No upper clamp: itemWidth/itemHeight are reference sizes, not resolution caps, so
  // larger containers (e.g. the focus banner) should scale up proportionally just like
  // the grid cell does, keeping the cover fan visually consistent across both contexts.
  const scale =
    containerWidth > 0 && itemWidth > 0 ? (containerWidth * activeFitRatio) / itemWidth : 1;
  const effectiveWidth = Math.round(itemWidth * scale);
  const effectiveHeight = Math.round(itemHeight * scale);
  const effectiveStackSpacing = Math.round(stackSpacing * scale);
  const effectiveCenterGap = Math.round(centerGap * scale);

  const reflectionFilterId =
    isMounted && enableReflection && !isMobile && !isSafari ? `${instanceId}-rf` : undefined;
  const showReflection = isMounted && enableReflection;
  const activeIndexRef = useRef(activeIndex);
  const enableScrollRef = useRef(enableScroll);
  const scrollThresholdRef = useRef(scrollThreshold);
  const onItemClickRef = useRef(onItemClick);
  const enableClickToSnapRef = useRef(enableClickToSnap);
  const onIndexChangeRef = useRef(onIndexChange);
  const isMountedForCallbackRef = useRef(false);
  const isDraggingRef = useRef(false);

  activeIndexRef.current = activeIndex;
  enableScrollRef.current = enableScroll;
  scrollThresholdRef.current = scrollThreshold;
  onItemClickRef.current = onItemClick;
  enableClickToSnapRef.current = enableClickToSnap;
  onIndexChangeRef.current = onIndexChange;
  isDraggingRef.current = isDragging;

  const prefersReducedMotion = useReducedMotion();
  const scrollX = useMotionValue(safeInitial);
  const springX = useSpring(scrollX, { stiffness: 150, damping: 30, mass: 1 });
  const effectiveScrollX = prefersReducedMotion ? scrollX : springX;
  const tick = useTickAudio(enableAudio);

  useEffect(() => {
    const clamped = clampIndex(initialIndex, items.length);
    if (clamped !== activeIndexRef.current) {
      setActiveIndex(clamped);
      scrollX.set(clamped);
    }
  }, [initialIndex, items.length, scrollX]);

  useEffect(() => {
    if (!isMountedForCallbackRef.current) {
      isMountedForCallbackRef.current = true;
      return;
    }
    onIndexChangeRef.current?.(activeIndex);
  }, [activeIndex]);

  const jumpToIndex = useCallback(
    (index: number, velocity = 0, direction?: Direction) => {
      const clamped = clampIndex(index, items.length);
      const prev = activeIndexRef.current;
      if (clamped === prev) return;
      const dir: Direction = direction ?? (clamped > prev ? 'right' : 'left');
      setActiveIndex(clamped);
      scrollX.set(clamped);
      tick(dir, velocity);
    },
    [items.length, scrollX, tick]
  );

  const jumpToIndexRef = useRef(jumpToIndex);
  const scrollXRef = useRef(scrollX);
  const tickRef = useRef(tick);
  const itemsLengthRef = useRef(items.length);
  jumpToIndexRef.current = jumpToIndex;
  scrollXRef.current = scrollX;
  tickRef.current = tick;
  itemsLengthRef.current = items.length;

  useEffect(() => {
    if (!autoAdvanceMs || prefersReducedMotion || items.length < 2) return;

    let cancelled = false;
    let timeoutId = 0;
    let inView = false;
    let pageVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const clear = () => {
      window.clearTimeout(timeoutId);
      timeoutId = 0;
    };

    const canRun = () => inView && pageVisible && !cancelled;

    const advance = () => {
      if (isDraggingRef.current) return;
      const prev = activeIndexRef.current;
      const next = prev + 1 >= itemsLengthRef.current ? 0 : prev + 1;
      // Wrap with set+jump so the fan loops without springing backward through the stack
      if (next === 0 && prev !== 0) {
        setActiveIndex(0);
        scrollXRef.current.jump(0);
        tickRef.current('right', 80);
        return;
      }
      jumpToIndexRef.current(next, 80, 'right');
    };

    const schedule = () => {
      clear();
      if (!canRun()) return;
      timeoutId = window.setTimeout(() => {
        if (!canRun()) return;
        // Still dwell while dragging — retry shortly without burning the full interval
        if (isDraggingRef.current) {
          timeoutId = window.setTimeout(() => {
            if (canRun()) schedule();
          }, 250);
          return;
        }
        advance();
        // activeIndex change restarts this effect with a fresh dwell
      }, autoAdvanceMs);
    };

    const onVisibility = () => {
      pageVisible = document.visibilityState !== 'hidden';
      if (pageVisible) schedule();
      else clear();
    };

    const container = containerRef.current;
    let io: IntersectionObserver | undefined;
    if (container && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        ([entry]) => {
          inView = Boolean(entry?.isIntersecting);
          if (canRun()) schedule();
          else clear();
        },
        { threshold: 0.25 }
      );
      io.observe(container);
    } else {
      inView = true;
      schedule();
    }

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clear();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // Restart the dwell whenever the active cover changes (auto or external)
  }, [autoAdvanceMs, prefersReducedMotion, items.length, activeIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let accumulator = 0;
    let lastTime = Date.now();
    let lastJump = 0;

    const handleWheel = (e: WheelEvent) => {
      if (!enableScrollRef.current) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;
      e.preventDefault();

      const now = Date.now();
      if (now - lastTime > 200) accumulator = 0;
      lastTime = now;
      accumulator += e.deltaX;

      const threshold = scrollThresholdRef.current;
      const shouldJump =
        (accumulator > threshold || accumulator < -threshold) && now - lastJump > 150;

      if (shouldJump) {
        const dir = accumulator > 0 ? 'right' : 'left';
        jumpToIndex(
          Math.round(scrollX.get()) + (dir === 'right' ? 1 : -1),
          Math.abs(e.deltaX),
          dir
        );
        accumulator = 0;
        lastJump = now;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [jumpToIndex, scrollX]);

  const handleCardClick = useCallback(
    (item: CoverFlowItem, index: number) => {
      if (index === activeIndexRef.current) {
        onItemClickRef.current?.(item, index);
      } else if (enableClickToSnapRef.current) {
        jumpToIndex(index);
      }
    },
    [jumpToIndex]
  );

  const onDragStart = useCallback(() => setIsDragging(true), []);

  const interactionScaleRef = useRef(interactionScale);
  interactionScaleRef.current = interactionScale;

  const onDrag = useCallback(
    (_: unknown, info: PanInfo) => {
      const scale = Math.max(interactionScaleRef.current, 0.001);
      const gap = Math.max(effectiveCenterGap, 1);
      const next = scrollX.get() - info.delta.x / (gap * 0.8 * scale);
      // Keep drag within a soft range so Motion never sees extreme indices
      const max = Math.max(itemsLengthRef.current - 1, 0);
      scrollX.set(Math.min(max + 0.45, Math.max(-0.45, next)));
    },
    [effectiveCenterGap, scrollX]
  );

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      setIsDragging(false);
      const scale = Math.max(interactionScaleRef.current, 0.001);
      const projected = scrollX.get() - info.velocity.x * 0.002 / scale;
      const clamped = clampIndex(Math.round(projected), itemsLengthRef.current);
      const prev = activeIndexRef.current;
      const dir: Direction = clamped >= prev ? 'right' : 'left';
      setActiveIndex(clamped);
      scrollX.set(clamped);
      if (clamped !== prev) tick(dir, Math.abs(info.velocity.x));
    },
    [scrollX, tick]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpToIndex(activeIndexRef.current - 1, 120, 'left');
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToIndex(activeIndexRef.current + 1, 120, 'right');
      }
    },
    [jumpToIndex]
  );

  if (items.length === 0) return null;

  const safeActiveIndex = clampIndex(activeIndex, items.length);
  const rootClass = [
    styles.coverFlow,
    isDragging ? styles.isDragging : styles.isIdle,
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {reflectionFilterId ? (
        <svg
          aria-hidden="true"
          focusable="false"
          className={styles.reflectionSvg}
        >
          <defs>
            <filter
              id={reflectionFilterId}
              x="-3%"
              y="-3%"
              width="106%"
              height="106%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.065"
                numOctaves="3"
                seed="8"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="5"
                xChannelSelector="R"
                yChannelSelector="G"
                result="displaced"
              />
              <feGaussianBlur in="displaced" stdDeviation="0.4 1.8" />
            </filter>
          </defs>
        </svg>
      ) : null}
      <motion.div
        ref={containerRef}
        className={rootClass}
        style={{ perspective: 1000 }}
        role="region"
        aria-label="Cover Flow"
        tabIndex={enableClickToSnap || enableScroll ? 0 : -1}
        onKeyDown={onKeyDown}
        drag={enableClickToSnap || enableScroll ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={enableClickToSnap || enableScroll ? onDragStart : undefined}
        onDrag={enableClickToSnap || enableScroll ? onDrag : undefined}
        onDragEnd={enableClickToSnap || enableScroll ? onDragEnd : undefined}
      >
        <div className={styles.stage} style={{ transformStyle: 'preserve-3d' }}>
          {items.map((item, index) => (
            <CoverFlowItemCard
              key={item.id}
              item={item}
              index={index}
              scrollX={effectiveScrollX}
              width={Math.max(effectiveWidth, 1)}
              height={Math.max(effectiveHeight, 1)}
              stackSpacing={effectiveStackSpacing}
              centerGap={Math.max(effectiveCenterGap, 1)}
              rotation={rotation}
              isActive={index === safeActiveIndex}
              showReflection={showReflection}
              reflectionFilterId={reflectionFilterId}
              enableClickToSnap={enableClickToSnap}
              reduceMotion={prefersReducedMotion ?? false}
              renderImage={renderImage}
              onCardClick={handleCardClick}
            />
          ))}
        </div>

        {showCaption ? (
          <div className={styles.caption}>
            <AnimatePresence mode="wait">
              <motion.div
                key={safeActiveIndex}
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -6 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: 'easeOut' }}
                className={styles.captionInner}
              >
                <h3 className={styles.captionTitle}>{items[safeActiveIndex]?.title}</h3>
                {items[safeActiveIndex]?.subtitle ? (
                  <p className={styles.captionSubtitle}>{items[safeActiveIndex]?.subtitle}</p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : null}
      </motion.div>
    </>
  );
}

interface CardProps {
  item: CoverFlowItem;
  index: number;
  scrollX: MotionValue<number>;
  width: number;
  height: number;
  stackSpacing: number;
  centerGap: number;
  rotation: number;
  isActive: boolean;
  showReflection: boolean;
  reflectionFilterId?: string;
  enableClickToSnap: boolean;
  reduceMotion: boolean;
  renderImage?: (props: RenderImageProps) => ReactNode;
  onCardClick: (item: CoverFlowItem, index: number) => void;
}

const CoverFlowItemCard = memo(function CoverFlowItemCard({
  item,
  index,
  scrollX,
  width,
  height,
  stackSpacing,
  centerGap,
  rotation,
  isActive,
  showReflection,
  reflectionFilterId,
  enableClickToSnap,
  reduceMotion: _reduceMotion,
  renderImage,
  onCardClick
}: CardProps) {
  const rotateY = useTransform(scrollX, (value) => {
    // Keep the 3D fan even when motion is reduced — only springs/auto-advance pause
    const pos = index - value;
    const absPos = Math.abs(pos);
    return absPos < 0.5 ? -pos * (rotation * 2) : pos < 0 ? rotation : -rotation;
  });

  const x = useTransform(scrollX, (value) => {
    const pos = index - value;
    const absPos = Math.abs(pos);
    if (absPos < 1) return pos * centerGap;
    return pos < 0
      ? -centerGap - (absPos - 1) * stackSpacing
      : centerGap + (absPos - 1) * stackSpacing;
  });

  const z = useTransform(scrollX, (value) => {
    const absPos = Math.abs(index - value);
    return absPos > 0.5 ? -200 : absPos * -400;
  });

  const zIndex = useTransform(scrollX, (value) => 1000 - Math.abs(index - value) * 10);

  const filterStyle = useTransform(
    scrollX,
    (value) => `brightness(${Math.abs(index - value) < 0.5 ? 1 : 0.5})`
  );

  const imageRenderer = renderImage ?? defaultRenderImage;
  const cursorClass =
    isActive || enableClickToSnap ? styles.cursorPointer : styles.cursorGrab;

  return (
    <motion.div
      className={`${styles.card} ${cursorClass}`}
      style={{
        width,
        height,
        marginTop: -height / 2,
        marginLeft: -width / 2,
        x,
        z,
        rotateY,
        zIndex,
        filter: filterStyle,
        pointerEvents: 'auto'
      }}
      onClick={() => onCardClick(item, index)}
    >
      <div className={styles.cardFace}>
        <div className={styles.cardBorder} />
        <div className={styles.cardImageWrap}>
          {imageRenderer({
            src: item.image,
            alt: item.title,
            width,
            height,
            className: styles.cardImage,
            draggable: false,
            sizes: `${width}px`,
            priority: isActive,
            loading: isActive ? 'eager' : 'lazy'
          })}
          <div className={styles.cardSheen} />
        </div>
      </div>

      {showReflection ? (
        <div
          aria-hidden="true"
          className={styles.reflection}
          style={{
            width,
            height: height * 0.42
          }}
        >
          <div
            className={styles.reflectionFlip}
            style={{
              filter: reflectionFilterId ? `url(#${reflectionFilterId})` : undefined,
              mixBlendMode: reflectionFilterId ? 'screen' : undefined,
              opacity: reflectionFilterId ? 0.55 : 0.4
            }}
          >
            <div
              className={`${styles.cardFace} ${reflectionFilterId ? styles.cardFaceReflect : ''}`}
            >
              <div className={styles.cardBorder} />
              <div className={styles.cardImageWrap}>
                {imageRenderer({
                  src: item.image,
                  alt: '',
                  width,
                  height,
                  className: styles.cardImage,
                  draggable: false,
                  sizes: `${width}px`,
                  loading: 'lazy'
                })}
              </div>
            </div>
          </div>
          <div className={styles.reflectionFade} />
        </div>
      ) : null}
    </motion.div>
  );
});
