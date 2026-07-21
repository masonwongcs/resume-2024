import styles from '../InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { animate, useMotionValue, useMotionValueEvent } from 'motion/react';

import type { InfiniteCanvasViewState } from '../camera/canvasView';
import { getWorkKey, parseGridCoords } from '../grid/gridMath';
import type { CustomCardConfig, FocusPhase, FocusSnapshot, GridItem, OriginCardConfig, Work } from '../types';
import { FOCUS_MOBILE_SIDE_PAD, computeFocusLayout, getLiveCellMetrics } from './focusLayout';
import {
  FOCUS_COPY_SLIDE_TRANSITION,
  FOCUS_MORPH_FALLBACK_MS,
  FOCUS_PEERS_RETURN_DELAY_MS,
  FOCUS_SWIPE_AXIS_RATIO,
  FOCUS_SWIPE_COMMIT,
  FOCUS_SWIPE_GAP_PX,
  FOCUS_SWIPE_LOCK_PX,
  FOCUS_SWIPE_MIN_DX,
  FOCUS_SWIPE_SNAP_BACK,
  getFocusCardSlideTargets,
  getFocusCopySlideTargets
} from './focusMotion';

type UseFocusModeArgs = {
  works: Work[];
  originCard?: OriginCardConfig;
  originCardKey: string | null;
  customCards?: CustomCardConfig[];
  customCardIdsRef: RefObject<Map<string, string>>;
  itemsRef: RefObject<Map<string, GridItem>>;
  originCardIdRef: RefObject<string | null>;
  viewRef: RefObject<InfiniteCanvasViewState>;
  cellWidth: number;
  cellHeight: number;
  gapSize: number;
  isMobile: boolean;
  setCanvasFocused: (focused: boolean) => void;
  clearPointer: () => void;
  resetAllProximity: (immediate?: boolean) => void;
  panCameraToItemIdIfOffscreen: (id: string | null, immediate?: boolean) => boolean;
  isItemIdOnScreen: (id: string | null) => boolean;
  shouldReturnFocusToCenter: (id: string | null) => boolean;
  panCameraToFocusReturnSeat: (id: string | null, immediate?: boolean) => boolean;
  getGridItemContentCenter: (item: { x: number; y: number; offsetX: number; offsetY: number }) => {
    x: number;
    y: number;
  };
  focusedIdRef: MutableRefObject<string | null>;
  focusPhaseRef: MutableRefObject<FocusPhase | null>;
  focusReturnPanActiveRef: MutableRefObject<boolean>;
  focusReturnToCenterRef: MutableRefObject<boolean>;
  focusReturnScaleOnlyRef: MutableRefObject<boolean>;
  isIntroPlayingRef: RefObject<boolean>;
  isDragging: MutableRefObject<boolean>;
  isCoastingRef: MutableRefObject<boolean>;
  panVelocityRef: MutableRefObject<{ x: number; y: number }>;
  touchInertiaEligibleRef: MutableRefObject<boolean>;
  suppressClickRef: MutableRefObject<boolean>;
};

