/** Shared active cover between grid face + focus banner (survives remount). */
let activeIndex = 2;
const indexListeners = new Set<(index: number) => void>();

/** Vinyl playing — pauses Cover Flow auto-advance while true. */
let vinylPlaying = false;
const playingListeners = new Set<(playing: boolean) => void>();

const clampCoverIndex = (index: number, length = Number.POSITIVE_INFINITY) => {
  if (!Number.isFinite(index)) return 0;
  const max = Number.isFinite(length) ? Math.max(length - 1, 0) : Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(Math.round(index), 0), max);
};

export const getListeningCoverIndex = () => activeIndex;

export const setListeningCoverIndex = (index: number, length?: number) => {
  const next = clampCoverIndex(index, length);
  if (next === activeIndex) return;
  activeIndex = next;
  indexListeners.forEach((listener) => listener(next));
};

export const subscribeListeningCoverIndex = (listener: (index: number) => void) => {
  indexListeners.add(listener);
  return () => {
    indexListeners.delete(listener);
  };
};

export const getListeningVinylPlaying = () => vinylPlaying;

export const setListeningVinylPlaying = (playing: boolean) => {
  if (playing === vinylPlaying) return;
  vinylPlaying = playing;
  playingListeners.forEach((listener) => listener(playing));
};

export const subscribeListeningVinylPlaying = (listener: (playing: boolean) => void) => {
  playingListeners.add(listener);
  return () => {
    playingListeners.delete(listener);
  };
};
