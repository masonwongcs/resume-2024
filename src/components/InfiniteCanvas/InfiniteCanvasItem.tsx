'use client';

import styles from './InfiniteCanvasItem.module.scss';

import React, { useCallback, useRef } from 'react';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import type { SpringOptions } from 'motion/react';

import { useImageLoad } from '@/hooks/useImageLoad';

interface Work {
  name: string;
  url: string;
  image: string;
  video?: string;
  thumbnail?: string;
  description: string;
}

export interface InfiniteCanvasItemIntro {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  delay: number;
  opacity: number;
  zIndex: number;
}

interface InfiniteCanvasItemProps {
  work: Work;
  x: number;
  y: number;
  width: number;
  height: number;
  intro?: InfiniteCanvasItemIntro;
  /** When false, intro items stay clustered until the spread is triggered */
  shouldSpread?: boolean;
  onClick: () => void;
  onIntroComplete?: () => void;
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
  x,
  y,
  width,
  height,
  intro,
  shouldSpread = true,
  onClick,
  onIntroComplete
}) => {
  const isLoaded = useImageLoad(work.image);
  const itemRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const shouldPlayIntro = Boolean(intro) && !prefersReducedMotion;
  const isClustered = shouldPlayIntro && !shouldSpread;

  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);
  const shineX = useSpring(50, springValues);
  const shineY = useSpring(50, springValues);
  const shineOpacity = useSpring(useMotionValue(0), springValues);
  const angle = useSpring(useMotionValue(180), springValues); // Initial angle for tilt.js style (180deg = default glare position)

  // Calculate border gradient angle based on card tilt
  // The angle follows the direction of the tilt for a more realistic effect
  const borderGradientAngle = useTransform([rotateX, rotateY], ([rx, ry]: number[]) => {
    // Calculate angle from rotation values (in degrees)
    // atan2 gives us the direction of the tilt
    const angle = (Math.atan2(ry, rx) * 180) / Math.PI;
    // Offset by 135deg (the base angle) and normalize to 0-360
    let normalized = (angle + 135) % 360;
    if (normalized < 0) normalized += 360;
    return `${normalized}deg`;
  });

  // Calculate shine position with perspective distortion based on card rotation
  const shineBackground = useTransform([shineX, shineY, rotateX, rotateY], ([x, y, rx, ry]: number[]) => {
    // Convert rotation to radians
    const rotXRad = (rx * Math.PI) / 180;
    const rotYRad = (ry * Math.PI) / 180;

    // Adjust shine position based on rotation (perspective effect)
    // When card tilts, the shine should shift to account for the 3D perspective
    const adjustedX = x + Math.sin(rotYRad) * 10;
    const adjustedY = y + Math.sin(rotXRad) * 10;

    // Calculate tilt intensity based on absolute rotation angles
    // Use the magnitude of rotation to determine how much the surface faces away from light
    const absRotX = Math.abs(rx);
    const absRotY = Math.abs(ry);
    const maxRotation = Math.max(absRotX, absRotY);
    // Map rotation (0-14 degrees) to intensity (1.0 to 0.4) for dramatic variation
    // Normalize to 0-1 range, then invert and scale
    const normalizedTilt = maxRotation / ROTATE_AMPLITUDE;
    const intensity = 1.0 - normalizedTilt * 0.6; // Range from 1.0 (flat) to 0.4 (max tilt)

    // Make gradient elliptical when tilted (more realistic)
    // Make the base size larger (150%) so it extends beyond card edges
    const baseSize = 150;
    const scaleX = baseSize * (1 + Math.abs(Math.sin(rotYRad)) * 0.3);
    const scaleY = baseSize * (1 + Math.abs(Math.sin(rotXRad)) * 0.3);

    return `radial-gradient(ellipse ${scaleX}% ${scaleY}% at ${adjustedX}% ${adjustedY}%, rgba(255, 255, 255, ${0.1 * intensity}), transparent 70%)`;
  });

  // Calculate shine rotation based on tilt.js angle
  const shineRotation = useTransform(angle, (a: number) => `${a}deg`);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!itemRef.current) return;

      const rect = itemRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - rect.width / 2;
      const offsetY = e.clientY - rect.top - rect.height / 2;

      const rotationX = (offsetY / (rect.height / 2)) * -ROTATE_AMPLITUDE;
      const rotationY = (offsetX / (rect.width / 2)) * ROTATE_AMPLITUDE;

      // Calculate shine position as percentage (0-100)
      const shineXPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const shineYPercent = ((e.clientY - rect.top) / rect.height) * 100;

      // Calculate angle for glare/shine rotation - tilt.js style
      // angle = atan2(x - centerX, -(y - centerY)) * (180/Math.PI)
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const calculatedAngle = (Math.atan2(e.clientX - centerX, -(e.clientY - centerY)) * 180) / Math.PI;

      rotateX.set(rotationX);
      rotateY.set(rotationY);
      angle.set(calculatedAngle);
      shineX.set(shineXPercent);
      shineY.set(shineYPercent);
    },
    [rotateX, rotateY, angle, shineX, shineY]
  );

  const handleMouseEnter = useCallback(() => {
    scale.set(SCALE_ON_HOVER);
    shineOpacity.set(1);
  }, [scale, shineOpacity]);

  const handleMouseLeave = useCallback(() => {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    angle.set(180); // Reset to default angle (tilt.js style)
    shineOpacity.set(0);
  }, [scale, rotateX, rotateY, angle, shineOpacity]);

  return (
    <motion.div
      ref={itemRef}
      className={styles.infiniteCanvasItem}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      initial={
        shouldPlayIntro && intro
          ? { x: intro.x, y: intro.y, rotate: intro.rotate, scale: intro.scale, opacity: intro.opacity }
          : { x, y, rotate: 0, scale: 1, opacity: 1 }
      }
      animate={
        isClustered && intro
          ? { x: intro.x, y: intro.y, rotate: intro.rotate, scale: intro.scale, opacity: intro.opacity }
          : { x, y, rotate: 0, scale: 1, opacity: 1 }
      }
      transition={
        shouldPlayIntro && intro && shouldSpread
          ? {
              type: 'spring',
              stiffness: 82,
              damping: 16,
              mass: 0.95,
              delay: intro.delay
            }
          : { duration: 0 }
      }
      onAnimationComplete={() => {
        if (shouldPlayIntro && shouldSpread) {
          onIntroComplete?.();
        }
      }}
      style={{
        width,
        height,
        zIndex: intro?.zIndex,
        willChange: 'transform, opacity'
      }}
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
          height: '100%',
          ['--card-border-gradiet-angle' as string]: borderGradientAngle
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
        <motion.div
          className={styles.infiniteCanvasItemShine}
          style={{
            background: shineBackground,
            opacity: shineOpacity,
            pointerEvents: 'none',
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            rotate: shineRotation
          }}
        />
      </motion.div>
    </motion.div>
  );
};
