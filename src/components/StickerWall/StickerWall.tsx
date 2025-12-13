'use client';

import styles from './StickerWall.module.scss';

import React, { useEffect, useState } from 'react';

import { useWorkStore } from '@/store';

interface Sticker {
  id: number;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  img: string;
}

interface StickerWallProps {
  width?: number;
  height?: number;
  items?: Array<{
    id: number;
    img: string;
    width: number;
    height: number;
  }>;
  maxOverlapTries?: number;
}

const checkOverlap = (item1: Sticker, item2: Sticker, overlapThreshold = 0.5) => {
  const xOverlap = Math.max(0, Math.min(item1.x + item1.width, item2.x + item2.width) - Math.max(item1.x, item2.x));
  const yOverlap = Math.max(0, Math.min(item1.y + item1.height, item2.y + item2.height) - Math.max(item1.y, item2.y));
  const overlapArea = xOverlap * yOverlap;

  const item1Area = item1.width * item1.height;
  const item2Area = item2.width * item2.height;
  const minArea = Math.min(item1Area, item2Area);

  return overlapArea / minArea > overlapThreshold;
};

const findValidPosition = (
  item: Omit<Sticker, 'x' | 'y' | 'rotation'>,
  placedItems: Sticker[],
  containerWidth: number,
  containerHeight: number,
  maxTries: number
): { x: number; y: number; rotation: number } | null => {
  for (let i = 0; i < maxTries; i++) {
    const x = Math.random() * (containerWidth - item.width);
    const y = Math.random() * (containerHeight - item.height);
    const rotation = Math.random() * 30 - 15;

    const newItem = { ...item, x, y, rotation };

    const hasOverlap = placedItems.some((placedItem) => checkOverlap(newItem, placedItem));

    if (!hasOverlap) {
      return { x, y, rotation };
    }
  }

  return {
    x: Math.random() * (containerWidth - item.width),
    y: Math.random() * (containerHeight - item.height),
    rotation: Math.random() * 30 - 15
  };
};

const StickerWall = ({ width = 600, height = 400, maxOverlapTries = 50 }: StickerWallProps) => {
  const stickersQueue = useWorkStore((state) => state.stickersQueue);
  const [placedStickers, setPlacedStickers] = useState<Sticker[]>([]);

  useEffect(() => {
    const items = stickersQueue?.map(({ src }, index) => ({
      id: index + 1,
      img: src,
      width: Math.random() * 20 + 30,
      height: Math.random() * 20 + 30
    }));

    const placeStickers = () => {
      const placed: Sticker[] = [];

      items.forEach((item) => {
        const position = findValidPosition(item, placed, width, height, maxOverlapTries);
        if (position) {
          placed.push({
            ...item,
            ...position
          });
        }
      });

      setPlacedStickers(placed);
    };

    placeStickers();
  }, [stickersQueue, width, height, maxOverlapTries]);

  return (
    <div className={styles.container} style={{ width, height }}>
      {placedStickers.map((sticker) => (
        <div
          key={sticker.id}
          className={styles.stickerWrapper}
          style={{
            transform: `translate(${sticker.x}px, ${sticker.y}px) rotate(${sticker.rotation}deg) translateZ(1px)`,
            width: sticker.width,
            height: sticker.height
          }}
        >
          <img src={sticker.img} alt={`Sticker ${sticker.id}`} className={styles.stickerImage} />
        </div>
      ))}
    </div>
  );
};

export { StickerWall };
