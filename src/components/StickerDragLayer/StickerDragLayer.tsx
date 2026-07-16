'use client';

import styles from './StickerDragLayer.module.scss';

import { FC, useEffect, useMemo, useState } from 'react';

import { motion } from 'motion/react';

import { StickerDrag } from '@/components/StickerDrag';

interface StickerData {
  src: string;
  alt?: string;
  startX: string;
  startY: string;
  transformEndX: number;
  transformEndY: number;
}

interface StickerDragLayerProps {
  stickers: StickerData[];
  active: boolean;
  className?: string;
}

const parseUnit = (value: string, base: number) => (parseFloat(value) / 100) * base;

const getStickerWidth = (vw: number, isMobile: boolean) => (isMobile ? 0.3 : 0.12) * vw;

const ENTRANCE_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/** Scatter stickers so they don't all sit axis-aligned. */
const randomRestRotation = () => (Math.random() - 0.5) * 28; // ~±14°

const StickerDragLayer: FC<StickerDragLayerProps> = ({ stickers, active, className }) => {
  const [layout, setLayout] = useState({ vw: 0, vh: 0, isMobile: false });
  const [aspects, setAspects] = useState<Record<string, number>>({});

  const stickerMeta = useMemo(
    () =>
      stickers.map((sticker, index) => ({
        ...sticker,
        duration: Math.random() * 0.3 + 0.3,
        delay: Math.random() * 0.15,
        rotation: randomRestRotation(),
        key: `${sticker.src}-${index}`
      })),
    [stickers]
  );

  useEffect(() => {
    const update = () => {
      setLayout({
        vw: window.innerWidth,
        vh: window.innerHeight,
        isMobile: window.matchMedia('(max-width: 480px)').matches
      });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    stickers.forEach(({ src }) => {
      const img = new Image();
      img.onload = () => {
        setAspects((prev) => {
          if (prev[src]) return prev;
          return {
            ...prev,
            [src]: img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
          };
        });
      };
      img.src = src;
    });
  }, [stickers]);

  if (layout.vw === 0) return null;

  const baseWidth = getStickerWidth(layout.vw, layout.isMobile);

  return (
    <div className={className ?? styles.layer}>
      {stickerMeta.map((sticker) => {
        const aspect = aspects[sticker.src] || 1;
        const width = baseWidth;
        const height = width / aspect;

        return (
          <motion.div
            key={sticker.key}
            className={styles.slot}
            style={{
              left: parseUnit(sticker.startX, layout.vw),
              top: parseUnit(sticker.startY, layout.vh),
              width,
              height
            }}
            initial={false}
            animate={
              active
                ? { x: 0, y: 0, opacity: 1 }
                : { x: sticker.transformEndX, y: sticker.transformEndY, opacity: 0 }
            }
            transition={{
              duration: active ? sticker.duration : 0.3,
              delay: active ? sticker.delay : 0,
              ease: ENTRANCE_EASE
            }}
          >
            <StickerDrag
              image={sticker.src}
              imageWidth={width}
              imageHeight={height}
              rotation={sticker.rotation}
            />
          </motion.div>
        );
      })}
    </div>
  );
};

export { StickerDragLayer };
