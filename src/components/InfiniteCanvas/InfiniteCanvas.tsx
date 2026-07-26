'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useReducedMotion } from 'motion/react';

import type { MarqueePersistedState } from '@/components/CurvedLoop';
import { getMatchingWorkKeys, isDiscoModeActive, isDiscoQuery, isWorkSearchMatch } from '@/lib/workSearch';
import { useHomeStore, useSearchStore } from '@/store';

import { createCanvasViewState } from './camera/canvasView';
import { useCanvasCamera } from './camera/useCanvasCamera';
import { useCanvasRecenter } from './camera/useCanvasRecenter';
import { computeItemFocusProps } from './focus/computeItemFocusProps';
import { FocusOverlay } from './focus/FocusOverlay';
import { FocusSwipeParallaxContext } from './focus/FocusSwipeParallaxContext';
import { FOCUS_SWIPE_GAP_PX } from './focus/focusMotion';
import { useFocusMode } from './focus/useFocusMode';
import { ensureSeatForWork, findExistingSeatForWork, getItemPosition, getWorkKey, parseGridCoords } from './grid/gridMath';
import { useVisibleGridItems } from './grid/useVisibleGridItems';
import { useIntroSequence } from './intro/useIntroSequence';
import { InfiniteCanvasItem } from './InfiniteCanvasItem';
import type {
  CustomCardConfig,
  FocusPhase,
  GridItem,
  InfiniteCanvasProps,
  PeerReturnStagger,
  Work
} from './types';

