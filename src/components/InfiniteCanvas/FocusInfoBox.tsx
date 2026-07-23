'use client';

import styles from './FocusInfoBox.module.scss';

import type { ReactNode } from 'react';

type FocusInfoBoxProps = {
  children: ReactNode;
  /** Optional eyebrow above the message (e.g. "Tip") */
  label?: string;
  /** Hide on narrow / touch viewports — for desktop-only Cover Flow hints */
  desktopOnly?: boolean;
  className?: string;
};

const InfoIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M12 10.75v5.5M12 7.75h.01"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

/** Shared callout for Infinite Canvas focus descriptions. */
export const FocusInfoBox = ({
  children,
  label = 'Tip',
  desktopOnly = false,
  className
}: FocusInfoBoxProps) => {
  const rootClass = [
    styles.infoBox,
    desktopOnly ? styles.desktopOnly : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={rootClass} role="note">
      <InfoIcon />
      <div className={styles.body}>
        {label ? <span className={styles.label}>{label}</span> : null}
        {typeof children === 'string' || typeof children === 'number' ? (
          <p className={styles.text}>{children}</p>
        ) : (
          children
        )}
      </div>
    </aside>
  );
};
