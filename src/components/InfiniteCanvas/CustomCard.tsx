'use client';

import styles from './CustomCard.module.scss';

import React from 'react';

import cx from 'classnames';

export type CustomCardProps = {
  children?: React.ReactNode;
  className?: string;
  /** Optional full-bleed background image */
  image?: string;
  /** Open focus when the face is tapped (portaled faces need this) */
  onActivate?: () => void;
  'aria-label'?: string;
};

/**
 * Generic canvas card face shell — full-bleed media and/or custom children.
 * Reuse for music, photos, notes, etc. without new grid plumbing.
 */
export const CustomCard = ({
  children,
  className,
  image,
  onActivate,
  'aria-label': ariaLabel
}: CustomCardProps) => {
  return (
    <div
      className={cx(styles.customCard, className)}
      aria-label={ariaLabel}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onActivate}
      // Named faces need a non-generic role — bare `div` + `aria-label` fails a11y audits
      role={onActivate ? 'button' : ariaLabel ? 'group' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
    >
      {image ? (
        <img className={styles.customCardImage} src={image} alt="" draggable={false} decoding="async" />
      ) : null}
      {children}
    </div>
  );
};

export type CustomCardFocusSlotProps = {
  children: React.ReactNode;
  /** Small eyebrow above the slot (e.g. "Now listening") */
  label?: string;
  className?: string;
};

/**
 * Focus-overlay easter-egg region — sits under the normal description.
 * Swap children later for music / experience / photos without touching canvas math.
 */
export const CustomCardFocusSlot = ({ children, label, className }: CustomCardFocusSlotProps) => {
  return (
    <aside className={cx(styles.focusSlot, className)}>
      {label ? <p className={styles.focusSlotLabel}>{label}</p> : null}
      <div className={styles.focusSlotBody}>{children}</div>
    </aside>
  );
};
