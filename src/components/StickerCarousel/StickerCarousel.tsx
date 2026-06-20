'use client';

import styles from './StickerCarousel.module.scss';

import { FC, memo, useCallback, useEffect, useRef, useState } from 'react';

import { type MotionValue, motion, useMotionValue, useMotionValueEvent, useSpring, useTransform } from 'motion/react';
import type { SpringOptions } from 'motion/react';

import type { StickerItem } from '@/fixture/Stickers.fixture';
import { useHomeStore } from '@/store';

interface StickerCarouselProps {
  stickers: StickerItem[];
}

const VISIBLE_COUNT = 11;
const MAX_OFFSET = (VISIBLE_COUNT - 1) / 2;
const FADE_OUT = 0.5;

const SAMPLE_SCALE_DROP = 0.7;
const SAMPLE_TRANSLATE_Z_STEP = 72;
const SAMPLE_OVERLAY_MAX = 0.3;
const SAMPLE_Y_PERCENT = 15;
const SAMPLE_INNER_X = 118;
const SAMPLE_INNER_SCALE_DROP = 0.283;
const CENTER_CLEARANCE_RATIO = 0.22;
const STACK_OVERLAP_FRACTION = 0.5;
const VIEWPORT_EDGE_OVERFLOW_RATIO = 0.68;

const TRACK_BASE_ROTATE_Y = -3;
const TRACK_BASE_ROTATE_X = -4;
const STAGE_TILT_AMPLITUDE = 3.5;

/** Wheel: lower = slower scroll per wheel tick */
const WHEEL_SCROLL_FACTOR = 0.001;

/** Drag: higher = more pixels needed to move one sticker */
const DRAG_SENSITIVITY_FACTOR = 0.85;

/** Autoplay: scroll units advanced per millisecond (~1 sticker every 5s) */
const AUTOPLAY_SCROLL_SPEED = 0.00016;

/** Resume autoplay after manual interaction */
const AUTOPLAY_RESUME_DELAY_MS = 2500;

const SCROLL_SPRING: SpringOptions = {
  stiffness: 220,
  damping: 42,
  mass: 0.45,
  restDelta: 0.0005,
  restSpeed: 0.0005
};

const TILT_SPRING: SpringOptions = {
  stiffness: 180,
  damping: 28,
  mass: 1.1
};

const wrapOffset = (offset: number, count: number) => {
  let wrapped = ((offset % count) + count) % count;
  if (wrapped > count / 2) wrapped -= count;
  return wrapped;
};

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

const getItemSize = () => Math.min(window.innerWidth * 0.18, window.innerHeight * 0.28);

const getTargetMaxSpread = (itemSize: number) => {
  const edgeHalf = (itemSize * (1 - SAMPLE_SCALE_DROP)) / 2;
  const edgeOverflow = itemSize * VIEWPORT_EDGE_OVERFLOW_RATIO;
  return window.innerWidth / 2 - edgeHalf + edgeOverflow;
};

const getRawStackDistance = (absOffset: number, itemSize: number) => {
  if (absOffset <= 0) return 0;

  const clearance = itemSize * CENTER_CLEARANCE_RATIO;

  const ringHalf = (ring: number) => {
    const offsetNorm = ring / MAX_OFFSET;
    return (itemSize * (1 - offsetNorm * SAMPLE_SCALE_DROP)) / 2;
  };

  const ringStep = (ring: number) => {
    const prevHalf = ringHalf(ring - 1);
    const half = ringHalf(ring);
    return (prevHalf + half) * (1 - STACK_OVERLAP_FRACTION);
  };

  const ring1Dist = itemSize / 2 + clearance + ringHalf(1);

  if (absOffset <= 1) {
    return ring1Dist * absOffset;
  }

  let distance = ring1Dist;
  const fullRings = Math.floor(absOffset);
  const fraction = absOffset - fullRings;

  for (let ring = 2; ring <= fullRings; ring++) {
    distance += ringStep(ring);
  }

  if (fraction > 0 && fullRings < MAX_OFFSET) {
    distance += fraction * ringStep(fullRings + 1);
  }

  return distance;
};

