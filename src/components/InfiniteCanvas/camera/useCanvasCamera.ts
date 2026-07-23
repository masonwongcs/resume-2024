import React, { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';

import { useAnimationFrame, useMotionValue } from 'motion/react';

import { type InfiniteCanvasViewState } from './canvasView';
import {
  getCellWindowKey as gridGetCellWindowKey,
  getGridItemContentCenter as gridGetGridItemContentCenter,
  parseGridCoords
} from '../grid/gridMath';
import type { ProximityRegistration } from '../InfiniteCanvasItem';
import type { FocusPhase, GridItem } from '../types';

type Point = { x: number; y: number };

type UseCanvasCameraArgs = {
  outerContainerRef: RefObject<HTMLDivElement | null>;
  innerContainerRef: RefObject<HTMLDivElement | null>;
  itemsRef: RefObject<Map<string, GridItem>>;
  viewRef: RefObject<InfiniteCanvasViewState>;
  targetOffsetRef: MutableRefObject<Point>;
  targetZoomRef: MutableRefObject<number>;
  isDragging: MutableRefObject<boolean>;
  isPinching: MutableRefObject<boolean>;
  isCoastingRef: MutableRefObject<boolean>;
  panVelocityRef: MutableRefObject<Point>;
  suppressClickRef: MutableRefObject<boolean>;
  touchInertiaEligibleRef: MutableRefObject<boolean>;
  pendingIntroSnapRef: MutableRefObject<Point | null>;
  focusedIdRef: RefObject<string | null>;
  focusPhaseRef: RefObject<FocusPhase | null>;
  focusReturnPanActiveRef: MutableRefObject<boolean>;
  isIntroPlayingRef: RefObject<boolean>;
  cellWidth: number;
  cellHeight: number;
  gapSize: number;
  staggerOffset: number;
  initialOffsetX: number;
  viewportPadding: number;
  isMobile: boolean;
  lerpFactor: number;
  touchLerpFactor: number;
  touchInertiaFriction: number;
  touchInertiaBoost: number;
  touchInertiaMinSpeed: number;
  touchVelocitySmoothing: number;
  zoomSpeed: number;
  minZoom: number;
  maxZoom: number;
  clickDragThresholdPx: number;
  prefersReducedMotion: boolean | null;
  introFlush: number;
};

const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

/** Resistance past min/max while pinching — lower = stiffer wall (matches focus swipe rubberband) */
const ZOOM_RUBBERBAND_FACTOR = 0.28;
/** Cap how far past the limit the rubberband can stretch (as a fraction of the limit) */
const ZOOM_RUBBERBAND_MAX_OVERSHOOT = 0.2;

/**
 * iOS-style rubber-band for zoom: allow a little overshoot past min/max with
 * diminishing returns, then snap back on release.
 */
const rubberbandZoom = (zoom: number, min: number, max: number) => {
  if (zoom >= min && zoom <= max) return zoom;
  if (zoom > max) {
    const excess = zoom - max;
    const banded = max + excess * ZOOM_RUBBERBAND_FACTOR;
    return Math.min(banded, max * (1 + ZOOM_RUBBERBAND_MAX_OVERSHOOT));
  }
  const excess = min - zoom;
  const banded = min - excess * ZOOM_RUBBERBAND_FACTOR;
  return Math.max(banded, min * (1 - ZOOM_RUBBERBAND_MAX_OVERSHOOT));
};

export const useCanvasCamera = ({
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
  introFlush
}: UseCanvasCameraArgs) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [introReady, setIntroReady] = useState(false);

  /** Last cell window committed to React — skip setState while this is unchanged */
  const committedCellWindowRef = useRef<string | null>(null);
  /** True after camera has synced React cull state at rest */
  const cullSettledRef = useRef(true);
  /** Throttle React cull commits during touch so overscan stays warm without remount storms */
  const lastCullCommitMsRef = useRef(0);
  const animationFrameRef = useRef<number>(null);
  const lastPosition = useRef({ x: 0, y: 0 });
  const lastPinchMidRef = useRef<Point | null>(null);
  /** Finger distance at pinch start — scale is measured from this, not frame-to-frame */
  const pinchStartDistanceRef = useRef<number | null>(null);
  /** Zoom at pinch start — paired with pinchStartDistanceRef for 1:1 tracking + rubberband */
  const pinchStartZoomRef = useRef<number | null>(null);
  /** Last pinch focal point in camera space — used to snap zoom back on release */
  const lastPinchZoomPointRef = useRef<Point | null>(null);
  /** True only for touch drag — mouse drag keeps wheel lerp */
  const isTouchDrag = useRef(false);
  const dragDistanceRef = useRef(0);
  const lastMoveTsRef = useRef(0);

  const pointerX = useMotionValue(-1);
  const pointerY = useMotionValue(-1);

  const proximityHandlersRef = useRef(
    new Map<string, { onFrame: ProximityRegistration['onFrame']; onReset: ProximityRegistration['onReset'] }>()
  );

  /** Injected by the parent once useCanvasRecenter is available */
  const updateRecenterVisibilityRef = useRef<(() => void) | null>(null);
  /** Injected by the parent once useFocusMode is available — keeps the focused card in sync on resize */
  const onViewBoundsChangeRef = useRef<(() => void) | null>(null);

  const metrics = { cellWidth, cellHeight, gapSize, staggerOffset };

  const getCellWindowKey = useCallback(
    (ox: number, oy: number, z: number, width: number, height: number) =>
      gridGetCellWindowKey(ox, oy, z, width, height, {
        cellWidth,
        cellHeight,
        gapSize,
        staggerOffset,
        initialOffsetX,
        viewportPadding
      }),
    [cellWidth, cellHeight, gapSize, staggerOffset, initialOffsetX, viewportPadding]
  );

  const getGridItemContentCenter = useCallback(
    (item: { x: number; y: number; offsetX: number; offsetY: number }) =>
      gridGetGridItemContentCenter(item, metrics),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellWidth, cellHeight, gapSize]
  );

  const applyCameraTransform = useCallback((x: number, y: number, z: number) => {
    const el = innerContainerRef.current;
    if (el) {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    }
  }, [innerContainerRef]);

  const commitCullPose = useCallback(
    (x: number, y: number, z: number, windowKey: string, markSettled = false) => {
      committedCellWindowRef.current = windowKey;
      if (markSettled) cullSettledRef.current = true;
      setOffset({ x, y });
      setZoom(z);
    },
    []
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
    [applyCameraTransform, commitCullPose, getCellWindowKey, prefersReducedMotion, targetOffsetRef, targetZoomRef, viewRef]
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
      const coords = parseGridCoords(id);
      const item = itemsRef.current.get(id);
      if (!coords || !item) return;
      panCameraToGridItem({ ...item, x: coords.x, y: coords.y }, immediate);
    },
    [itemsRef, panCameraToGridItem]
  );

  const isItemIdOnScreen = useCallback(
    (id: string | null) => {
      if (!id) return false;
      const coords = parseGridCoords(id);
      const item = itemsRef.current.get(id);
      if (!coords || !item) return false;
      const view = viewRef.current;
      if (view.width <= 0 || view.height <= 0) return false;
      const posX = coords.x * (cellWidth + gapSize) + item.offsetX;
      const posY = coords.y * (cellHeight + gapSize) + item.offsetY;
      const z = Math.max(view.zoom, 0.001);
      const originOffsetX = (view.width / 2) * (1 - 1 / z);
      const originOffsetY = (view.height / 2) * (1 - 1 / z);
      const left = originOffsetX - view.offsetX / z;
      const top = originOffsetY - view.offsetY / z;
      const right = left + view.width / z;
      const bottom = top + view.height / z;
      return posX + cellWidth > left && posX < right && posY + cellHeight > top && posY < bottom;
    },
    [cellWidth, cellHeight, gapSize, itemsRef, viewRef]
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

  /**
   * Desktop only: fully off-screen seats dissolve at focus center.
   * On-screen seats (including near the edge) morph home to their grid position.
   */
  const shouldReturnFocusToCenter = useCallback(
    (id: string | null) => {
      if (isMobile || !id) return false;
      return !isItemIdOnScreen(id);
    },
    [isMobile, isItemIdOnScreen]
  );

  /** Mobile swipe keeps the camera fixed — park on the return seat before morph home */
  const panCameraToFocusReturnSeat = useCallback(
    (id: string | null, immediate = false) => {
      if (!id) return false;
      const prevTargetX = targetOffsetRef.current.x;
      const prevTargetY = targetOffsetRef.current.y;
      const prevOffsetX = viewRef.current.offsetX;
      const prevOffsetY = viewRef.current.offsetY;
      panCameraToItemId(id, immediate);
      return (
        Math.abs(targetOffsetRef.current.x - prevTargetX) > 0.5 ||
        Math.abs(targetOffsetRef.current.y - prevTargetY) > 0.5 ||
        Math.abs(prevOffsetX - targetOffsetRef.current.x) > 0.5 ||
        Math.abs(prevOffsetY - targetOffsetRef.current.y) > 0.5
      );
    },
    [panCameraToItemId, targetOffsetRef, viewRef]
  );

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

    const focusFollowHome = focusReturnPanActiveRef.current && focusPhaseRef.current === 'returning';
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

    updateRecenterVisibilityRef.current?.();

    animationFrameRef.current = requestAnimationFrame(animateOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applyCameraTransform,
    commitCullPose,
    getCellWindowKey,
    prefersReducedMotion,
    focusedIdRef,
    focusPhaseRef,
    focusReturnPanActiveRef,
    isDragging,
    isPinching,
    isCoastingRef,
    panVelocityRef,
    targetOffsetRef,
    targetZoomRef,
    touchInertiaFriction,
    touchInertiaMinSpeed,
    touchLerpFactor,
    lerpFactor,
    outerContainerRef,
    viewRef
  ]);

  const syncViewBounds = useCallback(() => {
    const container = outerContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    viewRef.current.left = rect.left;
    viewRef.current.top = rect.top;
    viewRef.current.width = rect.width;
    viewRef.current.height = rect.height;

    onViewBoundsChangeRef.current?.();
  }, [outerContainerRef, viewRef]);

  useEffect(() => {
    // Fallback initial offset — intro snap replaces this when the cluster captures
    if (pendingIntroSnapRef.current) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOffsetX, applyCameraTransform, commitCullPose, getCellWindowKey]);

  // Apply intro camera snap once (introFlush bumps only when capture finishes)
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [syncViewBounds, outerContainerRef]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animateOffset);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animateOffset]);

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
    [clearPointer, resetAllProximity, focusedIdRef, isIntroPlayingRef, suppressClickRef, isCoastingRef, panVelocityRef, isDragging, viewRef]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging.current) return;
      const dx = clientX - lastPosition.current.x;
      const dy = clientY - lastPosition.current.y;
      dragDistanceRef.current += Math.hypot(dx, dy);
      // Mark as pan as soon as we exceed the slop — origin onTap fires on pointerup
      // before touchend, so waiting until handleEnd lets focus steal the gesture.
      if (dragDistanceRef.current > clickDragThresholdPx) {
        suppressClickRef.current = true;
      }
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
    [touchVelocitySmoothing, isDragging, targetOffsetRef, panVelocityRef, touchInertiaEligibleRef, clickDragThresholdPx, suppressClickRef]
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
  }, [
    prefersReducedMotion,
    touchInertiaBoost,
    touchInertiaMinSpeed,
    clickDragThresholdPx,
    isDragging,
    suppressClickRef,
    touchInertiaEligibleRef,
    panVelocityRef,
    isCoastingRef,
    viewRef
  ]);

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
    [handleMove, isDragging, pointerX, pointerY]
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

  const handleZoom = useCallback(
    (zoomPoint: Point, newZoom: number) => {
      const rect = outerContainerRef.current?.getBoundingClientRect();
      if (rect) {
        // Calculate the point in the content space
        const contentPointX = (zoomPoint.x - targetOffsetRef.current.x) / targetZoomRef.current;
        const contentPointY = (zoomPoint.y - targetOffsetRef.current.y) / targetZoomRef.current;

        // Calculate new offset to keep the zoom point stationary
        const newOffsetX = zoomPoint.x - contentPointX * newZoom;
        const newOffsetY = zoomPoint.y - contentPointY * newZoom;

        targetZoomRef.current = newZoom;
        targetOffsetRef.current = { x: newOffsetX, y: newOffsetY };
      }
    },
    [outerContainerRef, targetOffsetRef, targetZoomRef]
  );

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
    [handleZoom, focusedIdRef, isIntroPlayingRef, zoomSpeed, minZoom, maxZoom, targetZoomRef, targetOffsetRef, outerContainerRef]
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
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        pinchStartDistanceRef.current = distance;
        pinchStartZoomRef.current = targetZoomRef.current;
        lastPinchMidRef.current = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
      } else if (e.touches.length === 1) {
        isPinching.current = false;
        isTouchDrag.current = true;
        pinchStartDistanceRef.current = null;
        pinchStartZoomRef.current = null;
        lastPinchZoomPointRef.current = null;
        lastPinchMidRef.current = null;
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleStart, isDragging, isPinching, isCoastingRef, panVelocityRef, touchInertiaEligibleRef, targetZoomRef, viewRef]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      // Don't cancel native scrolling while the focus layer is open
      if (focusedIdRef.current) return;
      // React's onTouchMove is passive — only the native { passive: false } listener
      // can cancel. Guard so a stray passive call never warns.
      const cancelScroll = () => {
        if (e.cancelable) e.preventDefault();
      };
      if (isIntroPlayingRef.current) {
        cancelScroll();
        return;
      }

      cancelScroll();
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

        // Distance-ratio zoom from pinch start — tracks finger spread 1:1, with
        // iOS-style rubberband past min/max (snaps back on release).
        if (
          pinchStartDistanceRef.current !== null &&
          pinchStartDistanceRef.current > 0 &&
          pinchStartZoomRef.current !== null
        ) {
          const scale = distance / pinchStartDistanceRef.current;
          const proposed = pinchStartZoomRef.current * scale;
          const newZoom = prefersReducedMotion
            ? Math.max(minZoom, Math.min(maxZoom, proposed))
            : rubberbandZoom(proposed, minZoom, maxZoom);

          if (newZoom !== targetZoomRef.current) {
            const rect = outerContainerRef.current?.getBoundingClientRect();
            if (rect) {
              const zoomPoint = {
                x: midX - rect.left - window.innerWidth / 2,
                y: midY - rect.top - window.innerHeight / 2
              };
              lastPinchZoomPointRef.current = zoomPoint;
              handleZoom(zoomPoint, newZoom);
            }
          }
        }

        lastPinchMidRef.current = { x: midX, y: midY };
      } else if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [
      handleMove,
      handleZoom,
      focusedIdRef,
      isIntroPlayingRef,
      isPinching,
      isDragging,
      viewRef,
      targetOffsetRef,
      targetZoomRef,
      minZoom,
      maxZoom,
      prefersReducedMotion,
      outerContainerRef
    ]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        // Bounce back to min/max if the pinch rubberbanded past the limit
        const overshot =
          targetZoomRef.current < minZoom - 0.0001 || targetZoomRef.current > maxZoom + 0.0001;
        if (overshot && !prefersReducedMotion) {
          const clamped = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current));
          const zoomPoint = lastPinchZoomPointRef.current ?? { x: 0, y: 0 };
          handleZoom(zoomPoint, clamped);
        } else if (overshot) {
          targetZoomRef.current = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current));
        }

        isPinching.current = false;
        pinchStartDistanceRef.current = null;
        pinchStartZoomRef.current = null;
        lastPinchZoomPointRef.current = null;
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
    [handleEnd, handleStart, handleZoom, isPinching, minZoom, maxZoom, prefersReducedMotion, targetZoomRef]
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
  }, [handleWheel, outerContainerRef]);

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (outerContainer) {
      outerContainer.addEventListener('mousemove', handleMouseMove as unknown as EventListener);
      outerContainer.addEventListener('mouseup', handleEnd);
      outerContainer.addEventListener('mouseleave', handleMouseLeave);
      outerContainer.addEventListener('touchmove', handleTouchMove as unknown as EventListener, { passive: false });
      // touchend/cancel go through React handleTouchEnd so inertia isn't applied twice
    }

    return () => {
      if (outerContainer) {
        outerContainer.removeEventListener('mousemove', handleMouseMove as unknown as EventListener);
        outerContainer.removeEventListener('mouseup', handleEnd);
        outerContainer.removeEventListener('mouseleave', handleMouseLeave);
        outerContainer.removeEventListener('touchmove', handleTouchMove as unknown as EventListener);
      }
    };
  }, [handleMouseMove, handleMouseLeave, handleTouchMove, handleEnd, outerContainerRef]);

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

  return useMemo(
    () => ({
      offset,
      zoom,
      introReady,
      viewRef,
      applyCameraTransform,
      commitCullPose,
      getCellWindowKey,
      getGridItemContentCenter,
      panCameraToContentCenter,
      panCameraToGridItem,
      panCameraToItemId,
      isItemIdOnScreen,
      panCameraToItemIdIfOffscreen,
      shouldReturnFocusToCenter,
      panCameraToFocusReturnSeat,
      updateRecenterVisibilityRef,
      onViewBoundsChangeRef,
      clearPointer,
      registerProximity,
      unregisterProximity,
      resetAllProximity,
      handleMouseDown,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd
    }),
    [
      offset,
      zoom,
      introReady,
      viewRef,
      applyCameraTransform,
      commitCullPose,
      getCellWindowKey,
      getGridItemContentCenter,
      panCameraToContentCenter,
      panCameraToGridItem,
      panCameraToItemId,
      isItemIdOnScreen,
      panCameraToItemIdIfOffscreen,
      shouldReturnFocusToCenter,
      panCameraToFocusReturnSeat,
      clearPointer,
      registerProximity,
      unregisterProximity,
      resetAllProximity,
      handleMouseDown,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd
    ]
  );
};
