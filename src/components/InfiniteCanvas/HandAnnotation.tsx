'use client';

import styles from './HandAnnotation.module.scss';

import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

import cx from 'classnames';
import { useReducedMotion } from 'motion/react';

import {
  FOCUS_COPY_SWIPE_PARALLAX,
  focusSwipeSeatProgress
} from './focus/focusMotion';
import { useFocusSwipeParallax } from './focus/FocusSwipeParallaxContext';

/** neat-annotations direction — arrow points this way toward the target */
export type HandAnnotationDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export type HandAnnotationAnchor = {
  /** 0–1 along target width, or a named edge */
  x?: number | 'left' | 'center' | 'right';
  /** 0–1 along target height, or a named edge */
  y?: number | 'top' | 'center' | 'bottom';
  /** Extra screen-space offset after resolving the anchor point */
  offsetX?: number;
  offsetY?: number;
};

/** Where the tip is allowed to appear */
export type HandAnnotationVisibility = 'desktop' | 'mobile' | 'always';

export type HandAnnotationProps = {
  /** Element to point at (portaled so overflow:hidden parents don't clip) */
  targetRef: RefObject<HTMLElement | null>;
  /** Handwritten label (`data-note`) */
  note: string;
  /** When true, show (and re-enter when it becomes true again) */
  open: boolean;
  direction?: HandAnnotationDirection;
  /** Direction on mobile / coarse pointers; defaults to `se` */
  mobileDirection?: HandAnnotationDirection;
  color?: string;
  /**
   * Where this tip may appear.
   * - `desktop` — desktop / fine pointer only
   * - `mobile` — narrow / coarse pointer only
   * - `always` — both (uses `mobileAnchor` / `mobileDirection` on mobile)
   * @default 'desktop'
   */
  visibility?: HandAnnotationVisibility;
  /** @deprecated Prefer `visibility="desktop"` */
  desktopOnly?: boolean;
  /** Desktop / fine-pointer anchor (default: top-right outside the card) */
  anchor?: HandAnnotationAnchor;
  /**
   * Mobile / coarse-pointer anchor.
   * Defaults to top-center of the card (`HAND_ANNOTATION_MOBILE_ANCHOR`).
   */
  mobileAnchor?: HandAnnotationAnchor;
  rotate?: number;
  labelMaxWidth?: number;
  /** Screen-reader text; defaults to `note` */
  srText?: string;
  className?: string;
  zIndex?: number;
  /** Recompute anchor when this changes (e.g. carousel index) */
  trackKey?: string | number;
  /**
   * Focus-gallery seat for swipe parallax (defaults to `current`).
   * Matches FocusSwipeCopy’s Apple-style offset + fade.
   */
  swipeSide?: 'prev' | 'current' | 'next';
};

/** Declarative tip config — attach to a `Work` so focus cards can opt in */
export type WorkHandAnnotation = {
  note: string;
  srText?: string;
  direction?: HandAnnotationDirection;
  mobileDirection?: HandAnnotationDirection;
  visibility?: HandAnnotationVisibility;
  anchor?: HandAnnotationAnchor;
  mobileAnchor?: HandAnnotationAnchor;
  color?: string;
  rotate?: number;
  labelMaxWidth?: number;
};

const MOBILE_MQ = '(max-width: 480px), (pointer: coarse)';

/** Default mobile placement — centered on the top edge, tip sits just above the card */
export const HAND_ANNOTATION_MOBILE_ANCHOR: HandAnnotationAnchor = {
  x: 'center',
  y: 'top',
  offsetX: -50,
  offsetY: 10
};

const resolveAxis = (
  value: number | 'left' | 'center' | 'right' | 'top' | 'bottom' | undefined,
  size: number,
  named: Record<string, number>
) => {
  if (value == null) return size * 0.5;
  if (typeof value === 'number') return size * value;
  return size * (named[value] ?? 0.5);
};

const useIsHandAnnMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_MQ).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_MQ);
    const apply = () => setIsMobile(mql.matches);
    apply();
    mql.addEventListener?.('change', apply);
    return () => mql.removeEventListener?.('change', apply);
  }, []);
  return isMobile;
};

const copyParallaxX = (side: 'prev' | 'current' | 'next', dragX: number, stride: number) => {
  const w = stride || 1;
  if (side === 'current') return dragX * FOCUS_COPY_SWIPE_PARALLAX;
  if (side === 'next') return (dragX + w) * FOCUS_COPY_SWIPE_PARALLAX;
  return (dragX - w) * FOCUS_COPY_SWIPE_PARALLAX;
};

/**
 * Reusable neat-annotations tip — portals beside a target, draws in on open,
 * fades out on close. Pair with `@/styles/neat-annotations.css`.
 *
 * On mobile focus swipe, follows the card and applies the same copy parallax
 * as `FocusSwipeCopy` when `FocusSwipeParallaxContext` is active.
 *
 * @see https://github.com/syabro/neat-annotations
 */
