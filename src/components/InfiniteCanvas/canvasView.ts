/** Shared canvas transform used to map content-space coords → client coords without layout reads. */
export interface InfiniteCanvasViewState {
  offsetX: number;
  offsetY: number;
  zoom: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** True while the user is dragging/panning the canvas */
  isDragging: boolean;
}

export const createCanvasViewState = (): InfiniteCanvasViewState => ({
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  isDragging: false
});

/**
 * Maps a point in content space (item layout coords) to client/screen coordinates.
 * Matches `transform: translate3d(offset) scale(zoom)` with default origin at the container center.
 */
export const contentToClient = (
  contentX: number,
  contentY: number,
  view: InfiniteCanvasViewState
): { x: number; y: number } => {
  const { offsetX, offsetY, zoom, left, top, width, height } = view;
  return {
    x: (contentX - width / 2) * zoom + width / 2 + offsetX + left,
    y: (contentY - height / 2) * zoom + height / 2 + offsetY + top
  };
};

/** Inverse of contentToClient — screen/client → content-space layout coords. */
export const clientToContent = (
  clientX: number,
  clientY: number,
  view: InfiniteCanvasViewState
): { x: number; y: number } => {
  const { offsetX, offsetY, zoom, left, top, width, height } = view;
  const z = zoom || 1;
  return {
    x: (clientX - left - offsetX - width / 2) / z + width / 2,
    y: (clientY - top - offsetY - height / 2) / z + height / 2
  };
};

export type ProximityFrameHandler = (
  pointerX: number,
  pointerY: number,
  view: InfiniteCanvasViewState
) => void;

export type ProximityResetHandler = (immediate?: boolean) => void;
