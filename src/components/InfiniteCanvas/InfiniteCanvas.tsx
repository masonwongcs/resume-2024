'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useMotionValue, useAnimationFrame, useReducedMotion } from 'motion/react';

import { useHomeStore } from '@/store';
import { isImageCached, markImageLoaded, preloadImage, preloadImages } from '@/hooks/useImageLoad';

import { createCanvasViewState, type ProximityFrameHandler, type ProximityResetHandler } from './canvasView';
import {
  InfiniteCanvasItem,
  type InfiniteCanvasFocusMode,
  type InfiniteCanvasItemIntro,
  type ProximityRegistration
} from './InfiniteCanvasItem';

interface Work {
  name: string;
  url?: string;
  image: string;
  video?: string;
  thumbnail?: string;
  description: string;
}

interface GridItem {
  id: string;
  work: Work;
  offsetX: number;
  offsetY: number;
}

export type PeerReturnStagger = 'legacy' | 'focus';

interface InfiniteCanvasProps {
  works: Work[];
  /**
   * How surrounding cards stagger back in after focus closes.
   * Defaults to `focus` on mobile, `legacy` on desktop.
   * - `legacy` — original intro delays (distance from load-time center)
   * - `focus` — ripple from the clicked card
   */
  peerReturnStagger?: PeerReturnStagger;
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
const FOCUS_COPY_REVEAL_DELAY_S = 0.01;
const FOCUS_COPY_CONTAINER_VARIANTS = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: FOCUS_COPY_REVEAL_DELAY_S
    }
  }
};
const FOCUS_COPY_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: FOCUS_COPY_SPRING }
};
const FOCUS_COPY_LINK_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: FOCUS_COPY_SPRING }
};
/** Matches .infiniteCanvasFocusDetail width — focused card scales to this */
const FOCUS_DETAIL_MAX_WIDTH = 600;
const FOCUS_DETAIL_MAX_WIDTH_XL = 700;
/** Must match .infiniteCanvasFocusScrollInner mobile side padding */
const FOCUS_MOBILE_SIDE_PAD = 24;

const formatUrl = (url?: string) => {
  if (!url) return;
  let formattedUrl = url.replace(/^(https?:\/\/)/, '');
  formattedUrl = formattedUrl.replace(/\/$/, '');
  formattedUrl = formattedUrl.replace(/^www\./, '');
  return formattedUrl;
};

