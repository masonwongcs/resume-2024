'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';

import { AnimatePresence, animate, motion, useAnimationFrame, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'motion/react';

import { isImageCached, markImageLoaded, preloadImage, preloadImages } from '@/hooks/useImageLoad';
import type { MarqueePersistedState } from '@/components/CurvedLoop';
import { useHomeStore } from '@/store';

import {
  type InfiniteCanvasFocusMode,
  InfiniteCanvasItem,
  type InfiniteCanvasItemIntro,
  type ProximityRegistration
} from './InfiniteCanvasItem';
import { type ProximityFrameHandler, type ProximityResetHandler, createCanvasViewState } from './canvasView';

export interface Work {
  name: string;
  url?: string;
  image: string;
  video?: string;
  thumbnail?: string;
  description: ReactNode;
}

interface GridItem {
  id: string;
  work: Work;
  offsetX: number;
  offsetY: number;
  /** True for the one-shot custom center card */
  isOriginCard?: boolean;
}

export type PeerReturnStagger = 'legacy' | 'focus';

export type OriginCardRenderProps = {
  width: number;
  height: number;
  /**
   * False while the origin card is still in the pre-stack pill pose.
   * Used to hold the marquee on "Hi" until the card is actually visible.
   */
  active?: boolean;
  /** Open focus mode — wired by InfiniteCanvas (portaled content does not bubble clicks) */
  onActivate?: () => void;
  /** Shared marquee offset — survives grid ↔ focus portal handoff */
  marqueeState?: React.MutableRefObject<MarqueePersistedState>;
  /** True while the origin card is open in focus mode */
  inFocus?: boolean;
};

/**
 * One-shot custom card pinned to the intro origin (viewport center / top of stack).
 * Never tiled elsewhere in the infinite grid.
 */
export interface OriginCardConfig {
  /** Focus overlay metadata; optional poster via image/thumbnail for stack silhouette */
  work: Work;
  render: (props: OriginCardRenderProps) => React.ReactNode;
  /** Open the focus overlay on click. Defaults to true. */
  focusable?: boolean;
}

interface InfiniteCanvasProps {
  works: Work[];
  /**
   * How surrounding cards stagger back in after focus closes.
   * Defaults to `focus` on mobile, `legacy` on desktop.
   * - `legacy` — original intro delays (distance from load-time center)
   * - `focus` — ripple from the clicked card
   */
  peerReturnStagger?: PeerReturnStagger;
  /** Custom React face for the middle / top-of-stack card (appears once) */
  originCard?: OriginCardConfig;
  /** Fired when the "Back to start" control should show/hide (render outside the masked canvas) */
  onRecenterAvailabilityChange?: (visible: boolean) => void;
  /** Parent assigns click handler for the external recenter control */
  recenterActionRef?: React.MutableRefObject<(() => void) | null>;
}

// Matches Loader.module.scss exit: clip-path 1s @ 400ms + fade 200ms @ 1.4s
const INTRO_SPREAD_RIPPLE_S = 0.42;
/** Unlock tilt/proximity after spread starts — keep long enough for the spring to settle */
const INTRO_SPREAD_SAFETY_MS = 1800;
/** Pull the header in shortly after spread begins — don't wait for the full settle */
const HEADER_REVEAL_AFTER_SPREAD_MS = 420;
const INTRO_CLUSTER_ROTATION_RANGE = 32;
/** Gap between cards joining the load-time stack */
const STACK_ENTER_GAP_MS = 90;
/**
 * After the last card is released into the pile, wait for its enter spring to
 * reach center before spread — too short and the last few peel toward home mid-flight.
 */
const STACK_SETTLE_BEFORE_LOAD_MS = 900;
/** Force-complete intro preload / stack formation if an image hangs */
const INTRO_PRELOAD_SAFETY_MS = 8000;
/** Absolute fallback so a failed intro capture never blocks the site */
const INTRO_LOAD_FALLBACK_MS = 12000;
const FOCUS_EXIT_SCALE = 0.85;
/** Used when peerReturnStagger="focus" — inside-out ripple (near first) */
const FOCUS_PEER_RETURN_RIPPLE_S = 0.85;
const FOCUS_PEER_RETURN_BASE_S = 0.04;
const FOCUS_PEER_RETURN_JITTER_S = 0.08;
/** Soft reveal for focus copy — snappy enough to read as settled, still soft */
const FOCUS_COPY_SPRING = {
  type: 'spring' as const,
  stiffness: 78,
  damping: 20,
  mass: 0.95
};
/** Match Flyout closeBtn — scale + fade over material ease */
const FOCUS_CLOSE_TRANSITION = {
  duration: 0.6,
  ease: [0.4, 0, 0.2, 1] as const
};
/** Direction-aware gallery slide (1 = next, -1 = prev, 0 = first open). */
const FOCUS_SLIDE_TRANSITION = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1] as const
};
/** Copy travels farther than the card — Apple-style horizontal parallax */
const FOCUS_COPY_SLIDE_TRANSITION = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1] as const
};
const getFocusSlideInitial = (dir: number) =>
  dir === 0 ? false : { x: dir > 0 ? '8%' : '-8%', opacity: 0 };
const getFocusSlideExit = (dir: number) => ({
  x: dir > 0 ? '-8%' : '8%',
  opacity: 0
});
/** Desktop: outgoing fades in swipe direction; incoming slides in from the opposite side */
const getFocusCopySlideInitial = (dir: number) =>
  dir === 0
    ? { opacity: 0, y: 16 }
    : { opacity: 0, x: dir > 0 ? '40%' : '-40%' };
const getFocusCopySlideExit = (dir: number) =>
  dir === 0
    ? { opacity: 0, y: 8 }
    : { opacity: 0, x: dir > 0 ? '-40%' : '40%' };
/**
 * Mobile swipe copy parallax (relative to its panel):
 * outgoing accelerates in the swipe direction + fades;
 * incoming starts offset on the opposite edge and settles as the card centers.
 */
const FOCUS_COPY_SWIPE_PARALLAX = 0.38;

/** Progress of a swipe seat toward center: 1 = centered, 0 = fully off */
const focusSwipeSeatProgress = (
  side: 'prev' | 'current' | 'next',
  dragX: number,
  stride: number
) => {
  const w = stride || 1;
  if (side === 'current') return 1 - Math.min(1, Math.abs(dragX) / w);
  if (side === 'next') return Math.max(0, Math.min(1, -dragX / w));
  return Math.max(0, Math.min(1, dragX / w));
};
/** First-open copy reveal — explicit values, not variants (avoids parent motion inheritance) */
const FOCUS_COPY_ITEM_REVEAL = {
  title: { ...FOCUS_COPY_SPRING, delay: 0.04 },
  body: { ...FOCUS_COPY_SPRING, delay: 0.1 },
  link: { ...FOCUS_COPY_SPRING, delay: 0.16 }
};
/** Matches .infiniteCanvasFocusDetail width — focused card scales to this */
const FOCUS_DETAIL_MAX_WIDTH = 600;
const FOCUS_DETAIL_MAX_WIDTH_XL = 700;
/** Must match .infiniteCanvasFocusScrollInner mobile side padding */
const FOCUS_MOBILE_SIDE_PAD = 24;

const FOCUS_LINK_ARROW = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M20.7806 12.5306L14.0306 19.2806C13.8899 19.4213 13.699 19.5004 13.5 19.5004C13.301 19.5004 13.1101 19.4213 12.9694 19.2806C12.8286 19.1399 12.7496 18.949 12.7496 18.75C12.7496 18.551 12.8286 18.3601 12.9694 18.2194L18.4397 12.75H3.75C3.55109 12.75 3.36032 12.671 3.21967 12.5303C3.07902 12.3897 3 12.1989 3 12C3 11.8011 3.07902 11.6103 3.21967 11.4697C3.36032 11.329 3.55109 11.25 3.75 11.25H18.4397L12.9694 5.78061C12.8286 5.63988 12.7496 5.44901 12.7496 5.24999C12.7496 5.05097 12.8286 4.8601 12.9694 4.71936C13.1101 4.57863 13.301 4.49957 13.5 4.49957C13.699 4.49957 13.8899 4.57863 14.0306 4.71936L20.7806 11.4694C20.8504 11.539 20.9057 11.6217 20.9434 11.7128C20.9812 11.8038 21.0006 11.9014 21.0006 12C21.0006 12.0986 20.9812 12.1961 20.9434 12.2872C20.9057 12.3782 20.8504 12.461 20.7806 12.5306Z"
      fill="#ffffff"
    />
  </svg>
);

const formatUrl = (url?: string) => {
  if (!url) return;
  let formattedUrl = url.replace(/^(https?:\/\/)/, '');
  formattedUrl = formattedUrl.replace(/\/$/, '');
  formattedUrl = formattedUrl.replace(/^www\./, '');
  return formattedUrl;
};

