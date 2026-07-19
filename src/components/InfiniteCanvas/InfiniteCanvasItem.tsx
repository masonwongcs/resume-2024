'use client';

import styles from './InfiniteCanvasItem.module.scss';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions
} from 'motion/react';

import { useImageLoad } from '@/hooks/useImageLoad';

import {
  contentToClient,
  type InfiniteCanvasViewState,
  type ProximityFrameHandler,
  type ProximityResetHandler
} from './canvasView';

interface Work {
  name: string;
  url?: string;
  image: string;
  video?: string;
  thumbnail?: string;
  description: string;
}

export interface InfiniteCanvasItemIntro {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  delay: number;
  opacity: number;
  zIndex: number;
}

export type InfiniteCanvasFocusMode = 'idle' | 'focused' | 'exiting' | 'returning';

export interface ProximityRegistration {
  onFrame: ProximityFrameHandler;
  onReset: ProximityResetHandler;
}

interface InfiniteCanvasItemProps {
  id: string;
  work: Work;
  x: number;
  y: number;
  width: number;
  height: number;
  intro?: InfiniteCanvasItemIntro;
  /** When false, intro items stay clustered until the spread is triggered */
  shouldSpread?: boolean;
  /** Live canvas transform — read from refs, never triggers React renders */
  viewRef: React.RefObject<InfiniteCanvasViewState>;
  /** Gate effects during intro / reduced-capability contexts */
  proximityEnabled?: boolean;
  focusMode?: InfiniteCanvasFocusMode;
  /** Content-space animation target when focusing / exiting */
  focusX?: number;
  focusY?: number;
  focusScale?: number;
  focusOpacity?: number;
  /** Skip spring and jump to focus targets (handoff frames) */
  focusImmediate?: boolean;
  /** Stagger delay (seconds) when exiting / returning from focus */
  focusReturnDelay?: number;
  /** Register/unregister with the canvas's single proximity rAF */
  registerProximity?: (id: string, handlers: ProximityRegistration) => void;
  unregisterProximity?: (id: string) => void;
  onSelect: (id: string, work: Work) => void;
  onIntroComplete?: (id: string) => void;
  /** Fired once when the focus morph spring settles */
  onFocusArrive?: (id: string) => void;
  /** Fired once when the focus card has sprung back to its grid home */
  onFocusReturnComplete?: (id: string) => void;
}

const springValues: SpringOptions = {
  damping: 30,
  stiffness: 100,
  mass: 2
};

const proximitySpringValues: SpringOptions = {
  // Overdamped — critical is ~2*sqrt(stiffness*mass); underdamping reads as a heartbeat
  damping: 36,
  stiffness: 160,
  mass: 1
};

const focusSpring = {
  type: 'spring' as const,
  stiffness: 150,
  damping: 22,
  mass: 0.85
};

/** Soft spring so peers drift out / back in readably */
const exitSpring = {
  type: 'spring' as const,
  stiffness: 48,
  damping: 22,
  mass: 1.15
};

const peerReturnSpring = {
  type: 'spring' as const,
  stiffness: 120,
  damping: 22,
  mass: 0.9
};

const ROTATE_AMPLITUDE = 8;
const SCALE_ON_PROXIMITY = 1.1;
const PROXIMITY_RADIUS_FACTOR = 2.1;
const MAGNET_STRENGTH = 10;
const IMAGE_PARALLAX = 4;
const CARD_BORDER_RADIUS_RATIO = 20 / (1440 / 4.6);
const CARD_SHADOW_SRC = '/images/shadow.webp';
const SHADOW_REST_Y = 0;
const SHADOW_REST_OPACITY = 0;
const SHADOW_MAX_OPACITY = 0.5;
const SHADOW_REST_SCALE = 0.96;
const SHADOW_MAX_SCALE = 1.03;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const setMotion = (value: MotionValue<number>, next: number, immediate?: boolean) => {
  if (immediate && typeof (value as MotionValue<number> & { jump?: (v: number) => void }).jump === 'function') {
    (value as MotionValue<number> & { jump: (v: number) => void }).jump(next);
    return;
  }
  value.set(next);
};

