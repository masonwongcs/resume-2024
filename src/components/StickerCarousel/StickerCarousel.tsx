'use client';

import styles from './StickerCarousel.module.scss';

import { FC, useCallback, useEffect, useRef } from 'react';

import type { StickerItem } from '@/fixture/Stickers.fixture';
import { useHomeStore } from '@/store';

interface StickerCarouselProps {
  stickers: StickerItem[];
}

const TAU = Math.PI * 2;
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

const wrapOffset = (offset: number, count: number) => {
  let wrapped = ((offset % count) + count) % count;
  if (wrapped > count / 2) wrapped -= count;
  return wrapped;
};

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

const GAP_MULTIPLIER = 1.1;
const VISIBLE_COUNT = 9;
const MAX_OFFSET = (VISIBLE_COUNT - 1) / 2;
const FADE_OUT = 0.8;

const getLayout = (count: number) => {
  const angleStep = (TAU / count) * GAP_MULTIPLIER;
  const radiusX = window.innerWidth * 0.48;
  const radiusZ = window.innerWidth * 0.2;
  const dragSensitivity = radiusX * angleStep * 0.52;

  return { radiusX, radiusZ, angleStep, dragSensitivity };
};

const StickerCarousel: FC<StickerCarouselProps> = ({ stickers }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const counterRef = useRef<HTMLParagraphElement>(null);
  const scrollRef = useRef(0);
  const targetScrollRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);

  const count = stickers.length;
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);

  useEffect(() => {
    setLoadingProgress(100);
    setIsLoaded();
  }, [setIsLoaded, setLoadingProgress]);

  const getActiveIndex = useCallback(
    (scroll: number) => {
      if (count === 0) return 0;
      return ((Math.round(scroll) % count) + count) % count;
    },
    [count]
  );

  const applyTransforms = useCallback(
    (scroll: number) => {
      if (count === 0) return;

      const { radiusX, radiusZ, angleStep } = getLayout(count);

      itemRefs.current.forEach((item, index) => {
        if (!item) return;

        const wrappedOffset = wrapOffset(index - scroll, count);
        const absOffset = Math.abs(wrappedOffset);
        const outerLimit = MAX_OFFSET + FADE_OUT;

        if (absOffset > outerLimit) {
          item.style.visibility = 'hidden';
          item.style.pointerEvents = 'none';
          item.style.opacity = '0';
          return;
        }

        const angle = wrappedOffset * angleStep;
        const edgeT = Math.min(1, absOffset / MAX_OFFSET);
        const edgeCurve = edgeT * edgeT;

        const x = Math.sin(angle) * radiusX;
        const z = Math.cos(angle) * radiusZ - radiusZ;
        const depth = (z + radiusZ) / radiusZ;
        const scaleFactor = 1 - edgeT * 0.22;
        const baseScale = (0.74 + depth * 0.24) * scaleFactor;

        const edgeFalloff = 1 - smoothstep((edgeT - 0.45) / 0.55) * 0.38;
        const scrollFade =
          absOffset <= MAX_OFFSET ? 1 : 1 - smoothstep((absOffset - MAX_OFFSET) / FADE_OUT);
        const presence = edgeFalloff * scrollFade;

        const scale = baseScale * (0.86 + presence * 0.14);
        const opacity = (0.94 + depth * 0.06) * presence;
        const sideSign = wrappedOffset === 0 ? 0 : Math.sign(wrappedOffset);
        const curlStrength = (8 + edgeCurve * 28) * edgeT;
        const rawRotateY = (-(angle * 180) / Math.PI) * (1 + edgeCurve * 0.2);
        const rotateY = Math.sign(rawRotateY) * Math.min(Math.abs(rawRotateY), 58);
        const rotateX = -sideSign * curlStrength;
        const rotateZ = sideSign * (3 + edgeCurve * 12) * edgeT;
        const verticalLift = (14 + edgeCurve * 42) * edgeT;
        const y = sideSign * verticalLift;
        const scaleX = 1 - Math.abs(Math.sin(angle)) * (0.02 + edgeCurve * 0.1);

        item.style.visibility = opacity > 0.02 ? 'visible' : 'hidden';
        item.style.pointerEvents = depth > 0.35 && presence > 0.35 ? 'auto' : 'none';
        item.style.opacity = String(opacity);
        item.style.zIndex = String(Math.round(depth * 100));
        item.style.transform = [
          'translate(-50%, -50%)',
          `translate3d(${x}px, ${y}px, ${z}px)`,
          `rotateY(${rotateY}deg)`,
          `rotateX(${rotateX}deg)`,
          `rotateZ(${rotateZ}deg)`,
          `scale3d(${scale * scaleX}, ${scale}, 1)`
        ].join(' ');
      });

      if (counterRef.current) {
        counterRef.current.textContent = `${getActiveIndex(scroll) + 1} / ${count}`;
      }
    },
    [count, getActiveIndex]
  );

  const animate = useCallback(() => {
    scrollRef.current = lerp(scrollRef.current, targetScrollRef.current, 0.11);

    if (Math.abs(scrollRef.current - targetScrollRef.current) < 0.0005) {
      scrollRef.current = targetScrollRef.current;
    }

    applyTransforms(scrollRef.current);
    rafRef.current = requestAnimationFrame(animate);
  }, [applyTransforms]);

  useEffect(() => {
    applyTransforms(0);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animate, applyTransforms]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY + event.deltaX;
      targetScrollRef.current += delta * 0.0022;
    };

    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [count]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0) return;

    const onPointerDown = (event: PointerEvent) => {
      isDraggingRef.current = true;
      dragStartXRef.current = event.clientX;
      dragStartScrollRef.current = targetScrollRef.current;
      container.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;

      const { dragSensitivity } = getLayout(count);
      const deltaX = event.clientX - dragStartXRef.current;
      targetScrollRef.current = dragStartScrollRef.current - deltaX / dragSensitivity;
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
  }, [count]);

  const snapToIndex = useCallback(
    (index: number) => {
      if (count === 0) return;

      const current = targetScrollRef.current;
      const activeIndex = getActiveIndex(current);
      let delta = index - activeIndex;

      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;

      targetScrollRef.current = current + delta;
    },
    [count, getActiveIndex]
  );

  return (
    <section ref={containerRef} className={styles.carousel} aria-label="Sticker carousel">
      <p ref={counterRef} className={styles.counter}>
        1 / {count}
      </p>

      <div className={styles.stage}>
        <div className={styles.track}>
          {stickers.map((sticker, index) => (
            <div
              key={sticker.src}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              className={styles.item}
              onClick={() => snapToIndex(index)}
            >
              <div className={styles.card}>
                <img src={sticker.src} alt={sticker.alt} className={styles.image} draggable={false} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.hint}>Scroll or drag to browse</p>
    </section>
  );
};

export { StickerCarousel };