/** Per-seat Apple-style copy parallax for the mobile swipe track */
const FocusSwipeCopy: React.FC<{
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

/** Card crossfade on the swipe track — softens the hard “next slide” on chevron nav */
const FocusSwipeCard: React.FC<{
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

const getFocusDetailWidth = (viewportWidth: number) => {
  // Must match .infiniteCanvasFocusDetail / wrap padding
  if (viewportWidth <= 480) {
    return viewportWidth - FOCUS_MOBILE_SIDE_PAD * 2;
  }
  const maxWidth = viewportWidth >= 1920 ? FOCUS_DETAIL_MAX_WIDTH_XL : FOCUS_DETAIL_MAX_WIDTH;
  return Math.min(viewportWidth * 0.92, maxWidth);
};

/** Cell size from the live viewport — matches InfiniteCanvas render formulas */
const getLiveCellMetrics = () => {
  const isMobile = window.innerWidth <= 480;
  const cellWidth = isMobile ? window.innerWidth / 2.3 : window.innerWidth / 4.6;
  return {
    cellWidth,
    cellHeight: (cellWidth * 3) / 5,
    gapSize: isMobile ? window.innerWidth / 8 : window.innerWidth / 24
  };
};

const computeFocusLayout = (
  view: { width: number; height: number; offsetX: number; offsetY: number; zoom: number },
  cellWidth: number,
  cellHeight: number
) => {
  const detailWidth = getFocusDetailWidth(view.width);
  // screenWidth = cellWidth * zoom * cardScale → match detail column
  const cardScale = detailWidth / (cellWidth * view.zoom);
  const scaledScreenHeight = cellHeight * view.zoom * cardScale;
  // Mobile: fixed inset for scroll room. Desktop: % of viewport height.
  const cardTopScreenY = view.width <= 480 ? 100 : view.height * 0.15;
  const cardCenterScreenY = cardTopScreenY + scaledScreenHeight / 2;
  const contentCenterX = view.width / 2 - view.offsetX / view.zoom;
  const contentCenterY = view.height / 2 + (cardCenterScreenY - view.height / 2 - view.offsetY) / view.zoom;
  const pushDistance = (Math.hypot(view.width, view.height) / view.zoom) * 1.2;
  return {
    contentCenterX,
    contentCenterY,
    cardScale,
    detailWidth,
    scaledScreenHeight,
    cardTopScreenY,
    pushDistance
  };
};

interface FocusSnapshot {
  /** Morph destination (focus layout position) in content space */
  contentCenterX: number;
  contentCenterY: number;
  /** Clicked card center — peers spread from / return toward this point */
  originCenterX: number;
  originCenterY: number;
  pushDistance: number;
  /** Scale so on-screen card width matches the detail text column */
  cardScale: number;
  detailWidth: number;
  scaledScreenHeight: number;
  cardTopScreenY: number;
}

/** Morph canvas → swap to HTML → reverse handoff → card home → peers home */
type FocusPhase = 'in' | 'settled' | 'out' | 'returning';

const CARD_BORDER_RADIUS_RATIO = 20 / (1440 / 4.6);
const FOCUS_MORPH_FALLBACK_MS = 520;
/** How long after the focus card starts home before peers follow */
const FOCUS_PEERS_RETURN_DELAY_MS = 50;
/** Min horizontal travel (px) to count as a focus gallery swipe */
const FOCUS_SWIPE_MIN_DX = 56;
/** Horizontal must beat vertical by this factor so scroll still wins */
const FOCUS_SWIPE_AXIS_RATIO = 1.35;
/** Axis lock threshold before we commit to swipe vs scroll */
const FOCUS_SWIPE_LOCK_PX = 10;
/** Spring back when a swipe doesn't commit */
const FOCUS_SWIPE_SNAP_BACK = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 36,
  mass: 0.85
};
/** Gap between current + peek panels during swipe (must clear mobile side padding) */
const FOCUS_SWIPE_GAP_PX = 32;
/** Finish the swipe to the adjacent panel before swapping content */
const FOCUS_SWIPE_COMMIT = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const
};
/** Content-space distance (× viewport diagonal) before "Back to start" can appear */
const RECENTER_SHOW_DIST = 0.95;
/** Hide again once this close to home (hysteresis) */
const RECENTER_HIDE_DIST = 0.4;
/** Return seat farther than this × viewport diagonal → shrink to center instead of flying home */
const FOCUS_RETURN_CENTER_DIST = 0.45;
/** Wait until pan/coast settles before showing the control */
const RECENTER_IDLE_MS = 480;

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({
  works,
  peerReturnStagger,
  originCard,
  onRecenterAvailabilityChange,
  recenterActionRef
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);
  const resetLoading = useHomeStore((state) => state.resetLoading);
  const setIntroComplete = useHomeStore((state) => state.setIntroComplete);
  const setCanvasFocused = useHomeStore((state) => state.setCanvasFocused);
  const loaded = useHomeStore((state) => state.loaded);
  const introComplete = useHomeStore((state) => state.introComplete);

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, GridItem>>(new Map());
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const targetZoomRef = useRef(1);
  /** Last cell window committed to React — skip setState while this is unchanged */
  const committedCellWindowRef = useRef<string | null>(null);
  /** True after camera has synced React cull state at rest */
  const cullSettledRef = useRef(true);
  /** Throttle React cull commits during touch so overscan stays warm without remount storms */
  const lastCullCommitMsRef = useRef(0);
  const animationFrameRef = useRef<number>(null);
  const workUsageCountRef = useRef<Map<string, number>>(new Map());
  const lastTouchDistance = useRef<number | null>(null);
  const lastPinchMidRef = useRef<{ x: number; y: number } | null>(null);
  const isPinching = useRef(false);
  /** True only for touch drag — mouse drag keeps wheel lerp */
  const isTouchDrag = useRef(false);
  /** Swallow only the click tied to pointer-up after a pan — not the next intentional click */
  const suppressClickRef = useRef(false);
  const dragDistanceRef = useRef(0);
  /** Touch pan velocity in px/frame (normalized to ~60fps) — drives post-release inertia */
  const panVelocityRef = useRef({ x: 0, y: 0 });
  const lastMoveTsRef = useRef(0);
  const isCoastingRef = useRef(false);
  /** True after a touch drag sample — survives handleTouchEnd clearing isTouchDrag */
  const touchInertiaEligibleRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const introConfigRef = useRef<Map<string, InfiniteCanvasItemIntro> | null>(null);
  /** Intro cards in stackOrder (bottom → top) for sequential formation + forced mount */
  const introStackRef = useRef<{ id: string; src: string; item: GridItem & { x: number; y: number } }[] | null>(null);
  const introCompletedIdsRef = useRef<Set<string>>(new Set());
  /** Content-space center of the card that should sit dead-middle after intro */
  const introOriginRef = useRef<{ x: number; y: number } | null>(null);
  /** Grid id of the one-shot custom origin card */
  const originCardIdRef = useRef<string | null>(null);
  /** Pending camera snap from intro capture — applied once in layout effect */
  const pendingIntroSnapRef = useRef<{ x: number; y: number } | null>(null);
  const [introFlush, setIntroFlush] = useState(0);
  const [introReady, setIntroReady] = useState(false);
  const [shouldSpread, setShouldSpread] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(() => !prefersReducedMotion);
  /** Ids that have animated into the load-time stack */
  const [stackEnteredIds, setStackEnteredIds] = useState(() => new Set<string>());
  /** Ids whose enter spring has actually reached the cluster (not just been released) */
  const stackLandedIdsRef = useRef(new Set<string>());
  const formationSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedWork, setFocusedWork] = useState<Work | null>(null);
  const [focusSnapshot, setFocusSnapshot] = useState<FocusSnapshot | null>(null);
  const [focusPhase, setFocusPhase] = useState<FocusPhase | null>(null);
  const [morphCardHidden, setMorphCardHidden] = useState(false);
  /** Let peers spring home while the focused card is still returning (don't clearFocus early) */
  const [releaseFocusPeers, setReleaseFocusPeers] = useState(false);
  const focusedIdRef = useRef<string | null>(null);
  const focusPhaseRef = useRef<FocusPhase | null>(null);
  const focusCardRef = useRef<HTMLDivElement>(null);
  const focusImageRef = useRef<HTMLImageElement>(null);
  /** Keep refs across AnimatePresence slide swaps — exiting nodes must not clear the live card */
  const setFocusCardNode = useCallback((node: HTMLDivElement | null) => {
    if (node) focusCardRef.current = node;
  }, []);
  const setFocusImageNode = useCallback((node: HTMLImageElement | null) => {
    if (node) focusImageRef.current = node;
  }, []);
  /** Prefer the live connected card node (stale refs survive Presence/panel unmounts) */
  const getLiveFocusCardNode = useCallback(() => {
    const pinned = focusCardRef.current;
    if (pinned && pinned.isConnected) return pinned;
    const shell = focusScrollShellRef.current;
    if (!shell) return null;
    return shell.querySelector<HTMLElement>(`.${styles.infiniteCanvasFocusCard}`);
  }, []);
  const focusArriveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** After gallery swap, immediately hide the previous morph card (skip home → push spring) */
  const focusNavPrevIdRef = useRef<string | null>(null);
  /** True while close is lerping the camera to an off-screen return seat */
  const focusReturnPanActiveRef = useRef(false);
  /** Far-off return seat: shrink/fade at focus center instead of flying to grid home */
  const focusReturnToCenterRef = useRef(false);
  /** Gallery slide direction: 1 next, -1 prev, 0 initial open */
  const [focusNavDirection, setFocusNavDirection] = useState(0);
  /** Skip enter/exit slide after a committed swipe (peek already in place) */
  const [focusNavInstant, setFocusNavInstant] = useState(false);
  /** Mobile focus gallery swipe tracking */
  const focusSwipeRef = useRef<{
    x: number;
    y: number;
    axis: 'x' | 'y' | null;
  } | null>(null);
  const focusSwipeDragX = useMotionValue(0);
  const focusSwipeDragXRef = useRef(focusSwipeDragX);
  focusSwipeDragXRef.current = focusSwipeDragX;
  const focusDetailWidthRef = useRef(0);
  const focusSwipeCommittingRef = useRef(false);
  /** Mount peeks only while a horizontal swipe is live — prevents rest-frame bleed */
  const [focusSwipePeeksLive, setFocusSwipePeeksLive] = useState(false);
  /** Where the origin card sits in the swipe track — drives live-morph follow */
  const originSwipeSlotRef = useRef<'prev' | 'current' | 'next' | null>(null);
  /** Block nudge sync during seat swap so morph doesn't flash at center behind the UI */
  const originSwipeHandoffRef = useRef(false);
  const [originCanvasHost, setOriginCanvasHost] = useState<HTMLDivElement | null>(null);
  /** Portrait raised while focus is settled — face stays on the canvas morph (no portal) */
  const [originPortraitUp, setOriginPortraitUp] = useState(false);
  const originMarqueeStateRef = useRef<MarqueePersistedState>({
    offset: 0,
    direction: 'left',
    spacing: 0,
    initialized: false
  });
  const showRecenterRef = useRef(false);
  const isRecenteringRef = useRef(false);
  const recenterIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRecenterAvailabilityChangeRef = useRef(onRecenterAvailabilityChange);
  const pointerX = useMotionValue(-1);
  const pointerY = useMotionValue(-1);
  /** Origin morph Y sync with focus scroll (content-local; ÷ zoom×cardScale → screen 1:1) */
  const focusScrollNudgeY = useMotionValue(0);
  /** Origin morph X sync with focus swipe / gallery slide */
  const focusScrollNudgeX = useMotionValue(0);
  /** Outer focus shell (touch targets / desktop scroll) */
  const focusScrollShellRef = useRef<HTMLDivElement>(null);
  /** Element that actually scrolls — panel on mobile gallery, shell on desktop */
  const focusScrollRef = useRef<HTMLDivElement>(null);
  const focusSnapshotRef = useRef(focusSnapshot);
  focusSnapshotRef.current = focusSnapshot;
  /** Snap morph x/y/scale on viewport resize (avoid spring desync with HTML overlay) */
  const snapFocusLayoutRef = useRef(false);
  const viewRef = useRef(createCanvasViewState());
  const proximityHandlersRef = useRef(
    new Map<string, { onFrame: ProximityFrameHandler; onReset: ProximityResetHandler }>()
  );

  const isMobile = window.innerWidth <= 480;
  const staggerMode = peerReturnStagger ?? (isMobile ? 'focus' : 'legacy');
  // const staggerMode = 'focus';

  const gapSize = isMobile ? window.innerWidth / 8 : window.innerWidth / 24; // Size of the gap between grid items
  const cellWidth = isMobile ? window.innerWidth / 2.3 : window.innerWidth / 4.6;
  const cellHeight = (cellWidth * 3) / 5;
  // Mobile: tighter overscan — fewer mounted cards while panning
  // Keep ≥2 so cards mount off-screen and slide in with the camera (padding 1 pops at the edge)
  const viewportPadding = 2;
  const lerpFactor = 0.15;
  /** Touch drag + pinch share this; lower = more glide (wheel uses lerpFactor) */
  const touchLerpFactor = 0.3;
  /** Per-frame decay while coasting — lower = shorter glide */
  const touchInertiaFriction = 0.88;
  /** Scale release velocity (< 1 softens the fling) */
  const touchInertiaBoost = 0.75;
  const touchInertiaMinSpeed = 0.6;
  const touchVelocitySmoothing = 0.35;
  const seedFactor = Math.random() * 1000;
  const zoomSpeed = 0.001;
  const minZoom = 0.75; // Maximum zoom out
  const maxZoom = isMobile ? 2 : 3; // Maximum zoom in
  const clickDragThresholdPx = 6;
  const staggerOffset = (cellHeight + gapSize) * 0.5;
  const initialOffsetX = cellWidth / 2 + gapSize / 2;

  const generateItemId = (x: number, y: number) => `item_${x}_${y}`;

  const getWorkKey = (work: Work) => work.url ?? work.name;

  const originCardKey = originCard ? getWorkKey(originCard.work) : null;

  /** Gallery order for focus prev/next — origin first when focusable, then works */
  const focusGallery = useMemo(() => {
    const list: Work[] = [];
    if (originCard && originCard.focusable !== false) {
      list.push(originCard.work);
    }
    for (const work of works) {
      if (originCardKey && getWorkKey(work) === originCardKey) continue;
      list.push(work);
    }
    return list;
  }, [works, originCard, originCardKey]);

  const pinOriginCardAt = useCallback(
    (gx: number, gy: number) => {
      if (!originCard) return null;
      const id = generateItemId(gx, gy);
      const prevId = originCardIdRef.current;
      // If the center seat moved (intro snap), drop the old custom so it never tiles twice
      if (prevId && prevId !== id) {
        itemsRef.current.delete(prevId);
      }
      const item: GridItem = {
        id,
        work: originCard.work,
        offsetX: 0,
        offsetY: gx % 2 === 0 ? 0 : staggerOffset,
        isOriginCard: true
      };
      itemsRef.current.set(id, item);
      originCardIdRef.current = id;
      return item;
    },
    [originCard, staggerOffset]
  );

  const findCenterGridSeat = useCallback(
    (width: number, height: number) => {
      const strideX = cellWidth + gapSize;
      const strideY = cellHeight + gapSize;
      const idealCX = width / 2;
      const idealCY = height / 2;
      let originX = idealCX;
      let originY = idealCY;
      let originGX = 0;
      let originGY = 0;
      let bestDist = Infinity;
      const searchGX = Math.round(idealCX / strideX);
      const searchGY = Math.round(idealCY / strideY);
      for (let gx = searchGX - 3; gx <= searchGX + 3; gx++) {
        for (let gy = searchGY - 3; gy <= searchGY + 3; gy++) {
          const itemOffsetY = gx % 2 === 0 ? 0 : staggerOffset;
          const tx = gx * strideX + cellWidth / 2;
          const ty = gy * strideY + itemOffsetY + cellHeight / 2;
          const d = Math.hypot(tx - idealCX, ty - idealCY);
          if (d < bestDist) {
            bestDist = d;
            originX = tx;
            originY = ty;
            originGX = gx;
            originGY = gy;
          }
        }
      }
      return { originX, originY, originGX, originGY };
    },
    [cellWidth, cellHeight, gapSize, staggerOffset]
  );

  const seededRandom = (seed: number) => {
    // Improved random function with better distribution
    const x = Math.sin(seed) * seedFactor;
    const y = Math.cos(seed * 0.5) * (seedFactor * 0.7);
    return x + y - Math.floor(x + y);
  };

  const getAdjacentWorks = (x: number, y: number, radius: number = 2) => {
    const adjacent: Work[] = [];
    const seen = new Set<string>();
    // Check a larger radius to avoid duplicates in a wider area
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx === 0 && dy === 0) continue;
        // Use Manhattan distance to prioritize closer cells
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance > radius) continue;
        const id = generateItemId(x + dx, y + dy);
        const item = itemsRef.current.get(id);
        if (item?.work && !seen.has(getWorkKey(item.work))) {
          adjacent.push(item.work);
          seen.add(getWorkKey(item.work));
        }
      }
    }
    return adjacent;
  };

  const selectUniqueWork = (x: number, y: number, adjacentWorks: Work[]) => {
    const seed = x * seedFactor + y * seedFactor * 0.7;

    // Create a set of adjacent work URLs for faster lookup
    const adjacentKeys = new Set(adjacentWorks.map(getWorkKey));

    // Filter out adjacent works + the one-shot origin card (never tile it)
    const availableWorks = works.filter((work) => {
      const key = getWorkKey(work);
      if (originCardKey && key === originCardKey) return false;
      return !adjacentKeys.has(key);
    });

    // If no works are available (edge case), use all works except the origin card
    const fallbackWorks = originCardKey ? works.filter((work) => getWorkKey(work) !== originCardKey) : works;
    const candidateWorks =
      availableWorks.length > 0 ? availableWorks : fallbackWorks.length > 0 ? fallbackWorks : works;

    // Create a weighted selection based on usage count and randomness
    const weightedWorks = candidateWorks.map((work) => {
      const usageCount = workUsageCountRef.current.get(getWorkKey(work)) || 0;
      // Lower usage = higher weight, add randomness
      const descriptionSeed =
        typeof work.description === 'string' ? work.description.length : work.name.length;
      const randomWeight = seededRandom(seed + descriptionSeed);
      const weight = (1 / (usageCount + 1)) * (0.7 + randomWeight * 0.3);
      return { work, weight };
    });

    // Sort by weight (highest first)
    weightedWorks.sort((a, b) => b.weight - a.weight);

    // Select from top candidates with some randomness
    const topCandidates = Math.min(3, weightedWorks.length);
    const randomIndex = Math.floor(seededRandom(seed) * topCandidates);
    const selectedWork = weightedWorks[randomIndex]?.work || weightedWorks[0]?.work || works[0];

    // Update usage count
    const selectedWorkKey = getWorkKey(selectedWork);
    workUsageCountRef.current.set(selectedWorkKey, (workUsageCountRef.current.get(selectedWorkKey) || 0) + 1);

    return selectedWork;
  };

  const getCellWindowKey = useCallback(
    (ox: number, oy: number, z: number, width: number, height: number) => {
      const strideX = (cellWidth + gapSize) * z;
      const strideY = (cellHeight + gapSize) * z;
      const startX = Math.floor((-ox + initialOffsetX) / strideX) - viewportPadding;
      const startY = Math.floor(-oy / strideY) - viewportPadding;
      const endX = Math.ceil((width - ox + initialOffsetX) / strideX) + viewportPadding;
      const endY = Math.ceil((height - oy) / strideY) + viewportPadding;
      return `${startX},${startY},${endX},${endY}`;
    },
    [cellWidth, cellHeight, gapSize, initialOffsetX, viewportPadding]
  );

  const applyCameraTransform = useCallback((x: number, y: number, z: number) => {
    const el = innerContainerRef.current;
    if (el) {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    }
  }, []);

  const commitCullPose = useCallback((x: number, y: number, z: number, windowKey: string, markSettled = false) => {
    committedCellWindowRef.current = windowKey;
    if (markSettled) cullSettledRef.current = true;
    setOffset({ x, y });
    setZoom(z);
  }, []);

  const getGridItemContentCenter = useCallback(
    (item: { x: number; y: number; offsetX: number; offsetY: number }) => ({
      x: item.x * (cellWidth + gapSize) + item.offsetX + cellWidth / 2,
      y: item.y * (cellHeight + gapSize) + item.offsetY + cellHeight / 2
    }),
    [cellWidth, cellHeight, gapSize]
  );

  /** Aim the camera so a content-space point sits at the viewport center (keeps current zoom). */
  const panCameraToContentCenter = useCallback(
    (cx: number, cy: number, immediate = false) => {
      const view = viewRef.current;
      if (view.width <= 0 || view.height <= 0) return;
      const z = Math.max(view.zoom, 0.001);
      const next = {
        x: (view.width / 2 - cx) * z,
        y: (view.height / 2 - cy) * z
      };
      targetOffsetRef.current = next;
      targetZoomRef.current = z;
      if (immediate || prefersReducedMotion) {
        view.offsetX = next.x;
        view.offsetY = next.y;
        view.zoom = z;
        applyCameraTransform(next.x, next.y, z);
        const windowKey = getCellWindowKey(next.x, next.y, z, view.width, view.height);
        commitCullPose(next.x, next.y, z, windowKey, true);
      }
    },
    [applyCameraTransform, commitCullPose, getCellWindowKey, prefersReducedMotion]
  );

  const panCameraToGridItem = useCallback(
    (item: { x: number; y: number; offsetX: number; offsetY: number }, immediate = false) => {
      const center = getGridItemContentCenter(item);
      panCameraToContentCenter(center.x, center.y, immediate);
    },
    [getGridItemContentCenter, panCameraToContentCenter]
  );

  const panCameraToItemId = useCallback(
    (id: string | null, immediate = false) => {
      if (!id) return;
      const match = /^item_(-?\d+)_(-?\d+)$/.exec(id);
      const item = itemsRef.current.get(id);
      if (!match || !item) return;
      panCameraToGridItem({ ...item, x: Number(match[1]), y: Number(match[2]) }, immediate);
    },
    [panCameraToGridItem]
  );

  const isItemIdOnScreen = useCallback(
    (id: string | null) => {
      if (!id) return false;
      const match = /^item_(-?\d+)_(-?\d+)$/.exec(id);
      const item = itemsRef.current.get(id);
      if (!match || !item) return false;
      const view = viewRef.current;
      if (view.width <= 0 || view.height <= 0) return false;
      const gx = Number(match[1]);
      const gy = Number(match[2]);
      const posX = gx * (cellWidth + gapSize) + item.offsetX;
      const posY = gy * (cellHeight + gapSize) + item.offsetY;
      const z = Math.max(view.zoom, 0.001);
      const originOffsetX = (view.width / 2) * (1 - 1 / z);
      const originOffsetY = (view.height / 2) * (1 - 1 / z);
      const left = originOffsetX - view.offsetX / z;
      const top = originOffsetY - view.offsetY / z;
      const right = left + view.width / z;
      const bottom = top + view.height / z;
      return posX + cellWidth > left && posX < right && posY + cellHeight > top && posY < bottom;
    },
    [cellWidth, cellHeight, gapSize]
  );

  /** Pan only when the seat is outside the current viewport */
  const panCameraToItemIdIfOffscreen = useCallback(
    (id: string | null, immediate = false) => {
      if (!id || isItemIdOnScreen(id)) return false;
      panCameraToItemId(id, immediate);
      return true;
    },
    [isItemIdOnScreen, panCameraToItemId]
  );

  /** True when the return seat is too far from the viewport — close shrinks to center (desktop only) */
  const shouldReturnFocusToCenter = useCallback(
    (id: string | null) => {
      if (isMobile || !id) return false;
      if (!isItemIdOnScreen(id)) return true;
      const match = /^item_(-?\d+)_(-?\d+)$/.exec(id);
      const item = itemsRef.current.get(id);
      if (!match || !item) return false;
      const view = viewRef.current;
      if (view.width <= 0 || view.height <= 0) return false;
      const center = getGridItemContentCenter({
        ...item,
        x: Number(match[1]),
        y: Number(match[2])
      });
      const z = Math.max(view.zoom, 0.001);
      const vpX = view.width / 2 - view.offsetX / z;
      const vpY = view.height / 2 - view.offsetY / z;
      const dist = Math.hypot(center.x - vpX, center.y - vpY);
      const threshold = (Math.hypot(view.width, view.height) / z) * FOCUS_RETURN_CENTER_DIST;
      return dist > threshold;
    },
    [isMobile, getGridItemContentCenter, isItemIdOnScreen]
  );

  /** Mobile swipe keeps the camera fixed — always park on the return seat before morph home */
  const panCameraToFocusReturnSeat = useCallback(
    (id: string | null) => {
      if (!id) return false;
      const view = viewRef.current;
      const prevTargetX = targetOffsetRef.current.x;
      const prevTargetY = targetOffsetRef.current.y;
      panCameraToItemId(id, false);
      return (
        Math.abs(targetOffsetRef.current.x - prevTargetX) > 0.5 ||
        Math.abs(targetOffsetRef.current.y - prevTargetY) > 0.5 ||
        Math.abs(view.offsetX - targetOffsetRef.current.x) > 0.5 ||
        Math.abs(view.offsetY - targetOffsetRef.current.y) > 0.5
      );
    },
    [panCameraToItemId]
  );

  const beginFocusReturn = useCallback(() => {
    const id = focusedIdRef.current;
    const toCenter = shouldReturnFocusToCenter(id);
    focusReturnToCenterRef.current = toCenter;

    if (toCenter) {
      focusReturnPanActiveRef.current = false;
    } else if (isMobile) {
      // Gallery swipes never pan during focus — catch up now so the card can fly home
      focusReturnPanActiveRef.current = panCameraToFocusReturnSeat(id);
    } else {
      focusReturnPanActiveRef.current = panCameraToItemIdIfOffscreen(id);
    }

    focusPhaseRef.current = 'returning';
    setReleaseFocusPeers(false);
    setFocusPhase('returning');
    setCanvasFocused(false);
  }, [
    isMobile,
    shouldReturnFocusToCenter,
    panCameraToFocusReturnSeat,
    panCameraToItemIdIfOffscreen,
    setCanvasFocused
  ]);

  /** Content-space center of the intro / origin seat — camera home */
  const ensureHomeContent = useCallback(() => {
    if (introOriginRef.current) return introOriginRef.current;

    const id = originCardIdRef.current;
    if (id) {
      const match = /^item_(-?\d+)_(-?\d+)$/.exec(id);
      if (match) {
        const gx = Number(match[1]);
        const gy = Number(match[2]);
        const item = itemsRef.current.get(id);
        const x = gx * (cellWidth + gapSize) + (item?.offsetX ?? 0) + cellWidth / 2;
        const y =
          gy * (cellHeight + gapSize) +
          (item?.offsetY ?? (gx % 2 === 0 ? 0 : staggerOffset)) +
          cellHeight / 2;
        introOriginRef.current = { x, y };
        return introOriginRef.current;
      }
    }

    const view = viewRef.current;
    if (view.width > 0 && view.height > 0) {
      const { originX, originY } = findCenterGridSeat(view.width, view.height);
      introOriginRef.current = { x: originX, y: originY };
      return introOriginRef.current;
    }

    return null;
  }, [cellWidth, cellHeight, gapSize, staggerOffset, findCenterGridSeat]);

  const setRecenterVisible = useCallback((next: boolean) => {
    if (showRecenterRef.current === next) return;
    showRecenterRef.current = next;
    onRecenterAvailabilityChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    onRecenterAvailabilityChangeRef.current = onRecenterAvailabilityChange;
  }, [onRecenterAvailabilityChange]);

  const updateRecenterVisibility = useCallback(() => {
    const home = ensureHomeContent();
    const view = viewRef.current;
    const busy =
      Boolean(focusedIdRef.current) ||
      isIntroPlayingRef.current ||
      !loaded ||
      !introComplete ||
      view.width <= 0 ||
      !home;

    if (busy) {
      if (recenterIdleTimerRef.current) {
        clearTimeout(recenterIdleTimerRef.current);
        recenterIdleTimerRef.current = null;
      }
      isRecenteringRef.current = false;
      setRecenterVisible(false);
      return;
    }

    const z = Math.max(view.zoom, 0.001);
    const viewCX = view.width / 2 - view.offsetX / z;
    const viewCY = view.height / 2 - view.offsetY / z;
    const dist = Math.hypot(viewCX - home.x, viewCY - home.y);
    const diagonal = Math.hypot(view.width, view.height) / z;
    const showAt = diagonal * RECENTER_SHOW_DIST;
    const hideAt = diagonal * RECENTER_HIDE_DIST;

    if (isRecenteringRef.current) {
      const atTarget =
        Math.abs(view.offsetX - targetOffsetRef.current.x) <= 0.5 &&
        Math.abs(view.offsetY - targetOffsetRef.current.y) <= 0.5 &&
        Math.abs(view.zoom - targetZoomRef.current) <= 0.002;
      if (atTarget || dist <= hideAt) {
        isRecenteringRef.current = false;
        setRecenterVisible(false);
      }
      return;
    }

    const far = dist > showAt;
    const near = dist <= hideAt;
    const idle = !isDragging.current && !isPinching.current && !isCoastingRef.current;

    if (near || !far) {
      if (recenterIdleTimerRef.current) {
        clearTimeout(recenterIdleTimerRef.current);
        recenterIdleTimerRef.current = null;
      }
      if (near) setRecenterVisible(false);
      return;
    }

    // Far from home — only surface the control once pan/coast has settled
    if (!idle) {
      if (recenterIdleTimerRef.current) {
        clearTimeout(recenterIdleTimerRef.current);
        recenterIdleTimerRef.current = null;
      }
      return;
    }

    if (showRecenterRef.current || recenterIdleTimerRef.current) return;
    recenterIdleTimerRef.current = setTimeout(() => {
      recenterIdleTimerRef.current = null;
      if (
        !focusedIdRef.current &&
        !isIntroPlayingRef.current &&
        !isDragging.current &&
        !isPinching.current &&
        !isCoastingRef.current
      ) {
        setRecenterVisible(true);
      }
    }, RECENTER_IDLE_MS);
  }, [ensureHomeContent, introComplete, loaded, setRecenterVisible]);

  const handleRecenter = useCallback(() => {
    const home = ensureHomeContent();
    const view = viewRef.current;
    if (!home || view.width <= 0 || view.height <= 0) return;

    isCoastingRef.current = false;
    panVelocityRef.current = { x: 0, y: 0 };
    isRecenteringRef.current = true;

    const z = prefersReducedMotion ? Math.max(view.zoom, 0.001) : 1;
    const next = {
      x: (view.width / 2 - home.x) * z,
      y: (view.height / 2 - home.y) * z
    };
    targetZoomRef.current = z;
    targetOffsetRef.current = next;

    if (prefersReducedMotion) {
      view.offsetX = next.x;
      view.offsetY = next.y;
      view.zoom = z;
      applyCameraTransform(next.x, next.y, z);
      const windowKey = getCellWindowKey(next.x, next.y, z, view.width, view.height);
      commitCullPose(next.x, next.y, z, windowKey, true);
      isRecenteringRef.current = false;
      setRecenterVisible(false);
    }
  }, [
    applyCameraTransform,
    commitCullPose,
    ensureHomeContent,
    getCellWindowKey,
    prefersReducedMotion,
    setRecenterVisible
  ]);

  useEffect(() => {
    if (!recenterActionRef) return;
    recenterActionRef.current = handleRecenter;
    return () => {
      recenterActionRef.current = null;
    };
  }, [handleRecenter, recenterActionRef]);

  useEffect(() => {
    return () => {
      onRecenterAvailabilityChangeRef.current?.(false);
    };
  }, []);

  const visibleItems = useMemo(() => {
    if (!outerContainerRef.current) return [];
    const { width, height } = outerContainerRef.current.getBoundingClientRect();

    // Pin the custom center card as soon as we have a viewport (avoids a wrong-work flash)
    if (originCard && !originCardIdRef.current && width > 0 && height > 0) {
      const { originGX, originGY } = findCenterGridSeat(width, height);
      pinOriginCardAt(originGX, originGY);
    }

    const startX = Math.floor((-offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) - viewportPadding;
    const startY = Math.floor(-offset.y / ((cellHeight + gapSize) * zoom)) - viewportPadding;
    const endX = Math.ceil((width - offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) + viewportPadding;
    const endY = Math.ceil((height - offset.y) / ((cellHeight + gapSize) * zoom)) + viewportPadding;

    const items: (GridItem & { x: number; y: number })[] = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const id = generateItemId(x, y);
        let item = itemsRef.current.get(id);
        if (!item) {
          // If this seat is the pinned origin, always use the custom card
          if (originCard && originCardIdRef.current === id) {
            item = pinOriginCardAt(x, y)!;
          } else {
            const adjacentWorks = getAdjacentWorks(x, y, 3); // Increased radius to 2
            const selectedWork = selectUniqueWork(x, y, adjacentWorks);
            const offsetX = 0;
            const offsetY = x % 2 === 0 ? 0 : staggerOffset;
            item = {
              id,
              work: selectedWork,
              offsetX,
              offsetY
            };
            itemsRef.current.set(id, item);
          }
        }
        items.push({ ...item, x, y });
      }
    }

    // Periodically reset usage counts to allow for long-term variety
    if (items.length > works.length * 2) {
      workUsageCountRef.current.clear();
    }

    return items;
  }, [offset, zoom, works, initialOffsetX, originCard, findCenterGridSeat, pinOriginCardAt]);

  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  const animateOffset = useCallback(() => {
    // Focus locks the camera — freeze pose while morph / peer springs run.
    // Exception: while returning to an off-screen seat we lerp the camera there.
    // Also idle the camera while the menu drawer animates/scales .main so we
    // don't compete for compositor bandwidth during the shrink.
    const drawerBusy =
      typeof document !== 'undefined' &&
      (document.body.classList.contains('is-drawer-open') ||
        document.body.classList.contains('is-dragging') ||
        document.body.classList.contains('is-animating'));

    const focusFollowHome =
      focusReturnPanActiveRef.current &&
      (focusPhaseRef.current === 'returning' || focusPhaseRef.current === 'out');
    const cameraFollowAllowed = !drawerBusy && (!focusedIdRef.current || focusFollowHome);

    if (cameraFollowAllowed) {
      const view = viewRef.current;

      // Coast only when not in a focus morph — return just lerps to target
      if (
        !focusedIdRef.current &&
        isCoastingRef.current &&
        !isDragging.current &&
        !isPinching.current &&
        !prefersReducedMotion
      ) {
        const v = panVelocityRef.current;
        targetOffsetRef.current = {
          x: targetOffsetRef.current.x + v.x,
          y: targetOffsetRef.current.y + v.y
        };
        v.x *= touchInertiaFriction;
        v.y *= touchInertiaFriction;
        if (Math.hypot(v.x, v.y) < touchInertiaMinSpeed) {
          v.x = 0;
          v.y = 0;
          isCoastingRef.current = false;
        }
      }

      // Touch drag/pinch use touchLerpFactor; mouse drag + wheel + coast + focus-home use lerpFactor
      const follow =
        !focusedIdRef.current && (isPinching.current || (isDragging.current && isTouchDrag.current))
          ? touchLerpFactor
          : lerpFactor;
      const newX = lerp(view.offsetX, targetOffsetRef.current.x, follow);
      const newY = lerp(view.offsetY, targetOffsetRef.current.y, follow);
      const newZoom = lerp(view.zoom, targetZoomRef.current, follow);

      const offsetMoved = Math.abs(newX - view.offsetX) >= 0.01 || Math.abs(newY - view.offsetY) >= 0.01;
      const zoomMoved = Math.abs(newZoom - view.zoom) >= 0.0001;

      if (offsetMoved || zoomMoved) {
        view.offsetX = newX;
        view.offsetY = newY;
        view.zoom = newZoom;
        applyCameraTransform(newX, newY, newZoom);

        const awayFromTarget =
          Math.abs(newX - targetOffsetRef.current.x) > 0.1 ||
          Math.abs(newY - targetOffsetRef.current.y) > 0.1 ||
          Math.abs(newZoom - targetZoomRef.current) > 0.001;

        if (awayFromTarget) {
          cullSettledRef.current = false;
        }

        const width = view.width || outerContainerRef.current?.clientWidth || 0;
        const height = view.height || outerContainerRef.current?.clientHeight || 0;
        if (width > 0 && height > 0) {
          const windowKey = getCellWindowKey(newX, newY, newZoom, width, height);
          const settled =
            Math.abs(newX - targetOffsetRef.current.x) <= 0.01 &&
            Math.abs(newY - targetOffsetRef.current.y) <= 0.01 &&
            Math.abs(newZoom - targetZoomRef.current) <= 0.0001;

          // Touch: throttle cull so edges stay filled without remounting every frame.
          // Mouse/wheel: commit on every cell-window change.
          const touchGesturing = isPinching.current || (isDragging.current && isTouchDrag.current);
          const windowChanged = windowKey !== committedCellWindowRef.current;
          if (touchGesturing) {
            const now = performance.now();
            const due = now - lastCullCommitMsRef.current >= 120;
            if ((windowChanged && due) || (settled && !cullSettledRef.current)) {
              commitCullPose(newX, newY, newZoom, windowKey, settled);
              lastCullCommitMsRef.current = now;
            }
          } else if (windowChanged || (settled && !cullSettledRef.current)) {
            commitCullPose(newX, newY, newZoom, windowKey, settled);
          }
        }
      } else if (!cullSettledRef.current) {
        // Snap cull state to final camera pose once motion stops
        const width = view.width || outerContainerRef.current?.clientWidth || 0;
        const height = view.height || outerContainerRef.current?.clientHeight || 0;
        if (width > 0 && height > 0) {
          const windowKey = getCellWindowKey(view.offsetX, view.offsetY, view.zoom, width, height);
          commitCullPose(view.offsetX, view.offsetY, view.zoom, windowKey, true);
        } else {
          cullSettledRef.current = true;
        }
      }
    }

    updateRecenterVisibility();

    animationFrameRef.current = requestAnimationFrame(animateOffset);
  }, [
    applyCameraTransform,
    commitCullPose,
    getCellWindowKey,
    prefersReducedMotion,
    updateRecenterVisibility
  ]);

  const syncViewBounds = useCallback(() => {
    const container = outerContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    viewRef.current.left = rect.left;
    viewRef.current.top = rect.top;
    viewRef.current.width = rect.width;
    viewRef.current.height = rect.height;

    // Keep the focused card centered/sized when the viewport changes
    const phase = focusPhaseRef.current;
    if (!phase || phase === 'out' || phase === 'returning') return;
    if (!focusSnapshotRef.current || viewRef.current.width <= 0 || viewRef.current.height <= 0) return;

    const { cellWidth: liveCellWidth, cellHeight: liveCellHeight } = getLiveCellMetrics();
    const layout = computeFocusLayout(viewRef.current, liveCellWidth, liveCellHeight);
    const prev = focusSnapshotRef.current;
    if (
      Math.abs(prev.contentCenterX - layout.contentCenterX) < 0.5 &&
      Math.abs(prev.contentCenterY - layout.contentCenterY) < 0.5 &&
      Math.abs(prev.cardScale - layout.cardScale) < 0.001 &&
      Math.abs(prev.detailWidth - layout.detailWidth) < 0.5 &&
      Math.abs(prev.cardTopScreenY - layout.cardTopScreenY) < 0.5
    ) {
      return;
    }

    setFocusSnapshot({
      ...prev,
      ...layout
    });
    snapFocusLayoutRef.current = true;
  }, []);

  useEffect(() => {
    // Fallback initial offset — intro snap replaces this when the cluster captures
    if (introOriginRef.current || pendingIntroSnapRef.current) return;
    const x = initialOffsetX;
    const y = 0;
    const z = 1;
    targetOffsetRef.current = { x, y };
    targetZoomRef.current = z;
    viewRef.current.offsetX = x;
    viewRef.current.offsetY = y;
    viewRef.current.zoom = z;
    applyCameraTransform(x, y, z);
    const width = viewRef.current.width || outerContainerRef.current?.clientWidth || 0;
    const height = viewRef.current.height || outerContainerRef.current?.clientHeight || 0;
    const windowKey = width > 0 && height > 0 ? getCellWindowKey(x, y, z, width, height) : 'initial';
    commitCullPose(x, y, z, windowKey, true);
  }, [initialOffsetX, applyCameraTransform, commitCullPose, getCellWindowKey]);

  // Apply intro camera snap once (introFlush bumps only when capture finishes)
  useLayoutEffect(() => {
    const snap = pendingIntroSnapRef.current;
    if (!snap) return;
    pendingIntroSnapRef.current = null;
    const z = targetZoomRef.current;
    // Separate object from React state so wheel/pan can replace the target safely
    targetOffsetRef.current = { x: snap.x, y: snap.y };
    viewRef.current.offsetX = snap.x;
    viewRef.current.offsetY = snap.y;
    viewRef.current.zoom = z;
    applyCameraTransform(snap.x, snap.y, z);
    const width = viewRef.current.width || outerContainerRef.current?.clientWidth || 0;
    const height = viewRef.current.height || outerContainerRef.current?.clientHeight || 0;
    const windowKey = width > 0 && height > 0 ? getCellWindowKey(snap.x, snap.y, z, width, height) : 'intro';
    commitCullPose(snap.x, snap.y, z, windowKey, true);
    setIntroReady(true);
  }, [introFlush, applyCameraTransform, commitCullPose, getCellWindowKey]);

  useEffect(() => {
    syncViewBounds();

    const container = outerContainerRef.current;
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncViewBounds) : null;
    if (container && resizeObserver) {
      resizeObserver.observe(container);
    }

    window.addEventListener('scroll', syncViewBounds, true);
    window.addEventListener('resize', syncViewBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', syncViewBounds, true);
      window.removeEventListener('resize', syncViewBounds);
    };
  }, [syncViewBounds]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animateOffset);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (recenterIdleTimerRef.current) {
        clearTimeout(recenterIdleTimerRef.current);
        recenterIdleTimerRef.current = null;
      }
    };
  }, [animateOffset]);

  const clearPointer = useCallback(() => {
    pointerX.set(-1);
    pointerY.set(-1);
  }, [pointerX, pointerY]);

  const registerProximity = useCallback((id: string, handlers: ProximityRegistration) => {
    proximityHandlersRef.current.set(id, handlers);
  }, []);

  const unregisterProximity = useCallback((id: string) => {
    proximityHandlersRef.current.delete(id);
  }, []);

  const resetAllProximity = useCallback((immediate?: boolean) => {
    proximityHandlersRef.current.forEach((handlers) => {
      handlers.onReset(immediate);
    });
  }, []);

  const isIntroPlayingRef = useRef(isIntroPlaying);
  useEffect(() => {
    isIntroPlayingRef.current = isIntroPlaying;
  }, [isIntroPlaying]);

  // After intro, ignore the parked cursor until the user moves again
  useEffect(() => {
    if (isIntroPlaying) return;
    clearPointer();
    resetAllProximity(true);
  }, [isIntroPlaying, clearPointer, resetAllProximity]);

  const clearFocus = useCallback(() => {
    if (focusArriveTimeoutRef.current) {
      clearTimeout(focusArriveTimeoutRef.current);
      focusArriveTimeoutRef.current = null;
    }
    focusNavPrevIdRef.current = null;
    focusReturnPanActiveRef.current = false;
    focusReturnToCenterRef.current = false;
    focusCardRef.current = null;
    focusImageRef.current = null;
    focusSwipeRef.current = null;
    focusSwipeDragX.set(0);
    focusedIdRef.current = null;
    focusPhaseRef.current = null;
    focusScrollNudgeY.set(0);
    focusScrollNudgeX.set(0);
    if (focusScrollRef.current) focusScrollRef.current.scrollTop = 0;
    setFocusedId(null);
    setFocusedWork(null);
    setFocusSnapshot(null);
    setFocusPhase(null);
    setFocusNavDirection(0);
    setMorphCardHidden(false);
    setReleaseFocusPeers(false);
    setOriginPortraitUp(false);
    setFocusSwipePeeksLive(false);
    setCanvasFocused(false);
  }, [focusScrollNudgeY, focusScrollNudgeX, focusSwipeDragX, setCanvasFocused]);

  const syncOriginFocusScrollNudge = useCallback(
    (scrollTop: number) => {
      const scale = focusSnapshotRef.current?.cardScale ?? 1;
      const zoomValue = viewRef.current.zoom || 1;
      // Nudge sits inside the scaled card — divide so screen delta matches scrollTop
      focusScrollNudgeY.set(-scrollTop / (zoomValue * scale));
    },
    [focusScrollNudgeY]
  );

  const syncOriginFocusSwipeNudge = useCallback(
    (dragX: number, slot: 'prev' | 'current' | 'next' | null = originSwipeSlotRef.current) => {
      if (!slot) {
        focusScrollNudgeX.set(0);
        return;
      }
      const scale = focusSnapshotRef.current?.cardScale ?? 1;
      const zoomValue = viewRef.current.zoom || 1;
      const width = focusDetailWidthRef.current;
      const gap = FOCUS_SWIPE_GAP_PX;
      const denom = zoomValue * scale || 1;
      // Keep the live face locked to its HTML seat until that seat leaves the viewport
      if (slot === 'current') {
        focusScrollNudgeX.set(dragX / denom);
      } else if (slot === 'next') {
        focusScrollNudgeX.set((dragX + width + gap) / denom);
      } else {
        focusScrollNudgeX.set((dragX - width - gap) / denom);
      }
    },
    [focusScrollNudgeX]
  );

  // Keep the live origin morph locked to its swipe-track seat (current or peek)
  useMotionValueEvent(focusSwipeDragX, 'change', (x) => {
    if (originSwipeHandoffRef.current) return;
    const slot = originSwipeSlotRef.current;
    if (!slot) {
      if (x === 0) focusScrollNudgeX.set(0);
      return;
    }
    syncOriginFocusSwipeNudge(x, slot);
  });

  const handleFocusScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const id = focusedIdRef.current;
      if (!id || !itemsRef.current.get(id)?.isOriginCard) return;
      syncOriginFocusScrollNudge(event.currentTarget.scrollTop);
    },
    [syncOriginFocusScrollNudge]
  );

  const handleFocusArrive = useCallback((id: string) => {
    if (focusPhaseRef.current !== 'in') return;
    if (focusedIdRef.current !== id) return;
    if (focusArriveTimeoutRef.current) {
      clearTimeout(focusArriveTimeoutRef.current);
      focusArriveTimeoutRef.current = null;
    }

    const reveal = () => {
      if (focusPhaseRef.current !== 'in' || focusedIdRef.current !== id) return;
      focusPhaseRef.current = 'settled';
      setFocusPhase('settled');
    };

    const prepare = async () => {
      const img = focusImageRef.current;
      if (img?.decode) {
        try {
          await img.decode();
        } catch {
          // Cached / already decoded — fine to continue
        }
      }
      // Two frames: layout the pre-mounted card, then reveal it over the morph
      requestAnimationFrame(() => {
        requestAnimationFrame(reveal);
      });
    };

    void prepare();
  }, []);

  // Hide the canvas morph once the HTML card is on screen (avoids a blank frame).
  // Origin keeps the live face on the morph — never hide it (portal handoffs blink on mobile).
  useLayoutEffect(() => {
    if (focusPhase === 'settled') {
      const isOrigin =
        Boolean(focusedIdRef.current) &&
        Boolean(itemsRef.current.get(focusedIdRef.current!)?.isOriginCard);
      if (isOrigin) {
        setMorphCardHidden(false);
        return;
      }
      const frame = requestAnimationFrame(() => setMorphCardHidden(true));
      return () => cancelAnimationFrame(frame);
    }
    if (focusPhase === 'out') {
      setMorphCardHidden(false);
      return;
    }
    setMorphCardHidden(false);
  }, [focusPhase]);

  const requestClose = useCallback(() => {
    if (!focusedIdRef.current || !focusPhaseRef.current) return;
    if (focusPhaseRef.current === 'out' || focusPhaseRef.current === 'returning') return;

    if (focusPhaseRef.current === 'settled') {
      // Prefer live card rect (handles scroll). Fall back to snapshot if the slide
      // remount cleared the ref mid-transition.
      const cardNode = getLiveFocusCardNode();
      let nextSnapshot: FocusSnapshot | null | undefined;
      if (cardNode) {
        const rect = cardNode.getBoundingClientRect();
        if (rect.width > 2 && rect.height > 2) {
          const view = viewRef.current;
          const zoomValue = Math.max(view.zoom, 0.001);
          const screenCenterX = rect.left + rect.width / 2 - view.left;
          const screenCenterY = rect.top + rect.height / 2 - view.top;
          const contentCenterX =
            view.width / 2 + (screenCenterX - view.width / 2 - view.offsetX) / zoomValue;
          const contentCenterY =
            view.height / 2 + (screenCenterY - view.height / 2 - view.offsetY) / zoomValue;
          const cardScale = rect.width / (cellWidth * zoomValue);
          const prev = focusSnapshotRef.current;
          if (prev) {
            nextSnapshot = {
              ...prev,
              contentCenterX,
              contentCenterY,
              cardScale,
              scaledScreenHeight: rect.height
            };
          }
        }
      }
      // Clear mobile swipe trail so HTML→morph handoff isn't mid-parallax
      focusSwipeRef.current = null;
      focusNavPrevIdRef.current = null;
      focusSwipeDragX.stop();
      focusSwipeDragX.set(0);
      focusScrollNudgeY.set(0);
      focusScrollNudgeX.set(0);

      // Mobile: start panning to the return seat during handoff (camera was frozen in focus)
      if (isMobile && focusedIdRef.current) {
        focusReturnPanActiveRef.current = panCameraToFocusReturnSeat(focusedIdRef.current);
      } else {
        focusReturnPanActiveRef.current = false;
      }

      focusPhaseRef.current = 'out';
      flushSync(() => {
        if (nextSnapshot) setFocusSnapshot(nextSnapshot);
        setFocusNavInstant(false);
        setFocusSwipePeeksLive(false);
        setReleaseFocusPeers(false);
        // Reveal morph before HTML unmounts — same paint as phase 'out' + baked rect
        setMorphCardHidden(false);
        setFocusPhase('out');
      });
      return;
    }

    // Mid morph-in — cancel in the air and spring home (peers stay out until release)
    if (focusPhaseRef.current === 'in') {
      if (focusArriveTimeoutRef.current) {
        clearTimeout(focusArriveTimeoutRef.current);
        focusArriveTimeoutRef.current = null;
      }
      beginFocusReturn();
      setMorphCardHidden(false);
      setOriginPortraitUp(false);
    }
  }, [
    cellWidth,
    isMobile,
    focusSwipeDragX,
    focusScrollNudgeX,
    focusScrollNudgeY,
    getLiveFocusCardNode,
    panCameraToFocusReturnSeat,
    beginFocusReturn
  ]);

  // After snapshot absorbs the scrolled position, drop the nudge before paint (avoids a jump)
  useLayoutEffect(() => {
    if (focusPhase === 'out' || focusPhase === 'returning' || focusPhase == null) {
      focusScrollNudgeY.set(0);
      focusScrollNudgeX.set(0);
    }
  }, [focusPhase, focusScrollNudgeY, focusScrollNudgeX]);

  // Keep origin morph ↔ scroll alignment after layout refreshes (e.g. window resize)
  useLayoutEffect(() => {
    if (snapFocusLayoutRef.current) {
      snapFocusLayoutRef.current = false;
    }
    if (focusPhase !== 'settled') return;
    const id = focusedIdRef.current;
    if (!id || !itemsRef.current.get(id)?.isOriginCard) return;
    syncOriginFocusScrollNudge(focusScrollRef.current?.scrollTop ?? 0);
  }, [
    focusPhase,
    focusSnapshot?.cardScale,
    focusSnapshot?.contentCenterX,
    focusSnapshot?.contentCenterY,
    syncOriginFocusScrollNudge
  ]);

  // After handoff snap, start returning the focus card (peers stay exited)
  useLayoutEffect(() => {
    if (focusPhase !== 'out') return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        beginFocusReturn();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [focusPhase, beginFocusReturn]);

  const handleFocusReturnComplete = useCallback(
    (id: string) => {
      if (focusPhaseRef.current !== 'returning') return;
      if (focusedIdRef.current !== id) return;
      clearFocus();
    },
    [clearFocus]
  );

  // Release peers shortly after the focus card begins returning (overlap, not wait-for-settle).
  // Keep focusedId until the focused card finishes returning so rapid re-clicks can't skip the morph.
  useEffect(() => {
    if (focusPhase !== 'returning') return;
    const timeout = setTimeout(() => {
      if (focusPhaseRef.current === 'returning') setReleaseFocusPeers(true);
    }, FOCUS_PEERS_RETURN_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [focusPhase]);

  // Safety: if return animation never reports complete, unlock after a beat
  useEffect(() => {
    if (focusPhase !== 'returning') return;
    const timeout = setTimeout(() => {
      if (focusPhaseRef.current === 'returning') clearFocus();
    }, 1200);
    return () => clearTimeout(timeout);
  }, [focusPhase, clearFocus]);

  const handleItemClick = useCallback(
    (id: string, work: Work) => {
      // Pan release synthesizes a click — ignore that one only
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      // Block while any focus phase is active (including return) — prevents jump-to-overlay
      if (focusedIdRef.current || focusPhaseRef.current || isIntroPlayingRef.current) return;

      const stored = itemsRef.current.get(id);
      if (stored?.isOriginCard && originCard?.focusable === false) return;

      // Stop any fling before locking the camera for focus
      isCoastingRef.current = false;
      panVelocityRef.current = { x: 0, y: 0 };
      touchInertiaEligibleRef.current = false;

      const view = viewRef.current;
      if (view.width <= 0 || view.height <= 0) return;

      const gridMatch = /^item_(-?\d+)_(-?\d+)$/.exec(id);
      if (!gridMatch) return;
      const gridX = Number(gridMatch[1]);
      const gridY = Number(gridMatch[2]);
      const originX = gridX * (cellWidth + gapSize) + (stored?.offsetX ?? 0);
      const originY = gridY * (cellHeight + gapSize) + (stored?.offsetY ?? 0);
      const originCenterX = originX + cellWidth / 2;
      const originCenterY = originY + cellHeight / 2;

      const layout = computeFocusLayout(view, cellWidth, cellHeight);

      focusedIdRef.current = id;
      focusPhaseRef.current = 'in';
      // Never inherit a leftover hidden morph — that forces duration:0 and skips the enter
      setMorphCardHidden(false);
      setReleaseFocusPeers(false);
      setOriginPortraitUp(false);
      setFocusNavDirection(0);
      setFocusSnapshot({
        ...layout,
        originCenterX,
        originCenterY
      });
      setFocusedId(id);
      setFocusedWork(work);
      setFocusPhase('in');
      setCanvasFocused(true);
      clearPointer();
      resetAllProximity(false);
      isDragging.current = false;
      viewRef.current.isDragging = false;

      if (focusArriveTimeoutRef.current) clearTimeout(focusArriveTimeoutRef.current);
      focusArriveTimeoutRef.current = setTimeout(() => {
        handleFocusArrive(id);
      }, FOCUS_MORPH_FALLBACK_MS);
    },
    [cellWidth, cellHeight, gapSize, clearPointer, resetAllProximity, setCanvasFocused, handleFocusArrive, originCard]
  );

  const handleOriginActivate = useCallback(() => {
    const id = originCardIdRef.current;
    if (!id) return;
    const item = itemsRef.current.get(id);
    if (!item) return;
    handleItemClick(id, item.work);
  }, [handleItemClick]);

  const parseGridCoords = useCallback((id: string) => {
    const match = /^item_(-?\d+)_(-?\d+)$/.exec(id);
    if (!match) return null;
    return { x: Number(match[1]), y: Number(match[2]) };
  }, []);

  /** Nearest mounted grid seat for a work — exit morph returns here after gallery nav */
  const findReturnCellForWork = useCallback(
    (work: Work, nearId: string | null) => {
      const key = getWorkKey(work);

      if (originCard && getWorkKey(originCard.work) === key) {
        const id = originCardIdRef.current;
        if (!id) return null;
        const item = itemsRef.current.get(id);
        const coords = parseGridCoords(id);
        if (!item || !coords) return null;
        return { ...item, ...coords };
      }

      const near = nearId ? parseGridCoords(nearId) : null;
      const fromX = near?.x ?? 0;
      const fromY = near?.y ?? 0;

      let best: (GridItem & { x: number; y: number }) | null = null;
      let bestDist = Infinity;

      for (const item of itemsRef.current.values()) {
        if (item.isOriginCard) continue;
        if (getWorkKey(item.work) !== key) continue;
        const coords = parseGridCoords(item.id);
        if (!coords) continue;
        const dist = Math.hypot(coords.x - fromX, coords.y - fromY);
        if (dist < bestDist) {
          bestDist = dist;
          best = { ...item, ...coords };
        }
      }

      return best;
    },
    [originCard, parseGridCoords]
  );

  const navigateFocus = useCallback(
    (direction: -1 | 1, options?: { preserveSwipeX?: boolean; instant?: boolean }) => {
      if (focusPhaseRef.current !== 'settled') return;
      if (!focusedWork || focusGallery.length < 2) return;

      const currentKey = getWorkKey(focusedWork);
      const currentIndex = focusGallery.findIndex((work) => getWorkKey(work) === currentKey);
      if (currentIndex < 0) return;

      const len = focusGallery.length;
      for (let step = 1; step <= len; step++) {
        const nextIndex = ((currentIndex + direction * step) % len + len) % len;
        const nextWork = focusGallery[nextIndex];
        if (!nextWork || getWorkKey(nextWork) === currentKey) continue;

        const cell = findReturnCellForWork(nextWork, focusedIdRef.current);
        const view = viewRef.current;
        if (view.width <= 0 || view.height <= 0) return;

        focusScrollNudgeY.set(0);
        focusScrollNudgeX.set(0);
        if (!options?.preserveSwipeX) {
          if (focusScrollRef.current) focusScrollRef.current.scrollTop = 0;
          focusSwipeDragX.set(0);
        } else if (focusScrollRef.current) {
          focusScrollRef.current.scrollTop = 0;
        }

        setFocusNavDirection(direction);
        setFocusedWork(nextWork);

        // Prefer a mounted return seat; if none yet, keep the current id for close morph
        if (cell) {
          // Mobile swipe keeps the camera fixed under the HTML card — panning here
          // desyncs the invisible morph and makes close start from the wrong place.
          // Desktop / non-swipe nav can park the seat immediately (production behavior).
          if (!options?.preserveSwipeX) {
            panCameraToItemIdIfOffscreen(cell.id, true);
          }
          const layout = computeFocusLayout(viewRef.current, cellWidth, cellHeight);
          const origin = getGridItemContentCenter(cell);
          const prevId = focusedIdRef.current;

          focusNavPrevIdRef.current = prevId;
          focusedIdRef.current = cell.id;
          setFocusedId(cell.id);
          setFocusSnapshot({
            ...layout,
            originCenterX: origin.x,
            originCenterY: origin.y
          });

          const isOrigin = Boolean(cell.isOriginCard);
          setMorphCardHidden(!isOrigin);
          setOriginPortraitUp(isOrigin);
        }
        return;
      }
    },
    [
      focusedWork,
      focusGallery,
      findReturnCellForWork,
      focusScrollNudgeY,
      focusScrollNudgeX,
      focusSwipeDragX,
      cellWidth,
      cellHeight,
      panCameraToItemIdIfOffscreen,
      getGridItemContentCenter
    ]
  );

  const rubberbandSwipeX = useCallback((dx: number) => {
    const limit = typeof window !== 'undefined' ? window.innerWidth * 0.42 : 160;
    const scaled = dx * 0.92;
    if (Math.abs(scaled) <= limit) return scaled;
    const excess = Math.abs(scaled) - limit;
    return Math.sign(scaled) * (limit + excess * 0.22);
  }, []);

  const resetFocusSwipeTrail = useCallback(
    (springBack: boolean) => {
      focusSwipeRef.current = null;
      focusSwipeCommittingRef.current = false;
      if (springBack) {
        animate(focusSwipeDragX, 0, FOCUS_SWIPE_SNAP_BACK).then(() => {
          setFocusSwipePeeksLive(false);
          // Keep adjacent-origin morph parked off-screen (don't snap to center)
          syncOriginFocusSwipeNudge(0, originSwipeSlotRef.current);
        });
      } else {
        focusSwipeDragX.stop();
        focusSwipeDragX.set(0);
        setFocusSwipePeeksLive(false);
        syncOriginFocusSwipeNudge(0, originSwipeSlotRef.current);
      }
    },
    [focusSwipeDragX, syncOriginFocusSwipeNudge]
  );

  /** Animate the track onto the peek, then swap content with no slide blink */
  const commitFocusSwipe = useCallback(
    async (direction: -1 | 1) => {
      if (focusSwipeCommittingRef.current) return;
      if (focusPhaseRef.current !== 'settled') return;
      focusSwipeCommittingRef.current = true;
      focusSwipeRef.current = null;

      // Desktop shares one scroll shell — pin to top before the slide (mobile panels are independent)
      if (!isMobile) {
        focusScrollNudgeY.set(0);
        if (focusScrollRef.current) focusScrollRef.current.scrollTop = 0;
      }

      // Peeks must paint before the track moves (chevron/keyboard start from rest)
      flushSync(() => setFocusSwipePeeksLive(true));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const width =
        focusDetailWidthRef.current ||
        (typeof window !== 'undefined' ? window.innerWidth - FOCUS_MOBILE_SIDE_PAD * 2 : 300);
      const target = direction > 0 ? -(width + FOCUS_SWIPE_GAP_PX) : width + FOCUS_SWIPE_GAP_PX;

      await animate(focusSwipeDragX, target, FOCUS_SWIPE_COMMIT);

      if (focusPhaseRef.current !== 'settled') {
        focusSwipeDragX.stop();
        focusSwipeDragX.set(0);
        setFocusSwipePeeksLive(false);
        syncOriginFocusSwipeNudge(0, originSwipeSlotRef.current);
        focusSwipeCommittingRef.current = false;
        return;
      }

      // Swap seat + reset track in one paint. Lock nudge sync during the swap so
      // dragX→0 doesn't briefly park the live Hello face at screen center (backdrop blink).
      originSwipeHandoffRef.current = true;
      focusSwipeDragX.stop();
      flushSync(() => {
        focusSwipeDragX.set(0);
        setFocusNavInstant(true);
        navigateFocus(direction, { preserveSwipeX: true, instant: true });
        setFocusSwipePeeksLive(false);
      });
      syncOriginFocusSwipeNudge(0, originSwipeSlotRef.current);
      originSwipeHandoffRef.current = false;

      requestAnimationFrame(() => {
        setFocusNavInstant(false);
        focusSwipeCommittingRef.current = false;
      });
    },
    [
      isMobile,
      focusSwipeDragX,
      focusScrollNudgeY,
      navigateFocus,
      syncOriginFocusSwipeNudge
    ]
  );

  const handleFocusSwipeTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!isMobile || focusGallery.length < 2) return;
      if (focusPhaseRef.current !== 'settled') return;
      if (focusSwipeCommittingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      // Kill any in-flight snap-back so the trail feels immediate
      focusSwipeDragX.stop();
      focusSwipeDragX.set(0);
      focusSwipeRef.current = { x: touch.clientX, y: touch.clientY, axis: null };
    },
    [isMobile, focusGallery.length, focusSwipeDragX]
  );

  const handleFocusSwipeTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = focusSwipeRef.current;
      if (!start || !isMobile || focusGallery.length < 2) {
        resetFocusSwipeTrail(true);
        return;
      }
      if (focusPhaseRef.current !== 'settled' || focusSwipeCommittingRef.current) {
        resetFocusSwipeTrail(true);
        return;
      }

      const touch = event.changedTouches[0];
      const dx = touch ? touch.clientX - start.x : focusSwipeDragX.get();
      const dy = touch ? touch.clientY - start.y : 0;
      const axis = start.axis ?? (Math.abs(dx) > Math.abs(dy) * FOCUS_SWIPE_AXIS_RATIO ? 'x' : 'y');

      if (axis === 'x' && Math.abs(dx) >= FOCUS_SWIPE_MIN_DX) {
        // Swipe left → next, swipe right → previous
        void commitFocusSwipe(dx < 0 ? 1 : -1);
        return;
      }

      resetFocusSwipeTrail(true);
    },
    [isMobile, focusGallery.length, focusSwipeDragX, commitFocusSwipe, resetFocusSwipeTrail]
  );

  const handleFocusSwipeTouchCancel = useCallback(() => {
    if (focusSwipeCommittingRef.current) return;
    resetFocusSwipeTrail(true);
  }, [resetFocusSwipeTrail]);

  // Non-passive touchmove so we can lock horizontal swipes and drive the trail
  useEffect(() => {
    if (!isMobile || focusPhase !== 'settled' || focusGallery.length < 2) return;
    const el = focusScrollShellRef.current;
    if (!el) return;

    const onTouchMove = (event: TouchEvent) => {
      event.stopPropagation();
      const start = focusSwipeRef.current;
      if (!start || focusPhaseRef.current !== 'settled' || focusSwipeCommittingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (!start.axis) {
        if (Math.abs(dx) < FOCUS_SWIPE_LOCK_PX && Math.abs(dy) < FOCUS_SWIPE_LOCK_PX) return;
        start.axis = Math.abs(dx) > Math.abs(dy) * 1.05 ? 'x' : 'y';
      }

      if (start.axis === 'x') {
        event.preventDefault();
        setFocusSwipePeeksLive(true);
        focusSwipeDragXRef.current.set(rubberbandSwipeX(dx));
      } else {
        focusSwipeDragXRef.current.set(0);
      }
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [isMobile, focusPhase, focusGallery.length, rubberbandSwipeX]);

  useEffect(() => {
    return () => {
      setCanvasFocused(false);
      if (focusArriveTimeoutRef.current) clearTimeout(focusArriveTimeoutRef.current);
    };
  }, [setCanvasFocused]);

  useEffect(() => {
    focusedIdRef.current = focusedId;
  }, [focusedId]);

  // Clear the previous morph id after the gallery swap has painted
  useLayoutEffect(() => {
    if (!focusNavPrevIdRef.current) return;
    focusNavPrevIdRef.current = null;
  }, [focusedId]);

  // Swipe handoff safety net: snap track to 0 after the new current is in the DOM
  useLayoutEffect(() => {
    if (!focusNavInstant) return;
    if (originSwipeHandoffRef.current) return;
    focusSwipeDragX.stop();
    focusSwipeDragX.set(0);
    // Re-park adjacent origin — never snap morph X to 0 (that flashes Hello behind the UI)
    syncOriginFocusSwipeNudge(0, originSwipeSlotRef.current);
  }, [focusNavInstant, focusedWork, focusSwipeDragX, syncOriginFocusSwipeNudge]);

  useEffect(() => {
    if (!focusedId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isMobile) void commitFocusSwipe(-1);
        else navigateFocus(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isMobile) void commitFocusSwipe(1);
        else navigateFocus(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedId, requestClose, commitFocusSwipe, navigateFocus, isMobile]);

  // Single proximity rAF for the whole canvas — idle while panning / intro / focus / drawer
  useAnimationFrame(() => {
    const view = viewRef.current;
    if (view.isDragging || isIntroPlayingRef.current || focusedIdRef.current) return;
    if (
      document.body.classList.contains('is-drawer-open') ||
      document.body.classList.contains('is-dragging') ||
      document.body.classList.contains('is-animating')
    ) {
      return;
    }

    const px = pointerX.get();
    const py = pointerY.get();
    if (px < 0 || py < 0) return;

    proximityHandlersRef.current.forEach((handlers) => {
      handlers.onFrame(px, py, view);
    });
  });

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (focusedIdRef.current || isIntroPlayingRef.current) return;
      // New gesture — drop any leftover suppress from a pan that ended off-card
      suppressClickRef.current = false;
      dragDistanceRef.current = 0;
      // Kill leftover fling so a new grab takes over immediately
      isCoastingRef.current = false;
      panVelocityRef.current = { x: 0, y: 0 };
      lastMoveTsRef.current = performance.now();
      isDragging.current = true;
      viewRef.current.isDragging = true;
      clearPointer();
      // Spring out — hard jump felt abrupt when starting a pan
      resetAllProximity(false);
      lastPosition.current = { x: clientX, y: clientY };
    },
    [clearPointer, resetAllProximity]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging.current) return;
      const dx = clientX - lastPosition.current.x;
      const dy = clientY - lastPosition.current.y;
      dragDistanceRef.current += Math.hypot(dx, dy);
      targetOffsetRef.current = {
        x: targetOffsetRef.current.x + dx,
        y: targetOffsetRef.current.y + dy
      };

      // Sample touch velocity for post-release inertia (mouse pans stay snappy)
      if (isTouchDrag.current) {
        const now = performance.now();
        const dt = now - lastMoveTsRef.current;
        lastMoveTsRef.current = now;
        if (dt > 0 && dt < 100) {
          // Normalize to ~60fps frame units so fling distance is frame-rate stable
          const scale = 16.67 / dt;
          const instX = dx * scale;
          const instY = dy * scale;
          const s = touchVelocitySmoothing;
          const prev = panVelocityRef.current;
          panVelocityRef.current = {
            x: prev.x * (1 - s) + instX * s,
            y: prev.y * (1 - s) + instY * s
          };
          touchInertiaEligibleRef.current = true;
        }
      }

      lastPosition.current = { x: clientX, y: clientY };
    },
    [touchVelocitySmoothing]
  );

  const handleEnd = useCallback(() => {
    if (isDragging.current && dragDistanceRef.current > clickDragThresholdPx) {
      suppressClickRef.current = true;
    }

    // Touch fling: keep coasting if the finger was still moving at release
    if (touchInertiaEligibleRef.current) {
      touchInertiaEligibleRef.current = false;
      const age = performance.now() - lastMoveTsRef.current;
      const speed = Math.hypot(panVelocityRef.current.x, panVelocityRef.current.y);
      if (!prefersReducedMotion && age < 80 && speed > touchInertiaMinSpeed) {
        panVelocityRef.current = {
          x: panVelocityRef.current.x * touchInertiaBoost,
          y: panVelocityRef.current.y * touchInertiaBoost
        };
        isCoastingRef.current = true;
      } else {
        panVelocityRef.current = { x: 0, y: 0 };
        isCoastingRef.current = false;
      }
    }

    dragDistanceRef.current = 0;
    isDragging.current = false;
    viewRef.current.isDragging = false;
  }, [prefersReducedMotion, touchInertiaBoost, touchInertiaMinSpeed]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isTouchDrag.current = false;
      handleStart(e.clientX, e.clientY);
    },
    [handleStart]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging.current) {
        handleMove(e.clientX, e.clientY);
        return;
      }

      pointerX.set(e.clientX);
      pointerY.set(e.clientY);
    },
    [handleMove, pointerX, pointerY]
  );

  const handleMouseLeave = useCallback(() => {
    clearPointer();
    // Spring back — leaving the viewport shouldn't hard-cut the effect
    resetAllProximity(false);
    handleEnd();
  }, [clearPointer, resetAllProximity, handleEnd]);

  // Cursor left the browser window entirely
  useEffect(() => {
    const onWindowPointerExit = () => {
      clearPointer();
      resetAllProximity(false);
    };

    document.documentElement.addEventListener('mouseleave', onWindowPointerExit);
    window.addEventListener('blur', onWindowPointerExit);

    return () => {
      document.documentElement.removeEventListener('mouseleave', onWindowPointerExit);
      window.removeEventListener('blur', onWindowPointerExit);
    };
  }, [clearPointer, resetAllProximity]);

  const handleZoom = useCallback((zoomPoint: { x: number; y: number }, newZoom: number) => {
    const rect = outerContainerRef.current?.getBoundingClientRect();
    if (rect) {
      const zoomFactor = newZoom / targetZoomRef.current;

      // Calculate the point in the content space
      const contentPointX = (zoomPoint.x - targetOffsetRef.current.x) / targetZoomRef.current;
      const contentPointY = (zoomPoint.y - targetOffsetRef.current.y) / targetZoomRef.current;

      // Calculate new offset to keep the zoom point stationary
      const newOffsetX = zoomPoint.x - contentPointX * newZoom;
      const newOffsetY = zoomPoint.y - contentPointY * newZoom;

      targetZoomRef.current = newZoom;
      targetOffsetRef.current = { x: newOffsetX, y: newOffsetY };
    }
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Let the focus scroll layer handle wheel/trackpad while focused
      if (focusedIdRef.current) return;
      // Block pan/zoom until the intro spread has finished
      if (isIntroPlayingRef.current) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom functionality remains the same
        const delta = -e.deltaY * zoomSpeed;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current * (1 + delta)));

        if (newZoom !== targetZoomRef.current) {
          const rect = outerContainerRef.current?.getBoundingClientRect();
          if (rect) {
            const zoomPoint = {
              x: e.clientX - rect.left - window.innerWidth / 2,
              y: e.clientY - rect.top - window.innerHeight / 2
            };
            handleZoom(zoomPoint, newZoom);
          }
        }
      } else {
        // Always assign a new object — in-place mutation breaks lerp when
        // targetOffsetRef and React offset state accidentally share a reference
        targetOffsetRef.current = {
          x: targetOffsetRef.current.x - e.deltaX,
          y: targetOffsetRef.current.y - e.deltaY
        };
      }
    },
    [handleZoom]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        isDragging.current = false;
        viewRef.current.isDragging = false;
        isPinching.current = true;
        isCoastingRef.current = false;
        panVelocityRef.current = { x: 0, y: 0 };
        touchInertiaEligibleRef.current = false;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        lastTouchDistance.current = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        lastPinchMidRef.current = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
      } else if (e.touches.length === 1) {
        isPinching.current = false;
        isTouchDrag.current = true;
        lastTouchDistance.current = null;
        lastPinchMidRef.current = null;
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleStart]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Don't cancel native scrolling while the focus layer is open
      if (focusedIdRef.current) return;
      if (isIntroPlayingRef.current) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      if (e.touches.length === 2) {
        isPinching.current = true;
        isDragging.current = false;
        viewRef.current.isDragging = false;

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        const midX = (touch1.clientX + touch2.clientX) / 2;
        const midY = (touch1.clientY + touch2.clientY) / 2;

        // Two-finger pan — move with the pinch midpoint
        if (lastPinchMidRef.current) {
          const dx = midX - lastPinchMidRef.current.x;
          const dy = midY - lastPinchMidRef.current.y;
          if (dx !== 0 || dy !== 0) {
            targetOffsetRef.current = {
              x: targetOffsetRef.current.x + dx,
              y: targetOffsetRef.current.y + dy
            };
          }
        }

        // Distance-ratio zoom — tracks finger spread 1:1 (old 0.01*delta felt sluggish)
        if (lastTouchDistance.current !== null && lastTouchDistance.current > 0) {
          const scale = distance / lastTouchDistance.current;
          const newZoom = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current * scale));

          if (newZoom !== targetZoomRef.current) {
            const rect = outerContainerRef.current?.getBoundingClientRect();
            if (rect) {
              const zoomPoint = {
                x: midX - rect.left - window.innerWidth / 2,
                y: midY - rect.top - window.innerHeight / 2
              };
              handleZoom(zoomPoint, newZoom);
            }
          }
        }

        lastTouchDistance.current = distance;
        lastPinchMidRef.current = { x: midX, y: midY };
      } else if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleMove, handleZoom]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        isPinching.current = false;
        lastTouchDistance.current = null;
        lastPinchMidRef.current = null;
      }
      if (e.touches.length === 0) {
        // handleEnd reads isTouchDrag / inertia eligibility — clear after
        handleEnd();
        isTouchDrag.current = false;
      } else if (e.touches.length === 1) {
        // Hand off to one-finger drag from the remaining touch
        isTouchDrag.current = true;
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleEnd, handleStart]
  );

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (outerContainer) {
      outerContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (outerContainer) {
        outerContainer.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (outerContainer) {
      outerContainer.addEventListener('mousemove', handleMouseMove as any);
      outerContainer.addEventListener('mouseup', handleEnd);
      outerContainer.addEventListener('mouseleave', handleMouseLeave);
      outerContainer.addEventListener('touchmove', handleTouchMove as any, { passive: false });
      // touchend/cancel go through React handleTouchEnd so inertia isn't applied twice
    }

    return () => {
      if (outerContainer) {
        outerContainer.removeEventListener('mousemove', handleMouseMove as any);
        outerContainer.removeEventListener('mouseup', handleEnd);
        outerContainer.removeEventListener('mouseleave', handleMouseLeave);
        outerContainer.removeEventListener('touchmove', handleTouchMove as any);
      }
    };
  }, [handleMouseMove, handleMouseLeave, handleTouchMove, handleEnd]);

  useEffect(() => {
    // Replay loader after HMR / remount when the store was already marked loaded
    if (useHomeStore.getState().loaded) {
      resetLoading();
      document.body.classList.remove('is-ready');
    }

    // Absolute fallback — never leave the loader stuck if intro capture / preload fails
    const timeout = setTimeout(() => {
      if (useHomeStore.getState().loaded) return;
      setLoadingProgress(100);
      setIsLoaded();
      setIntroComplete(true);
    }, INTRO_LOAD_FALLBACK_MS);
    return () => clearTimeout(timeout);
  }, [resetLoading, setIsLoaded, setLoadingProgress, setIntroComplete]);

  // Reduced motion: skip stack formation — preload a small work batch then finish
  useEffect(() => {
    if (!prefersReducedMotion) return;

    const srcs = works.slice(0, 8).map((work) => work.thumbnail || work.image);
    const cancel = preloadImages(srcs, {
      onProgress: ({ loaded, total }) => {
        if (total === 0) {
          setLoadingProgress(100);
          return;
        }
        setLoadingProgress(Math.round((loaded / total) * 100));
      },
      onComplete: () => {
        setLoadingProgress(100);
        setIsLoaded();
        setIntroComplete(true);
      }
    });

    const safety = setTimeout(() => {
      setLoadingProgress(100);
      setIsLoaded();
      setIntroComplete(true);
    }, INTRO_PRELOAD_SAFETY_MS);

    return () => {
      cancel();
      clearTimeout(safety);
    };
  }, [prefersReducedMotion, works, setIsLoaded, setLoadingProgress, setIntroComplete]);

  // Motion path: preload intro images, release cards into the stack one-by-one, then finish load
  useEffect(() => {
    if (prefersReducedMotion || !introReady) return;

    const stack = introStackRef.current;
    if (!stack || stack.length === 0) {
      setLoadingProgress(100);
      setIsLoaded();
      setIntroComplete(true);
      return;
    }

    let cancelled = false;
    let enterIndex = 0;
    let waitingForGap = false;
    const imageReady = new Set<string>();
    let gapTimer: ReturnType<typeof setTimeout> | null = null;
    // Fixed cadence — image preload runs in parallel, but the pile (and %) only advances on this beat
    const enterGapMs = STACK_ENTER_GAP_MS;
    stackLandedIdsRef.current = new Set();
    if (formationSettleTimerRef.current) {
      clearTimeout(formationSettleTimerRef.current);
      formationSettleTimerRef.current = null;
    }

    const finishLoad = () => {
      if (cancelled || useHomeStore.getState().loaded) return;
      if (formationSettleTimerRef.current) {
        clearTimeout(formationSettleTimerRef.current);
        formationSettleTimerRef.current = null;
      }
      setLoadingProgress(100);
      setIsLoaded();
    };

    const finishFormation = () => {
      if (cancelled) return;
      setLoadingProgress(100);
      // Safety: if onAnimationComplete never fires for a card, still spread after the spring window
      formationSettleTimerRef.current = setTimeout(() => {
        formationSettleTimerRef.current = null;
        finishLoad();
      }, STACK_SETTLE_BEFORE_LOAD_MS);
      // If every card already reported landing (e.g. remounts), proceed now
      if (stackLandedIdsRef.current.size >= stack.length) {
        finishLoad();
      }
    };

    const reportProgress = () => {
      if (cancelled) return;
      setLoadingProgress(Math.round((enterIndex / stack.length) * 100));
    };

    const enterNext = () => {
      if (cancelled || waitingForGap) return;
      if (enterIndex >= stack.length) {
        finishFormation();
        return;
      }

      const next = stack[enterIndex];
      if (!imageReady.has(next.id)) return;

      setStackEnteredIds((prev) => {
        if (prev.has(next.id)) return prev;
        const nextSet = new Set(prev);
        nextSet.add(next.id);
        return nextSet;
      });
      enterIndex += 1;
      reportProgress();

      if (enterIndex >= stack.length) {
        finishFormation();
        return;
      }

      waitingForGap = true;
      gapTimer = setTimeout(() => {
        waitingForGap = false;
        gapTimer = null;
        enterNext();
      }, enterGapMs);
    };

    for (const entry of stack) {
      if (!entry.src || isImageCached(entry.src)) {
        imageReady.add(entry.id);
      }
    }

    const preloadCancels = stack.map((entry) => {
      if (imageReady.has(entry.id)) return () => {};
      let settled = false;
      preloadImage(entry.src).then(() => {
        if (cancelled || settled) return;
        settled = true;
        imageReady.add(entry.id);
        enterNext();
      });
      return () => {
        settled = true;
      };
    });

    enterNext();

    const safety = setTimeout(() => {
      if (cancelled) return;
      for (const entry of stack) {
        imageReady.add(entry.id);
      }
      waitingForGap = false;
      if (gapTimer) {
        clearTimeout(gapTimer);
        gapTimer = null;
      }
      const forceEnter = () => {
        if (cancelled) return;
        if (enterIndex >= stack.length) {
          finishFormation();
          return;
        }
        const next = stack[enterIndex];
        setStackEnteredIds((prev) => {
          const nextSet = new Set(prev);
          nextSet.add(next.id);
          return nextSet;
        });
        enterIndex += 1;
        reportProgress();
        if (enterIndex >= stack.length) {
          finishFormation();
          return;
        }
        gapTimer = setTimeout(forceEnter, enterGapMs);
      };
      forceEnter();
    }, INTRO_PRELOAD_SAFETY_MS);

    return () => {
      cancelled = true;
      if (gapTimer) clearTimeout(gapTimer);
      if (formationSettleTimerRef.current) {
        clearTimeout(formationSettleTimerRef.current);
        formationSettleTimerRef.current = null;
      }
      clearTimeout(safety);
      preloadCancels.forEach((c) => c());
    };
  }, [introReady, prefersReducedMotion, setIsLoaded, setLoadingProgress, setIntroComplete]);

  const handleStackEnterComplete = useCallback(
    (itemId: string) => {
      stackLandedIdsRef.current.add(itemId);
      const total = introStackRef.current?.length ?? 0;
      // Wait until every stack card has actually reached center — not just been released
      if (total === 0 || stackLandedIdsRef.current.size < total) return;
      if (useHomeStore.getState().loaded) return;
      if (formationSettleTimerRef.current) {
        clearTimeout(formationSettleTimerRef.current);
        formationSettleTimerRef.current = null;
      }
      setLoadingProgress(100);
      setIsLoaded();
    },
    [setIsLoaded, setLoadingProgress]
  );

  const getItemPosition = useCallback(
    (item: GridItem & { x: number; y: number }) => ({
      x: item.x * (cellWidth + gapSize) + item.offsetX,
      y: item.y * (cellHeight + gapSize) + item.offsetY
    }),
    [cellWidth, cellHeight, gapSize]
  );

  const getViewportContentBounds = useCallback(
    (
      viewportWidth: number,
      viewportHeight: number,
      viewportOffsetX: number,
      viewportOffsetY: number,
      viewportZoom: number
    ) => {
      const originOffsetX = (viewportWidth / 2) * (1 - 1 / viewportZoom);
      const originOffsetY = (viewportHeight / 2) * (1 - 1 / viewportZoom);

      return {
        left: originOffsetX - viewportOffsetX / viewportZoom,
        top: originOffsetY - viewportOffsetY / viewportZoom,
        right: originOffsetX - viewportOffsetX / viewportZoom + viewportWidth / viewportZoom,
        bottom: originOffsetY - viewportOffsetY / viewportZoom + viewportHeight / viewportZoom
      };
    },
    []
  );

  const isItemInViewport = useCallback(
    (
      item: GridItem & { x: number; y: number },
      bounds: ReturnType<typeof getViewportContentBounds>,
      itemWidth: number,
      itemHeight: number
    ) => {
      const pos = getItemPosition(item);

      return (
        pos.x + itemWidth > bounds.left &&
        pos.x < bounds.right &&
        pos.y + itemHeight > bounds.top &&
        pos.y < bounds.bottom
      );
    },
    [getItemPosition]
  );

  // Capture a one-shot clustered intro layout for viewport items only
  if (visibleItems.length > 0 && !introConfigRef.current && !prefersReducedMotion && outerContainerRef.current) {
    const { width, height } = outerContainerRef.current.getBoundingClientRect();
    if (width > 0 && height > 0) {
      const viewportZoom = targetZoomRef.current;

      // Pick the grid seat nearest the viewport middle, then pan so it lands dead-center
      const { originX, originY, originGX, originGY } = findCenterGridSeat(width, height);

      const snapOffset = {
        x: (width / 2 - originX) * viewportZoom,
        y: (height / 2 - originY) * viewportZoom
      };
      introOriginRef.current = { x: originX, y: originY };

      const viewportBounds = getViewportContentBounds(width, height, snapOffset.x, snapOffset.y, viewportZoom);
      const viewportItems = visibleItems.filter((item) =>
        isItemInViewport(item, viewportBounds, cellWidth, cellHeight)
      );

      // Guarantee the dead-center seat exists in the intro set (and pin custom origin card)
      const originId = generateItemId(originGX, originGY);
      const pinnedOrigin = originCard ? pinOriginCardAt(originGX, originGY) : null;
      const existingOriginIdx = viewportItems.findIndex((item) => item.id === originId);
      if (pinnedOrigin) {
        const originEntry = { ...pinnedOrigin, x: originGX, y: originGY };
        if (existingOriginIdx >= 0) {
          viewportItems[existingOriginIdx] = originEntry;
        } else {
          viewportItems.push(originEntry);
        }
      } else if (existingOriginIdx < 0) {
        let originItem = itemsRef.current.get(originId);
        if (!originItem) {
          const adjacentWorks = getAdjacentWorks(originGX, originGY, 3);
          originItem = {
            id: originId,
            work: selectUniqueWork(originGX, originGY, adjacentWorks),
            offsetX: 0,
            offsetY: originGX % 2 === 0 ? 0 : staggerOffset
          };
          itemsRef.current.set(originId, originItem);
        }
        viewportItems.push({ ...originItem, x: originGX, y: originGY });
      }

      const itemTargets = viewportItems.map((item) => {
        const pos = getItemPosition(item);
        const targetCenterX = pos.x + cellWidth / 2;
        const targetCenterY = pos.y + cellHeight / 2;
        const dx = targetCenterX - originX;
        const dy = targetCenterY - originY;
        return {
          item,
          targetCenterY,
          distance: Math.hypot(dx, dy)
        };
      });

      const maxDistance = Math.max(...itemTargets.map((target) => target.distance), 1);
      const minY = Math.min(...itemTargets.map((target) => target.targetCenterY));
      const maxY = Math.max(...itemTargets.map((target) => target.targetCenterY));
      const yRange = Math.max(maxY - minY, 1);
      // Stack cards stay fully opaque during formation (no depth fade)
      const minStackOpacity = 1;
      // Cluster on the origin card's home — it stays put while peers peel outward
      const clusterX = originX - cellWidth / 2;
      const clusterY = originY - cellHeight / 2;

      const stackEntries = itemTargets.map(({ item, targetCenterY, distance }) => {
        const seed = item.x * 12.9898 + item.y * 78.233 + item.id.length * 3.17;
        const randB = seededRandom(seed + 1);
        const randD = seededRandom(seed + 3);
        const randE = seededRandom(seed * 1.73 + 9.41);
        const rotationMix = randD * 0.55 + randE * 0.45;
        const distT = distance / maxDistance;
        const fromBottom = (maxY - targetCenterY) / yRange;
        const isOrigin = distance < 1;

        return {
          item,
          distance,
          stackOrder: isOrigin ? 2 : 1 - distT + randB * 0.08,
          x: clusterX,
          y: clusterY,
          rotate: isOrigin ? 0 : (rotationMix - 0.5) * INTRO_CLUSTER_ROTATION_RANGE,
          scale: 1,
          delay: isOrigin ? 0 : 0.03 + distT * INTRO_SPREAD_RIPPLE_S + distT * fromBottom * 0.12 + randB * 0.04
        };
      });

      stackEntries.sort((a, b) => a.stackOrder - b.stackOrder);

      const configs = new Map<string, InfiniteCanvasItemIntro>();
      stackEntries.forEach((entry, stackIndex) => {
        const stackDepth = stackEntries.length <= 1 ? 1 : stackIndex / (stackEntries.length - 1);
        const opacity = minStackOpacity + stackDepth * (1 - minStackOpacity);

        configs.set(entry.item.id, {
          x: entry.x,
          y: entry.y,
          rotate: entry.rotate,
          scale: entry.scale,
          delay: entry.delay,
          opacity,
          zIndex: stackIndex + 1
        });
      });

      introConfigRef.current = configs.size > 0 ? configs : new Map();
      introStackRef.current = stackEntries.map(({ item }) => ({
        id: item.id,
        // Custom origin may have no poster — empty src is treated as ready in stack enter
        src: item.work.thumbnail || item.work.image || '',
        item
      }));
      introCompletedIdsRef.current = new Set();
      // Defer setState to layout effect — setState during render aborts the rest of the pass
      pendingIntroSnapRef.current = snapOffset;
      queueMicrotask(() => setIntroFlush((n) => n + 1));
    }
  }

  // Origin card is pinned in visibleItems (including reduced-motion).

  const isClusterHold = Boolean(introConfigRef.current?.size) && !shouldSpread && !prefersReducedMotion;
  const introStackCount = introConfigRef.current?.size ?? 0;
  const stackFormationDone = prefersReducedMotion || introStackCount === 0 || stackEnteredIds.size >= introStackCount;

  // Spread as soon as load hits 100% (formation done)
  useEffect(() => {
    if (prefersReducedMotion) {
      setShouldSpread(true);
      setIsIntroPlaying(false);
      return;
    }
    if (shouldSpread || !loaded || !introReady || !stackFormationDone) return;
    setShouldSpread(true);
  }, [loaded, shouldSpread, introReady, prefersReducedMotion, stackFormationDone]);

  const handleIntroComplete = useCallback(
    (itemId: string) => {
      const total = introConfigRef.current?.size ?? 0;
      if (total === 0 || !isIntroPlaying) return;

      introCompletedIdsRef.current.add(itemId);
      if (introCompletedIdsRef.current.size >= total) {
        setIsIntroPlaying(false);
      }
    },
    [isIntroPlaying]
  );

  // Safety timeout in case some items never fire onAnimationComplete
  useEffect(() => {
    if (!shouldSpread || !isIntroPlaying) return;
    const timeout = setTimeout(() => setIsIntroPlaying(false), INTRO_SPREAD_SAFETY_MS);
    return () => clearTimeout(timeout);
  }, [shouldSpread, isIntroPlaying]);

  // Reveal header shortly after spread starts (not after the full spring settles)
  useEffect(() => {
    if (prefersReducedMotion && loaded) {
      setIntroComplete(true);
      return;
    }
    if (!shouldSpread) return;
    const timeout = setTimeout(() => setIntroComplete(true), HEADER_REVEAL_AFTER_SPREAD_MS);
    return () => clearTimeout(timeout);
  }, [shouldSpread, prefersReducedMotion, loaded, setIntroComplete]);

  const isFocused = Boolean(focusedId && focusSnapshot && focusedWork && focusPhase);
  const isInteractionLocked = isIntroPlaying || isFocused;
  const isFocusSettled = focusPhase === 'settled';
  const isFocusHandingOff = focusPhase === 'out';
  const isFocusReturning = focusPhase === 'returning';
  const focusImageSrc = focusedWork ? (focusedWork.thumbnail ? focusedWork.thumbnail : focusedWork.image) : '';
  const focusedIsOriginCard = Boolean(focusedId && itemsRef.current.get(focusedId)?.isOriginCard && originCard);
  const showFocusScrim = focusPhase === 'in' || focusPhase === 'settled';
  // Keep HTML through 'out' so the morph can paint underneath before the overlay exits
  const showFocusHtml = focusPhase === 'in' || focusPhase === 'settled' || focusPhase === 'out';
  const focusWorkKey = focusedWork ? getWorkKey(focusedWork) : '';
  if (focusSnapshot) {
    focusDetailWidthRef.current = focusSnapshot.detailWidth;
  }
  const focusAdjacentWorks = useMemo(() => {
    if (!focusedWork || focusGallery.length < 2) return { prev: null as Work | null, next: null as Work | null };
    const currentKey = getWorkKey(focusedWork);
    const currentIndex = focusGallery.findIndex((work) => getWorkKey(work) === currentKey);
    if (currentIndex < 0) return { prev: null, next: null };
    const len = focusGallery.length;
    return {
      prev: focusGallery[(currentIndex - 1 + len) % len] ?? null,
      next: focusGallery[(currentIndex + 1) % len] ?? null
    };
  }, [focusedWork, focusGallery]);
  const useFocusSwipeGallery = isMobile && focusGallery.length > 1;
  /** Per-panel scroll is mobile-only; desktop keeps the shared shell scroll */
  const useMobilePanelScroll = useFocusSwipeGallery;
  const showFocusSwipePeeks = useFocusSwipeGallery && isFocusSettled && focusSwipePeeksLive;
  /** Origin's seat in the swipe track — only while on-screen as current or live peek */
  const originSwipeSlot = useMemo(() => {
    if (!originCardKey || !focusedWork || !useFocusSwipeGallery) {
      return null as 'prev' | 'current' | 'next' | null;
    }
    if (getWorkKey(focusedWork) === originCardKey) return 'current';
    if (!showFocusSwipePeeks) return null;
    if (focusAdjacentWorks.next && getWorkKey(focusAdjacentWorks.next) === originCardKey) return 'next';
    if (focusAdjacentWorks.prev && getWorkKey(focusAdjacentWorks.prev) === originCardKey) return 'prev';
    return null;
  }, [originCardKey, focusedWork, useFocusSwipeGallery, showFocusSwipePeeks, focusAdjacentWorks]);
  originSwipeSlotRef.current = originSwipeSlot;

  // Re-sync morph X when the origin seat changes (peek mounts / becomes current)
  useLayoutEffect(() => {
    if (originSwipeHandoffRef.current) return;
    syncOriginFocusSwipeNudge(focusSwipeDragX.get(), originSwipeSlot);
  }, [originSwipeSlot, syncOriginFocusSwipeNudge, focusSwipeDragX]);

  // Desktop: AnimatePresence slides (production morph). Mobile: track + peeks.
  const useFocusSlidePresence = !isMobile && focusGallery.length > 1;
  const focusSlideInitial = getFocusSlideInitial(focusNavDirection);
  const focusSlideExit = getFocusSlideExit(focusNavDirection);
  const focusSlideTransition = FOCUS_SLIDE_TRANSITION;
  const focusSwipePanels = useMemo(() => {
    if (!focusedWork) return [] as { work: Work; side: 'prev' | 'current' | 'next' }[];
    if (!useFocusSwipeGallery) {
      return [{ work: focusedWork, side: 'current' as const }];
    }
    const panels: { work: Work; side: 'prev' | 'current' | 'next' }[] = [];
    if (showFocusSwipePeeks && focusAdjacentWorks.prev) {
      panels.push({ work: focusAdjacentWorks.prev, side: 'prev' });
    }
    panels.push({ work: focusedWork, side: 'current' });
    if (showFocusSwipePeeks && focusAdjacentWorks.next) {
      panels.push({ work: focusAdjacentWorks.next, side: 'next' });
    }
    return panels;
  }, [focusedWork, useFocusSwipeGallery, showFocusSwipePeeks, focusAdjacentWorks]);

  // Start the marquee as soon as the origin card joins the stack (not when load/intro fully finishes)
  const originCardId = originCardIdRef.current;
  const originMarqueeActive =
    !isClusterHold || shouldSpread || (originCardId ? stackEnteredIds.has(originCardId) : false);

  const originInFocus = originPortraitUp;

  const originCustomContent = useMemo(
    () =>
      originCard
        ? originCard.render({
            width: cellWidth,
            height: cellHeight,
            active: originMarqueeActive,
            onActivate: handleOriginActivate,
            marqueeState: originMarqueeStateRef,
            inFocus: originInFocus
          })
        : null,
    [originCard, cellWidth, cellHeight, originMarqueeActive, handleOriginActivate, originInFocus]
  );

  // Origin face always lives on the canvas morph — never portal into the focus overlay
  // (mobile browsers flash on portal host swaps).
  const showOriginFace = Boolean(originCanvasHost && originCustomContent);

  // Portrait up while origin is the focused card or riding in as a swipe peek.
  useLayoutEffect(() => {
    if (focusPhase === 'out' || focusPhase === 'returning' || focusPhase == null) {
      setOriginPortraitUp(false);
      return;
    }
    if (originSwipeSlot === 'current' || originSwipeSlot === 'prev' || originSwipeSlot === 'next') {
      const frame = requestAnimationFrame(() => setOriginPortraitUp(true));
      return () => cancelAnimationFrame(frame);
    }
    if (focusedIsOriginCard && isFocusSettled) {
      const frame = requestAnimationFrame(() => setOriginPortraitUp(true));
      return () => cancelAnimationFrame(frame);
    }
    // Left the Hello seat (swiped a few slides away) — drop portrait so it
    // doesn't keep animating on an exiting/invisible morph.
    setOriginPortraitUp(false);
  }, [focusedIsOriginCard, isFocusSettled, focusPhase, originSwipeSlot]);

  return (
    <div
      ref={outerContainerRef}
      className={styles.infiniteCanvas}
      data-total={visibleItems.length}
      data-focused={isFocused && !isFocusReturning ? 'true' : undefined}
      onMouseDown={isInteractionLocked ? undefined : handleMouseDown}
      onTouchStart={isInteractionLocked ? undefined : handleTouchStart}
      onTouchMove={isInteractionLocked ? undefined : handleTouchMove}
      onTouchEnd={isInteractionLocked ? undefined : handleTouchEnd}
      onTouchCancel={isInteractionLocked ? undefined : handleTouchEnd}
      style={{ pointerEvents: isClusterHold ? 'none' : undefined }}
    >
      <AnimatePresence>
        {showFocusScrim && (
          <motion.button
            key="focus-scrim"
            type="button"
            aria-label="Dismiss project"
            className={styles.infiniteCanvasFocusScrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={requestClose}
          />
        )}
      </AnimatePresence>

      <div
        ref={innerContainerRef}
        className={styles.infiniteCanvasItemWrapper}
        style={{
          // Transform is driven by rAF via applyCameraTransform — keep out of React style
          willChange: 'transform',
          pointerEvents: isFocused ? 'none' : undefined
        }}
      >
        {(() => {
          let peerReturnMaxDist = 1;
          if (staggerMode === 'focus' && focusedId && focusSnapshot) {
            for (const item of visibleItems) {
              if (item.id === focusedId) continue;
              const pos = getItemPosition(item);
              const dist = Math.hypot(
                pos.x + cellWidth / 2 - focusSnapshot.originCenterX,
                pos.y + cellHeight / 2 - focusSnapshot.originCenterY
              );
              if (dist > peerReturnMaxDist) peerReturnMaxDist = dist;
            }
          }

          // During cluster hold, force-mount intro stack cards (cull can drop them after snap).
          // Always keep the focused return seat mounted after gallery nav (may sit outside cull).
          const renderItems = (() => {
            const byId = new Map(visibleItems.map((item) => [item.id, item]));
            if (focusedId) {
              const focused = itemsRef.current.get(focusedId);
              const coords = focused ? parseGridCoords(focusedId) : null;
              if (focused && coords && !byId.has(focusedId)) {
                byId.set(focusedId, { ...focused, ...coords });
              }
            }
            // Keep origin mounted while it rides in as a swipe peek (live morph follow)
            if (originSwipeSlot === 'prev' || originSwipeSlot === 'next') {
              const originId = originCardIdRef.current;
              if (originId && !byId.has(originId)) {
                const originItem = itemsRef.current.get(originId);
                const coords = originItem ? parseGridCoords(originId) : null;
                if (originItem && coords) {
                  byId.set(originId, { ...originItem, ...coords });
                }
              }
            }
            if (isClusterHold && introStackRef.current?.length) {
              for (const entry of introStackRef.current) {
                if (!byId.has(entry.id)) {
                  byId.set(entry.id, entry.item);
                }
              }
            }
            return [...byId.values()];
          })();

          return renderItems.map((item) => {
            const position = getItemPosition(item);
            const intro = introConfigRef.current?.get(item.id);

            // During stack formation, only the intro pile is visible — hide the rest of the grid
            if (isClusterHold && !intro) {
              return null;
            }
            // Wait for camera snap before painting intro cards (avoids off-screen flash)
            if (isClusterHold && !introReady) {
              return null;
            }

            let focusMode: InfiniteCanvasFocusMode = 'idle';
            let focusX = position.x;
            let focusY = position.y;
            let focusScale = 1;
            let focusOpacity = 1;
            let focusImmediate = false;
            let focusReturnDelay = 0;

            if (focusedId && focusSnapshot && focusPhase) {
              if (item.id === focusedId) {
                if (isFocusReturning) {
                  if (focusReturnToCenterRef.current) {
                    // Far-off seat: dissolve at the focus center instead of flying across the grid
                    focusMode = 'returning';
                    focusX = focusSnapshot.contentCenterX - cellWidth / 2;
                    focusY = focusSnapshot.contentCenterY - cellHeight / 2;
                    focusScale = FOCUS_EXIT_SCALE;
                    focusOpacity = 0;
                    focusImmediate = false;
                  } else {
                    // Card springs home first; peers stay exited until this completes
                    focusMode = 'returning';
                    focusX = position.x;
                    focusY = position.y;
                    focusScale = 1;
                    focusOpacity = 1;
                    focusImmediate = false;
                  }
                } else {
                  focusMode = 'focused';
                  focusX = focusSnapshot.contentCenterX - cellWidth / 2;
                  focusY = focusSnapshot.contentCenterY - cellHeight / 2;
                  focusScale = focusSnapshot.cardScale;
                  // Origin: live morph stays up while Hello is focused (slides with the seat)
                  focusOpacity = item.isOriginCard ? 1 : morphCardHidden ? 0 : 1;
                  // Instant opacity only for handoff hide/show — never on morph-in (skips enter)
                  // Also snap on viewport resize / gallery swap so morph tracks the HTML overlay
                  focusImmediate =
                    snapFocusLayoutRef.current ||
                    isFocusHandingOff ||
                    (morphCardHidden && isFocusSettled && !item.isOriginCard) ||
                    (isFocusSettled && Boolean(focusNavPrevIdRef.current));
                }
              } else if (
                item.isOriginCard &&
                focusSnapshot &&
                (originSwipeSlot === 'prev' || originSwipeSlot === 'next')
              ) {
                // Ride with the peek as the live Hello face — no static-image blink on land
                focusMode = 'focused';
                focusX = focusSnapshot.contentCenterX - cellWidth / 2;
                focusY = focusSnapshot.contentCenterY - cellHeight / 2;
                focusScale = focusSnapshot.cardScale;
                focusOpacity = showFocusSwipePeeks ? 1 : 0;
                focusImmediate = true;
              } else if (releaseFocusPeers && isFocusReturning) {
                // Peers released early — fall through to idle so peer-return springs run
                focusMode = 'idle';
              } else {
                focusMode = 'exiting';
                const cx = position.x + cellWidth / 2;
                const cy = position.y + cellHeight / 2;
                // Push away from the clicked card, not the focus destination
                let dx = cx - focusSnapshot.originCenterX;
                let dy = cy - focusSnapshot.originCenterY;
                const distFromOrigin = Math.hypot(dx, dy) || 1;
                dx /= distFromOrigin;
                dy /= distFromOrigin;
                focusX = position.x + dx * focusSnapshot.pushDistance;
                focusY = position.y + dy * focusSnapshot.pushDistance;
                focusScale = FOCUS_EXIT_SCALE;
                focusOpacity = 0;
                // Previous gallery seat + Hello: snap out. Hello especially must not
                // spring from the focus/peek seat to exit after peeks unmount (blink).
                focusImmediate =
                  item.id === focusNavPrevIdRef.current || Boolean(item.isOriginCard);
                if (staggerMode === 'legacy') {
                  // Original: reuse intro spread delays
                  focusReturnDelay = introConfigRef.current?.get(item.id)?.delay ?? 0;
                } else {
                  // Inside-out: nearest peers first — same stagger for exit + return
                  const t = Math.min(1, distFromOrigin / peerReturnMaxDist);
                  const seed = item.x * 12.9898 + item.y * 78.233 + item.id.length * 3.17;
                  focusReturnDelay =
                    FOCUS_PEER_RETURN_BASE_S +
                    t * FOCUS_PEER_RETURN_RIPPLE_S +
                    seededRandom(seed + 1) * FOCUS_PEER_RETURN_JITTER_S;
                }
              }
            }

            return (
              <InfiniteCanvasItem
                key={item.id}
                id={item.id}
                onSelect={handleItemClick}
                work={item.work}
                x={position.x}
                y={position.y}
                width={cellWidth}
                height={cellHeight}
                intro={isIntroPlaying || isClusterHold ? intro : undefined}
                shouldSpread={shouldSpread}
                stackEntered={!intro || shouldSpread || stackEnteredIds.has(item.id)}
                customContentHostRef={item.isOriginCard ? setOriginCanvasHost : undefined}
                viewRef={viewRef}
                proximityEnabled={!isIntroPlaying && !focusedId}
                focusMode={focusMode}
                focusX={focusX}
                focusY={focusY}
                focusScale={focusScale}
                focusOpacity={focusOpacity}
                focusImmediate={focusImmediate}
                focusReturnDissolve={
                  isFocusReturning &&
                  item.id === focusedId &&
                  focusReturnToCenterRef.current
                }
                focusReturnDelay={focusReturnDelay}
                focusScrollNudgeY={item.isOriginCard ? focusScrollNudgeY : undefined}
                focusScrollNudgeX={item.isOriginCard ? focusScrollNudgeX : undefined}
                registerProximity={registerProximity}
                unregisterProximity={unregisterProximity}
                onStackEnterComplete={intro && isClusterHold ? handleStackEnterComplete : undefined}
                onIntroComplete={intro && (isIntroPlaying || isClusterHold) ? handleIntroComplete : undefined}
                onFocusArrive={item.id === focusedId ? handleFocusArrive : undefined}
                onFocusReturnComplete={item.id === focusedId ? handleFocusReturnComplete : undefined}
              />
            );
          });
        })()}
        {showOriginFace ? createPortal(originCustomContent, originCanvasHost!) : null}
      </div>

      <AnimatePresence>
        {showFocusHtml && focusedWork && focusSnapshot && (
          <>
            <AnimatePresence>
              {isFocusSettled ? (
                <motion.button
                  key="focus-close"
                  type="button"
                  className={styles.infiniteCanvasFocusClose}
                  aria-label="Close"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={FOCUS_CLOSE_TRANSITION}
                  onClick={requestClose}
                >
                  <img src="/images/icon/close.svg" alt="" />
                </motion.button>
              ) : null}
            </AnimatePresence>
            <div
              key="focus-scroll"
              ref={(node) => {
                focusScrollShellRef.current = node;
                if (!useMobilePanelScroll) focusScrollRef.current = node;
              }}
              className={styles.infiniteCanvasFocusScroll}
              data-ready={isFocusSettled ? 'true' : undefined}
              data-origin={focusedIsOriginCard ? 'true' : undefined}
              data-panel-scroll={useMobilePanelScroll ? 'true' : undefined}
              onScroll={
                !useMobilePanelScroll && focusedIsOriginCard ? handleFocusScroll : undefined
              }
              onTouchStart={handleFocusSwipeTouchStart}
              onTouchEnd={handleFocusSwipeTouchEnd}
              onTouchCancel={handleFocusSwipeTouchCancel}
              onWheel={(e) => e.stopPropagation()}
              style={{
                opacity: isFocusSettled ? 1 : 0,
                pointerEvents: isFocusSettled ? 'auto' : 'none'
              }}
            >
              <div
                className={styles.infiniteCanvasFocusScrollInner}
                style={
                  useMobilePanelScroll
                    ? {
                        // Keep the 24px side inset on the shell so detailWidth matches the morph
                        paddingLeft: FOCUS_MOBILE_SIDE_PAD,
                        paddingRight: FOCUS_MOBILE_SIDE_PAD
                      }
                    : { paddingTop: focusSnapshot.cardTopScreenY }
                }
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={styles.infiniteCanvasFocusDetail}
                  style={{ width: focusSnapshot.detailWidth }}
                >
                  <motion.div
                    className={styles.infiniteCanvasFocusSwipeTrack}
                    style={{ x: showFocusSwipePeeks ? focusSwipeDragX : 0 }}
                  >
                    {useFocusSwipeGallery ? (
                      focusSwipePanels.map(({ work, side }) => {
                        const panelKey = getWorkKey(work);
                        const isCurrent = side === 'current';
                        const isOriginWork = Boolean(originCardKey && panelKey === originCardKey);
                        const panelSrc = work.thumbnail || work.image;
                        return (
                          <div
                            key={panelKey}
                            className={styles.infiniteCanvasFocusSwipePanel}
                            data-side={side}
                            aria-hidden={!isCurrent}
                            ref={
                              isCurrent && useMobilePanelScroll
                                ? (node) => {
                                    focusScrollRef.current = node;
                                  }
                                : undefined
                            }
                            onScroll={
                              isCurrent && useMobilePanelScroll && isOriginWork
                                ? handleFocusScroll
                                : undefined
                            }
                            style={
                              useMobilePanelScroll
                                ? { paddingTop: focusSnapshot.cardTopScreenY }
                                : undefined
                            }
                          >
                            <FocusSwipeCard
                              side={side}
                              dragX={focusSwipeDragX}
                              panelStride={focusSnapshot.detailWidth + FOCUS_SWIPE_GAP_PX}
                              reducedMotion={Boolean(prefersReducedMotion)}
                              softIncoming={!isMobile}
                              isCurrent={isCurrent}
                              isOriginWork={isOriginWork}
                              detailWidth={focusSnapshot.detailWidth}
                              scaledScreenHeight={focusSnapshot.scaledScreenHeight}
                              borderRadius={
                                focusSnapshot.detailWidth * CARD_BORDER_RADIUS_RATIO
                              }
                              panelSrc={panelSrc}
                              workName={work.name}
                              setFocusCardNode={isCurrent ? setFocusCardNode : undefined}
                              setFocusImageNode={isCurrent ? setFocusImageNode : undefined}
                            />
                            {isFocusSettled ? (
                              <FocusSwipeCopy
                                work={work}
                                side={side}
                                dragX={focusSwipeDragX}
                                panelStride={
                                  focusSnapshot.detailWidth + FOCUS_SWIPE_GAP_PX
                                }
                                isCurrent={isCurrent}
                                firstOpenReveal={
                                  isCurrent &&
                                  focusNavDirection === 0 &&
                                  !focusNavInstant
                                }
                                reducedMotion={Boolean(prefersReducedMotion)}
                              />
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className={styles.infiniteCanvasFocusSwipePanel} data-side="current">
                        <div className={styles.infiniteCanvasFocusCardStage}>
                          {useFocusSlidePresence ? (
                            <AnimatePresence mode="sync" initial={false}>
                              <motion.div
                                key={focusWorkKey}
                                className={styles.infiniteCanvasFocusSlide}
                                initial={focusSlideInitial}
                                animate={{ x: 0, opacity: 1 }}
                                exit={focusSlideExit}
                                transition={focusSlideTransition}
                              >
                                <div
                                  ref={setFocusCardNode}
                                  className={styles.infiniteCanvasFocusCard}
                                  data-origin={focusedIsOriginCard ? 'true' : undefined}
                                  style={{
                                    width: focusSnapshot.detailWidth,
                                    height: focusSnapshot.scaledScreenHeight,
                                    borderRadius:
                                      focusSnapshot.detailWidth * CARD_BORDER_RADIUS_RATIO
                                  }}
                                >
                                  {focusedIsOriginCard ? (
                                    <div
                                      className={styles.infiniteCanvasFocusCardCustom}
                                      aria-hidden
                                    />
                                  ) : (
                                    <img
                                      ref={setFocusImageNode}
                                      className={styles.infiniteCanvasFocusCardImage}
                                      src={focusImageSrc}
                                      alt={focusedWork.name}
                                      draggable={false}
                                      decoding="async"
                                      fetchPriority="high"
                                      onLoad={() => markImageLoaded(focusImageSrc)}
                                    />
                                  )}
                                </div>
                              </motion.div>
                            </AnimatePresence>
                          ) : (
                            <div className={styles.infiniteCanvasFocusSlide}>
                              <div
                                ref={setFocusCardNode}
                                className={styles.infiniteCanvasFocusCard}
                                data-origin={focusedIsOriginCard ? 'true' : undefined}
                                style={{
                                  width: focusSnapshot.detailWidth,
                                  height: focusSnapshot.scaledScreenHeight,
                                  borderRadius: focusSnapshot.detailWidth * CARD_BORDER_RADIUS_RATIO
                                }}
                              >
                                {focusedIsOriginCard ? (
                                  <div
                                    className={styles.infiniteCanvasFocusCardCustom}
                                    aria-hidden
                                  />
                                ) : (
                                  <img
                                    ref={setFocusImageNode}
                                    className={styles.infiniteCanvasFocusCardImage}
                                    src={focusImageSrc}
                                    alt={focusedWork.name}
                                    draggable={false}
                                    decoding="async"
                                    fetchPriority="high"
                                    onLoad={() => markImageLoaded(focusImageSrc)}
                                  />
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {isFocusSettled ? (
                          <div className={styles.infiniteCanvasFocusCopyStage}>
                            {useFocusSlidePresence ? (
                              <AnimatePresence mode="sync">
                                <motion.div
                                  key={focusWorkKey}
                                  className={styles.infiniteCanvasFocusCopy}
                                  initial={getFocusCopySlideInitial(focusNavDirection)}
                                  animate={{ opacity: 1, x: 0, y: 0 }}
                                  exit={getFocusCopySlideExit(focusNavDirection)}
                                  transition={
                                    focusNavDirection === 0
                                      ? FOCUS_COPY_ITEM_REVEAL.body
                                      : FOCUS_COPY_SLIDE_TRANSITION
                                  }
                                >
                                  <h1 className={styles.infiniteCanvasFocusTitle}>
                                    {focusedWork.name}
                                  </h1>
                                  <div className={styles.infiniteCanvasFocusDescription}>
                                    {focusedWork.description}
                                  </div>
                                  {focusedWork.url ? (
                                    <a
                                      className={styles.infiniteCanvasFocusLink}
                                      href={focusedWork.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {formatUrl(focusedWork.url)}
                                      {FOCUS_LINK_ARROW}
                                    </a>
                                  ) : null}
                                </motion.div>
                              </AnimatePresence>
                            ) : (
                              <motion.div
                                key={focusWorkKey}
                                className={styles.infiniteCanvasFocusCopy}
                                initial={
                                  focusNavDirection === 0 && !focusNavInstant
                                    ? { opacity: 0, y: 16 }
                                    : false
                                }
                                animate={{ opacity: 1, x: 0, y: 0 }}
                                transition={
                                  focusNavDirection === 0 && !focusNavInstant
                                    ? FOCUS_COPY_ITEM_REVEAL.body
                                    : { duration: 0 }
                                }
                              >
                                <h1 className={styles.infiniteCanvasFocusTitle}>
                                  {focusedWork.name}
                                </h1>
                                <div className={styles.infiniteCanvasFocusDescription}>
                                  {focusedWork.description}
                                </div>
                                {focusedWork.url ? (
                                  <a
                                    className={styles.infiniteCanvasFocusLink}
                                    href={focusedWork.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {formatUrl(focusedWork.url)}
                                    {FOCUS_LINK_ARROW}
                                  </a>
                                ) : null}
                              </motion.div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </motion.div>
                </div>
              </div>
            </div>
            <AnimatePresence>
              {isFocusSettled && !isMobile && focusGallery.length > 1 ? (
                <>
                  <motion.button
                    key="focus-prev"
                    type="button"
                    className={styles.infiniteCanvasFocusNavPrev}
                    aria-label="Previous project"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => navigateFocus(-1)}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M14.5 5.5L8 12l6.5 6.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.button>
                  <motion.button
                    key="focus-next"
                    type="button"
                    className={styles.infiniteCanvasFocusNavNext}
                    aria-label="Next project"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => navigateFocus(1)}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M9.5 5.5L16 12l-6.5 6.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.button>
                </>
              ) : null}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export { InfiniteCanvas };
