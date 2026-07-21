export const FOCUS_EXIT_SCALE = 0.85;
/** Used when peerReturnStagger="focus" — inside-out ripple (near first) */
export const FOCUS_PEER_RETURN_RIPPLE_S = 0.85;
export const FOCUS_PEER_RETURN_BASE_S = 0.04;
export const FOCUS_PEER_RETURN_JITTER_S = 0.08;
/** Soft reveal for focus copy — snappy enough to read as settled, still soft */
export const FOCUS_COPY_SPRING = {
  type: 'spring' as const,
  stiffness: 78,
  damping: 20,
  mass: 0.95
};
/** Match Flyout closeBtn — scale + fade over material ease */
export const FOCUS_CLOSE_TRANSITION = {
  duration: 0.6,
  ease: [0.4, 0, 0.2, 1] as const
};
/** Direction-aware gallery slide (1 = next, -1 = prev, 0 = first open). */
export const FOCUS_SLIDE_TRANSITION = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1] as const
};
/** Copy travels farther than the card — Apple-style horizontal parallax */
export const FOCUS_COPY_SLIDE_TRANSITION = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1] as const
};
/** First-open copy reveal — explicit values, not variants (avoids parent motion inheritance) */
export const FOCUS_COPY_ITEM_REVEAL = {
  title: { ...FOCUS_COPY_SPRING, delay: 0.04 },
  body: { ...FOCUS_COPY_SPRING, delay: 0.1 },
  link: { ...FOCUS_COPY_SPRING, delay: 0.16 }
};

export type FocusSlideTargets = {
  initial: false | { x?: string | number; y?: number; opacity: number };
  animate: { x: number; y: number; opacity: number };
  exit: { x?: string | number; y?: number; opacity: number };
  transition: object;
};

const FOCUS_SLIDE_CENTER = { x: 0, y: 0, opacity: 1 } as const;

export const getFocusCardSlideTargets = (dir: number): FocusSlideTargets => {
  if (dir === 0) {
    return {
      initial: false,
      animate: FOCUS_SLIDE_CENTER,
      exit: { x: 0, opacity: 0 },
      transition: FOCUS_SLIDE_TRANSITION
    };
  }
  return {
    initial: { x: dir > 0 ? '8%' : '-8%', opacity: 0 },
    animate: FOCUS_SLIDE_CENTER,
    exit: { x: dir > 0 ? '-8%' : '8%', opacity: 0 },
    transition: FOCUS_SLIDE_TRANSITION
  };
};

export const getFocusCopySlideTargets = (dir: number): FocusSlideTargets => {
  if (dir === 0) {
    return {
      initial: { opacity: 0, y: 16, x: 0 },
      animate: FOCUS_SLIDE_CENTER,
      exit: { opacity: 0, y: 8, x: 0 },
      transition: FOCUS_COPY_ITEM_REVEAL.body
    };
  }
  return {
    initial: { opacity: 0, x: dir > 0 ? '40%' : '-40%', y: 0 },
    animate: FOCUS_SLIDE_CENTER,
    exit: { opacity: 0, x: dir > 0 ? '-40%' : '40%', y: 0 },
    transition: FOCUS_COPY_SLIDE_TRANSITION
  };
};

/**
 * Mobile swipe copy parallax (relative to its panel):
 * outgoing accelerates in the swipe direction + fades;
 * incoming starts offset on the opposite edge and settles as the card centers.
 */
export const FOCUS_COPY_SWIPE_PARALLAX = 0.38;

/** Progress of a swipe seat toward center: 1 = centered, 0 = fully off */
export const focusSwipeSeatProgress = (
  side: 'prev' | 'current' | 'next',
  dragX: number,
  stride: number
) => {
  const w = stride || 1;
  if (side === 'current') return 1 - Math.min(1, Math.abs(dragX) / w);
  if (side === 'next') return Math.max(0, Math.min(1, -dragX / w));
  return Math.max(0, Math.min(1, dragX / w));
};

export const FOCUS_MORPH_FALLBACK_MS = 520;
/** How long after the focus card starts home before peers follow */
export const FOCUS_PEERS_RETURN_DELAY_MS = 50;
/** Min horizontal travel (px) to count as a focus gallery swipe */
export const FOCUS_SWIPE_MIN_DX = 56;
/** Horizontal must beat vertical by this factor so scroll still wins */
export const FOCUS_SWIPE_AXIS_RATIO = 1.35;
/** Axis lock threshold before we commit to swipe vs scroll */
export const FOCUS_SWIPE_LOCK_PX = 10;
/** Spring back when a swipe doesn't commit */
export const FOCUS_SWIPE_SNAP_BACK = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 36,
  mass: 0.85
};
/** Gap between current + peek panels during swipe (must clear mobile side padding) */
export const FOCUS_SWIPE_GAP_PX = 32;
/** Finish the swipe to the adjacent panel before swapping content */
export const FOCUS_SWIPE_COMMIT = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const
};
