'use client';

import styles from '../InfiniteCanvas.module.scss';

import React from 'react';

import { motion, useTransform, type MotionValue } from 'motion/react';

import { markImageLoaded } from '@/hooks/useImageLoad';

import { focusSwipeSeatProgress } from './focusMotion';

/** Card crossfade on the swipe track — softens the hard “next slide” on chevron nav */
export const FocusSwipeCard: React.FC<{
  side: 'prev' | 'current' | 'next';
  dragX: MotionValue<number>;
  panelStride: number;
  reducedMotion: boolean;
  /** Stronger ease-in on incoming (desktop chevron feels smoother than a hard peek) */
  softIncoming: boolean;
  isCurrent: boolean;
  isOriginWork: boolean;
  detailWidth: number;
  scaledScreenHeight: number;
  borderRadius: number;
  panelSrc: string;
  workName: string;
  /** Custom hero instead of the work image (e.g. Cover Flow) */
  banner?: React.ReactNode;
  setFocusCardNode?: (node: HTMLDivElement | null) => void;
  setFocusImageNode?: (node: HTMLImageElement | null) => void;
}> = ({
  side,
  dragX,
  panelStride,
  reducedMotion,
  softIncoming,
  isCurrent,
  isOriginWork,
  detailWidth,
  scaledScreenHeight,
  borderRadius,
  panelSrc,
  workName,
  banner,
  setFocusCardNode,
  setFocusImageNode
}) => {
  const cardOpacity = useTransform(dragX, (x) => {
    if (reducedMotion) return side === 'current' ? 1 : 0;
    const t = focusSwipeSeatProgress(side, x, panelStride);
    if (side === 'current') {
      // Hold opacity, then ease out so the handoff doesn’t flash a twin card
      return softIncoming ? Math.pow(t, 0.7) : Math.max(0.35, t);
    }
    // Incoming: stay faded early, bloom in as it centers
    return softIncoming ? t * t : Math.max(0.2, t);
  });

  return (
    <motion.div
      ref={isCurrent ? setFocusCardNode : undefined}
      className={styles.infiniteCanvasFocusCard}
      data-origin={isOriginWork ? 'true' : undefined}
      style={{
        width: detailWidth,
        height: scaledScreenHeight,
        borderRadius,
        opacity: cardOpacity
      }}
    >
      {isOriginWork ? (
        <div className={styles.infiniteCanvasFocusCardCustom} aria-hidden />
      ) : banner ? (
        <div className={styles.infiniteCanvasFocusCardBanner} aria-hidden={!isCurrent}>
          {banner}
        </div>
      ) : (
        <img
          ref={isCurrent ? setFocusImageNode : undefined}
          className={styles.infiniteCanvasFocusCardImage}
          src={panelSrc}
          alt={isCurrent ? workName : ''}
          draggable={false}
          decoding="async"
          fetchPriority={isCurrent ? 'high' : 'auto'}
          onLoad={isCurrent ? () => markImageLoaded(panelSrc) : undefined}
        />
      )}
    </motion.div>
  );
};
