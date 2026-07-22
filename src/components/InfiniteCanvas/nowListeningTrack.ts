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
  /** Soft wash tint for the focus player card (hand-picked) */
  accentColor: string;
  /** Optional second tint for dual-tone washes (blue/green, silver/gold, etc.) */
  accentColorSecondary?: string;
  /** Chromatic covers stay strong; black/grey covers use a quieter wash */
  washStrength: 'strong' | 'soft';
};

type AlbumAccent = {
  primary: string;
  secondary?: string;
  washStrength?: 'strong' | 'soft';
};

/** Curated accents from cover vibe — closest match per album */
const ALBUM_ACCENTS: Record<number, AlbumAccent> = {
  // Cigarettes After Sex — cool silver hint (not dark grey flood)
  1217977525: { primary: '#9aa3ad', washStrength: 'soft' },
  // Abbey Road — blue sky + green trees
  1474815798: { primary: '#3b6ea5', secondary: '#4a7c59', washStrength: 'strong' },
  // Dark Side of the Moon — quiet silver (artwork owns the prism)
  1065973699: { primary: '#9aa3ad', washStrength: 'soft' },
  // The Wall — brick red + white
  1065975633: { primary: '#c62828', secondary: '#e8e4dc', washStrength: 'strong' },
  // Random Access Memories — silver-blue + gold helmet
  617154241: { primary: '#8fa3b8', secondary: '#c9a227', washStrength: 'strong' }
};

/** Baked from iTunes lookup — five albums with per-track preview URLs */
export const NOW_LISTENING_LIBRARY: NowListeningAlbum[] = (
  libraryJson as Omit<NowListeningAlbum, 'accentColor' | 'accentColorSecondary' | 'washStrength'>[]
).map((album) => {
  const accents = ALBUM_ACCENTS[album.collectionId] ?? { primary: '#6b6b6e' };
  return {
    ...album,
    accentColor: accents.primary,
    washStrength: accents.washStrength ?? 'strong',
    ...(accents.secondary ? { accentColorSecondary: accents.secondary } : {})
  };
});

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
