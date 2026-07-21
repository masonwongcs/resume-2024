/** Matches .infiniteCanvasFocusDetail width — focused card scales to this */
export const FOCUS_DETAIL_MAX_WIDTH = 600;
export const FOCUS_DETAIL_MAX_WIDTH_XL = 700;
/** Must match .infiniteCanvasFocusScrollInner mobile side padding */
export const FOCUS_MOBILE_SIDE_PAD = 24;

export const CARD_BORDER_RADIUS_RATIO = 20 / (1440 / 4.6);

export const getFocusDetailWidth = (viewportWidth: number) => {
  // Must match .infiniteCanvasFocusDetail / wrap padding
  if (viewportWidth <= 480) {
    return viewportWidth - FOCUS_MOBILE_SIDE_PAD * 2;
  }
  const maxWidth = viewportWidth >= 1920 ? FOCUS_DETAIL_MAX_WIDTH_XL : FOCUS_DETAIL_MAX_WIDTH;
  return Math.min(viewportWidth * 0.92, maxWidth);
};

/** Cell size from the live viewport — matches InfiniteCanvas render formulas */
export const getLiveCellMetrics = () => {
  const isMobile = window.innerWidth <= 480;
  const cellWidth = isMobile ? window.innerWidth / 2.3 : window.innerWidth / 4.6;
  return {
    cellWidth,
    cellHeight: (cellWidth * 3) / 5,
    gapSize: isMobile ? window.innerWidth / 8 : window.innerWidth / 24
  };
};

export const computeFocusLayout = (
  view: { width: number; height: number; offsetX: number; offsetY: number; zoom: number },
  cellWidth: number,
  cellHeight: number
) => {
  const detailWidth = getFocusDetailWidth(view.width);
  // screenWidth = cellWidth * zoom * cardScale → match detail column
  const cardScale = detailWidth / (cellWidth * view.zoom);
  const scaledScreenHeight = cellHeight * view.zoom * cardScale;
  // Mobile: fixed inset for scroll room. Desktop: % of viewport height.
  const cardTopScreenY = view.width <= 480 ? 100 : view.height * 0.15;
  const cardCenterScreenY = cardTopScreenY + scaledScreenHeight / 2;
  const contentCenterX = view.width / 2 - view.offsetX / view.zoom;
  const contentCenterY = view.height / 2 + (cardCenterScreenY - view.height / 2 - view.offsetY) / view.zoom;
  const pushDistance = (Math.hypot(view.width, view.height) / view.zoom) * 1.2;
  return {
    contentCenterX,
    contentCenterY,
    cardScale,
    detailWidth,
    scaledScreenHeight,
    cardTopScreenY,
    pushDistance
  };
};
