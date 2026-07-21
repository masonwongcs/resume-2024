'use client';

import styles from './VinylListening.module.scss';

import { useCallback, useEffect, useRef, useState } from 'react';

import cx from 'classnames';
import { motion, useReducedMotion } from 'motion/react';

import { CoverFlow } from './CoverFlow';
import { CustomCard } from './CustomCard';
import {
  getListeningCoverIndex,
  getListeningVinylPlaying,
  setListeningCoverIndex,
  setListeningVinylPlaying,
  subscribeListeningCoverIndex,
  subscribeListeningVinylPlaying
} from './listeningCoverFlowState';
import {
  FEATURED_ALBUM,
  NOW_LISTENING_LIBRARY,
  type NowListeningAlbum,
  type NowListeningTrack,
  PREVIEW_DURATION_MS
} from './nowListeningTrack';
import type { CustomCardConfig, CustomCardFocusContentProps, CustomCardRenderProps, Work } from './types';

const library = NOW_LISTENING_LIBRARY;
const defaultAlbum = FEATURED_ALBUM;
const defaultTrack = defaultAlbum.tracks.find((t) => t.title === 'Time') ?? defaultAlbum.tracks[0]!;

const COVER_FLOW_ITEMS = library.map((album) => ({
  id: album.collectionId,
  image: album.artworkUrl,
  title: album.artist,
  subtitle: album.title.replace(/ \(.*\)$/, '')
}));

/** Layout is authored at cell size — focus CSS-scales the same box (origin-card pattern). */
const COVER_FLOW_LAYOUT = {
  itemWidth: 180,
  itemHeight: 180,
  stackSpacing: 64,
  centerGap: 160,
  rotation: 50,
  fitRatio: 0.4,
  /** Keep sleeves compact on narrow / coarse viewports */
  mobileFitRatio: 0.25
} as const;

/** Dwell between auto-advances on the grid face (ms). */
const COVER_FLOW_AUTO_ADVANCE_MS = 16000;

const useListeningCoverIndex = () => {
  const [index, setIndex] = useState(getListeningCoverIndex);
  useEffect(() => subscribeListeningCoverIndex(setIndex), []);
  return index;
};

const useListeningVinylPlaying = () => {
  const [playing, setPlaying] = useState(getListeningVinylPlaying);
  useEffect(() => subscribeListeningVinylPlaying(setPlaying), []);
  return playing;
};

/** Metadata for the listening custom card (focus morph uses featured album art) */
export const LISTENING_CUSTOM_WORK: Work = {
  name: 'Now listening',
  image: defaultAlbum.artworkUrl,
  description: (
    <p>
      My current playlist is a mix of timeless classics and modern favorites that span different genres and eras. I
      enjoy music that creates a strong atmosphere, whether it is reflective, energetic, or simply easy to get lost in.
      The collection reflects a balance of familiar albums, newer discoveries, and artists whose music I keep coming
      back to.
    </p>
  )
  // description: <p>A small shelf of records — {library.map((a) => a.title.replace(/ \(.*\)$/, '')).join(', ')}.</p>
};

/** Grid face — compact Cover Flow fan (non-interactive; card click opens focus) */
export const ListeningCardFace = ({ onActivate, inFocus }: CustomCardRenderProps) => {
  const coverIndex = useListeningCoverIndex();
  const vinylPlaying = useListeningVinylPlaying();

  return (
    <CustomCard
      className={styles.sleeveFace}
      onActivate={onActivate}
      aria-label={`Now listening — ${defaultAlbum.title}`}
    >
      <div className={styles.coverFlowSlot} aria-hidden>
        <CoverFlow
          items={COVER_FLOW_ITEMS}
          {...COVER_FLOW_LAYOUT}
          initialIndex={coverIndex}
          onIndexChange={setListeningCoverIndex}
          enableReflection
          enableClickToSnap={false}
          enableScroll={false}
          showCaption={false}
          autoAdvanceMs={inFocus || vinylPlaying ? undefined : COVER_FLOW_AUTO_ADVANCE_MS}
          className={styles.coverFlowEmbedded}
        />
      </div>
    </CustomCard>
  );
};