const getStackDistance = (absOffset: number, itemSize: number) => {
  if (absOffset <= 0) return 0;

  const raw = getRawStackDistance(absOffset, itemSize);
  const rawMax = getRawStackDistance(MAX_OFFSET, itemSize);
  const ring1 = getRawStackDistance(1, itemSize);
  const targetMax = getTargetMaxSpread(itemSize);

  if (absOffset <= 1) {
    return raw;
  }

  const outerRaw = raw - ring1;
  const outerRawMax = rawMax - ring1;
  const outerTargetMax = targetMax - ring1;

  if (outerRawMax <= 0) return raw;

  return ring1 + (outerRaw / outerRawMax) * outerTargetMax;
};

const getDragSensitivity = (itemSize: number) => getStackDistance(1, itemSize) * DRAG_SENSITIVITY_FACTOR;

const getSampleRotations = (offsetNorm: number, sideSign: number) => {
  if (sideSign === 0 || offsetNorm === 0) {
    return { rotateZ: 0, rotateY: 0, rotateX: 0 };
  }

  if (sideSign > 0) {
    return {
      rotateZ: -offsetNorm * 100,
      rotateY: -offsetNorm * 110,
      rotateX: -offsetNorm * 30
    };
  }

  return {
    rotateZ: offsetNorm * 130,
    rotateY: -offsetNorm * 28,
    rotateX: offsetNorm * 120
  };
};

interface ItemMotion {
  x: number;
  yPercent: number;
  translateZ: number;
  rotateZ: number;
  rotateY: number;
  rotateX: number;
  scale: number;
  opacity: number;
  zIndex: number;
  overlayOpacity: number;
  innerX: number;
  innerScale: number;
  interactive: boolean;
}

const computeItemMotion = (index: number, scroll: number, count: number, itemSize: number): ItemMotion => {
  const wrappedOffset = wrapOffset(index - scroll, count);
  const absOffset = Math.abs(wrappedOffset);
  const outerLimit = MAX_OFFSET + FADE_OUT;

  if (absOffset > outerLimit) {
    return {
      x: 0,
      yPercent: 0,
      translateZ: 0,
      rotateZ: 0,
      rotateY: 0,
      rotateX: 0,
      scale: 0.3,
      opacity: 0,
      zIndex: 0,
      overlayOpacity: 0,
      innerX: 0,
      innerScale: 1,
      interactive: false
    };
  }

  const offsetNorm = Math.min(1, absOffset / MAX_OFFSET);
  const sideSign = wrappedOffset === 0 ? 0 : Math.sign(wrappedOffset);

  const scrollFade = absOffset <= MAX_OFFSET ? 1 : 1 - smoothstep((absOffset - MAX_OFFSET) / FADE_OUT);

  const { rotateZ, rotateY, rotateX } = getSampleRotations(offsetNorm, sideSign);

  return {
    x: sideSign * getStackDistance(absOffset, itemSize),
    yPercent: sideSign * offsetNorm * SAMPLE_Y_PERCENT,
    translateZ: Math.round((MAX_OFFSET - absOffset) * SAMPLE_TRANSLATE_Z_STEP),
    rotateZ,
    rotateY,
    rotateX,
    scale: 1 - offsetNorm * SAMPLE_SCALE_DROP,
    opacity: scrollFade,
    zIndex: Math.round(1000 - absOffset * 100),
    overlayOpacity: offsetNorm * SAMPLE_OVERLAY_MAX,
    innerX: sideSign * offsetNorm * SAMPLE_INNER_X,
    innerScale: 1 - offsetNorm * SAMPLE_INNER_SCALE_DROP,
    interactive: offsetNorm < 0.72 && scrollFade > 0.35
  };
};

const buildItemTransform = (m: ItemMotion) =>
  [
    'translate(-50%, -50%)',
    `translate3d(${m.x}px, ${m.yPercent}%, ${m.translateZ}px)`,
    `rotate(${m.rotateZ}deg)`,
    `rotateY(${m.rotateY}deg)`,
    `rotateX(${m.rotateX}deg)`,
    `scale(${m.scale})`
  ].join(' ');