export const useFocusMode = ({
  works,
  originCard,
  originCardKey,
  customCards,
  customCardIdsRef,
  itemsRef,
  originCardIdRef,
  viewRef,
  cellWidth,
  cellHeight,
  gapSize,
  isMobile,
  setCanvasFocused,
  clearPointer,
  resetAllProximity,
  panCameraToItemIdIfOffscreen,
  isItemIdOnScreen,
  shouldReturnFocusToCenter,
  panCameraToFocusReturnSeat,
  getGridItemContentCenter,
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
  suppressClickRef
}: UseFocusModeArgs) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedWork, setFocusedWork] = useState<Work | null>(null);
  const [focusSnapshot, setFocusSnapshot] = useState<FocusSnapshot | null>(null);
  const [focusPhase, setFocusPhase] = useState<FocusPhase | null>(null);
  const [morphCardHidden, setMorphCardHidden] = useState(false);
  /** Let peers spring home while the focused card is still returning (don't clearFocus early) */
  const [releaseFocusPeers, setReleaseFocusPeers] = useState(false);
  const focusCardRef = useRef<HTMLDivElement>(null);
  const focusImageRef = useRef<HTMLImageElement>(null);
  /** Keep refs across AnimatePresence slide swaps — exiting nodes must not clear the live card */
  const setFocusCardNode = useCallback((node: HTMLDivElement | null) => {
    if (node) focusCardRef.current = node;
  }, []);
  const setFocusImageNode = useCallback((node: HTMLImageElement | null) => {
    if (node) focusImageRef.current = node;
  }, []);
  const focusScrollShellRef = useRef<HTMLDivElement>(null);
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
  // (focusReturnPanActiveRef / focusReturnToCenterRef / focusReturnScaleOnlyRef are shared refs from the parent)
  /** Gallery slide direction: 1 next, -1 prev, 0 initial open */
  const [focusNavDirection, setFocusNavDirection] = useState(0);
  const [focusCardSlide, setFocusCardSlide] = useState(() => getFocusCardSlideTargets(0));
  const [focusCopySlide, setFocusCopySlide] = useState(() => getFocusCopySlideTargets(0));
  /** Skip enter/exit slide after a committed swipe (peek already in place) */
  const [focusNavInstant, setFocusNavInstant] = useState(false);
  /** Mobile focus gallery swipe tracking */
  const focusSwipeRef = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
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
  /** Portrait raised while focus is settled — face stays on the canvas morph (no portal) */
  const [originPortraitUp, setOriginPortraitUp] = useState(false);
  /** Origin morph Y sync with focus scroll (content-local; ÷ zoom×cardScale → screen 1:1) */
  const focusScrollNudgeY = useMotionValue(0);
  /** Origin morph X sync with focus swipe / gallery slide */
  const focusScrollNudgeX = useMotionValue(0);
  /** Element that actually scrolls — panel on mobile gallery, shell on desktop */
  const focusScrollRef = useRef<HTMLDivElement>(null);
  const focusSnapshotRef = useRef(focusSnapshot);
  focusSnapshotRef.current = focusSnapshot;
  /** Snap morph x/y/scale on viewport resize (avoid spring desync with HTML overlay) */
  const snapFocusLayoutRef = useRef(false);

  if (focusSnapshot) {
    focusDetailWidthRef.current = focusSnapshot.detailWidth;
  }

  /** Gallery order for focus prev/next — origin first when focusable, then custom cards, then works */
  const focusGallery = useMemo(() => {
    const list: Work[] = [];
    const seen = new Set<string>();
    if (originCard && originCard.focusable !== false) {
      list.push(originCard.work);
      seen.add(getWorkKey(originCard.work));
    }
    for (const card of customCards ?? []) {
      if (card.focusable === false) continue;
      const key = getWorkKey(card.work);
      if (seen.has(key)) continue;
      list.push(card.work);
      seen.add(key);
    }
    for (const work of works) {
      const key = getWorkKey(work);
      if (seen.has(key)) continue;
      if (originCardKey && key === originCardKey) continue;
      list.push(work);
      seen.add(key);
    }
    return list;
  }, [works, originCard, originCardKey, customCards]);

  const clearFocus = useCallback(() => {
    if (focusArriveTimeoutRef.current) {
      clearTimeout(focusArriveTimeoutRef.current);
      focusArriveTimeoutRef.current = null;
    }
    focusNavPrevIdRef.current = null;
    focusReturnPanActiveRef.current = false;
    focusReturnToCenterRef.current = false;
    focusReturnScaleOnlyRef.current = false;
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
    setFocusCardSlide(getFocusCardSlideTargets(0));
    setFocusCopySlide(getFocusCopySlideTargets(0));
    setMorphCardHidden(false);
    setReleaseFocusPeers(false);
    setOriginPortraitUp(false);
    setFocusSwipePeeksLive(false);
    setCanvasFocused(false);
  }, [
    focusScrollNudgeY,
    focusScrollNudgeX,
    focusSwipeDragX,
    setCanvasFocused,
    focusedIdRef,
    focusPhaseRef,
    focusReturnPanActiveRef,
    focusReturnToCenterRef,
    focusReturnScaleOnlyRef
  ]);

  /** Desktop only: fully off-screen seats dissolve at focus center. On-screen seats morph home. */
  const beginFocusReturn = useCallback(() => {
    const id = focusedIdRef.current;
    const toCenter = shouldReturnFocusToCenter(id);
    focusReturnToCenterRef.current = toCenter;
    focusReturnScaleOnlyRef.current = false;

    if (toCenter) {
      focusReturnPanActiveRef.current = false;
    } else if (isMobile) {
      // Gallery swipe freezes the camera — only when the return seat is off-screen
      // do we snap + scale in place. On-screen seats morph home normally (no camera
      // snap), otherwise every close looks like a mid-screen shrink.
      if (!isItemIdOnScreen(id)) {
        panCameraToFocusReturnSeat(id, true);
        focusReturnPanActiveRef.current = false;
        focusReturnScaleOnlyRef.current = true;
      } else {
        focusReturnPanActiveRef.current = false;
      }
    } else {
      focusReturnPanActiveRef.current = panCameraToItemIdIfOffscreen(id);
    }

    focusPhaseRef.current = 'returning';
    setReleaseFocusPeers(false);
    setFocusPhase('returning');
    setCanvasFocused(false);
  }, [
    isMobile,
    isItemIdOnScreen,
    shouldReturnFocusToCenter,
    panCameraToFocusReturnSeat,
    panCameraToItemIdIfOffscreen,
    setCanvasFocused,
    focusedIdRef,
    focusPhaseRef,
    focusReturnPanActiveRef,
    focusReturnToCenterRef,
    focusReturnScaleOnlyRef
  ]);

  const syncOriginFocusScrollNudge = useCallback(
    (scrollTop: number) => {
      const scale = focusSnapshotRef.current?.cardScale ?? 1;
      const zoomValue = viewRef.current.zoom || 1;
      // Nudge sits inside the scaled card — divide so screen delta matches scrollTop
      focusScrollNudgeY.set(-scrollTop / (zoomValue * scale));
    },
    [focusScrollNudgeY, viewRef]
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
    [focusScrollNudgeX, viewRef]
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
    [syncOriginFocusScrollNudge, focusedIdRef, itemsRef]
  );

  const handleFocusArrive = useCallback(
    (id: string) => {
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
    },
    [focusPhaseRef, focusedIdRef]
  );

  // Hide the canvas morph once the HTML card is on screen (avoids a blank frame).
  // Origin keeps the live face on the morph — never hide it (portal handoffs blink on mobile).
  useLayoutEffect(() => {
    if (focusPhase === 'settled') {
      const isOrigin =
        Boolean(focusedIdRef.current) && Boolean(itemsRef.current.get(focusedIdRef.current!)?.isOriginCard);
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
  }, [focusPhase, focusedIdRef, itemsRef]);

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
          const contentCenterX = view.width / 2 + (screenCenterX - view.width / 2 - view.offsetX) / zoomValue;
          const contentCenterY = view.height / 2 + (screenCenterY - view.height / 2 - view.offsetY) / zoomValue;
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
    focusSwipeDragX,
    focusScrollNudgeX,
    focusScrollNudgeY,
    getLiveFocusCardNode,
    beginFocusReturn,
    focusedIdRef,
    focusPhaseRef,
    viewRef
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
    syncOriginFocusScrollNudge,
    focusedIdRef,
    itemsRef
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
    [clearFocus, focusPhaseRef, focusedIdRef]
  );

  // Release peers shortly after the focus card begins returning (overlap, not wait-for-settle).
  // Keep focusedId until the focused card finishes returning so rapid re-clicks can't skip the morph.
  useEffect(() => {
    if (focusPhase !== 'returning') return;
    const timeout = setTimeout(() => {
      if (focusPhaseRef.current === 'returning') setReleaseFocusPeers(true);
    }, FOCUS_PEERS_RETURN_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [focusPhase, focusPhaseRef]);

  // Safety: if return animation never reports complete, unlock after a beat
  useEffect(() => {
    if (focusPhase !== 'returning') return;
    const timeout = setTimeout(() => {
      if (focusPhaseRef.current === 'returning') clearFocus();
    }, 1200);
    return () => clearTimeout(timeout);
  }, [focusPhase, clearFocus, focusPhaseRef]);

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
      if (stored?.customCardId) {
        const card = customCards?.find((c) => c.id === stored.customCardId);
        if (card?.focusable === false) return;
      }

      // Stop any fling before locking the camera for focus
      isCoastingRef.current = false;
      panVelocityRef.current = { x: 0, y: 0 };
      touchInertiaEligibleRef.current = false;

      const view = viewRef.current;
      if (view.width <= 0 || view.height <= 0) return;

      const coords = parseGridCoords(id);
      if (!coords) return;
      const originX = coords.x * (cellWidth + gapSize) + (stored?.offsetX ?? 0);
      const originY = coords.y * (cellHeight + gapSize) + (stored?.offsetY ?? 0);
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
      setFocusCardSlide(getFocusCardSlideTargets(0));
      setFocusCopySlide(getFocusCopySlideTargets(0));
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
    [
      cellWidth,
      cellHeight,
      gapSize,
      clearPointer,
      resetAllProximity,
      setCanvasFocused,
      handleFocusArrive,
      originCard,
      customCards,
      suppressClickRef,
      focusedIdRef,
      focusPhaseRef,
      isIntroPlayingRef,
      itemsRef,
      isCoastingRef,
      panVelocityRef,
      touchInertiaEligibleRef,
      isDragging,
      viewRef
    ]
  );

  /** Nearest mounted grid seat for a work — exit morph returns here after gallery nav */
  const findReturnCellForWork = useCallback(
    (work: Work, nearId: string | null) => {
      const key = getWorkKey(work);

      if (originCard && getWorkKey(originCard.work) === key) {
        const id = originCardIdRef.current;
        if (!id) return null;
        const item = itemsRef.current.get(id);
        const coords = id ? parseGridCoords(id) : null;
        if (!item || !coords) return null;
        return { ...item, ...coords };
      }

      for (const card of customCards ?? []) {
        if (getWorkKey(card.work) !== key) continue;
        const id = customCardIdsRef.current.get(card.id);
        if (!id) continue;
        const item = itemsRef.current.get(id);
        const coords = parseGridCoords(id);
        if (!item || !coords) continue;
        return { ...item, ...coords };
      }

      const near = nearId ? parseGridCoords(nearId) : null;
      const fromX = near?.x ?? 0;
      const fromY = near?.y ?? 0;

      let best: (GridItem & { x: number; y: number }) | null = null;
      let bestDist = Infinity;

      for (const item of itemsRef.current.values()) {
        if (item.isOriginCard || item.customCardId) continue;
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
    [originCard, customCards, itemsRef, originCardIdRef, customCardIdsRef]
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
        const nextIndex = (((currentIndex + direction * step) % len) + len) % len;
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

        // Pin exit direction on the outgoing slide, then swap enter + content.
        // Without the first flushSync, AnimatePresence keeps the previous exit prop.
        const cardTargets = getFocusCardSlideTargets(direction);
        const copyTargets = getFocusCopySlideTargets(direction);
        flushSync(() => {
          setFocusCardSlide((prev) => ({ ...prev, exit: cardTargets.exit }));
          setFocusCopySlide((prev) => ({
            ...prev,
            exit: copyTargets.exit,
            transition: FOCUS_COPY_SLIDE_TRANSITION
          }));
        });
        flushSync(() => {
          setFocusNavDirection(direction);
          setFocusCardSlide(cardTargets);
          setFocusCopySlide(copyTargets);
          setFocusedWork(nextWork);
        });

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
      getGridItemContentCenter,
      focusPhaseRef,
      focusedIdRef,
      viewRef
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
    [isMobile, focusSwipeDragX, focusScrollNudgeY, navigateFocus, syncOriginFocusSwipeNudge, focusPhaseRef]
  );

  const handleFocusSwipeTouchStart = useCallback(
    (event: React.TouchEvent) => {
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
    [isMobile, focusGallery.length, focusSwipeDragX, focusPhaseRef]
  );

  const handleFocusSwipeTouchEnd = useCallback(
    (event: React.TouchEvent) => {
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
    [isMobile, focusGallery.length, focusSwipeDragX, commitFocusSwipe, resetFocusSwipeTrail, focusPhaseRef]
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
        // Must clearly beat vertical (matches the touchend fallback) — a near-45°
        // drag should default to scroll, not hijack it as a swipe.
        start.axis = Math.abs(dx) > Math.abs(dy) * FOCUS_SWIPE_AXIS_RATIO ? 'x' : 'y';
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
  }, [isMobile, focusPhase, focusGallery.length, rubberbandSwipeX, focusPhaseRef]);

  useEffect(() => {
    return () => {
      setCanvasFocused(false);
      if (focusArriveTimeoutRef.current) clearTimeout(focusArriveTimeoutRef.current);
    };
  }, [setCanvasFocused]);

  useEffect(() => {
    focusedIdRef.current = focusedId;
  }, [focusedId, focusedIdRef]);

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

  /** Injectable resize handler — wired into useCanvasCamera's syncViewBounds */
  const handleViewportResize = useCallback(() => {
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
  }, [focusPhaseRef, viewRef]);

  const handleOriginActivate = useCallback(() => {
    const id = originCardIdRef.current;
    if (!id) return;
    const item = itemsRef.current.get(id);
    if (!item) return;
    handleItemClick(id, item.work);
  }, [handleItemClick, originCardIdRef, itemsRef]);

  const isFocused = Boolean(focusedId && focusSnapshot && focusedWork && focusPhase);
  const isFocusSettled = focusPhase === 'settled';
  const isFocusHandingOff = focusPhase === 'out';
  const isFocusReturning = focusPhase === 'returning';
  const focusImageSrc = focusedWork ? (focusedWork.thumbnail ? focusedWork.thumbnail : focusedWork.image) : '';
  const focusedIsOriginCard = Boolean(focusedId && itemsRef.current.get(focusedId)?.isOriginCard && originCard);
  const showFocusScrim = focusPhase === 'in' || focusPhase === 'settled';
  // Keep HTML through 'out' so the morph can paint underneath before the overlay exits
  const showFocusHtml = focusPhase === 'in' || focusPhase === 'settled' || focusPhase === 'out';
  const focusWorkKey = focusedWork ? getWorkKey(focusedWork) : '';

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

  return {
    focusedId,
    focusedWork,
    focusSnapshot,
    focusPhase,
    morphCardHidden,
    releaseFocusPeers,
    focusNavDirection,
    focusCardSlide,
    focusCopySlide,
    focusNavInstant,
    focusSwipePeeksLive,
    originPortraitUp,
    setOriginPortraitUp,
    focusCardRef,
    focusImageRef,
    setFocusCardNode,
    setFocusImageNode,
    focusScrollShellRef,
    focusScrollRef,
    focusScrollNudgeY,
    focusScrollNudgeX,
    focusSwipeDragX,
    originSwipeSlotRef,
    originSwipeHandoffRef,
    focusGallery,
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
    focusReturnToCenterRef,
    focusReturnScaleOnlyRef,
    focusNavPrevIdRef,
    snapFocusLayoutRef,
    handleItemClick,
    handleOriginActivate,
    clearFocus,
    beginFocusReturn,
    handleFocusArrive,
    requestClose,
    handleFocusReturnComplete,
    navigateFocus,
    commitFocusSwipe,
    handleFocusSwipeTouchStart,
    handleFocusSwipeTouchEnd,
    handleFocusSwipeTouchCancel,
    handleFocusScroll,
    syncOriginFocusSwipeNudge,
    handleViewportResize
  };
};

export type UseFocusModeResult = ReturnType<typeof useFocusMode>;
