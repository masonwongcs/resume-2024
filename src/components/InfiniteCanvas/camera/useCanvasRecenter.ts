import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

import type { InfiniteCanvasViewState } from './canvasView';
import { findCenterGridSeat, parseGridCoords } from '../grid/gridMath';
import type { GridItem } from '../types';

const RECENTER_SHOW_DIST = 0.95;
const RECENTER_HIDE_DIST = 0.4;
const RECENTER_IDLE_MS = 480;

type UseCanvasRecenterArgs = {
  viewRef: RefObject<InfiniteCanvasViewState>;
  itemsRef: RefObject<Map<string, GridItem>>;
  introOriginRef: MutableRefObject<{ x: number; y: number } | null>;
  originCardIdRef: RefObject<string | null>;
  focusedIdRef: RefObject<string | null>;
  isIntroPlayingRef: RefObject<boolean>;
  targetOffsetRef: MutableRefObject<{ x: number; y: number }>;
  targetZoomRef: MutableRefObject<number>;
  isDragging: RefObject<boolean>;
  isPinching: RefObject<boolean>;
  isCoastingRef: MutableRefObject<boolean>;
  panVelocityRef: MutableRefObject<{ x: number; y: number }>;
  cellWidth: number;
  cellHeight: number;
  gapSize: number;
  staggerOffset: number;
  loaded: boolean;
  introComplete: boolean;
  prefersReducedMotion: boolean | null;
  onRecenterAvailabilityChange?: (visible: boolean) => void;
  recenterActionRef?: MutableRefObject<(() => void) | null>;
  applyCameraTransform: (x: number, y: number, z: number) => void;
  commitCullPose: (x: number, y: number, z: number, windowKey: string, markSettled?: boolean) => void;
  getCellWindowKey: (ox: number, oy: number, z: number, width: number, height: number) => string;
};

export const useCanvasRecenter = ({
  viewRef,
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
  applyCameraTransform,
  commitCullPose,
  getCellWindowKey
}: UseCanvasRecenterArgs) => {
  const showRecenterRef = useRef(false);
  const isRecenteringRef = useRef(false);
  const recenterIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRecenterAvailabilityChangeRef = useRef(onRecenterAvailabilityChange);

  const metrics = { cellWidth, cellHeight, gapSize, staggerOffset };

  const ensureHomeContent = useCallback(() => {
    if (introOriginRef.current) return introOriginRef.current;

    const id = originCardIdRef.current;
    if (id) {
      const coords = parseGridCoords(id);
      if (coords) {
        const item = itemsRef.current.get(id);
        const x =
          coords.x * (cellWidth + gapSize) + (item?.offsetX ?? 0) + cellWidth / 2;
        const y =
          coords.y * (cellHeight + gapSize) +
          (item?.offsetY ?? (coords.x % 2 === 0 ? 0 : staggerOffset)) +
          cellHeight / 2;
        introOriginRef.current = { x, y };
        return introOriginRef.current;
      }
    }

    const view = viewRef.current;
    if (view.width > 0 && view.height > 0) {
      const { originX, originY } = findCenterGridSeat(view.width, view.height, metrics);
      introOriginRef.current = { x: originX, y: originY };
      return introOriginRef.current;
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellWidth, cellHeight, gapSize, staggerOffset]);

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
  }, [
    ensureHomeContent,
    introComplete,
    loaded,
    setRecenterVisible,
    focusedIdRef,
    isIntroPlayingRef,
    viewRef,
    targetOffsetRef,
    targetZoomRef,
    isDragging,
    isPinching,
    isCoastingRef
  ]);

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
    setRecenterVisible,
    viewRef,
    isCoastingRef,
    panVelocityRef,
    targetOffsetRef,
    targetZoomRef
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
      if (recenterIdleTimerRef.current) {
        clearTimeout(recenterIdleTimerRef.current);
        recenterIdleTimerRef.current = null;
      }
    };
  }, []);

  return {
    ensureHomeContent,
    updateRecenterVisibility,
    handleRecenter,
    recenterIdleTimerRef,
    isRecenteringRef,
    showRecenterRef
  };
};
