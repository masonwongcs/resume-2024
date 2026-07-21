'use client';

import styles from '../InfiniteCanvas.module.scss';

import React from 'react';

import { motion, useTransform, type MotionValue } from 'motion/react';

import type { Work } from '../types';
import {
  FOCUS_COPY_ITEM_REVEAL,
  FOCUS_COPY_SWIPE_PARALLAX,
  focusSwipeSeatProgress
} from './focusMotion';

export const FOCUS_LINK_ARROW = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M20.7806 12.5306L14.0306 19.2806C13.8899 19.4213 13.699 19.5004 13.5 19.5004C13.301 19.5004 13.1101 19.4213 12.9694 19.2806C12.8286 19.1399 12.7496 18.949 12.7496 18.75C12.7496 18.551 12.8286 18.3601 12.9694 18.2194L18.4397 12.75H3.75C3.55109 12.75 3.36032 12.671 3.21967 12.5303C3.07902 12.3897 3 12.1989 3 12C3 11.8011 3.07902 11.6103 3.21967 11.4697C3.36032 11.329 3.55109 11.25 3.75 11.25H18.4397L12.9694 5.78061C12.8286 5.63988 12.7496 5.44901 12.7496 5.24999C12.7496 5.05097 12.8286 4.8601 12.9694 4.71936C13.1101 4.57863 13.301 4.49957 13.5 4.49957C13.699 4.49957 13.8899 4.57863 14.0306 4.71936L20.7806 11.4694C20.8504 11.539 20.9057 11.6217 20.9434 11.7128C20.9812 11.8038 21.0006 11.9014 21.0006 12C21.0006 12.0986 20.9812 12.1961 20.9434 12.2872C20.9057 12.3782 20.8504 12.461 20.7806 12.5306Z"
      fill="#ffffff"
    />
  </svg>
);

export const formatUrl = (url?: string) => {
  if (!url) return;
  let formattedUrl = url.replace(/^(https?:\/\/)/, '');
  formattedUrl = formattedUrl.replace(/\/$/, '');
  formattedUrl = formattedUrl.replace(/^www\./, '');
  return formattedUrl;
};

/** Per-seat Apple-style copy parallax for the mobile swipe track */
export const FocusSwipeCopy: React.FC<{
  work: Work;
  side: 'prev' | 'current' | 'next';
  dragX: MotionValue<number>;
  panelStride: number;
  isCurrent: boolean;
  firstOpenReveal: boolean;
  reducedMotion: boolean;
}> = ({ work, side, dragX, panelStride, isCurrent, firstOpenReveal, reducedMotion }) => {
  const copyX = useTransform(dragX, (x) => {
    if (reducedMotion) return 0;
    const w = panelStride || 1;
    if (side === 'current') return x * FOCUS_COPY_SWIPE_PARALLAX;
    if (side === 'next') return (x + w) * FOCUS_COPY_SWIPE_PARALLAX;
    return (x - w) * FOCUS_COPY_SWIPE_PARALLAX;
  });
  const copyOpacity = useTransform(dragX, (x) => {
    if (reducedMotion) return side === 'current' ? 1 : 0;
    return focusSwipeSeatProgress(side, x, panelStride);
  });

  const link = work.url ? (
    isCurrent ? (
      <a
        className={styles.infiniteCanvasFocusLink}
        href={work.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {formatUrl(work.url)}
        {FOCUS_LINK_ARROW}
      </a>
    ) : (
      <span className={styles.infiniteCanvasFocusLink}>
        {formatUrl(work.url)}
        {FOCUS_LINK_ARROW}
      </span>
    )
  ) : null;

  if (firstOpenReveal) {
    return (
      <motion.div
        className={styles.infiniteCanvasFocusCopy}
        style={{ x: copyX }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={FOCUS_COPY_ITEM_REVEAL.body}
      >
        <h1 className={styles.infiniteCanvasFocusTitle}>{work.name}</h1>
        <div className={styles.infiniteCanvasFocusDescription}>{work.description}</div>
        {link}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={styles.infiniteCanvasFocusCopy}
      style={{ x: copyX, opacity: copyOpacity }}
    >
      <h1 className={styles.infiniteCanvasFocusTitle}>{work.name}</h1>
      <div className={styles.infiniteCanvasFocusDescription}>{work.description}</div>
      {link}
    </motion.div>
  );
};