interface StickerCarouselItemProps {
  index: number;
  sticker: StickerItem;
  scroll: MotionValue<number>;
  count: number;
  itemSize: number;
  onSnap: (index: number) => void;
}

const StickerCarouselItem = memo(function StickerCarouselItem({
  index,
  sticker,
  scroll,
  count,
  itemSize,
  onSnap
}: StickerCarouselItemProps) {
  const motionCache = useRef({ scroll: NaN, motion: null as ItemMotion | null });

  const getMotion = (s: number) => {
    if (motionCache.current.scroll !== s) {
      motionCache.current = { scroll: s, motion: computeItemMotion(index, s, count, itemSize) };
    }
    return motionCache.current.motion!;
  };

  const transform = useTransform(scroll, (s) => buildItemTransform(getMotion(s)));
  const opacity = useTransform(scroll, (s) => getMotion(s).opacity);
  const zIndex = useTransform(scroll, (s) => getMotion(s).zIndex);
  const imageBrightness = useTransform(scroll, (s) => 1 - getMotion(s).overlayOpacity * 3);
  const innerX = useTransform(scroll, (s) => `${getMotion(s).innerX}px`);
  const innerScale = useTransform(scroll, (s) => getMotion(s).innerScale);
  const pointerEvents = useTransform(scroll, (s) => (getMotion(s).interactive ? 'auto' : 'none'));

  return (
    <motion.div
      className={styles.item}
      style={{
        transform,
        opacity,
        zIndex,
        pointerEvents,
        ['--inner-x' as string]: innerX,
        ['--inner-scale' as string]: innerScale,
        ['--image-brightness' as string]: imageBrightness
      }}
      onClick={() => onSnap(index)}
    >
      <div className={styles.media}>
        <div className={styles.inner}>
          <img
            src={sticker.src}
            alt={sticker.alt}
            className={styles.image}
            draggable={false}
            decoding="async"
            loading="eager"
          />
        </div>
      </div>
    </motion.div>
  );
});

