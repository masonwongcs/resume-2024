'use client';

import styles from './HandAnnotation.module.scss';

import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useState
} from 'react';
import { createPortal } from 'react-dom';

import cx from 'classnames';
import { useReducedMotion } from 'motion/react';

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

export type HandAnnotationProps = {
  /** Element to point at (portaled so overflow:hidden parents don't clip) */
  targetRef: RefObject<HTMLElement | null>;
  /** Handwritten label (`data-note`) */
  note: string;
  /** When true, show (and re-enter when it becomes true again) */
  open: boolean;
  direction?: HandAnnotationDirection;
  color?: string;
  /** Hide on narrow / coarse pointers */
  desktopOnly?: boolean;
  anchor?: HandAnnotationAnchor;
  rotate?: number;
  labelMaxWidth?: number;
  /** Screen-reader text; defaults to `note` */
  srText?: string;
  className?: string;
  zIndex?: number;
  /** Recompute anchor when this changes (e.g. carousel index) */
  trackKey?: string | number;
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

/**
 * Reusable neat-annotations tip — portals beside a target, draws in on open,
 * fades out on close. Pair with `@/styles/neat-annotations.css`.
 *
 * @see https://github.com/syabro/neat-annotations
 */
export const HandAnnotation = ({
  targetRef,
  note,
  open,
  direction = 'sw',
  color = '#5c5346',
  desktopOnly = false,
  anchor = { x: 'right', y: 'top', offsetX: -28, offsetY: -18 },
  rotate = -6,
  labelMaxWidth = 150,
  srText,
  className,
  zIndex = 11050,
  trackKey
}: HandAnnotationProps) => {
  const reduceMotion = useReducedMotion();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'entered' | 'leaving'>('hidden');

  // Open → measure + enter; close → leave fade then hide
  useEffect(() => {
    if (open) return;
    setPhase((prev) => (prev === 'entered' ? 'leaving' : 'hidden'));
  }, [open]);

  useEffect(() => {
    if (phase !== 'leaving' || open) return;
    const ms = reduceMotion ? 0 : 280;
    const id = window.setTimeout(() => {
      setPhase('hidden');
      setPos(null);
    }, ms);
    return () => window.clearTimeout(id);
  }, [phase, open, reduceMotion]);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const el = targetRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      const x = resolveAxis(anchor.x, r.width, { left: 0, center: 0.5, right: 1 });
      const y = resolveAxis(anchor.y, r.height, { top: 0, center: 0.5, bottom: 1 });
      setPos({
        top: r.top + y + (anchor.offsetY ?? 0),
        left: r.left + x + (anchor.offsetX ?? 0)
      });
    };

    update();
    const enterId = window.setTimeout(() => setPhase('entered'), reduceMotion ? 0 : 40);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearTimeout(enterId);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, targetRef, anchor.x, anchor.y, anchor.offsetX, anchor.offsetY, trackKey, reduceMotion]);

  const visible = open || phase === 'leaving';
  if (!visible || !pos || typeof document === 'undefined') return null;

  const a11y = srText ?? note;

  return (
    <>
      {a11y ? <span className={styles.srOnly}>{a11y}</span> : null}
      {createPortal(
        <span
          className={cx(
            'ann',
            `ann-${direction}`,
            'ann-no-mark',
            styles.portal,
            desktopOnly && styles.desktopOnly,
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
