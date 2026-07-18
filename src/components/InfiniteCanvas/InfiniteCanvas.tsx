'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useMotionValue, useAnimationFrame, useReducedMotion } from 'motion/react';

import { useHomeStore } from '@/store';

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

interface InfiniteCanvasProps {
  works: Work[];
}

// Matches Loader.module.scss exit: clip-path 1s @ 400ms + fade 200ms @ 1.4s
const INTRO_SPREAD_DELAY_MS = 2000;
const INTRO_SPREAD_RIPPLE_S = 0.42;
const INTRO_SPREAD_SAFETY_MS = 2800;
const INTRO_CLUSTER_ROTATION_RANGE = 32;
const FOCUS_EXIT_SCALE = 0.85;
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

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ works }) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);
  const setCanvasFocused = useHomeStore((state) => state.setCanvasFocused);
  const loaded = useHomeStore((state) => state.loaded);

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, GridItem>>(new Map());
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const targetZoomRef = useRef(1);
  const animationFrameRef = useRef<number>(null);
  const workUsageCountRef = useRef<Map<string, number>>(new Map());
  const lastTouchDistance = useRef<number | null>(null);
  const isMoving = useRef(false);
  const moveTimeout = useRef<NodeJS.Timeout>(null);
  const prefersReducedMotion = useReducedMotion();
  const introConfigRef = useRef<Map<string, InfiniteCanvasItemIntro> | null>(null);
  const introCompletedIdsRef = useRef<Set<string>>(new Set());
  const [shouldSpread, setShouldSpread] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(() => !prefersReducedMotion);
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

  const gapSize = isMobile ? window.innerWidth / 8 : window.innerWidth / 24; // Size of the gap between grid items
  const cellWidth = isMobile ? window.innerWidth / 2.3 : window.innerWidth / 4.6;
  const cellHeight = (cellWidth * 3) / 5;
  const viewportPadding = 2;
  const lerpFactor = 0.15;
  const seedFactor = Math.random() * 1000;
  const zoomSpeed = 0.001;
  const minZoom = 0.75; // Maximum zoom out
  const maxZoom = isMobile ? 2 : 3; // Maximum zoom in
  const moveTimeoutDuration = 100;
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
    setOffset((prevOffset) => {
      const newX = lerp(prevOffset.x, targetOffsetRef.current.x, lerpFactor);
      const newY = lerp(prevOffset.y, targetOffsetRef.current.y, lerpFactor);

      viewRef.current.offsetX = newX;
      viewRef.current.offsetY = newY;

      if (Math.abs(newX - targetOffsetRef.current.x) > 0.1 || Math.abs(newY - targetOffsetRef.current.y) > 0.1) {
        isMoving.current = true;
        if (moveTimeout.current) {
          clearTimeout(moveTimeout.current);
        }
        moveTimeout.current = setTimeout(() => {
          isMoving.current = false;
        }, moveTimeoutDuration); // Wait for 300ms of no movement before considering it stopped
      }

      return { x: newX, y: newY };
    });

    setZoom((prevZoom) => {
      const newZoom = lerp(prevZoom, targetZoomRef.current, lerpFactor);

      viewRef.current.zoom = newZoom;

      // Also check zoom changes for movement
      if (Math.abs(newZoom - targetZoomRef.current) > 0.001) {
        isMoving.current = true;
        if (moveTimeout.current) {
          clearTimeout(moveTimeout.current);
        }
        moveTimeout.current = setTimeout(() => {
          isMoving.current = false;
        }, moveTimeoutDuration);
      }

      return newZoom;
    });

    animationFrameRef.current = requestAnimationFrame(animateOffset);
  }, []);

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
    // Set initial offset
    setOffset({ x: initialOffsetX, y: 0 });
    targetOffsetRef.current = { x: initialOffsetX, y: 0 };
    viewRef.current.offsetX = initialOffsetX;
    viewRef.current.offsetY = 0;
  }, [initialOffsetX]);

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
      if (isMoving.current || focusedIdRef.current || isIntroPlayingRef.current) return;

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

  // Single proximity rAF for the whole canvas — idle while panning / intro / focus
  useAnimationFrame(() => {
    const view = viewRef.current;
    if (view.isDragging || isIntroPlayingRef.current || focusedIdRef.current) return;

    const px = pointerX.get();
    const py = pointerY.get();
    if (px < 0 || py < 0) return;

    proximityHandlersRef.current.forEach((handlers) => {
      handlers.onFrame(px, py, view);
    });
  });

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (focusedIdRef.current) return;
      isDragging.current = true;
      viewRef.current.isDragging = true;
      clearPointer();
      // Spring out — hard jump felt abrupt when starting a pan
      resetAllProximity(false);
      lastPosition.current = { x: clientX, y: clientY };
    },
    [clearPointer, resetAllProximity]
  );

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - lastPosition.current.x;
    const dy = clientY - lastPosition.current.y;
    targetOffsetRef.current = {
      x: targetOffsetRef.current.x + dx,
      y: targetOffsetRef.current.y + dy
    };
    lastPosition.current = { x: clientX, y: clientY };
  }, []);

  const handleEnd = useCallback(() => {
    isDragging.current = false;
    viewRef.current.isDragging = false;
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
        const deltaX = e.deltaX;
        const deltaY = e.deltaY;

        targetOffsetRef.current.x -= deltaX;
        targetOffsetRef.current.y -= deltaY;
      }
    },
    [handleZoom]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        lastTouchDistance.current = distance;
      } else if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleStart]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Don't cancel native scrolling while the focus layer is open
      if (focusedIdRef.current) return;

      e.preventDefault();
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);

        if (lastTouchDistance.current !== null) {
          const delta = distance - lastTouchDistance.current;
          const newZoom = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current * (1 + delta * 0.01)));

          if (newZoom !== targetZoomRef.current) {
            const rect = outerContainerRef.current?.getBoundingClientRect();
            if (rect) {
              const zoomPoint = {
                x: (touch1.clientX + touch2.clientX) / 2 - rect.left - window.innerWidth / 2,
                y: (touch1.clientY + touch2.clientY) / 2 - rect.top - window.innerHeight / 2
              };
              handleZoom(zoomPoint, newZoom);
            }
          }
        }
        lastTouchDistance.current = distance;
      } else if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleMove, handleZoom]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = null;
    handleEnd();
  }, [handleEnd]);

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
      outerContainer.addEventListener('touchend', handleEnd);
      outerContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (outerContainer) {
        outerContainer.removeEventListener('mousemove', handleMouseMove as any);
        outerContainer.removeEventListener('mouseup', handleEnd);
        outerContainer.removeEventListener('mouseleave', handleMouseLeave);
        outerContainer.removeEventListener('touchmove', handleTouchMove as any);
        outerContainer.removeEventListener('touchend', handleEnd);
        outerContainer.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleMouseMove, handleMouseLeave, handleTouchMove, handleEnd, handleWheel]);

  useEffect(() => {
    setLoadingProgress(100);
    setIsLoaded();
  }, []);

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
    const viewportZoom = targetZoomRef.current;
    const centerX = width / 2 - initialOffsetX / viewportZoom;
    const centerY = height / 2;

    const viewportBounds = getViewportContentBounds(width, height, initialOffsetX, 0, viewportZoom);
    const viewportItems = visibleItems.filter((item) => isItemInViewport(item, viewportBounds, cellWidth, cellHeight));

    const itemTargets = viewportItems.map((item) => {
      const pos = getItemPosition(item);
      const targetCenterX = pos.x + cellWidth / 2;
      const targetCenterY = pos.y + cellHeight / 2;
      const dx = targetCenterX - centerX;
      const dy = targetCenterY - centerY;
      return {
        item,
        distance: Math.hypot(dx, dy)
      };
    });

    const maxDistance = Math.max(...itemTargets.map((target) => target.distance), 1);
    const minStackOpacity = 0.32;
    const clusterX = centerX - cellWidth / 2;
    const clusterY = centerY - cellHeight / 2;

    const stackEntries = itemTargets.map(({ item, distance }) => {
      const seed = item.x * 12.9898 + item.y * 78.233 + item.id.length * 3.17;
      const randB = seededRandom(seed + 1);
      const randC = seededRandom(seed + 2);
      const randD = seededRandom(seed + 3);
      const randE = seededRandom(seed * 1.73 + 9.41);
      const rotationMix = randD * 0.55 + randE * 0.45;

      return {
        item,
        distance,
        stackOrder: randC,
        x: clusterX,
        y: clusterY,
        rotate: (rotationMix - 0.5) * INTRO_CLUSTER_ROTATION_RANGE,
        scale: 1,
        delay: 0.03 + (distance / maxDistance) * INTRO_SPREAD_RIPPLE_S + randB * 0.04
      };
    });

    // Lower cards in the stack fade out gradually
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
    introCompletedIdsRef.current = new Set();
  }

  const isClusterHold = Boolean(introConfigRef.current?.size) && !shouldSpread && !prefersReducedMotion;

  // Hold the cluster until the interstitial finishes, then spread
  useEffect(() => {
    if (prefersReducedMotion) {
      setShouldSpread(true);
      setIsIntroPlaying(false);
      return;
    }
    if (!loaded || !introConfigRef.current) return;
    const timeout = setTimeout(() => setShouldSpread(true), INTRO_SPREAD_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [loaded, visibleItems.length, prefersReducedMotion]);

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

  const isFocused = Boolean(focusedId && focusSnapshot && focusedWork && focusPhase);
  const isInteractionLocked = isClusterHold || isFocused;
  const isFocusSettled = focusPhase === 'settled';
  const isFocusHandingOff = focusPhase === 'out';
  const isFocusReturning = focusPhase === 'returning';
  const showFocusScrim = focusPhase === 'in' || focusPhase === 'settled';
  // Pre-mount during morph so the replacement is decoded + sized before the swap
  const showFocusHtml = focusPhase === 'in' || focusPhase === 'settled';
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
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          willChange: 'transform',
          pointerEvents: isFocused ? 'none' : undefined
        }}
      >
        {visibleItems.map((item) => {
          const position = getItemPosition(item);
          const intro = introConfigRef.current?.get(item.id);

          let focusMode: InfiniteCanvasFocusMode = 'idle';
          let focusX = position.x;
          let focusY = position.y;
          let focusScale = 1;
          let focusOpacity = 1;
          let focusImmediate = false;

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
              const len = Math.hypot(dx, dy) || 1;
              dx /= len;
              dy /= len;
              focusX = position.x + dx * focusSnapshot.pushDistance;
              focusY = position.y + dy * focusSnapshot.pushDistance;
              focusScale = FOCUS_EXIT_SCALE;
              focusOpacity = 0;
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
              intro={intro}
              shouldSpread={shouldSpread}
              viewRef={viewRef}
              proximityEnabled={!isIntroPlaying && !focusedId}
              focusMode={focusMode}
              focusX={focusX}
              focusY={focusY}
              focusScale={focusScale}
              focusOpacity={focusOpacity}
              focusImmediate={focusImmediate}
              registerProximity={registerProximity}
              unregisterProximity={unregisterProximity}
              onIntroComplete={intro ? handleIntroComplete : undefined}
              onFocusArrive={item.id === focusedId ? handleFocusArrive : undefined}
              onFocusReturnComplete={item.id === focusedId ? handleFocusReturnComplete : undefined}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {showFocusHtml && focusedWork && focusSnapshot && (
          <>
            <motion.button
              key="focus-close"
              type="button"
              className={styles.infiniteCanvasFocusClose}
              aria-label="Close"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: isFocusSettled ? 1 : 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0 } }}
              transition={{ duration: 0.25 }}
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
                    />
                  </div>
                  {isFocusSettled ? (
                    <motion.div
                      className={styles.infiniteCanvasFocusCopy}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.04 }}
                    >
                      <h1 className={styles.infiniteCanvasFocusTitle}>{focusedWork.name}</h1>
                      <p className={styles.infiniteCanvasFocusDescription}>{focusedWork.description}</p>
                      {focusedWork.url ? (
                        <a
                          className={styles.infiniteCanvasFocusLink}
                          href={focusedWork.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {formatUrl(focusedWork.url)}
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M20.7806 12.5306L14.0306 19.2806C13.8899 19.4213 13.699 19.5004 13.5 19.5004C13.301 19.5004 13.1101 19.4213 12.9694 19.2806C12.8286 19.1399 12.7496 18.949 12.7496 18.75C12.7496 18.551 12.8286 18.3601 12.9694 18.2194L18.4397 12.75H3.75C3.55109 12.75 3.36032 12.671 3.21967 12.5303C3.07902 12.3897 3 12.1989 3 12C3 11.8011 3.07902 11.6103 3.21967 11.4697C3.36032 11.329 3.55109 11.25 3.75 11.25H18.4397L12.9694 5.78061C12.8286 5.63988 12.7496 5.44901 12.7496 5.24999C12.7496 5.05097 12.8286 4.8601 12.9694 4.71936C13.1101 4.57863 13.301 4.49957 13.5 4.49957C13.699 4.49957 13.8899 4.57863 14.0306 4.71936L20.7806 11.4694C20.8504 11.539 20.9057 11.6217 20.9434 11.7128C20.9812 11.8038 21.0006 11.9014 21.0006 12C21.0006 12.0986 20.9812 12.1961 20.9434 12.2872C20.9057 12.3782 20.8504 12.461 20.7806 12.5306Z"
                              fill="#ffffff"
                            />
                          </svg>
                        </a>
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
