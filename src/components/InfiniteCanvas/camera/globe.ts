import type { InfiniteCanvasViewState } from './canvasView';

/** 0 = flat grid, 1 = fully curved globe. Driven by the camera while the user drags. */
export type GlobeFrameHandler = (bend: number, view: InfiniteCanvasViewState) => void;

/** Screen-px camera distance for the globe projection */
const GLOBE_PERSPECTIVE = 1000;
/** How far the viewport center bulges toward the viewer at full bend (screen px) */
const GLOBE_BULGE = 170;
/**
 * Bulge falls to zero this far from the viewport center (× half-diagonal).
 * Past it cards stay flat — Z never goes negative, so cards only ever move
 * outward on screen and the drag can't pull culled overscan into view.
 */
const GLOBE_FALLOFF = 1.25;
/** Peak opacity loss for cards rolling over the globe's shoulder (at full bend) */
const GLOBE_EDGE_FADE = 0.35;

export interface GlobeStyle {
  transform: string;
  opacity: string;
}

const FLAT: GlobeStyle = { transform: '', opacity: '' };

/**
 * Pose for a card whose content-space center lands at client (cx, cy).
 * Empty strings when flat so the card drops its 3D layer.
 */
export const getGlobeStyle = (
  cx: number,
  cy: number,
  view: InfiniteCanvasViewState,
  bend: number
): GlobeStyle => {
  if (bend <= 0.001 || view.width <= 0 || view.height <= 0) return FLAT;

  const dx = cx - (view.left + view.width / 2);
  const dy = cy - (view.top + view.height / 2);
  const falloff = Math.hypot(view.width, view.height) * 0.5 * GLOBE_FALLOFF;
  const f2 = falloff * falloff;
  const u2 = (dx * dx + dy * dy) / f2;
  if (u2 >= 1) return FLAT;

  // z = A(1 − u²)² — height, tilt and fade all reach zero at the falloff edge
  const amp = GLOBE_BULGE * bend;
  const rim = 1 - u2;
  const z = amp * rim * rim;
  // Tilt along the surface tangent so cards face outward like tiles on a sphere
  const slope = (4 * amp * rim) / f2;
  const rotateY = Math.atan(slope * dx);
  const rotateX = -Math.atan(slope * dy);
  // Strongest around the viewport edges (u² ≈ 0.5), back to 1 at center and falloff
  const fade = GLOBE_EDGE_FADE * bend * 4 * u2 * rim;

  // Card lives inside the camera's scale(zoom) — express screen px in local units,
  // and shift the perspective origin from the card center to the viewport center.
  const zoom = view.zoom || 1;
  const lx = dx / zoom;
  const ly = dy / zoom;
  return {
    transform:
      `translate(${-lx}px, ${-ly}px) perspective(${GLOBE_PERSPECTIVE / zoom}px) ` +
      `translate3d(${lx}px, ${ly}px, ${z / zoom}px) rotateY(${rotateY}rad) rotateX(${rotateX}rad)`,
    opacity: fade > 0.002 ? (1 - fade).toFixed(3) : ''
  };
};