export const HandAnnotation = ({
  targetRef,
  note,
  open,
  direction = 'sw',
  mobileDirection,
  color = '#5c5346',
  visibility,
  desktopOnly = false,
  anchor = { x: 'right', y: 'top', offsetX: -28, offsetY: -18 },
  mobileAnchor,
  rotate = -6,
  labelMaxWidth = 150,
  srText,
  className,
  zIndex = 11050,
  trackKey,
  swipeSide = 'current'
}: HandAnnotationProps) => {
  const reduceMotion = useReducedMotion();
  const isMobile = useIsHandAnnMobile();
  const swipe = useFocusSwipeParallax();
  const portalRef = useRef<HTMLSpanElement | null>(null);
  const resolvedVisibility: HandAnnotationVisibility = desktopOnly
    ? 'desktop'
    : (visibility ?? 'desktop');
  const allowed =
    resolvedVisibility === 'always' ||
    (resolvedVisibility === 'desktop' && !isMobile) ||
    (resolvedVisibility === 'mobile' && isMobile);

  const activeAnchor = isMobile ? (mobileAnchor ?? HAND_ANNOTATION_MOBILE_ANCHOR) : anchor;
  /** Top-of-card tips default to `se` on mobile */
  const activeDirection = isMobile ? (mobileDirection ?? 'se') : direction;

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'entered' | 'leaving'>('hidden');

  const show = open && allowed;

  // Open → measure + enter; close → leave fade then hide
  useEffect(() => {
    if (show) return;
    setPhase((prev) => (prev === 'entered' ? 'leaving' : 'hidden'));
  }, [show]);

  useEffect(() => {
    if (phase !== 'leaving' || show) return;
    const ms = reduceMotion ? 0 : 280;
    const id = window.setTimeout(() => {
      setPhase('hidden');
      setPos(null);
    }, ms);
    return () => window.clearTimeout(id);
  }, [phase, show, reduceMotion]);

  // Track target every frame so tips follow swipe transforms; add copy parallax on mobile
  useEffect(() => {
    if (!show) return;

    let raf = 0;
    let entered = false;
    let enterTimer = 0;

    const apply = () => {
      const el = targetRef.current;
      if (!el) {
        raf = requestAnimationFrame(apply);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) {
        raf = requestAnimationFrame(apply);
        return;
      }
      const x = resolveAxis(activeAnchor.x, r.width, { left: 0, center: 0.5, right: 1 });
      const y = resolveAxis(activeAnchor.y, r.height, { top: 0, center: 0.5, bottom: 1 });
      let top = r.top + y + (activeAnchor.offsetY ?? 0);
      let left = r.left + x + (activeAnchor.offsetX ?? 0);
      let opacity = 1;

      const useSwipeParallax = Boolean(isMobile && swipe?.active && !reduceMotion);
      if (useSwipeParallax && swipe) {
        const drag = swipe.dragX.get();
        left += copyParallaxX(swipeSide, drag, swipe.panelStride);
        opacity = focusSwipeSeatProgress(swipeSide, drag, swipe.panelStride);
      }

      const node = portalRef.current;
      if (node) {
        node.style.top = `${top}px`;
        node.style.left = `${left}px`;
        node.style.opacity = String(opacity);
      } else {
        setPos({ top, left });
      }

      if (!entered) {
        entered = true;
        enterTimer = window.setTimeout(() => setPhase('entered'), reduceMotion ? 0 : 40);
      }

      raf = requestAnimationFrame(apply);
    };

    raf = requestAnimationFrame(apply);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(enterTimer);
    };
  }, [
    show,
    targetRef,
    activeAnchor.x,
    activeAnchor.y,
    activeAnchor.offsetX,
    activeAnchor.offsetY,
    trackKey,
    reduceMotion,
    isMobile,
    swipe,
    swipeSide
  ]);

  const visible = show || phase === 'leaving';
  if (!visible || !pos || typeof document === 'undefined') return null;

  const a11y = srText ?? note;

  return (
    <>
      {a11y ? <span className={styles.srOnly}>{a11y}</span> : null}
      {createPortal(
        <span
          ref={portalRef}
          className={cx(
            'ann',
            `ann-${activeDirection}`,
            'ann-no-mark',
            styles.portal,
            phase === 'entered' && styles.entered,
            phase === 'leaving' && styles.leaving,
            reduceMotion && styles.reduceMotion,
            className
          )}
          data-note={note}
          style={
            {
              top: pos.top,
              left: pos.left,
              zIndex,
              '--ann-font': "'Shantell Sans', cursive",
              '--ann-color': color,
              '--ann-label-max-width': `${labelMaxWidth}px`,
              '--ann-rotate': `${rotate}deg`,
              '--ann-target-gap': '10px',
              '--ann-label-gap': '8px',
              '--ann-text-x': '10px',
              '--ann-text-y': '-6px',
              '--ann-arrow-y': '-6px'
            } as CSSProperties
          }
          aria-hidden
        />,
        document.body
      )}
    </>
  );
};
