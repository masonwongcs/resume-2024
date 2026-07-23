import type { MutableRefObject, ReactNode } from 'react';

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
  /** Config id when this seat is a pinned custom card (not origin) */
  customCardId?: string;
}

export type PeerReturnStagger = 'legacy' | 'focus';

/** Shared props for any custom card face on the canvas */
export type CustomCardRenderProps = {
  width: number;
  height: number;
  /**
   * False while the card is still in the pre-stack pill pose.
   * Used to hold animated faces until the card is actually visible.
   */
  active?: boolean;
  /** Open focus mode — wired by InfiniteCanvas (portaled content does not bubble clicks) */
  onActivate?: () => void;
  /** True while this card is open in focus mode */
  inFocus?: boolean;
};

export type CustomCardFocusContentProps = {
  work: Work;
  /** True once the focus morph has settled — use for enter-only tips / animations */
  isFocusSettled?: boolean;
};

/**
 * Reusable custom card config — grid face + optional focus-only easter egg.
 * Origin is the first placement; more seats can reuse this later.
 */
export interface CustomCardConfig {
  /** Stable id for this custom card instance */
  id: string;
  /** Focus overlay metadata; optional poster via image/thumbnail for stack silhouette */
  work: Work;
  /** Grid face. Omit to use the work image like a normal tile. */
  render?: (props: CustomCardRenderProps) => ReactNode;
  /**
   * Focus-only content rendered under (or with) the description.
   * Use for easter eggs — music, photos, notes — without changing the grid face.
   */
  renderFocusContent?: (props: CustomCardFocusContentProps) => ReactNode;
  /**
   * Replaces the focus card hero image (`infiniteCanvasFocusCardImage`).
   * Use for custom banners (e.g. Cover Flow) without changing the grid face
   * or the focus-content easter egg below the description.
   */
  renderFocusBanner?: (props: CustomCardFocusContentProps) => ReactNode;
  /** Open the focus overlay on click. Defaults to true. */
  focusable?: boolean;
  /**
   * Pin strategy.
   * - `random` (default) — stable seeded seat away from origin
   * - `origin` — reserved for the Hello card via `originCard` prop
   */
  placement?: 'random' | 'origin';
}

export type OriginCardRenderProps = CustomCardRenderProps & {
  /** Shared marquee offset — survives grid ↔ focus portal handoff */
  marqueeState?: MutableRefObject<MarqueePersistedState>;
};

/**
 * One-shot custom card pinned to the intro origin (viewport center / top of stack).
 * Never tiled elsewhere in the infinite grid.
 */
export interface OriginCardConfig extends Omit<CustomCardConfig, 'id' | 'render' | 'placement'> {
  /** Focus overlay metadata; optional poster via image/thumbnail for stack silhouette */
  work: Work;
  render: (props: OriginCardRenderProps) => ReactNode;
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
  /**
   * Extra pinned custom cards (random seats by default).
   * Each may supply a grid `render` face and/or focus-only `renderFocusContent`.
   */
  customCards?: CustomCardConfig[];
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