const StickerCarousel: FC<StickerCarouselProps> = ({ stickers }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLParagraphElement>(null);
  const scrollTarget = useMotionValue(0);
  const scroll = useSpring(scrollTarget, SCROLL_SPRING);
  const hoverRotateX = useSpring(useMotionValue(0), TILT_SPRING);
  const hoverRotateY = useSpring(useMotionValue(0), TILT_SPRING);
  const trackRotateX = useTransform(hoverRotateX, (x) => TRACK_BASE_ROTATE_X + x);
  const trackRotateY = useTransform(hoverRotateY, (y) => TRACK_BASE_ROTATE_Y + y);
  const trackTransform = useTransform(
    [trackRotateX, trackRotateY],
    ([rx, ry]) => `translate(-50%, -50%) rotateY(${ry}deg) rotateX(${rx}deg)`
  );
  const isDraggingRef = useRef(false);
  const isAutoplayPausedRef = useRef(false);
  const autoplayResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);

  const [itemSize, setItemSize] = useState(0);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(false);

  const count = stickers.length;
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);

  useEffect(() => {
    setLoadingProgress(100);
    setIsLoaded();
  }, [setIsLoaded, setLoadingProgress]);

  useEffect(() => {
    stickers.forEach((sticker) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = sticker.src;
    });
  }, [stickers]);

  useEffect(() => {
    const updateSize = () => setItemSize(getItemSize());
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const getActiveIndex = useCallback(
    (value: number) => {
      if (count === 0) return 0;
      return ((Math.round(value) % count) + count) % count;
    },
    [count]
  );

  useMotionValueEvent(scroll, 'change', (value) => {
    if (counterRef.current) {
      counterRef.current.textContent = `${getActiveIndex(value) + 1} / ${count}`;
    }
  });

  const snapToIndex = useCallback(
    (index: number) => {
      if (count === 0) return;

      const current = scrollTarget.get();
      const activeIndex = getActiveIndex(current);
      let delta = index - activeIndex;

      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;

      scrollTarget.set(current + delta);
    },
    [count, getActiveIndex, scrollTarget]
  );

  const handleStageMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDraggingRef.current || !stageRef.current) return;

      const rect = stageRef.current.getBoundingClientRect();
      const offsetX = event.clientX - rect.left - rect.width / 2;
      const offsetY = event.clientY - rect.top - rect.height / 2;

      hoverRotateX.set((offsetY / (rect.height / 2)) * -STAGE_TILT_AMPLITUDE);
      hoverRotateY.set((offsetX / (rect.width / 2)) * STAGE_TILT_AMPLITUDE);
    },
    [hoverRotateX, hoverRotateY]
  );

  const resetStageTilt = useCallback(() => {
    hoverRotateX.set(0);
    hoverRotateY.set(0);
  }, [hoverRotateX, hoverRotateY]);

  const pauseAutoplayTemporarily = useCallback(() => {
    isAutoplayPausedRef.current = true;

    if (autoplayResumeTimeoutRef.current) {
      clearTimeout(autoplayResumeTimeoutRef.current);
    }

    if (!isAutoplayEnabled) return;

    autoplayResumeTimeoutRef.current = setTimeout(() => {
      isAutoplayPausedRef.current = false;
    }, AUTOPLAY_RESUME_DELAY_MS);
  }, [isAutoplayEnabled]);

  useEffect(() => {
    return () => {
      if (autoplayResumeTimeoutRef.current) {
        clearTimeout(autoplayResumeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAutoplayEnabled || count === 0) return;

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      if (!isAutoplayPausedRef.current && !isDraggingRef.current) {
        scrollTarget.set(scrollTarget.get() + delta * AUTOPLAY_SCROLL_SPEED);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isAutoplayEnabled, count, scrollTarget]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0 || itemSize === 0) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      pauseAutoplayTemporarily();
      const delta = event.deltaY + event.deltaX;
      scrollTarget.set(scrollTarget.get() + delta * WHEEL_SCROLL_FACTOR);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [count, itemSize, scrollTarget, pauseAutoplayTemporarily]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0 || itemSize === 0) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select')) return;

      isDraggingRef.current = true;
      pauseAutoplayTemporarily();
      resetStageTilt();
      dragStartXRef.current = event.clientX;
      dragStartScrollRef.current = scrollTarget.get();
      container.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;

      const dragSensitivity = getDragSensitivity(itemSize);
      const deltaX = event.clientX - dragStartXRef.current;
      scrollTarget.jump(dragStartScrollRef.current - deltaX / dragSensitivity);
    };

    const endDrag = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      container.releasePointerCapture(event.pointerId);
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointercancel', endDrag);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', endDrag);
      container.removeEventListener('pointercancel', endDrag);
    };
  }, [count, itemSize, scrollTarget, resetStageTilt, pauseAutoplayTemporarily]);

  const toggleAutoplay = useCallback(() => {
    setIsAutoplayEnabled((enabled) => {
      const next = !enabled;
      isAutoplayPausedRef.current = false;

      if (autoplayResumeTimeoutRef.current) {
        clearTimeout(autoplayResumeTimeoutRef.current);
        autoplayResumeTimeoutRef.current = null;
      }

      return next;
    });
  }, []);

  return (
    <div className={styles.wrapper}>
      <section ref={containerRef} className={styles.carousel} aria-label="Sticker carousel">
        <div ref={stageRef} className={styles.stage} onMouseMove={handleStageMouseMove} onMouseLeave={resetStageTilt}>
          <motion.div className={styles.track} style={{ transform: trackTransform }}>
            {itemSize > 0 &&
              stickers.map((sticker, index) => (
                <StickerCarouselItem
                  key={sticker.src}
                  index={index}
                  sticker={sticker}
                  scroll={scroll}
                  count={count}
                  itemSize={itemSize}
                  onSnap={snapToIndex}
                />
              ))}
          </motion.div>
        </div>
      </section>

      <button
        type="button"
        className={styles.autoplayButton}
        onClick={toggleAutoplay}
        aria-label={isAutoplayEnabled ? 'Pause autoplay' : 'Play autoplay'}
        aria-pressed={isAutoplayEnabled}
      >
        {isAutoplayEnabled ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5-11-6.5z" />
          </svg>
        )}
      </button>
    </div>
  );
};

export { StickerCarousel };
