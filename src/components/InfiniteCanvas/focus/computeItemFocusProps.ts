import { seededRandom } from '../grid/gridMath';
import type { InfiniteCanvasFocusMode } from '../InfiniteCanvasItem';
import type { FocusPhase, FocusSnapshot, GridItem, PeerReturnStagger } from '../types';
import {
  FOCUS_EXIT_SCALE,
  FOCUS_PEER_RETURN_BASE_S,
  FOCUS_PEER_RETURN_JITTER_S,
  FOCUS_PEER_RETURN_RIPPLE_S
} from './focusMotion';

export type ItemFocusProps = {
  focusMode: InfiniteCanvasFocusMode;
  focusX: number;
  focusY: number;
  focusScale: number;
  focusOpacity: number;
  focusImmediate: boolean;
  focusReturnDelay: number;
};

type ComputeItemFocusPropsArgs = {
  item: GridItem & { x: number; y: number };
  position: { x: number; y: number };
  focusedId: string | null;
  focusSnapshot: FocusSnapshot | null;
  focusPhase: FocusPhase | null;
  isFocusReturning: boolean;
  isFocusSettled: boolean;
  isFocusHandingOff: boolean;
  morphCardHidden: boolean;
  focusNavPrevId: string | null;
  originSwipeSlot: 'prev' | 'current' | 'next' | null;
  showFocusSwipePeeks: boolean;
  releaseFocusPeers: boolean;
  staggerMode: PeerReturnStagger;
  introDelayForId: number;
  peerReturnMaxDist: number;
  cellWidth: number;
  cellHeight: number;
  focusReturnToCenter: boolean;
  snapFocusLayout: boolean;
  seedFactor: number;
};

/** Per-item focus animation target — mirrors InfiniteCanvas's render-time focus branch. */
export const computeItemFocusProps = ({
  item,
  position,
  focusedId,
  focusSnapshot,
  focusPhase,
  isFocusReturning,
  isFocusSettled,
  isFocusHandingOff,
  morphCardHidden,
  focusNavPrevId,
  originSwipeSlot,
  showFocusSwipePeeks,
  releaseFocusPeers,
  staggerMode,
  introDelayForId,
  peerReturnMaxDist,
  cellWidth,
  cellHeight,
  focusReturnToCenter,
  snapFocusLayout,
  seedFactor
}: ComputeItemFocusPropsArgs): ItemFocusProps => {
  let focusMode: InfiniteCanvasFocusMode = 'idle';
  let focusX = position.x;
  let focusY = position.y;
  let focusScale = 1;
  let focusOpacity = 1;
  let focusImmediate = false;
  let focusReturnDelay = 0;

  if (!(focusedId && focusSnapshot && focusPhase)) {
    return { focusMode, focusX, focusY, focusScale, focusOpacity, focusImmediate, focusReturnDelay };
  }

  if (item.id === focusedId) {
    if (isFocusReturning) {
      if (focusReturnToCenter) {
        // Far-off seat: dissolve at the focus center instead of flying across the grid
        focusMode = 'returning';
        focusX = focusSnapshot.contentCenterX - cellWidth / 2;
        focusY = focusSnapshot.contentCenterY - cellHeight / 2;
        focusScale = FOCUS_EXIT_SCALE;
        focusOpacity = 0;
        focusImmediate = false;
      } else {
        // Card springs home first; peers stay exited until this completes
        focusMode = 'returning';
        focusX = position.x;
        focusY = position.y;
        focusScale = 1;
        focusOpacity = 1;
        focusImmediate = false;
      }
    } else {
      focusMode = 'focused';
      focusX = focusSnapshot.contentCenterX - cellWidth / 2;
      focusY = focusSnapshot.contentCenterY - cellHeight / 2;
      focusScale = focusSnapshot.cardScale;
      // Origin: live morph stays up while Hello is focused (slides with the seat)
      focusOpacity = item.isOriginCard ? 1 : morphCardHidden ? 0 : 1;
      // Instant opacity only for handoff hide/show — never on morph-in (skips enter)
      // Also snap on viewport resize / gallery swap so morph tracks the HTML overlay
      focusImmediate =
        snapFocusLayout ||
        isFocusHandingOff ||
        (morphCardHidden && isFocusSettled && !item.isOriginCard) ||
        (isFocusSettled && Boolean(focusNavPrevId));
    }
  } else if (item.isOriginCard && focusSnapshot && (originSwipeSlot === 'prev' || originSwipeSlot === 'next')) {
    // Ride with the peek as the live Hello face — no static-image blink on land
    focusMode = 'focused';
    focusX = focusSnapshot.contentCenterX - cellWidth / 2;
    focusY = focusSnapshot.contentCenterY - cellHeight / 2;
    focusScale = focusSnapshot.cardScale;
    focusOpacity = showFocusSwipePeeks ? 1 : 0;
    focusImmediate = true;
  } else if (releaseFocusPeers && isFocusReturning) {
    // Peers released early — fall through to idle so peer-return springs run
    focusMode = 'idle';
  } else {
    focusMode = 'exiting';
    const cx = position.x + cellWidth / 2;
    const cy = position.y + cellHeight / 2;
    // Push away from the clicked card, not the focus destination
    let dx = cx - focusSnapshot.originCenterX;
    let dy = cy - focusSnapshot.originCenterY;
    const distFromOrigin = Math.hypot(dx, dy) || 1;
    dx /= distFromOrigin;
    dy /= distFromOrigin;
    focusX = position.x + dx * focusSnapshot.pushDistance;
    focusY = position.y + dy * focusSnapshot.pushDistance;
    focusScale = FOCUS_EXIT_SCALE;
    focusOpacity = 0;
    // Previous gallery seat + Hello: snap out. Hello especially must not
    // spring from the focus/peek seat to exit after peeks unmount (blink).
    focusImmediate = item.id === focusNavPrevId || Boolean(item.isOriginCard);
    if (staggerMode === 'legacy') {
      // Original: reuse intro spread delays
      focusReturnDelay = introDelayForId;
    } else {
      // Inside-out: nearest peers first — same stagger for exit + return
      const t = Math.min(1, distFromOrigin / peerReturnMaxDist);
      const seed = item.x * 12.9898 + item.y * 78.233 + item.id.length * 3.17;
      focusReturnDelay =
        FOCUS_PEER_RETURN_BASE_S + t * FOCUS_PEER_RETURN_RIPPLE_S + seededRandom(seed + 1, seedFactor) * FOCUS_PEER_RETURN_JITTER_S;
    }
  }

  return { focusMode, focusX, focusY, focusScale, focusOpacity, focusImmediate, focusReturnDelay };
};
