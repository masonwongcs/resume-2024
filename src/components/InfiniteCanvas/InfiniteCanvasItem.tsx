'use client';

import React, { useRef, useCallback } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import type { SpringOptions } from 'motion/react';
import styles from './InfiniteCanvasItem.module.scss';
import { useImageLoad } from '@/hooks/useImageLoad';

interface Work {
  name: string;
  url: string;
  image: string;
  video?: string;
  thumbnail?: string;
  description: string;
}

interface InfiniteCanvasItemProps {
  work: Work;
  style: React.CSSProperties;
  onClick: () => void;
}

const springValues: SpringOptions = {
  damping: 30,
  stiffness: 100,
  mass: 2
};

const ROTATE_AMPLITUDE = 14; // Maximum tilt angle in degrees
const SCALE_ON_HOVER = 1.05;

export const InfiniteCanvasItem: React.FC<InfiniteCanvasItemProps> = ({
  work,
  style,
  onClick
}) => {
  const isLoaded = useImageLoad(work.image);
  const itemRef = useRef<HTMLDivElement>(null);

  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!itemRef.current) return;

      const rect = itemRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - rect.width / 2;
      const offsetY = e.clientY - rect.top - rect.height / 2;

      const rotationX = (offsetY / (rect.height / 2)) * -ROTATE_AMPLITUDE;
      const rotationY = (offsetX / (rect.width / 2)) * ROTATE_AMPLITUDE;

      rotateX.set(rotationX);
      rotateY.set(rotationY);
    },
    [rotateX, rotateY]
  );

  const handleMouseEnter = useCallback(() => {
    scale.set(SCALE_ON_HOVER);
  }, [scale]);

  const handleMouseLeave = useCallback(() => {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  }, [scale, rotateX, rotateY]);

  return (
    <div
      ref={itemRef}
      className={styles.infiniteCanvasItem}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={style}
    >
      <div
        className={styles.infiniteCanvasItemBackground}
        style={{
          opacity: isLoaded ? 0 : 1
        }}
      />
      <motion.div
        className={styles.infiniteCanvasItemInner}
        style={{
          rotateX,
          rotateY,
          scale,
          transformStyle: 'preserve-3d',
          width: '100%',
          height: '100%'
        }}
      >
        <img
          className={styles.infiniteCanvasItemImage}
          src={work?.thumbnail ? work?.thumbnail : work.image}
          alt={work.name}
          style={{
            opacity: isLoaded ? 1 : 0
          }}
        />
      </motion.div>
    </div>
  );
};