const InfiniteCanvasItemComponent: React.FC<InfiniteCanvasItemProps> = ({
  id,
  work,
  x,
  y,
  width,
  height,
  intro,
  shouldSpread = true,
  viewRef,
  proximityEnabled = true,
  focusMode = 'idle',
  focusX,
  focusY,
  focusScale = 1,
  focusOpacity = 1,
  focusImmediate = false,
  focusReturnDelay = 0,
  registerProximity,
  unregisterProximity,
  onSelect,
  onIntroComplete,
  onFocusArrive,
  onFocusReturnComplete
}) => {
  const isLoaded = useImageLoad(work.image);
  const itemRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  // Gate 3D tilt/shine by pointer capability — NOT viewport width.
  // max-width was incorrectly killing desktop tilt in narrow windows / side panels.
  const [isTouchUi] = useState(
    () =>
      typeof window !== 'undefined' &&
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
  const shouldPlayIntro = Boolean(intro) && !prefersReducedMotion;
  const isClustered = shouldPlayIntro && !shouldSpread;
  const isFocusing = focusMode !== 'idle';
  const canUseProximity = useRef(false);
  const isClusteredRef = useRef(isClustered);
  const proximityEnabledRef = useRef(proximityEnabled && !isFocusing);
  const proximityEngagedRef = useRef(false);
  const isPointerOverRef = useRef(false);
  const focusArrivedRef = useRef(false);
  const focusReturnedRef = useRef(false);
  const prevFocusModeRef = useRef(focusMode);
  const peerReturnActiveRef = useRef(false);
  const peerReturnDelayRef = useRef(0);
  const [peerPaintHidden, setPeerPaintHidden] = useState(false);
  const layoutRef = useRef({ x, y, width, height });
  const baseZIndex = intro?.zIndex ?? 0;
  const baseZIndexRef = useRef(baseZIndex);

  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, proximitySpringValues);
  const magnetX = useSpring(0, proximitySpringValues);
  const magnetY = useSpring(0, proximitySpringValues);
  const proximity = useSpring(0, proximitySpringValues);
  const zIndex = useMotionValue(baseZIndex);
  const shineX = useSpring(50, springValues);
  const shineY = useSpring(50, springValues);
  const shineOpacity = useSpring(0, springValues);
  const angle = useSpring(useMotionValue(180), springValues);
  const imageX = useSpring(0, springValues);
  const imageY = useSpring(0, springValues);
  const shadowX = useSpring(0, proximitySpringValues);
  const shadowY = useSpring(SHADOW_REST_Y, proximitySpringValues);
  const shadowOpacity = useSpring(SHADOW_REST_OPACITY, proximitySpringValues);
  const shadowScale = useSpring(SHADOW_REST_SCALE, proximitySpringValues);

  const borderGlow = useTransform(proximity, (p) => String(p));

  useEffect(() => {
    layoutRef.current = { x, y, width, height };
  }, [x, y, width, height]);

  useEffect(() => {
    baseZIndexRef.current = baseZIndex;
    if (!isFocusing) {
      zIndex.set(baseZIndex);
    }
  }, [baseZIndex, zIndex, isFocusing]);

  useEffect(() => {
    proximityEnabledRef.current = proximityEnabled && !isFocusing;
  }, [proximityEnabled, isFocusing]);

  useEffect(() => {
    isClusteredRef.current = isClustered;
  }, [isClustered]);

  useEffect(() => {
    canUseProximity.current =
      !prefersReducedMotion &&
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, [prefersReducedMotion]);

  const resetProximity = useCallback(
    (immediate?: boolean) => {
      proximityEngagedRef.current = false;
      setMotion(scale, 1, immediate);
      setMotion(magnetX, 0, immediate);
      setMotion(magnetY, 0, immediate);
      setMotion(proximity, 0, immediate);
      setMotion(shadowX, 0, immediate);
      setMotion(shadowY, SHADOW_REST_Y, immediate);
      setMotion(shadowOpacity, SHADOW_REST_OPACITY, immediate);
      setMotion(shadowScale, SHADOW_REST_SCALE, immediate);
      if (!isPointerOverRef.current) {
        setMotion(shineOpacity, 0, immediate);
      }
      if (!isFocusing) {
        zIndex.set(baseZIndexRef.current);
      }
    },
    [scale, magnetX, magnetY, proximity, shadowX, shadowY, shadowOpacity, shadowScale, shineOpacity, zIndex, isFocusing]
  );

  useEffect(() => {
    if (isFocusing) {
      resetProximity(true);
      rotateX.set(0);
      rotateY.set(0);
      imageX.set(0);
      imageY.set(0);
      shineOpacity.set(0);
      if (focusMode === 'focused' || focusMode === 'returning') {
        zIndex.set(1000);
      } else {
        zIndex.set(0);
      }
    }
  }, [
    isFocusing,
    focusMode,
    resetProximity,
    rotateX,
    rotateY,
    imageX,
    imageY,
    shineOpacity,
    zIndex
  ]);

  const onProximityFrame = useCallback<ProximityFrameHandler>(
    (px, py, view) => {
      if (!canUseProximity.current || isClusteredRef.current || !proximityEnabledRef.current) {
        return;
      }

      const { x: contentX, y: contentY, width: w, height: h } = layoutRef.current;
      const center = contentToClient(contentX + w / 2, contentY + h / 2, view);
      const screenW = w * view.zoom;
      const screenH = h * view.zoom;

      const dx = px - center.x;
      const dy = py - center.y;
      const distance = Math.hypot(dx, dy);
      const radius = (Math.max(screenW, screenH) / 2) * PROXIMITY_RADIUS_FACTOR;
      const nextProximity = smoothstep(Math.max(0, 1 - distance / radius));

      if (nextProximity <= 0 && !proximityEngagedRef.current) {
        return;
      }

      if (nextProximity <= 0) {
        resetProximity();
        return;
      }

      proximityEngagedRef.current = true;
      proximity.set(nextProximity);
      scale.set(1 + nextProximity * (SCALE_ON_PROXIMITY - 1));

      // Unit vector from center → pointer (stable when dx≈0, unlike atan2 flips)
      const dist = Math.max(distance, 1);
      const pull = nextProximity * MAGNET_STRENGTH;
      const nextMagnetX = (dx / dist) * pull;
      const nextMagnetY = (dy / dist) * pull;
      magnetX.set(nextMagnetX);
      magnetY.set(nextMagnetY);

      shadowX.set(nextMagnetX * 0.2);
      shadowY.set(SHADOW_REST_Y + nextProximity * 3);
      shadowOpacity.set(SHADOW_REST_OPACITY + nextProximity * (SHADOW_MAX_OPACITY - SHADOW_REST_OPACITY));
      shadowScale.set(SHADOW_REST_SCALE + nextProximity * (SHADOW_MAX_SCALE - SHADOW_REST_SCALE));

      if (!isPointerOverRef.current) {
        shineOpacity.set(nextProximity * 0.55);
        shineX.set(50 + (dx / (screenW / 2 || 1)) * 28);
        shineY.set(50 + (dy / (screenH / 2 || 1)) * 28);
        angle.set((Math.atan2(dx, -dy) * 180) / Math.PI);
      }

      // Don't mutate z-index every frame — discrete steps reorder neighbors and look like bouncing
    },
    [
      resetProximity,
      proximity,
      scale,
      magnetX,
      magnetY,
      shadowX,
      shadowY,
      shadowOpacity,
      shadowScale,
      shineOpacity,
      shineX,
      shineY,
      angle
    ]
  );

  useEffect(() => {
    if (!registerProximity || !unregisterProximity) return;

    registerProximity(id, {
      onFrame: onProximityFrame,
      onReset: resetProximity
    });

    return () => unregisterProximity(id);
  }, [id, registerProximity, unregisterProximity, onProximityFrame, resetProximity]);

  useEffect(() => {
    if ((isClustered || !proximityEnabled || isFocusing) && proximityEngagedRef.current) {
      resetProximity(true);
    }
  }, [isClustered, proximityEnabled, isFocusing, resetProximity]);

  // Kill hover tilt during intro / focus — cards sit under the cursor at load and were tilting early
  useEffect(() => {
    if (isClustered || !proximityEnabled || isFocusing) {
      isPointerOverRef.current = false;
      rotateX.set(0);
      rotateY.set(0);
      angle.set(180);
      imageX.set(0);
      imageY.set(0);
      shineOpacity.set(0);
    }
  }, [
    isClustered,
    proximityEnabled,
    isFocusing,
    rotateX,
    rotateY,
    angle,
    imageX,
    imageY,
    shineOpacity
  ]);

  // Cards already at their home pose (e.g. center origin) never animate, so
  // onAnimationComplete never fires — report intro done immediately on spread.
  useEffect(() => {
    if (!shouldPlayIntro || !intro || !shouldSpread || isFocusing) return;
    const atHome =
      Math.abs(intro.x - x) < 1 &&
      Math.abs(intro.y - y) < 1 &&
      Math.abs(intro.rotate) < 0.5 &&
      Math.abs((intro.scale ?? 1) - 1) < 0.01;
    if (atHome) {
      onIntroComplete?.(id);
    }
  }, [shouldPlayIntro, intro, shouldSpread, isFocusing, x, y, id, onIntroComplete]);

  const borderGradientAngle = useTransform([rotateX, rotateY], ([rx, ry]: number[]) => {
    const tiltAngle = (Math.atan2(ry, rx) * 180) / Math.PI;
    let normalized = (tiltAngle + 135) % 360;
    if (normalized < 0) normalized += 360;
    return `${normalized}deg`;
  });

  const shineBackground = useTransform([shineX, shineY, rotateX, rotateY], ([sx, sy, rx, ry]: number[]) => {
    const rotXRad = (rx * Math.PI) / 180;
    const rotYRad = (ry * Math.PI) / 180;

    const adjustedX = sx + Math.sin(rotYRad) * 10;
    const adjustedY = sy + Math.sin(rotXRad) * 10;

    const absRotX = Math.abs(rx);
    const absRotY = Math.abs(ry);
    const maxRotation = Math.max(absRotX, absRotY);
    const normalizedTilt = maxRotation / ROTATE_AMPLITUDE;
    const intensity = 1.0 - normalizedTilt * 0.6;

    const baseSize = 150;
    const scaleX = baseSize * (1 + Math.abs(Math.sin(rotYRad)) * 0.3);
    const scaleY = baseSize * (1 + Math.abs(Math.sin(rotXRad)) * 0.3);

    return `radial-gradient(ellipse ${scaleX}% ${scaleY}% at ${adjustedX}% ${adjustedY}%, rgba(255, 255, 255, ${0.14 * intensity}), transparent 70%)`;
  });

  const shineRotation = useTransform(angle, (a: number) => `${a}deg`);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isFocusing || isClusteredRef.current || !proximityEnabledRef.current) return;

      const layout = layoutRef.current;
      const view = viewRef.current;
      let screenW = layout.width;
      let screenH = layout.height;
      let centerX: number;
      let centerY: number;

      if (view && view.width > 0) {
        const center = contentToClient(layout.x + layout.width / 2, layout.y + layout.height / 2, view);
        centerX = center.x;
        centerY = center.y;
        screenW = layout.width * view.zoom;
        screenH = layout.height * view.zoom;
      } else if (itemRef.current) {
        const rect = itemRef.current.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        screenW = rect.width;
        screenH = rect.height;
      } else {
        return;
      }

      const offsetX = e.clientX - centerX;
      const offsetY = e.clientY - centerY;
      const halfW = screenW / 2 || 1;
      const halfH = screenH / 2 || 1;

      rotateX.set((offsetY / halfH) * -ROTATE_AMPLITUDE);
      rotateY.set((offsetX / halfW) * ROTATE_AMPLITUDE);
      angle.set((Math.atan2(e.clientX - centerX, -(e.clientY - centerY)) * 180) / Math.PI);
      shineX.set(((e.clientX - (centerX - halfW)) / screenW) * 100);
      shineY.set(((e.clientY - (centerY - halfH)) / screenH) * 100);
      imageX.set((offsetX / halfW) * -IMAGE_PARALLAX);
      imageY.set((offsetY / halfH) * -IMAGE_PARALLAX);
    },
    [rotateX, rotateY, angle, shineX, shineY, imageX, imageY, viewRef, isFocusing]
  );

  const handleMouseEnter = useCallback(() => {
    if (isFocusing || isClusteredRef.current || !proximityEnabledRef.current) return;
    isPointerOverRef.current = true;
    shineOpacity.set(1);
    zIndex.set(baseZIndexRef.current + 50);
  }, [shineOpacity, isFocusing, zIndex]);

  const handleMouseLeave = useCallback(() => {
    isPointerOverRef.current = false;
    rotateX.set(0);
    rotateY.set(0);
    angle.set(180);
    imageX.set(0);
    imageY.set(0);
    shineOpacity.set(proximity.get() * 0.55);
    if (!isFocusing) {
      zIndex.set(baseZIndexRef.current);
    }
  }, [rotateX, rotateY, angle, imageX, imageY, shineOpacity, proximity, zIndex, isFocusing]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (focusMode === 'focused' || focusMode === 'exiting' || focusMode === 'returning') return;
      onSelect(id, work);
    },
    [onSelect, id, work, focusMode]
  );

  useEffect(() => {
    if (focusMode !== 'focused') {
      focusArrivedRef.current = false;
    }
    if (focusMode !== 'returning') {
      focusReturnedRef.current = false;
    }
  }, [focusMode]);

  useEffect(() => {
    if (focusMode === 'exiting') {
      setPeerPaintHidden(false);
    }
  }, [focusMode]);

  const cardBorderRadius = width * CARD_BORDER_RADIUS_RATIO;
  // Capture stagger while exited so it survives the clearFocus → idle frame
  if (focusMode === 'exiting') {
    peerReturnDelayRef.current = focusReturnDelay;
  }
  if (prevFocusModeRef.current === 'exiting' && focusMode === 'idle') {
    peerReturnActiveRef.current = true;
  }
  if (focusMode === 'exiting' || focusMode === 'focused' || focusMode === 'returning') {
    peerReturnActiveRef.current = false;
  }
  prevFocusModeRef.current = focusMode;

  const animateState = (() => {
    if (isClustered && intro) {
      return { x: intro.x, y: intro.y, rotate: intro.rotate, scale: intro.scale, opacity: intro.opacity };
    }
    if (isFocusing) {
      return {
        x: focusX ?? x,
        y: focusY ?? y,
        rotate: 0,
        scale: focusScale,
        opacity: focusOpacity
      };
    }
    return { x, y, rotate: 0, scale: 1, opacity: 1 };
  })();

  const transition =
    shouldPlayIntro && intro && shouldSpread && !isFocusing && focusMode === 'idle' && !peerReturnActiveRef.current
      ? {
          type: 'spring' as const,
          stiffness: 82,
          damping: 16,
          mass: 0.95,
          delay: intro.delay
        }
      : focusImmediate
        ? { duration: 0 }
        : focusMode === 'exiting'
          ? exitSpring
          : peerReturnActiveRef.current
            ? { ...peerReturnSpring, delay: peerReturnDelayRef.current }
            : isFocusing || focusMode === 'focused' || focusMode === 'returning'
              ? focusSpring
              : {
                  // Soft opacity enter when culled cards remount; keep spring for transform
                  ...focusSpring,
                  opacity: { type: 'tween' as const, duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                };

  return (
    <motion.div
      ref={itemRef}
      className={styles.infiniteCanvasItem}
      data-focus={focusMode}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      initial={
        shouldPlayIntro && intro
          ? { x: intro.x, y: intro.y, rotate: intro.rotate, scale: intro.scale, opacity: intro.opacity }
          : // Soft fade when culled cards remount into view (skip hard pop)
            { x, y, rotate: 0, scale: 1, opacity: 0 }
      }
      animate={animateState}
      transition={transition}
      onAnimationComplete={() => {
        if (shouldPlayIntro && shouldSpread && !isFocusing) {
          onIntroComplete?.(id);
        }
        if (focusMode === 'focused' && focusOpacity > 0.99 && !focusArrivedRef.current) {
          focusArrivedRef.current = true;
          onFocusArrive?.(id);
        }
        if (focusMode === 'returning' && !focusReturnedRef.current) {
          focusReturnedRef.current = true;
          onFocusReturnComplete?.(id);
        }
        if (focusMode === 'exiting') {
          setPeerPaintHidden(true);
        }
        if (peerReturnActiveRef.current && focusMode === 'idle') {
          peerReturnActiveRef.current = false;
        }
      }}
      style={{
        width,
        height,
        zIndex,
        // Drop compositor layers when idle — permanent willChange on every card is expensive
        willChange:
          focusMode !== 'idle' || peerReturnActiveRef.current ? 'transform, opacity' : undefined,
        pointerEvents:
          focusMode === 'exiting' || focusMode === 'returning' || focusOpacity < 0.01 ? 'none' : 'auto',
        cursor: focusMode === 'focused' ? 'default' : undefined,
        // Hide focused morph during HTML handoff; drop exited peers from paint once faded
        visibility:
          (focusMode === 'focused' && focusOpacity < 0.01) ||
          (focusMode === 'exiting' && peerPaintHidden)
            ? 'hidden'
            : 'visible'
      }}
    >
      <div
        className={styles.infiniteCanvasItemBackground}
        style={{
          opacity: isLoaded ? 0 : 1
        }}
      />
      {!isTouchUi && (
        <motion.img
          className={styles.infiniteCanvasItemShadow}
          src={CARD_SHADOW_SRC}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            x: shadowX,
            y: shadowY,
            scale: shadowScale,
            opacity: shadowOpacity
          }}
        />
      )}
      <motion.div
        className={styles.infiniteCanvasItemInner}
        style={{
          x: isTouchUi ? 0 : magnetX,
          y: isTouchUi ? 0 : magnetY,
          rotateX: isTouchUi ? 0 : rotateX,
          rotateY: isTouchUi ? 0 : rotateY,
          scale: isFocusing || isTouchUi ? 1 : scale,
          transformStyle: isTouchUi ? undefined : 'preserve-3d',
          width: '100%',
          height: '100%',
          ['--card-border-radius' as string]: `${cardBorderRadius}px`,
          ['--card-border-gradiet-angle' as string]: borderGradientAngle,
          ['--card-border-glow' as string]: borderGlow
        }}
      >
        <motion.img
          className={styles.infiniteCanvasItemImage}
          src={work?.thumbnail ? work?.thumbnail : work.image}
          alt={work.name}
          style={{
            opacity: isLoaded ? 1 : 0,
            x: isTouchUi ? 0 : imageX,
            y: isTouchUi ? 0 : imageY,
            scale: 1.08
          }}
          decoding="async"
          loading="lazy"
        />
        {!isTouchUi && (
          <motion.div
            className={styles.infiniteCanvasItemShine}
            style={{
              background: shineBackground,
              opacity: shineOpacity,
              pointerEvents: 'none',
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
              rotate: shineRotation
            }}
          />
        )}
      </motion.div>
    </motion.div>
  );
};

export const InfiniteCanvasItem = React.memo(InfiniteCanvasItemComponent);