export type {
  CanvasFocusBridge,
  CustomCardConfig,
  CustomCardFocusContentProps,
  CustomCardRenderProps,
  FocusUrlIntent,
  OriginCardConfig,
  OriginCardRenderProps,
  PeerReturnStagger,
  Work
} from './types';

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({
  works,
  peerReturnStagger,
  originCard,
  customCards,
  onRecenterAvailabilityChange,
  recenterActionRef,
  focusBridgeRef,
  onBridgeReady,
  onFocusIntent
}) => {
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);
  const resetLoading = useHomeStore((state) => state.resetLoading);
  const setIntroComplete = useHomeStore((state) => state.setIntroComplete);
  const setCanvasFocused = useHomeStore((state) => state.setCanvasFocused);
  const loaded = useHomeStore((state) => state.loaded);
  const introComplete = useHomeStore((state) => state.introComplete);
  const canvasFocused = useHomeStore((state) => state.canvasFocused);
  const searchQuery = useSearchStore((state) => state.query);
  const discoEnabled = useSearchStore((state) => state.discoEnabled);
  const discoMode = isDiscoModeActive(searchQuery, discoEnabled);
  const discoQuery = isDiscoQuery(searchQuery);
  const discoModeRef = useRef(discoMode);
  discoModeRef.current = discoMode;
  // Keep card dance mounted briefly so it can ease to rest instead of hard-cutting
  const [discoDanceActive, setDiscoDanceActive] = useState(discoMode);
  const [discoDanceExiting, setDiscoDanceExiting] = useState(false);
  useEffect(() => {
    if (discoMode) {
      setDiscoDanceActive(true);
      setDiscoDanceExiting(false);
      return;
    }
    if (!discoDanceActive) return;
    setDiscoDanceExiting(true);
    const id = window.setTimeout(() => {
      setDiscoDanceActive(false);
      setDiscoDanceExiting(false);
    }, 550);
    return () => window.clearTimeout(id);
  }, [discoMode, discoDanceActive]);
  const matchingWorkKeys = useMemo(() => getMatchingWorkKeys(works, searchQuery), [works, searchQuery]);
  // Disco query is an easter egg, not a work filter — keep the grid lit even before opt-in
  const searchFilterActive = searchQuery.trim().length > 0 && !canvasFocused && !discoQuery;

  const prefersReducedMotion = useReducedMotion();

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, GridItem>>(new Map());
  const workUsageCountRef = useRef<Map<string, number>>(new Map());
  /** Grid id of the one-shot custom origin card */
  const originCardIdRef = useRef<string | null>(null);
  /** config id → grid item id for pinned random custom cards */
  const customCardIdsRef = useRef<Map<string, string>>(new Map());
  /** Content-space center of the card that should sit dead-middle after intro */
  const introOriginRef = useRef<{ x: number; y: number } | null>(null);
  const viewRef = useRef(createCanvasViewState());

  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const targetZoomRef = useRef(1);
  const isDragging = useRef(false);
  const isPinching = useRef(false);
  const isCoastingRef = useRef(false);
  const panVelocityRef = useRef({ x: 0, y: 0 });
  /** Swallow only the click tied to pointer-up after a pan — not the next intentional click */
  const suppressClickRef = useRef(false);
  /** True after a touch drag sample — survives handleTouchEnd clearing isTouchDrag */
  const touchInertiaEligibleRef = useRef(false);
  /** Pending camera snap from intro capture — applied once in layout effect */
  const pendingIntroSnapRef = useRef<{ x: number; y: number } | null>(null);

  const focusedIdRef = useRef<string | null>(null);
  const focusPhaseRef = useRef<FocusPhase | null>(null);
  /** True while close is lerping the camera to an off-screen return seat */
  const focusReturnPanActiveRef = useRef(false);
  /** Far-off return seat: shrink/fade at focus center instead of flying to grid home */
  const focusReturnToCenterRef = useRef(false);
  /** Mobile: camera snaps first — return is scale-only at the grid seat (no lateral spring) */
  const focusReturnScaleOnlyRef = useRef(false);
  const isIntroPlayingRef = useRef(!prefersReducedMotion);

  const [introFlush, setIntroFlush] = useState(0);
  /** Bumped after a deep-link pins a work into a previously-uncached seat (see gridMath) */
  const [gridVersion, setGridVersion] = useState(0);
  const [originCanvasHost, setOriginCanvasHost] = useState<HTMLDivElement | null>(null);
  const originMarqueeStateRef = useRef<MarqueePersistedState>({
    offset: 0,
    direction: 'left',
    spacing: 0,
    initialized: false
  });
  const isMobile = window.innerWidth <= 480;
  const staggerMode: PeerReturnStagger = peerReturnStagger ?? (isMobile ? 'focus' : 'legacy');

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
  /** Stable per-mount seed — must not change every render (grid memo + intro capture) */
  const seedFactorRef = useRef(Math.random() * 1000);
  const seedFactor = seedFactorRef.current;
  const zoomSpeed = 0.001;
  const minZoom = 0.75; // Maximum zoom out
  const maxZoom = isMobile ? 2 : 3; // Maximum zoom in
  const clickDragThresholdPx = isMobile ? 4 : 6;
  const staggerOffset = (cellHeight + gapSize) * 0.5;
  const initialOffsetX = cellWidth / 2 + gapSize / 2;
  const cellMetrics = { cellWidth, cellHeight, gapSize, staggerOffset };

  const originCardKey = originCard ? getWorkKey(originCard.work) : null;

  /** Only Hello stays unique — custom cards may tile across the grid */
  const excludedWorkKeys = useMemo(() => {
    const keys = new Set<string>();
    if (originCardKey) keys.add(originCardKey);
    return keys;
  }, [originCardKey]);

  /** Portfolio works + custom card works so they can be selected / repeated */
  const canvasWorks = useMemo(() => {
    const list = [...works];
    const seen = new Set(list.map(getWorkKey));
    for (const card of customCards ?? []) {
      const key = getWorkKey(card.work);
      if (seen.has(key)) continue;
      list.push(card.work);
      seen.add(key);
    }
    return list;
  }, [works, customCards]);

  const customCardById = useMemo(
    () => new Map((customCards ?? []).map((card) => [card.id, card])),
    [customCards]
  );

  const customCardByWorkKey = useMemo(() => {
    const map = new Map<string, CustomCardConfig>();
    for (const card of customCards ?? []) {
      map.set(getWorkKey(card.work), card);
    }
    return map;
  }, [customCards]);

  const camera = useCanvasCamera({
    outerContainerRef,
    innerContainerRef,
    itemsRef,
    viewRef,
    targetOffsetRef,
    targetZoomRef,
    isDragging,
    isPinching,
    isCoastingRef,
    panVelocityRef,
    suppressClickRef,
    touchInertiaEligibleRef,
    pendingIntroSnapRef,
    focusedIdRef,
    focusPhaseRef,
    focusReturnPanActiveRef,
    isIntroPlayingRef,
    cellWidth,
    cellHeight,
    gapSize,
    staggerOffset,
    initialOffsetX,
    viewportPadding,
    isMobile,
    lerpFactor,
    touchLerpFactor,
    touchInertiaFriction,
    touchInertiaBoost,
    touchInertiaMinSpeed,
    touchVelocitySmoothing,
    zoomSpeed,
    minZoom,
    maxZoom,
    clickDragThresholdPx,
    prefersReducedMotion,
    introFlush,
    discoModeRef
  });

  const visibleItems = useVisibleGridItems({
    outerContainerRef,
    itemsRef,
    workUsageCountRef,
    originCardIdRef,
    customCardIdsRef,
    offset: camera.offset,
    zoom: camera.zoom,
    works: canvasWorks,
    originCard,
    originCardKey,
    customCards,
    excludedWorkKeys,
    seedFactor,
    cellWidth,
    cellHeight,
    gapSize,
    staggerOffset,
    initialOffsetX,
    viewportPadding,
    gridVersion
  });

  const focus = useFocusMode({
    works: canvasWorks,
    originCard,
    customCards,
    customCardIdsRef,
    itemsRef,
    originCardIdRef,
    workUsageCountRef,
    excludedWorkKeys,
    seedFactor,
    viewRef: camera.viewRef,
    cellWidth,
    cellHeight,
    gapSize,
    staggerOffset,
    isMobile,
    setCanvasFocused,
    clearPointer: camera.clearPointer,
    resetAllProximity: camera.resetAllProximity,
    panCameraToItemIdIfOffscreen: camera.panCameraToItemIdIfOffscreen,
    isItemIdOnScreen: camera.isItemIdOnScreen,
    shouldReturnFocusToCenter: camera.shouldReturnFocusToCenter,
    panCameraToFocusReturnSeat: camera.panCameraToFocusReturnSeat,
    getGridItemContentCenter: camera.getGridItemContentCenter,
    focusedIdRef,
    focusPhaseRef,
    focusReturnPanActiveRef,
    focusReturnToCenterRef,
    focusReturnScaleOnlyRef,
    isIntroPlayingRef,
    isDragging,
    isCoastingRef,
    panVelocityRef,
    touchInertiaEligibleRef,
    suppressClickRef,
    onFocusIntent
  });
  // Injected callback — camera's syncViewBounds keeps the focused card in sync on resize
  camera.onViewBoundsChangeRef.current = focus.handleViewportResize;

  const recenter = useCanvasRecenter({
    viewRef: camera.viewRef,
    itemsRef,
    introOriginRef,
    originCardIdRef,
    focusedIdRef,
    isIntroPlayingRef,
    targetOffsetRef,
    targetZoomRef,
    isDragging,
    isPinching,
    isCoastingRef,
    panVelocityRef,
    cellWidth,
    cellHeight,
    gapSize,
    staggerOffset,
    loaded,
    introComplete,
    prefersReducedMotion,
    onRecenterAvailabilityChange,
    recenterActionRef,
    applyCameraTransform: camera.applyCameraTransform,
    commitCullPose: camera.commitCullPose,
    getCellWindowKey: camera.getCellWindowKey
  });
  // Injected callback — camera's rAF loop pings recenter visibility every frame
  camera.updateRecenterVisibilityRef.current = recenter.updateRecenterVisibility;

  const intro = useIntroSequence({
    prefersReducedMotion,
    works: canvasWorks,
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
    introReady: camera.introReady,
    loaded,
    setIntroFlush,
    setLoadingProgress,
    setIsLoaded,
    setIntroComplete,
    resetLoading,
    clearPointer: camera.clearPointer,
    resetAllProximity: camera.resetAllProximity
  });

  // Capture a one-shot clustered intro layout for viewport items only (render-time)
  intro.maybeCaptureIntro(visibleItems);

  const handleOriginActivate = focus.handleOriginActivate;

  const {
    focusedId,
    focusedWork,
    focusSnapshot,
    focusPhase,
    releaseFocusPeers,
    focusNavDirection,
    focusCardSlide,
    focusCopySlide,
    focusNavInstant,
    focusSwipePeeksLive,
    originPortraitUp,
    setOriginPortraitUp,
    focusScrollShellRef,
    focusScrollRef,
    focusSwipeDragX,
    originSwipeSlotRef,
    originSwipeHandoffRef,
    canSpatialFocusNav,
    focusAdjacentWorks,
    isFocused,
    isFocusSettled,
    isFocusHandingOff,
    isFocusReturning,
    focusImageSrc,
    focusedIsOriginCard,
    showFocusScrim,
    showFocusHtml,
    focusWorkKey,
    focusSlideKey,
    syncOriginFocusSwipeNudge
  } = focus;

  // --- Deep-link focus-by-work / origin (URL sync bridge) ------------------------------
  // Queue the latest requested work until intro is done + the view has been measured
  // (KTD7). `undefined` = no pending request; a request always supersedes an older one.
  // Origin focus uses a separate pending flag so `/about` can open Hello without a work seat.
  const pendingApplyWorkRef = useRef<Work | null | undefined>(undefined);
  const pendingApplyOriginRef = useRef(false);

  const flushPendingApplyWork = useCallback(() => {
    if (intro.isIntroPlaying || !camera.introReady) return;

    if (pendingApplyOriginRef.current) {
      pendingApplyOriginRef.current = false;
      pendingApplyWorkRef.current = undefined;
      const originId = originCardIdRef.current;
      const originItem = originId ? itemsRef.current.get(originId) : null;
      if (originId && originItem) {
        focus.applyFocusForWork(originId, originItem.work);
      }
      return;
    }

    if (pendingApplyWorkRef.current === undefined) return;

    const work = pendingApplyWorkRef.current;
    pendingApplyWorkRef.current = undefined;

    if (!work) {
      focus.applyFocusForWork(null, null);
      return;
    }

    const existing = findExistingSeatForWork(itemsRef.current, work);
    const seat = existing ?? ensureSeatForWork({ work, items: itemsRef.current, originCardIdRef, staggerOffset });
    if (!existing) setGridVersion((v) => v + 1);

    focus.applyFocusForWork(seat.id, work);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro.isIntroPlaying, camera.introReady, focus.applyFocusForWork, staggerOffset]);

  useEffect(() => {
    flushPendingApplyWork();
  }, [flushPendingApplyWork]);

  const requestApplyFocusWork = useCallback(
    (work: Work | null) => {
      pendingApplyOriginRef.current = false;
      pendingApplyWorkRef.current = work;
      flushPendingApplyWork();
    },
    [flushPendingApplyWork]
  );

  const requestApplyFocusOrigin = useCallback(() => {
    pendingApplyWorkRef.current = undefined;
    pendingApplyOriginRef.current = true;
    flushPendingApplyWork();
  }, [flushPendingApplyWork]);

  // Stable bridge object — the parent holds this ref across the CSR mount race and always
  // reaches the latest callbacks/state via the closures refreshed on relevant changes.
  useEffect(() => {
    if (!focusBridgeRef) return;
    const isFirstAssign = focusBridgeRef.current === null;
    focusBridgeRef.current = {
      getFocusedWork: () => focusedWork,
      applyFocusWork: requestApplyFocusWork,
      applyFocusOrigin: requestApplyFocusOrigin
    };
    if (isFirstAssign) onBridgeReady?.();
  }, [focusBridgeRef, focusedWork, requestApplyFocusWork, requestApplyFocusOrigin, onBridgeReady]);

  useEffect(
    () => () => {
      if (focusBridgeRef) focusBridgeRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const isInteractionLocked = intro.isIntroPlaying || isFocused;

  const useFocusSwipeGallery = isMobile && canSpatialFocusNav;
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
  React.useLayoutEffect(() => {
    if (originSwipeHandoffRef.current) return;
    syncOriginFocusSwipeNudge(focusSwipeDragX.get(), originSwipeSlot);
  }, [originSwipeSlot, syncOriginFocusSwipeNudge, focusSwipeDragX, originSwipeHandoffRef]);

  // Desktop: AnimatePresence slides (production morph). Mobile: track + peeks.
  const useFocusSlidePresence = !isMobile && canSpatialFocusNav;
  const focusSwipePanels = useMemo(() => {
    if (!focusedWork) return [] as { work: Work; side: 'prev' | 'current' | 'next'; reactKey: string }[];
    if (!useFocusSwipeGallery) {
      return [{ work: focusedWork, side: 'current' as const, reactKey: getWorkKey(focusedWork) }];
    }

    // Key by work so commit can reuse the peek DOM as current. The infinite grid can
    // tile the same work on both sides — disambiguate duplicates to avoid React key clashes.
    const used = new Set<string>();
    const panelFor = (work: Work, side: 'prev' | 'current' | 'next') => {
      const workKey = getWorkKey(work);
      const reactKey = used.has(workKey) ? `${side}:${workKey}` : workKey;
      used.add(workKey);
      return { work, side, reactKey };
    };

    const panels: { work: Work; side: 'prev' | 'current' | 'next'; reactKey: string }[] = [];
    // Current first so it always owns the canonical work key
    panels.push(panelFor(focusedWork, 'current'));
    if (showFocusSwipePeeks && focusAdjacentWorks.prev) {
      panels.unshift(panelFor(focusAdjacentWorks.prev, 'prev'));
    }
    if (showFocusSwipePeeks && focusAdjacentWorks.next) {
      panels.push(panelFor(focusAdjacentWorks.next, 'next'));
    }
    return panels;
  }, [focusedWork, useFocusSwipeGallery, showFocusSwipePeeks, focusAdjacentWorks]);

  // Start the marquee as soon as the origin card joins the stack (not when load/intro fully finishes)
  const originCardId = originCardIdRef.current;
  const originMarqueeActive =
    !intro.isClusterHold || intro.shouldSpread || (originCardId ? intro.stackEnteredIds.has(originCardId) : false);

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

  const getFocusExtraForWork = useCallback(
    (work: Work) => {
      const key = getWorkKey(work);
      if (originCard?.renderFocusContent && originCardKey && key === originCardKey) {
        return originCard.renderFocusContent({ work, isFocusSettled });
      }
      for (const card of customCards ?? []) {
        if (!card.renderFocusContent) continue;
        if (getWorkKey(card.work) !== key) continue;
        return card.renderFocusContent({ work, isFocusSettled });
      }
      return null;
    },
    [originCard, originCardKey, customCards, isFocusSettled]
  );

  const getFocusBannerForWork = useCallback(
    (work: Work) => {
      const key = getWorkKey(work);
      if (originCard?.renderFocusBanner && originCardKey && key === originCardKey) {
        return originCard.renderFocusBanner({ work, isFocusSettled });
      }
      for (const card of customCards ?? []) {
        if (!card.renderFocusBanner) continue;
        if (getWorkKey(card.work) !== key) continue;
        return card.renderFocusBanner({ work, isFocusSettled });
      }
      return null;
    },
    [originCard, originCardKey, customCards, isFocusSettled]
  );

  const focusedFocusExtra = useMemo(() => {
    if (!focusedWork) return null;
    return getFocusExtraForWork(focusedWork);
  }, [focusedWork, getFocusExtraForWork]);

  const focusedFocusBanner = useMemo(() => {
    if (!focusedWork) return null;
    return getFocusBannerForWork(focusedWork);
  }, [focusedWork, getFocusBannerForWork]);

  // Origin face always lives on the canvas morph — never portal into the focus overlay
  // (mobile browsers flash on portal host swaps).
  const showOriginFace = Boolean(originCanvasHost && originCustomContent);

  // Portrait up while origin is the focused card or riding in as a swipe peek.
  React.useLayoutEffect(() => {
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
  }, [focusedIsOriginCard, isFocusSettled, focusPhase, originSwipeSlot, setOriginPortraitUp]);

  const getPosition = useCallback(
    (item: GridItem & { x: number; y: number }) => getItemPosition(item, cellMetrics),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellWidth, cellHeight, gapSize]
  );

  const focusSwipeParallax = useMemo(
    () => ({
      dragX: focusSwipeDragX,
      panelStride: (focusSnapshot?.detailWidth ?? 0) + FOCUS_SWIPE_GAP_PX,
      active: useFocusSwipeGallery && isFocusSettled
    }),
    [focusSwipeDragX, focusSnapshot?.detailWidth, useFocusSwipeGallery, isFocusSettled]
  );

  return (
    <FocusSwipeParallaxContext.Provider value={focusSwipeParallax}>
    <div
      ref={outerContainerRef}
      className={styles.infiniteCanvas}
      data-total={visibleItems.length}
      data-focused={isFocused && !isFocusReturning ? 'true' : undefined}
      onMouseDown={isInteractionLocked ? undefined : camera.handleMouseDown}
      onTouchStart={isInteractionLocked ? undefined : camera.handleTouchStart}
      onTouchEnd={isInteractionLocked ? undefined : camera.handleTouchEnd}
      onTouchCancel={isInteractionLocked ? undefined : camera.handleTouchEnd}
      style={{ pointerEvents: intro.isClusterHold ? 'none' : undefined }}
    >
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
              const pos = getPosition(item);
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
            if (intro.isClusterHold && intro.introStackRef.current?.length) {
              for (const entry of intro.introStackRef.current) {
                if (!byId.has(entry.id)) {
                  byId.set(entry.id, entry.item);
                }
              }
            }
            return [...byId.values()];
          })();

          return renderItems.map((item) => {
            const position = getPosition(item);
            const introConfig = intro.introConfigRef.current?.get(item.id);

            // During stack formation, only the intro pile is visible — hide the rest of the grid
            if (intro.isClusterHold && !introConfig) {
              return null;
            }
            // Wait for camera snap before painting intro cards (avoids off-screen flash)
            if (intro.isClusterHold && !camera.introReady) {
              return null;
            }

            const {
              focusMode,
              focusX,
              focusY,
              focusScale,
              focusOpacity,
              focusImmediate,
              focusReturnDelay
            } = computeItemFocusProps({
              item,
              position,
              focusedId,
              focusSnapshot,
              focusPhase,
              isFocusReturning,
              isFocusSettled,
              isFocusHandingOff,
              morphCardHidden: focus.morphCardHidden,
              focusNavPrevId: focus.focusNavPrevIdRef.current,
              originSwipeSlot,
              showFocusSwipePeeks,
              releaseFocusPeers,
              staggerMode,
              introDelayForId: intro.introConfigRef.current?.get(item.id)?.delay ?? 0,
              peerReturnMaxDist,
              cellWidth,
              cellHeight,
              focusReturnToCenter: focus.focusReturnToCenterRef.current,
              snapFocusLayout: focus.snapFocusLayoutRef.current,
              seedFactor
            });

            const customCard =
              (item.customCardId != null ? customCardById.get(item.customCardId) : undefined) ??
              customCardByWorkKey.get(getWorkKey(item.work));
            const customFace =
              customCard?.render != null
                ? customCard.render({
                    width: cellWidth,
                    height: cellHeight,
                    active: !intro.isClusterHold || intro.shouldSpread,
                    onActivate: () => focus.handleItemClick(item.id, item.work),
                    inFocus: focusedId === item.id && isFocusSettled
                  })
                : undefined;

            return (
              <InfiniteCanvasItem
                key={item.id}
                id={item.id}
                onSelect={focus.handleItemClick}
                work={item.work}
                x={position.x}
                y={position.y}
                width={cellWidth}
                height={cellHeight}
                intro={intro.isIntroPlaying || intro.isClusterHold ? introConfig : undefined}
                shouldSpread={intro.shouldSpread}
                stackEntered={!introConfig || intro.shouldSpread || intro.stackEnteredIds.has(item.id)}
                customContent={customFace}
                customContentHostRef={item.isOriginCard ? setOriginCanvasHost : undefined}
                viewRef={camera.viewRef}
                proximityEnabled={!intro.isIntroPlaying && !focusedId}
                focusMode={focusMode}
                focusX={focusX}
                focusY={focusY}
                focusScale={focusScale}
                focusOpacity={focusOpacity}
                focusImmediate={focusImmediate}
                focusReturnDissolve={isFocusReturning && item.id === focusedId && focus.focusReturnToCenterRef.current}
                focusReturnScaleOnly={
                  isFocusReturning && item.id === focusedId && focus.focusReturnScaleOnlyRef.current
                }
                focusReturnDelay={focusReturnDelay}
                focusScrollNudgeY={item.isOriginCard ? focus.focusScrollNudgeY : undefined}
                focusScrollNudgeX={item.isOriginCard ? focus.focusScrollNudgeX : undefined}
                searchDimmed={
                  searchFilterActive && !isWorkSearchMatch(item.work, matchingWorkKeys, searchQuery)
                }
                discoMode={discoDanceActive}
                discoExiting={discoDanceExiting}
                registerProximity={camera.registerProximity}
                unregisterProximity={camera.unregisterProximity}
                onStackEnterComplete={introConfig && intro.isClusterHold ? intro.handleStackEnterComplete : undefined}
                onIntroComplete={
                  introConfig && (intro.isIntroPlaying || intro.isClusterHold) ? intro.handleIntroComplete : undefined
                }
                onFocusArrive={item.id === focusedId ? focus.handleFocusArrive : undefined}
                onFocusReturnComplete={item.id === focusedId ? focus.handleFocusReturnComplete : undefined}
              />
            );
          });
        })()}
        {showOriginFace ? createPortal(originCustomContent, originCanvasHost!) : null}
      </div>

      <FocusOverlay
        showFocusScrim={showFocusScrim}
        showFocusHtml={showFocusHtml}
        focusedWork={focusedWork}
        focusSnapshot={focusSnapshot}
        isFocusSettled={isFocusSettled}
        focusedIsOriginCard={focusedIsOriginCard}
        useMobilePanelScroll={useMobilePanelScroll}
        useFocusSwipeGallery={useFocusSwipeGallery}
        useFocusSlidePresence={useFocusSlidePresence}
        showFocusSwipePeeks={showFocusSwipePeeks}
        isMobile={isMobile}
        canSpatialFocusNav={canSpatialFocusNav}
        focusSwipePanels={focusSwipePanels}
        focusSwipeDragX={focusSwipeDragX}
        focusWorkKey={focusWorkKey}
        focusSlideKey={focusSlideKey}
        focusImageSrc={focusImageSrc}
        focusCardSlide={focusCardSlide}
        focusCopySlide={focusCopySlide}
        focusNavDirection={focusNavDirection}
        focusNavInstant={focusNavInstant}
        prefersReducedMotion={Boolean(prefersReducedMotion)}
        originCardKey={originCardKey}
        getWorkKey={getWorkKey}
        focusedFocusExtra={focusedFocusExtra}
        getFocusExtraForWork={getFocusExtraForWork}
        focusedFocusBanner={focusedFocusBanner}
        getFocusBannerForWork={getFocusBannerForWork}
        requestClose={focus.requestClose}
        navigateFocus={focus.navigateFocus}
        handleFocusScroll={focus.handleFocusScroll}
        handleFocusSwipeTouchStart={focus.handleFocusSwipeTouchStart}
        handleFocusSwipeTouchEnd={focus.handleFocusSwipeTouchEnd}
        handleFocusSwipeTouchCancel={focus.handleFocusSwipeTouchCancel}
        setFocusCardNode={focus.setFocusCardNode}
        setFocusImageNode={focus.setFocusImageNode}
        focusScrollShellRef={focusScrollShellRef}
        focusScrollRef={focusScrollRef}
      />
    </div>
    </FocusSwipeParallaxContext.Provider>
  );
};

export { InfiniteCanvas };