/** Focus hero — fills the morph card; same fitRatio as grid (no CSS scale — that flattens 3D) */
export const ListeningFocusBanner = (_props: CustomCardFocusContentProps) => {
  const coverIndex = useListeningCoverIndex();
  const active = COVER_FLOW_ITEMS[coverIndex] ?? COVER_FLOW_ITEMS[0];

  return (
    <div className={styles.coverFlowBannerSlot}>
      <CoverFlow
        items={COVER_FLOW_ITEMS}
        {...COVER_FLOW_LAYOUT}
        initialIndex={coverIndex}
        onIndexChange={setListeningCoverIndex}
        enableReflection
        enableClickToSnap
        enableScroll
        showCaption={false}
        className={styles.coverFlowEmbedded}
      />
      {active ? (
        <div className={styles.coverFlowBannerCaption}>
          <p className={styles.coverFlowBannerTitle}>{active.title}</p>
          {active.subtitle ? <p className={styles.coverFlowBannerSubtitle}>{active.subtitle}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

/**
 * Focus easter egg — album stack, tracklist, Apple previews.
 */
export const VinylFocusPlayer = () => {
  const reduceMotion = useReducedMotion();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const startAlbum = library[getListeningCoverIndex()] ?? defaultAlbum;
  const startTrack =
    startAlbum.collectionId === defaultAlbum.collectionId ? defaultTrack : (startAlbum.tracks[0] ?? defaultTrack);

  const albumRef = useRef(startAlbum);
  const trackRef = useRef(startTrack);
  const playTrackRef = useRef<
    (album: NowListeningAlbum, track: NowListeningTrack, opts?: { softStart?: boolean }) => Promise<void>
  >(async () => undefined);

  const [album, setAlbum] = useState(startAlbum);
  const [track, setTrack] = useState(startTrack);
  const [playing, setPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [hovered, setHovered] = useState(false);

  const clearFade = () => {
    if (fadeRafRef.current) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
  };

  const clearStopTimer = () => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  };

  const fadeTo = useCallback((audio: HTMLAudioElement, target: number, ms: number) => {
    return new Promise<void>((resolve) => {
      clearFade();
      const start = performance.now();
      const from = audio.volume;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        audio.volume = from + (target - from) * t;
        if (t < 1) {
          fadeRafRef.current = requestAnimationFrame(tick);
        } else {
          fadeRafRef.current = null;
          resolve();
        }
      };
      fadeRafRef.current = requestAnimationFrame(tick);
    });
  }, []);

  const playTrack = useCallback(
    async (
      nextAlbum: NowListeningAlbum,
      nextTrack: NowListeningTrack,
      opts?: { softStart?: boolean; syncCover?: boolean }
    ) => {
      albumRef.current = nextAlbum;
      trackRef.current = nextTrack;
      setAlbum(nextAlbum);
      setTrack(nextTrack);

      // Only flip Cover Flow on explicit user album picks — not auto-next while playing
      if (opts?.syncCover) {
        const coverIdx = library.findIndex((a) => a.collectionId === nextAlbum.collectionId);
        if (coverIdx >= 0) setListeningCoverIndex(coverIdx);
      }

      clearStopTimer();
      clearFade();

      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        audioRef.current = audio;
      }

      audio.pause();
      audio.src = nextTrack.previewUrl;
      audio.volume = opts?.softStart ? 0 : 0.85;

      try {
        await audio.play();
        setPlaying(true);
        setListeningVinylPlaying(true);
        setNeedsGesture(false);
        if (opts?.softStart) {
          await fadeTo(audio, 0.85, 450);
        }
        stopTimerRef.current = window.setTimeout(() => {
          void fadeTo(audio!, 0, 450).then(() => {
            const currentAlbum = albumRef.current;
            const currentTrack = trackRef.current;
            const trackIndex = currentAlbum.tracks.findIndex((t) => t.trackId === currentTrack.trackId);
            const nextInAlbum = currentAlbum.tracks[trackIndex + 1];
            if (nextInAlbum) {
              void playTrackRef.current(currentAlbum, nextInAlbum);
              return;
            }
            const albumIndex = library.findIndex((a) => a.collectionId === currentAlbum.collectionId);
            const following = library[(albumIndex + 1) % library.length]!;
            void playTrackRef.current(following, following.tracks[0]!);
          });
        }, PREVIEW_DURATION_MS);
      } catch {
        setNeedsGesture(true);
        setPlaying(false);
        setListeningVinylPlaying(false);
      }
    },
    [fadeTo]
  );

  playTrackRef.current = playTrack;

  // Auto-start the album currently showing in Cover Flow
  useEffect(() => {
    const coverAlbum = library[getListeningCoverIndex()] ?? defaultAlbum;
    const coverTrack =
      coverAlbum.collectionId === defaultAlbum.collectionId ? defaultTrack : (coverAlbum.tracks[0] ?? defaultTrack);
    void playTrack(coverAlbum, coverTrack, { softStart: true });
    return () => {
      clearStopTimer();
      clearFade();
      setListeningVinylPlaying(false);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cover Flow snap / drag → play that album (cover already on this index)
  useEffect(() => {
    return subscribeListeningCoverIndex((index) => {
      const next = library[index];
      if (!next || next.collectionId === albumRef.current.collectionId) return;
      void playTrackRef.current(next, next.tracks[0]!);
    });
  }, []);

  const handleAlbumSelect = (next: NowListeningAlbum) => {
    if (next.collectionId === album.collectionId) return;
    const first = next.tracks[0]!;
    void playTrack(next, first, { syncCover: true });
  };

  const handleTrackSelect = (next: NowListeningTrack) => {
    void playTrack(album, next);
  };

  const handlePlayClick = () => {
    const audio = audioRef.current;
    if (playing && audio && !audio.paused) {
      audio.pause();
      setPlaying(false);
      setListeningVinylPlaying(false);
      clearStopTimer();
      return;
    }
    void playTrack(album, track);
  };

  const appleHref = track.trackViewUrl || album.albumViewUrl;
  const artistShort = album.artist;
  const trackLabel = `[${artistShort.toUpperCase()} - ${track.title.toUpperCase()}]`;
  const vinylOpen = playing || hovered;

  return (
    <aside className={styles.lofiPlayer}>
      {/*<p className={styles.lofiEyebrow}>[CURRENTLY ON REPEAT]</p>*/}

      <div
        className={styles.lofiStage}
        data-open={vinylOpen ? 'true' : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <motion.div
          className={styles.lofiRig}
          initial={false}
          animate={vinylOpen ? { left: 0, x: 0 } : { left: '50%', x: '-50%' }}
          transition={{ type: 'spring', stiffness: 150, damping: 22 }}
        >
          <motion.div
            className={styles.lofiVinyl}
            initial={false}
            animate={{ x: vinylOpen ? '62%' : '6%' }}
            transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          >
            <motion.div
              className={styles.lofiVinylDisc}
              animate={{ rotate: playing && !reduceMotion ? 360 : 0 }}
              transition={
                playing && !reduceMotion
                  ? { duration: 4.5, ease: 'linear', repeat: Infinity }
                  : { duration: 0.45, ease: 'easeOut' }
              }
            >
              <img
                className={styles.lofiVinylLabel}
                src={album.artworkUrl}
                alt=""
                draggable={false}
                decoding="async"
                aria-hidden
              />
              <div className={styles.lofiVinylHole} aria-hidden />
            </motion.div>
            <button
              type="button"
              className={styles.lofiPlay}
              aria-label={playing ? 'Pause preview' : 'Play preview'}
              onClick={handlePlayClick}
            >
              {playing ? (
                <span className={styles.lofiPauseIcon} aria-hidden />
              ) : (
                <span className={styles.lofiPlayIcon} aria-hidden />
              )}
            </button>
          </motion.div>

          <div className={styles.lofiSleeve}>
            <img
              className={styles.lofiSleeveImg}
              src={album.artworkUrl}
              alt={`${album.title} cover`}
              draggable={false}
              decoding="async"
            />
            <div className={styles.lofiSleeveSheen} aria-hidden />
          </div>
        </motion.div>
      </div>

      <p className={styles.lofiTrack}>{trackLabel}</p>

      {needsGesture ? (
        <button type="button" className={styles.lofiGesture} onClick={handlePlayClick}>
          [TAP TO PLAY PREVIEW]
        </button>
      ) : null}

      <div className={styles.albumStrip} role="listbox" aria-label="Albums">
        {library.map((item) => (
          <button
            key={item.collectionId}
            type="button"
            role="option"
            aria-selected={item.collectionId === album.collectionId}
            className={cx(styles.albumThumb, {
              [styles.albumThumbActive]: item.collectionId === album.collectionId
            })}
            onClick={() => handleAlbumSelect(item)}
            title={`${item.artist} — ${item.title}`}
          >
            <img src={item.artworkUrl} alt="" draggable={false} decoding="async" />
          </button>
        ))}
      </div>

      <ol className={styles.trackList} aria-label={`${album.title} tracklist`}>
        {album.tracks.map((item) => {
          const active = item.trackId === track.trackId;
          return (
            <li key={item.trackId}>
              <button
                type="button"
                className={cx(styles.trackRow, { [styles.trackRowActive]: active })}
                onClick={() => handleTrackSelect(item)}
                aria-current={active ? 'true' : undefined}
              >
                <span className={styles.trackNum}>{item.trackNumber}</span>
                <span className={styles.trackName}>{item.title}</span>
                {active && playing ? (
                  <span className={styles.trackPlaying} aria-hidden>
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      <a className={styles.appleLink} href={appleHref} target="_blank" rel="noopener noreferrer">
        LISTEN ON APPLE MUSIC
      </a>
    </aside>
  );
};

/** @deprecated Use VinylFocusPlayer */
export const OriginFocusEasterEgg = VinylFocusPlayer;

export const listeningCustomCard: CustomCardConfig = {
  id: 'listening',
  work: LISTENING_CUSTOM_WORK,
  placement: 'random',
  focusable: true,
  render: (props) => <ListeningCardFace {...props} />,
  renderFocusBanner: (props) => <ListeningFocusBanner {...props} />,
  renderFocusContent: () => <VinylFocusPlayer />
};
