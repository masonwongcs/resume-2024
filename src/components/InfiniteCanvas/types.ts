import type { ReactNode } from 'react';

import type { MarqueePersistedState } from '@/components/CurvedLoop';

export interface Work {
  name: string;
  url?: string;
  image: string;
  video?: string;
  thumbnail?: string;
  description: ReactNode;
}

export interface GridItem {
  id: string;
  work: Work;
  offsetX: number;
  offsetY: number;
  /** True for the one-shot custom center card */
  isOriginCard?: boolean;
}

export type PeerReturnStagger = 'legacy' | 'focus';

export type OriginCardRenderProps = {
  width: number;
  height: number;
  /**
   * False while the origin card is still in the pre-stack pill pose.
   * Used to hold the marquee on "Hi" until the card is actually visible.
   */
  active?: boolean;
  /** Open focus mode — wired by InfiniteCanvas (portaled content does not bubble clicks) */
  onActivate?: () => void;
  /** Shared marquee offset — survives grid ↔ focus portal handoff */
  marqueeState?: React.MutableRefObject<MarqueePersistedState>;
  /** True while the origin card is open in focus mode */
  inFocus?: boolean;
};

/**
 * One-shot custom card pinned to the intro origin (viewport center / top of stack).
 * Never tiled elsewhere in the infinite grid.
 */
export interface OriginCardConfig {
  /** Focus overlay metadata; optional poster via image/thumbnail for stack silhouette */
  work: Work;
  render: (props: OriginCardRenderProps) => React.ReactNode;
  /** Open the focus overlay on click. Defaults to true. */
  focusable?: boolean;
}

export interface InfiniteCanvasProps {
  works: Work[];
  /**
   * How surrounding cards stagger back in after focus closes.
   * Defaults to `focus` on mobile, `legacy` on desktop.
   * - `legacy` — original intro delays (distance from load-time center)
   * - `focus` — ripple from the clicked card
   */
  peerReturnStagger?: PeerReturnStagger;
  /** Custom React face for the middle / top-of-stack card (appears once) */
  originCard?: OriginCardConfig;
  /** Fired when the "Back to start" control should show/hide (render outside the masked canvas) */
  onRecenterAvailabilityChange?: (visible: boolean) => void;
  /** Parent assigns click handler for the external recenter control */
  recenterActionRef?: React.MutableRefObject<(() => void) | null>;
}

export interface FocusSnapshot {
  /** Morph destination (focus layout position) in content space */
  contentCenterX: number;
  contentCenterY: number;
  /** Clicked card center — peers spread from / return toward this point */
  originCenterX: number;
  originCenterY: number;
  pushDistance: number;
  /** Scale so on-screen card width matches the detail text column */
  cardScale: number;
  detailWidth: number;
  scaledScreenHeight: number;
  cardTopScreenY: number;
}

/** Morph canvas → swap to HTML → reverse handoff → card home → peers home */
export type FocusPhase = 'in' | 'settled' | 'out' | 'returning';
