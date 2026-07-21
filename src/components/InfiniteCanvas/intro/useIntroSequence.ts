import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

import { isImageCached, preloadImage, preloadImages } from '@/hooks/useImageLoad';
import { useHomeStore } from '@/store';

import {
  findCenterGridSeat,
  generateItemId,
  getAdjacentWorks,
  getItemPosition,
  getWorkKey,
  pinCustomCardAt,
  pinOriginCardAt,
  selectUniqueWork,
  seededRandom
} from '../grid/gridMath';
import type { InfiniteCanvasItemIntro } from '../InfiniteCanvasItem';
import type { CustomCardConfig, GridItem, OriginCardConfig, Work } from '../types';

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

type ViewportContentBounds = { left: number; top: number; right: number; bottom: number };

const getViewportContentBounds = (
  viewportWidth: number,
  viewportHeight: number,
  viewportOffsetX: number,
  viewportOffsetY: number,
  viewportZoom: number
): ViewportContentBounds => {
  const originOffsetX = (viewportWidth / 2) * (1 - 1 / viewportZoom);
  const originOffsetY = (viewportHeight / 2) * (1 - 1 / viewportZoom);

  return {
    left: originOffsetX - viewportOffsetX / viewportZoom,
    top: originOffsetY - viewportOffsetY / viewportZoom,
    right: originOffsetX - viewportOffsetX / viewportZoom + viewportWidth / viewportZoom,
    bottom: originOffsetY - viewportOffsetY / viewportZoom + viewportHeight / viewportZoom
  };
};

const isItemInViewport = (
  pos: { x: number; y: number },
  bounds: ViewportContentBounds,
  itemWidth: number,
  itemHeight: number
) =>
  pos.x + itemWidth > bounds.left &&
  pos.x < bounds.right &&
  pos.y + itemHeight > bounds.top &&
  pos.y < bounds.bottom;

type UseIntroSequenceArgs = {
  prefersReducedMotion: boolean | null;
  works: Work[];
  outerContainerRef: RefObject<HTMLDivElement | null>;
  itemsRef: RefObject<Map<string, GridItem>>;
  workUsageCountRef: RefObject<Map<string, number>>;
  originCard?: OriginCardConfig;
  originCardKey: string | null;
  excludedWorkKeys: Set<string>;
  customCards?: CustomCardConfig[];
  customCardIdsRef: MutableRefObject<Map<string, string>>;
  originCardIdRef: MutableRefObject<string | null>;
  introOriginRef: MutableRefObject<{ x: number; y: number } | null>;
  pendingIntroSnapRef: MutableRefObject<{ x: number; y: number } | null>;
  targetZoomRef: MutableRefObject<number>;
  isIntroPlayingRef: RefObject<boolean>;
  cellWidth: number;
  cellHeight: number;
  gapSize: number;
  staggerOffset: number;
  seedFactor: number;
  introReady: boolean;
  loaded: boolean;
  setIntroFlush: (updater: (n: number) => number) => void;
  setLoadingProgress: (progress: number) => void;
  setIsLoaded: () => void;
  setIntroComplete: (introComplete: boolean) => void;
  resetLoading: () => void;
  clearPointer: () => void;
  resetAllProximity: (immediate?: boolean) => void;
};