const getFocusDetailWidth = (viewportWidth: number) => {
  // Must match .infiniteCanvasFocusDetail / wrap padding
  if (viewportWidth <= 480) {
    return viewportWidth - FOCUS_MOBILE_SIDE_PAD * 2;
  }
  const maxWidth = viewportWidth >= 1920 ? FOCUS_DETAIL_MAX_WIDTH_XL : FOCUS_DETAIL_MAX_WIDTH;
  return Math.min(viewportWidth * 0.92, maxWidth);
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

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ works, peerReturnStagger }) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);
  const resetLoading = useHomeStore((state) => state.resetLoading);
  const setIntroComplete = useHomeStore((state) => state.setIntroComplete);
  const setCanvasFocused = useHomeStore((state) => state.setCanvasFocused);
  const loaded = useHomeStore((state) => state.loaded);

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
  const introStackRef = useRef<
    { id: string; src: string; item: GridItem & { x: number; y: number } }[] | null
  >(null);
  const introCompletedIdsRef = useRef<Set<string>>(new Set());
  /** Content-space center of the card that should sit dead-middle after intro */
  const introOriginRef = useRef<{ x: number; y: number } | null>(null);
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
  const focusedIdRef = useRef<string | null>(null);
  const focusPhaseRef = useRef<FocusPhase | null>(null);
  const focusCardRef = useRef<HTMLDivElement>(null);
  const focusImageRef = useRef<HTMLImageElement>(null);
  const focusArriveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerX = useMotionValue(-1);
  const pointerY = useMotionValue(-1);
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

    // Filter out adjacent works first
    const availableWorks = works.filter((work) => !adjacentKeys.has(getWorkKey(work)));

    // If no works are available (edge case), use all works
    const candidateWorks = availableWorks.length > 0 ? availableWorks : works;

    // Create a weighted selection based on usage count and randomness
    const weightedWorks = candidateWorks.map((work) => {
      const usageCount = workUsageCountRef.current.get(getWorkKey(work)) || 0;
      // Lower usage = higher weight, add randomness
      const randomWeight = seededRandom(seed + work.description.length);
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
    workUsageCountRef.current.set(
      selectedWorkKey,
      (workUsageCountRef.current.get(selectedWorkKey) || 0) + 1
    );

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

  const visibleItems = useMemo(() => {
    if (!outerContainerRef.current) return [];
    const { width, height } = outerContainerRef.current.getBoundingClientRect();

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
        items.push({ ...item, x, y });
      }
    }

    // Periodically reset usage counts to allow for long-term variety
    if (items.length > works.length * 2) {
      workUsageCountRef.current.clear();
    }

    return items;
  }, [offset, zoom, works, initialOffsetX]);

  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  const animateOffset = useCallback(() => {
    // Focus locks the camera — freeze pose while morph / peer springs run.
    // Also idle the camera while the menu drawer animates/scales .main so we
    // don't compete for compositor bandwidth during the shrink.
    const drawerBusy =
      typeof document !== 'undefined' &&
      (document.body.classList.contains('is-drawer-open') ||
        document.body.classList.contains('is-dragging') ||
        document.body.classList.contains('is-animating'));

    if (!focusedIdRef.current && !drawerBusy) {
      const view = viewRef.current;

      // Coast: keep pushing the camera target after touch release
      if (
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

      // Touch drag/pinch use touchLerpFactor; mouse drag + wheel + coast use lerpFactor
      const follow =
        isPinching.current || (isDragging.current && isTouchDrag.current)
          ? touchLerpFactor
          : lerpFactor;
      const newX = lerp(view.offsetX, targetOffsetRef.current.x, follow);
      const newY = lerp(view.offsetY, targetOffsetRef.current.y, follow);
      const newZoom = lerp(view.zoom, targetZoomRef.current, follow);

      const offsetMoved =
        Math.abs(newX - view.offsetX) >= 0.01 || Math.abs(newY - view.offsetY) >= 0.01;
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
          const touchGesturing =
            isPinching.current || (isDragging.current && isTouchDrag.current);
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

    animationFrameRef.current = requestAnimationFrame(animateOffset);
  }, [applyCameraTransform, commitCullPose, getCellWindowKey, prefersReducedMotion]);

  const syncViewBounds = useCallback(() => {
    const container = outerContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    viewRef.current.left = rect.left;
    viewRef.current.top = rect.top;
    viewRef.current.width = rect.width;
    viewRef.current.height = rect.height;
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
    const windowKey =
      width > 0 && height > 0 ? getCellWindowKey(x, y, z, width, height) : 'initial';
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
    const windowKey =
      width > 0 && height > 0 ? getCellWindowKey(snap.x, snap.y, z, width, height) : 'intro';
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
    focusedIdRef.current = null;
    focusPhaseRef.current = null;
    setFocusedId(null);
    setFocusedWork(null);
    setFocusSnapshot(null);
    setFocusPhase(null);
    setMorphCardHidden(false);
    setCanvasFocused(false);
  }, [setCanvasFocused]);

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

  // Hide the canvas morph only after the HTML card is on screen (avoids a blank frame)
  useLayoutEffect(() => {
    if (focusPhase === 'settled') {
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

    if (focusPhaseRef.current === 'settled' && focusCardRef.current) {
      const rect = focusCardRef.current.getBoundingClientRect();
      const view = viewRef.current;
      const zoomValue = Math.max(view.zoom, 0.001);
      const screenCenterX = rect.left + rect.width / 2 - view.left;
      const screenCenterY = rect.top + rect.height / 2 - view.top;
      const contentCenterX = view.width / 2 + (screenCenterX - view.width / 2 - view.offsetX) / zoomValue;
      const contentCenterY = view.height / 2 + (screenCenterY - view.height / 2 - view.offsetY) / zoomValue;
      const cardScale = rect.width / (cellWidth * zoomValue);

      setFocusSnapshot((prev) =>
        prev
          ? {
              ...prev,
              contentCenterX,
              contentCenterY,
              cardScale,
              scaledScreenHeight: rect.height
            }
          : null
      );
      focusPhaseRef.current = 'out';
      // Reveal morph before HTML unmounts — same render as phase 'out'
      setMorphCardHidden(false);
      setFocusPhase('out');
      return;
    }

    // Mid morph-in — send the focus card home first; peers stay out until it lands
    focusPhaseRef.current = 'returning';
    setMorphCardHidden(false);
    setFocusPhase('returning');
    setCanvasFocused(false);
  }, [cellWidth, setCanvasFocused]);

  // After handoff snap, start returning the focus card (peers stay exited)
  useLayoutEffect(() => {
    if (focusPhase !== 'out') return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        focusPhaseRef.current = 'returning';
        setFocusPhase('returning');
        setCanvasFocused(false);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [focusPhase, setCanvasFocused]);

  const handleFocusReturnComplete = useCallback(
    (id: string) => {
      if (focusPhaseRef.current !== 'returning') return;
      if (focusedIdRef.current !== id) return;
      clearFocus();
    },
    [clearFocus]
  );

  // Release peers shortly after the focus card begins returning (overlap, not wait-for-settle)
  useEffect(() => {
    if (focusPhase !== 'returning') return;
    const timeout = setTimeout(() => {
      if (focusPhaseRef.current === 'returning') clearFocus();
    }, FOCUS_PEERS_RETURN_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [focusPhase, clearFocus]);

  const handleItemClick = useCallback(
    (id: string, work: Work) => {
      // Pan release synthesizes a click — ignore that one only
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (focusedIdRef.current || isIntroPlayingRef.current) return;

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
      const stored = itemsRef.current.get(id);
      const originX = gridX * (cellWidth + gapSize) + (stored?.offsetX ?? 0);
      const originY = gridY * (cellHeight + gapSize) + (stored?.offsetY ?? 0);
      const originCenterX = originX + cellWidth / 2;
      const originCenterY = originY + cellHeight / 2;

      const detailWidth = getFocusDetailWidth(view.width);
      // screenWidth = cellWidth * zoom * cardScale → match detail column
      const cardScale = detailWidth / (cellWidth * view.zoom);
      const scaledScreenHeight = cellHeight * view.zoom * cardScale;

      // Mobile: fixed inset for scroll room. Desktop: % of viewport height.
      const cardTopScreenY = view.width <= 480 ? 100 : view.height * 0.15;
      const cardCenterScreenY = cardTopScreenY + scaledScreenHeight / 2;
      const contentCenterX = view.width / 2 - view.offsetX / view.zoom;
      const contentCenterY =
        view.height / 2 + (cardCenterScreenY - view.height / 2 - view.offsetY) / view.zoom;
      const pushDistance = (Math.hypot(view.width, view.height) / view.zoom) * 1.2;

      focusedIdRef.current = id;
      focusPhaseRef.current = 'in';
      setFocusSnapshot({
        contentCenterX,
        contentCenterY,
        originCenterX,
        originCenterY,
        pushDistance,
        cardScale,
        detailWidth,
        scaledScreenHeight,
        cardTopScreenY
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
    [cellWidth, cellHeight, gapSize, clearPointer, resetAllProximity, setCanvasFocused, handleFocusArrive]
  );

  useEffect(() => {
    return () => {
      setCanvasFocused(false);
      if (focusArriveTimeoutRef.current) clearTimeout(focusArriveTimeoutRef.current);
    };
  }, [setCanvasFocused]);

  useEffect(() => {
    focusedIdRef.current = focusedId;
  }, [focusedId]);

  useEffect(() => {
    if (!focusedId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedId, requestClose]);

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
        lastTouchDistance.current = Math.hypot(
          touch1.clientX - touch2.clientX,
          touch1.clientY - touch2.clientY
        );
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
        const distance = Math.hypot(
          touch1.clientX - touch2.clientX,
          touch1.clientY - touch2.clientY
        );
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
          const newZoom = Math.max(
            minZoom,
            Math.min(maxZoom, targetZoomRef.current * scale)
          );

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
      if (isImageCached(entry.src)) {
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
      const strideX = cellWidth + gapSize;
      const strideY = cellHeight + gapSize;

      // Pick the grid seat nearest the viewport middle, then pan so it lands dead-center
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

      const snapOffset = {
        x: (width / 2 - originX) * viewportZoom,
        y: (height / 2 - originY) * viewportZoom
      };
      introOriginRef.current = { x: originX, y: originY };

      const viewportBounds = getViewportContentBounds(
        width,
        height,
        snapOffset.x,
        snapOffset.y,
        viewportZoom
      );
      const viewportItems = visibleItems.filter((item) =>
        isItemInViewport(item, viewportBounds, cellWidth, cellHeight)
      );

      // Guarantee the dead-center seat exists in the intro set
      const originId = generateItemId(originGX, originGY);
      if (!viewportItems.some((item) => item.id === originId)) {
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
      // Keep stacked cards readable under the transparent loader
      const minStackOpacity = 0.55;
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
          delay: isOrigin
            ? 0
            : 0.03 + distT * INTRO_SPREAD_RIPPLE_S + distT * fromBottom * 0.12 + randB * 0.04
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
        src: item.work.thumbnail || item.work.image,
        item
      }));
      introCompletedIdsRef.current = new Set();
      // Defer setState to layout effect — setState during render aborts the rest of the pass
      pendingIntroSnapRef.current = snapOffset;
      queueMicrotask(() => setIntroFlush((n) => n + 1));
    }
  }

  const isClusterHold = Boolean(introConfigRef.current?.size) && !shouldSpread && !prefersReducedMotion;
  const introStackCount = introConfigRef.current?.size ?? 0;
  const stackFormationDone =
    prefersReducedMotion || introStackCount === 0 || stackEnteredIds.size >= introStackCount;

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
  const showFocusScrim = focusPhase === 'in' || focusPhase === 'settled';
  // Keep HTML through 'out' so the morph can paint underneath before the overlay exits
  const showFocusHtml = focusPhase === 'in' || focusPhase === 'settled' || focusPhase === 'out';
  const focusImageSrc = focusedWork
    ? focusedWork.thumbnail
      ? focusedWork.thumbnail
      : focusedWork.image
    : '';

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

          // During cluster hold, force-mount intro stack cards (cull can drop them after snap)
          const renderItems =
            isClusterHold && introStackRef.current?.length
              ? (() => {
                  const byId = new Map(visibleItems.map((item) => [item.id, item]));
                  for (const entry of introStackRef.current) {
                    if (!byId.has(entry.id)) {
                      byId.set(entry.id, entry.item);
                    }
                  }
                  return [...byId.values()];
                })()
              : visibleItems;

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
                // Card springs home first; peers stay exited until this completes
                focusMode = 'returning';
                focusX = position.x;
                focusY = position.y;
                focusScale = 1;
                focusOpacity = 1;
                focusImmediate = false;
              } else {
                focusMode = 'focused';
                focusX = focusSnapshot.contentCenterX - cellWidth / 2;
                focusY = focusSnapshot.contentCenterY - cellHeight / 2;
                focusScale = focusSnapshot.cardScale;
                // Keep morph visible until HTML has painted over it
                focusOpacity = morphCardHidden ? 0 : 1;
                focusImmediate = morphCardHidden || isFocusHandingOff;
              }
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
              viewRef={viewRef}
              proximityEnabled={!isIntroPlaying && !focusedId}
              focusMode={focusMode}
              focusX={focusX}
              focusY={focusY}
              focusScale={focusScale}
              focusOpacity={focusOpacity}
              focusImmediate={focusImmediate}
              focusReturnDelay={focusReturnDelay}
              registerProximity={registerProximity}
              unregisterProximity={unregisterProximity}
              onStackEnterComplete={
                intro && isClusterHold ? handleStackEnterComplete : undefined
              }
              onIntroComplete={intro && (isIntroPlaying || isClusterHold) ? handleIntroComplete : undefined}
              onFocusArrive={item.id === focusedId ? handleFocusArrive : undefined}
              onFocusReturnComplete={item.id === focusedId ? handleFocusReturnComplete : undefined}
            />
          );
          });
        })()}
      </div>

      <AnimatePresence>
        {showFocusHtml && focusedWork && focusSnapshot && (
          <>
            <motion.button
              key="focus-close"
              type="button"
              className={styles.infiniteCanvasFocusClose}
              aria-label="Close"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{
                opacity: isFocusSettled ? 1 : 0,
                scale: isFocusSettled ? 1 : 0.88
              }}
              exit={{ opacity: 0, scale: 0.88, transition: { duration: 0 } }}
              transition={{
                ...FOCUS_COPY_SPRING,
                delay: isFocusSettled ? FOCUS_COPY_REVEAL_DELAY_S : 0
              }}
              onClick={requestClose}
              style={{ pointerEvents: isFocusSettled ? 'auto' : 'none' }}
            >
              <img src="/images/icon/close.svg" alt="" />
            </motion.button>
            <div
              key="focus-scroll"
              className={styles.infiniteCanvasFocusScroll}
              data-ready={isFocusSettled ? 'true' : undefined}
              onTouchMove={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
              style={{
                opacity: isFocusSettled ? 1 : 0,
                pointerEvents: isFocusSettled ? 'auto' : 'none'
              }}
            >
              <div
                className={styles.infiniteCanvasFocusScrollInner}
                style={{ paddingTop: focusSnapshot.cardTopScreenY }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={styles.infiniteCanvasFocusDetail}
                  style={{ width: focusSnapshot.detailWidth }}
                >
                  {/* Exact morph target size + same 1.08 crop as InfiniteCanvasItem */}
                  <div
                    ref={focusCardRef}
                    className={styles.infiniteCanvasFocusCard}
                    style={{
                      width: focusSnapshot.detailWidth,
                      height: focusSnapshot.scaledScreenHeight,
                      borderRadius: focusSnapshot.detailWidth * CARD_BORDER_RADIUS_RATIO
                    }}
                  >
                    <img
                      ref={focusImageRef}
                      className={styles.infiniteCanvasFocusCardImage}
                      src={focusImageSrc}
                      alt={focusedWork.name}
                      draggable={false}
                      decoding="async"
                      fetchPriority="high"
                      onLoad={() => markImageLoaded(focusImageSrc)}
                    />
                  </div>
                  {isFocusSettled ? (
                    <motion.div
                      className={styles.infiniteCanvasFocusCopy}
                      initial="hidden"
                      animate="show"
                      variants={FOCUS_COPY_CONTAINER_VARIANTS}
                    >
                      <motion.h1
                        className={styles.infiniteCanvasFocusTitle}
                        variants={FOCUS_COPY_ITEM_VARIANTS}
                      >
                        {focusedWork.name}
                      </motion.h1>
                      <motion.p
                        className={styles.infiniteCanvasFocusDescription}
                        variants={FOCUS_COPY_ITEM_VARIANTS}
                      >
                        {focusedWork.description}
                      </motion.p>
                      {focusedWork.url ? (
                        <motion.a
                          className={styles.infiniteCanvasFocusLink}
                          href={focusedWork.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variants={FOCUS_COPY_LINK_VARIANTS}
                        >
                          {formatUrl(focusedWork.url)}
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M20.7806 12.5306L14.0306 19.2806C13.8899 19.4213 13.699 19.5004 13.5 19.5004C13.301 19.5004 13.1101 19.4213 12.9694 19.2806C12.8286 19.1399 12.7496 18.949 12.7496 18.75C12.7496 18.551 12.8286 18.3601 12.9694 18.2194L18.4397 12.75H3.75C3.55109 12.75 3.36032 12.671 3.21967 12.5303C3.07902 12.3897 3 12.1989 3 12C3 11.8011 3.07902 11.6103 3.21967 11.4697C3.36032 11.329 3.55109 11.25 3.75 11.25H18.4397L12.9694 5.78061C12.8286 5.63988 12.7496 5.44901 12.7496 5.24999C12.7496 5.05097 12.8286 4.8601 12.9694 4.71936C13.1101 4.57863 13.301 4.49957 13.5 4.49957C13.699 4.49957 13.8899 4.57863 14.0306 4.71936L20.7806 11.4694C20.8504 11.539 20.9057 11.6217 20.9434 11.7128C20.9812 11.8038 21.0006 11.9014 21.0006 12C21.0006 12.0986 20.9812 12.1961 20.9434 12.2872C20.9057 12.3782 20.8504 12.461 20.7806 12.5306Z"
                              fill="#ffffff"
                            />
                          </svg>
                        </motion.a>
                      ) : null}
                    </motion.div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export { InfiniteCanvas };
