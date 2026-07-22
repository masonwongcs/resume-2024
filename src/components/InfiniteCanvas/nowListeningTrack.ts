import libraryJson from './nowListeningLibrary.json';

export const PREVIEW_DURATION_MS = 12000;

export type NowListeningTrack = {
  trackId: number;
  title: string;
  trackNumber: number;
  discNumber: number;
  previewUrl: string;
  trackViewUrl: string;
};

export type NowListeningAlbum = {
  collectionId: number;
  title: string;
  artist: string;
  artworkUrl: string;
  albumViewUrl: string;
  tracks: NowListeningTrack[];
};

/** Baked from iTunes lookup — five albums with per-track preview URLs */
export const NOW_LISTENING_LIBRARY = libraryJson as NowListeningAlbum[];

/** Featured album (front of stack / initial focus) — Dark Side of the Moon */
export const FEATURED_ALBUM = NOW_LISTENING_LIBRARY[2]!;

/** @deprecated Prefer FEATURED_ALBUM / library — kept for older imports */
export const NOW_LISTENING_TRACK = {
  trackId: FEATURED_ALBUM.tracks.find((t) => t.title === 'Time')?.trackId ?? FEATURED_ALBUM.tracks[0]!.trackId,
  title: 'Time',
  artist: FEATURED_ALBUM.artist,
  album: FEATURED_ALBUM.title,
  previewUrl: FEATURED_ALBUM.tracks.find((t) => t.title === 'Time')?.previewUrl ?? FEATURED_ALBUM.tracks[0]!.previewUrl,
  artworkUrl: FEATURED_ALBUM.artworkUrl,
  trackViewUrl: FEATURED_ALBUM.tracks.find((t) => t.title === 'Time')?.trackViewUrl ?? FEATURED_ALBUM.albumViewUrl,
  previewDurationMs: PREVIEW_DURATION_MS
} as const;

export type NowListeningTrackLegacy = typeof NOW_LISTENING_TRACK;