export const useIntroSequence = ({
  prefersReducedMotion,
  works,
  outerContainerRef,
  itemsRef,
  workUsageCountRef,
  originCard,
  originCardKey,
  excludedWorkKeys,
  customCards,
  customCardIdsRef,
  originCardIdRef,
  introOriginRef,
  pendingIntroSnapRef,
  targetZoomRef,
  isIntroPlayingRef,
  cellWidth,
  cellHeight,
  gapSize,
  staggerOffset,
  seedFactor,
  introReady,
  loaded,
  setIntroFlush,
  setLoadingProgress,
  setIsLoaded,
  setIntroComplete,
  resetLoading,
  clearPointer,
  resetAllProximity
}: UseIntroSequenceArgs) => {
  const metrics = { cellWidth, cellHeight, gapSize, staggerOffset };

  const introConfigRef = useRef<Map<string, InfiniteCanvasItemIntro> | null>(null);
  /** Intro cards in stackOrder (bottom → top) for sequential formation + forced mount */
  const introStackRef = useRef<{ id: string; src: string; item: GridItem & { x: number; y: number } }[] | null>(
    null
  );
  const introCompletedIdsRef = useRef<Set<string>>(new Set());
  /** Ids whose enter spring has actually reached the cluster (not just been released) */
  const stackLandedIdsRef = useRef(new Set<string>());
  const formationSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [shouldSpread, setShouldSpread] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(() => !prefersReducedMotion);
  /** Ids that have animated into the load-time stack */
  const [stackEnteredIds, setStackEnteredIds] = useState(() => new Set<string>());

  useEffect(() => {
    isIntroPlayingRef.current = isIntroPlaying;
  }, [isIntroPlaying, isIntroPlayingRef]);

  // After intro, ignore the parked cursor until the user moves again
  useEffect(() => {
    if (isIntroPlaying) return;
    clearPointer();
    resetAllProximity(true);
  }, [isIntroPlaying, clearPointer, resetAllProximity]);

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

  /** Capture a one-shot clustered intro layout for viewport items only (render-time). */
  const maybeCaptureIntro = useCallback(
    (visibleItems: (GridItem & { x: number; y: number })[]) => {
      if (visibleItems.length === 0 || introConfigRef.current || prefersReducedMotion || !outerContainerRef.current) {
        return;
      }
      const { width, height } = outerContainerRef.current.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;

      const viewportZoom = targetZoomRef.current;

      // Pick the grid seat nearest the viewport middle, then pan so it lands dead-center
      const { originX, originY, originGX, originGY } = findCenterGridSeat(width, height, metrics);

      const snapOffset = {
        x: (width / 2 - originX) * viewportZoom,
        y: (height / 2 - originY) * viewportZoom
      };
      introOriginRef.current = { x: originX, y: originY };

      const viewportBounds = getViewportContentBounds(width, height, snapOffset.x, snapOffset.y, viewportZoom);
      const viewportItems = visibleItems.filter((item) =>
        isItemInViewport(getItemPosition(item, metrics), viewportBounds, cellWidth, cellHeight)
      );

      // Guarantee the dead-center seat exists in the intro set (and pin custom origin card)
      const originId = generateItemId(originGX, originGY);
      const pinnedOrigin = originCard
        ? pinOriginCardAt({
            gx: originGX,
            gy: originGY,
            originCard,
            items: itemsRef.current,
            originCardIdRef,
            staggerOffset
          })
        : null;
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
          const adjacentWorks = getAdjacentWorks(originGX, originGY, itemsRef.current, 3);
          originItem = {
            id: originId,
            work: selectUniqueWork({
              x: originGX,
              y: originGY,
              adjacentWorks,
              works,
              excludedWorkKeys,
              seedFactor,
              workUsageCount: workUsageCountRef.current
            }),
            offsetX: 0,
            offsetY: originGX % 2 === 0 ? 0 : staggerOffset
          };
          itemsRef.current.set(originId, originItem);
        }
        viewportItems.push({ ...originItem, x: originGX, y: originGY });
      }

      // Fold custom cards into the intro stack so they peel with the rest
      for (const card of customCards ?? []) {
        if (card.placement === 'origin') continue;
        const key = getWorkKey(card.work);
        const alreadyInStack = viewportItems.some((item) => getWorkKey(item.work) === key);
        if (alreadyInStack) continue;

        let bestIdx = -1;
        let bestDist = -1;
        for (let i = 0; i < viewportItems.length; i++) {
          const item = viewportItems[i]!;
          if (item.isOriginCard || item.id === originId) continue;
          const pos = getItemPosition(item, metrics);
          const dist = Math.hypot(
            pos.x + cellWidth / 2 - originX,
            pos.y + cellHeight / 2 - originY
          );
          if (dist > bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        if (bestIdx < 0) continue;

        const target = viewportItems[bestIdx]!;
        const pinned = pinCustomCardAt({
          gx: target.x,
          gy: target.y,
          customCard: card,
          items: itemsRef.current,
          customCardIdsRef,
          staggerOffset
        });
        viewportItems[bestIdx] = { ...pinned, x: target.x, y: target.y };
      }

      const itemTargets = viewportItems.map((item) => {
        const pos = getItemPosition(item, metrics);
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
        const randB = seededRandom(seed + 1, seedFactor);
        const randD = seededRandom(seed + 3, seedFactor);
        const randE = seededRandom(seed * 1.73 + 9.41, seedFactor);
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      prefersReducedMotion,
      outerContainerRef,
      targetZoomRef,
      cellWidth,
      cellHeight,
      gapSize,
      staggerOffset,
      originCard,
      originCardKey,
      excludedWorkKeys,
      customCards,
      customCardIdsRef,
      itemsRef,
      workUsageCountRef,
      originCardIdRef,
      introOriginRef,
      pendingIntroSnapRef,
      setIntroFlush,
      works,
      seedFactor
    ]
  );

  return {
    isIntroPlaying,
    setIsIntroPlaying,
    shouldSpread,
    stackEnteredIds,
    introConfigRef,
    introStackRef,
    introCompletedIdsRef,
    isClusterHold,
    introStackCount,
    stackFormationDone,
    handleStackEnterComplete,
    handleIntroComplete,
    maybeCaptureIntro
  };
};
