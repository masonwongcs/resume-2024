/** Shared active cover between grid face + focus banner (survives remount). */
let activeIndex = 2;
const indexListeners = new Set<(index: number) => void>();

/** Vinyl playing — pauses Cover Flow auto-advance while true. */
let vinylPlaying = false;
const playingListeners = new Set<(playing: boolean) => void>();

/** Desktop Cover Flow Y-flip — external playlist overlay over the active cover. */
let coverFlipped = false;
const flipListeners = new Set<(flipped: boolean) => void>();

export type ListeningFlipRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** Screen-space morph: cover rect → full playlist panel (document.body portal). */
export type ListeningFlipOverlayRect = {
  from: ListeningFlipRect;
  to: ListeningFlipRect;
};

let flipOverlayRect: ListeningFlipOverlayRect | null = null;
const flipOverlayListeners = new Set<(rect: ListeningFlipOverlayRect | null) => void>();

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

export const getListeningCoverFlipped = () => coverFlipped;

export const setListeningCoverFlipped = (flipped: boolean) => {
  if (flipped === coverFlipped) return;
  coverFlipped = flipped;
  flipListeners.forEach((listener) => listener(flipped));
};

export const toggleListeningCoverFlipped = () => {
  setListeningCoverFlipped(!coverFlipped);
};

export const subscribeListeningCoverFlipped = (listener: (flipped: boolean) => void) => {
  flipListeners.add(listener);
  return () => {
    flipListeners.delete(listener);
  };
};

export const getListeningFlipOverlayRect = () => flipOverlayRect;

export const setListeningFlipOverlayRect = (rect: ListeningFlipOverlayRect | null) => {
  flipOverlayRect = rect;
  flipOverlayListeners.forEach((listener) => listener(rect));
};

export const clearListeningFlipOverlayRect = () => {
  if (flipOverlayRect == null) return;
  flipOverlayRect = null;
  flipOverlayListeners.forEach((listener) => listener(null));
};

export const subscribeListeningFlipOverlayRect = (
  listener: (rect: ListeningFlipOverlayRect | null) => void
) => {
  flipOverlayListeners.add(listener);
  return () => {
    flipOverlayListeners.delete(listener);
  };
};

/** Ask the playlist overlay to play its close morph (instead of hard-unmounting). */
let closeRequest = 0;
const closeRequestListeners = new Set<(token: number) => void>();
let playlistClosing = false;

export const getListeningPlaylistClosing = () => playlistClosing;

export const setListeningPlaylistClosing = (closing: boolean) => {
  playlistClosing = closing;
};

export const requestListeningPlaylistClose = () => {
  if (!coverFlipped || playlistClosing) return;
  closeRequest += 1;
  closeRequestListeners.forEach((listener) => listener(closeRequest));
};

export const subscribeListeningPlaylistClose = (listener: (token: number) => void) => {
  closeRequestListeners.add(listener);
  return () => {
    closeRequestListeners.delete(listener);
  };
};
