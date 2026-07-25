'use client';

import styles from './VinylListening.module.scss';

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

import cx from 'classnames';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { CoverFlow } from './CoverFlow';
import { CustomCard } from './CustomCard';
import { HandAnnotation } from './HandAnnotation';
import {
  type ListeningFlipOverlayRect,
  clearListeningFlipOverlayRect,
  getListeningCoverFlipped,
  getListeningCoverIndex,
  getListeningFlipOverlayRect,
  getListeningPlaylistClosing,
  getListeningVinylPlaying,
  requestListeningPlaylistClose,
  setListeningCoverFlipped,
  setListeningCoverIndex,
  setListeningFlipOverlayRect,
  setListeningPlaylistClosing,
  setListeningVinylPlaying,
  subscribeListeningCoverFlipped,
  subscribeListeningCoverIndex,
  subscribeListeningFlipOverlayRect,
  subscribeListeningPlaylistClose,
  subscribeListeningVinylPlaying
} from './listeningCoverFlowState';
import { useIsCoverFlowCompact } from './useCoverFlowCompact';
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

const PLAY_VOLUME = 0.85;
const FADE_MS = 450;

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
  mobileFitRatio: 0.35
} as const;

/** Match Cover Flow grow ratios so the overlay sits on the same grown card. */
const FLIP_WIDTH_RATIO = 1.45;
const FLIP_HEIGHT_RATIO = 2.25;
/** Full player needs a roomier panel than the square cover alone. */
const OVERLAY_MIN_WIDTH = 360;
const OVERLAY_MIN_HEIGHT = 580;

const computeFlipOverlayRect = (el: HTMLElement): ListeningFlipOverlayRect => {
  const r = el.getBoundingClientRect();
  const from = { top: r.top, left: r.left, width: r.width, height: r.height };
  const width = Math.min(Math.max(r.width * FLIP_WIDTH_RATIO, OVERLAY_MIN_WIDTH), window.innerWidth - 32);
  const height = Math.min(Math.max(r.height * FLIP_HEIGHT_RATIO, OVERLAY_MIN_HEIGHT), window.innerHeight - 32);
  const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, 16), window.innerWidth - width - 16);
  const top = Math.min(Math.max(r.top + r.height / 2 - height / 2, 16), window.innerHeight - height - 16);
  return { from, to: { left, top, width, height } };
};

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

const useListeningCoverFlipped = () => {
  const [flipped, setFlipped] = useState(getListeningCoverFlipped);
  useEffect(() => subscribeListeningCoverFlipped(setFlipped), []);
  return flipped;
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
export const ListeningFocusBanner = ({ isFocusSettled = false }: CustomCardFocusContentProps) => {
  const coverIndex = useListeningCoverIndex();
  const flipped = useListeningCoverFlipped();
  const isMobile = useIsCoverFlowCompact();
  const active = COVER_FLOW_ITEMS[coverIndex] ?? COVER_FLOW_ITEMS[0];
  const activeCardNodeRef = useRef<HTMLElement | null>(null);
  const wasFocusSettledRef = useRef(false);

  useEffect(() => {
    // Reset flip when leaving focus (banner unmounts)
    return () => {
      setListeningCoverFlipped(false);
      setListeningPlaylistClosing(false);
      clearListeningFlipOverlayRect();
    };
  }, []);

  const handleActiveCardNode = useCallback((node: HTMLElement | null) => {
    activeCardNodeRef.current = node;
  }, []);

  const publishOverlayRect = useCallback(() => {
    if (getListeningPlaylistClosing()) return;
    const el = activeCardNodeRef.current;
    if (!el) return;
    setListeningFlipOverlayRect(computeFlipOverlayRect(el));
  }, []);

  // Keep the floating playlist aligned when the window (or page scroll) moves —
  // ignore scrolls inside the playlist itself (tracklist) so we don't churn rect state.
  useEffect(() => {
    if (!flipped || isMobile) return;
    publishOverlayRect();
    const onResize = () => publishOverlayRect();
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Element && target.closest('[data-listening-playlist-overlay]')) return;
      publishOverlayRect();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [flipped, isMobile, publishOverlayRect]);

  // Ignore album-nav close requests that arrive in the same gesture as opening
  // (drag click can open, then onUserIndexChange closes → cover shrink/grow flash)
  const ignoreCloseUntilRef = useRef(0);
  const [hintOpen, setHintOpen] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const dismissCoverFlowAnn = useCallback(() => {
    setHintOpen(false);
  }, []);

  const handleItemClick = useCallback(() => {
    if (isMobile) return;
    dismissCoverFlowAnn();
    if (getListeningCoverFlipped()) {
      requestListeningPlaylistClose();
      return;
    }
    const el = activeCardNodeRef.current;
    // Never flip without a measurable cover — that starts audio with no playlist UI
    if (!el) return;
    ignoreCloseUntilRef.current = Date.now() + 450;
    setListeningFlipOverlayRect(computeFlipOverlayRect(el));
    setListeningCoverFlipped(true);
  }, [dismissCoverFlowAnn, isMobile]);

  const handleUserIndexChange = useCallback(() => {
    dismissCoverFlowAnn();
    if (Date.now() < ignoreCloseUntilRef.current) return;
    requestListeningPlaylistClose();
  }, [dismissCoverFlowAnn]);

  // Show handwritten tip when focus settles; dismiss on swipe/click; again on next focus entry
  useEffect(() => {
    const justSettled = Boolean(isFocusSettled) && !wasFocusSettledRef.current;
    wasFocusSettledRef.current = Boolean(isFocusSettled);
    if (!isFocusSettled) {
      setHintOpen(false);
      return;
    }
    if (justSettled) setHintOpen(true);
  }, [isFocusSettled]);

  return (
    <div ref={bannerRef} className={styles.coverFlowBannerSlot}>
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
        enableFlip={!isMobile}
        flipped={flipped && !isMobile}
        onItemClick={handleItemClick}
        onUserIndexChange={handleUserIndexChange}
        onActiveCardNode={handleActiveCardNode}
      />
      <HandAnnotation
        targetRef={bannerRef}
        note="swipe to browse and click cover to select"
        srText="Swipe Cover Flow to browse albums, then click the center cover to select."
        open={hintOpen}
        direction="sw"
        visibility="desktop"
        trackKey={coverIndex}
        anchor={{ x: 'right', y: 'top', offsetX: -28, offsetY: -18 }}
        labelMaxWidth={170}
      />
      {active && !(flipped && !isMobile) ? (
        <div className={styles.coverFlowBannerCaption}>
          <p className={styles.coverFlowBannerTitle}>{active.title}</p>
          {active.subtitle ? <p className={styles.coverFlowBannerSubtitle}>{active.subtitle}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

type VinylPlayerBodyProps = {
  album: NowListeningAlbum;
  track: NowListeningTrack;
  playing: boolean;
  needsGesture: boolean;
  reduceMotion: boolean | null;
  compact?: boolean;
  /** Full player chrome inside the fixed Cover Flow overlay */
  overlay?: boolean;
  onPlayClick: () => void;
  onAlbumStep: (delta: -1 | 1) => void;
  onTrackSelect: (track: NowListeningTrack) => void;
  onInteractPointerDown?: (e: ReactPointerEvent | ReactMouseEvent) => void;
};

/** Shared player chrome — below-banner panel or Cover Flow overlay. */
const VinylPlayerBody = ({
  album,
  track,
  playing,
  needsGesture,
  reduceMotion,
  compact = false,
  overlay = false,
  onPlayClick,
  onAlbumStep,
  onTrackSelect,
  onInteractPointerDown
}: VinylPlayerBodyProps) => {
  const [hovered, setHovered] = useState(false);
  const appleHref = track.trackViewUrl || album.albumViewUrl;
  const trackLabel = `${album.artist} - ${track.title}`;
  const albumTitleShort = album.title.replace(/ \(.*\)$/, '');
  // Compact mode keeps the sleeve stacked; overlay uses the full vinyl pull like the below panel
  const vinylOpen = compact ? false : playing || hovered;

  const stop = onInteractPointerDown;

  return (
    <aside
      className={cx(styles.lofiPlayer, {
        [styles.lofiPlayerCompact]: compact,
        [styles.lofiPlayerOverlay]: overlay
      })}
      onPointerDown={stop}
    >
      <div className={styles.lofiAccentWash} aria-hidden>
        <AnimatePresence initial={false}>
          <motion.div
            key={album.collectionId}
            className={styles.lofiAccentWashLayer}
            style={
              {
                '--album-accent': album.accentColor,
                '--album-accent-2': album.accentColorSecondary ?? album.accentColor,
                ...(album.washStrength === 'soft'
                  ? { '--wash-peak': '14%', '--wash-mid': '8%', '--wash-low': '4%' }
                  : { '--wash-peak': '34%', '--wash-mid': '18%', '--wash-low': '8%' })
              } as CSSProperties
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeInOut' }}
          />
        </AnimatePresence>
      </div>

      <div
        className={styles.lofiStage}
        data-open={vinylOpen ? 'true' : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <motion.div
          className={styles.lofiRig}
          initial={false}
          animate={
            // Playing: shift sleeve left so sleeve + pulled vinyl center as one unit
            vinylOpen ? { left: '50%', x: 'calc(-50% - 2.75rem)' } : { left: '50%', x: '-50%' }
          }
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
              <AnimatePresence initial={false}>
                <motion.img
                  key={album.collectionId}
                  className={styles.lofiVinylLabel}
                  src={album.artworkUrl}
                  alt=""
                  draggable={false}
                  decoding="async"
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeInOut' }}
                />
              </AnimatePresence>
              <div className={styles.lofiVinylHole} aria-hidden />
            </motion.div>
            <button
              type="button"
              className={styles.lofiPlay}
              aria-label={playing ? 'Pause preview' : 'Play preview'}
              onClick={onPlayClick}
            >
              {playing ? (
                <span className={styles.lofiPauseIcon} aria-hidden />
              ) : (
                <span className={styles.lofiPlayIcon} aria-hidden />
              )}
            </button>
          </motion.div>

          <div className={styles.lofiSleeve}>
            <AnimatePresence initial={false}>
              <motion.img
                key={album.collectionId}
                className={styles.lofiSleeveImg}
                src={album.artworkUrl}
                alt={`${album.title} cover`}
                draggable={false}
                decoding="async"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeInOut' }}
              />
            </AnimatePresence>
            <div className={styles.lofiSleeveSheen} aria-hidden />
          </div>
        </motion.div>
      </div>

      <p className={styles.lofiTrack}>{trackLabel}</p>

      {needsGesture ? (
        <button type="button" className={styles.lofiGesture} onClick={onPlayClick}>
          [TAP TO PLAY PREVIEW]
        </button>
      ) : null}

      <nav className={styles.albumNav} aria-label="Albums">
        <button
          type="button"
          className={styles.albumNavBtn}
          aria-label="Previous album"
          onClick={() => onAlbumStep(-1)}
        >
          ‹
        </button>
        <p className={styles.albumNavTitle}>
          <AnimatePresence initial={false}>
            <motion.span
              key={album.collectionId}
              className={styles.albumNavTitleText}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: 'easeOut' }}
            >
              {albumTitleShort}
            </motion.span>
          </AnimatePresence>
        </p>
        <button type="button" className={styles.albumNavBtn} aria-label="Next album" onClick={() => onAlbumStep(1)}>
          ›
        </button>
      </nav>

      <ol className={styles.trackList} aria-label={`${album.title} tracklist`}>
        {album.tracks.map((item) => {
          const active = item.trackId === track.trackId;
          return (
            <li key={item.trackId}>
              <button
                type="button"
                className={cx(styles.trackRow, { [styles.trackRowActive]: active })}
                onClick={() => onTrackSelect(item)}
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

/**
 * Focus easter egg — album stack, tracklist, Apple previews.
 * On desktop while Cover Flow is flipped, portals a fixed overlay over the grown cover.
 */
export const VinylFocusPlayer = () => {
  const reduceMotion = useReducedMotion();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const flipped = useListeningCoverFlipped();
  const isMobile = useIsCoverFlowCompact();
  const [overlayRect, setOverlayRect] = useState(getListeningFlipOverlayRect);

  useEffect(() => subscribeListeningFlipOverlayRect(setOverlayRect), []);

  const startAlbum = library[getListeningCoverIndex()] ?? defaultAlbum;
  const startTrack =
    startAlbum.collectionId === defaultAlbum.collectionId ? defaultTrack : (startAlbum.tracks[0] ?? defaultTrack);

  const albumRef = useRef(startAlbum);
  const trackRef = useRef(startTrack);
  const playGenRef = useRef(0);
  const playTrackRef = useRef<
    (album: NowListeningAlbum, track: NowListeningTrack, opts?: { syncCover?: boolean }) => Promise<void>
  >(async () => undefined);

  const [album, setAlbum] = useState(startAlbum);
  const [track, setTrack] = useState(startTrack);
  const [playing, setPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

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
      const clampedTarget = Math.min(1, Math.max(0, target));
      if (ms <= 0 || Math.abs(audio.volume - clampedTarget) < 0.01) {
        audio.volume = clampedTarget;
        resolve();
        return;
      }
      const start = performance.now();
      const from = audio.volume;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        audio.volume = Math.min(1, Math.max(0, from + (clampedTarget - from) * t));
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
    async (nextAlbum: NowListeningAlbum, nextTrack: NowListeningTrack, opts?: { syncCover?: boolean }) => {
      const gen = ++playGenRef.current;

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

      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        audioRef.current = audio;
      }

      // Fade out current audio before swapping tracks
      if (!audio.paused && audio.volume > 0.01) {
        await fadeTo(audio, 0, FADE_MS);
        if (gen !== playGenRef.current) return;
      }

      audio.pause();
      audio.src = nextTrack.previewUrl;
      audio.volume = 0;

      try {
        await audio.play();
        if (gen !== playGenRef.current) return;
        setPlaying(true);
        setListeningVinylPlaying(true);
        setNeedsGesture(false);
        await fadeTo(audio, PLAY_VOLUME, FADE_MS);
        if (gen !== playGenRef.current) return;

        stopTimerRef.current = window.setTimeout(() => {
          void (async () => {
            await fadeTo(audio!, 0, FADE_MS);
            if (gen !== playGenRef.current) return;
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
          })();
        }, PREVIEW_DURATION_MS);
      } catch {
        if (gen !== playGenRef.current) return;
        setNeedsGesture(true);
        setPlaying(false);
        setListeningVinylPlaying(false);
      }
    },
    [fadeTo]
  );

  playTrackRef.current = playTrack;

  // Mobile: auto-start when focus opens. Desktop: open playlist only — user starts playback.
  useEffect(() => {
    if (!isMobile) {
      return () => {
        playGenRef.current += 1;
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
    }

    const coverAlbum = library[getListeningCoverIndex()] ?? defaultAlbum;
    const coverTrack =
      coverAlbum.collectionId === defaultAlbum.collectionId ? defaultTrack : (coverAlbum.tracks[0] ?? defaultTrack);
    void playTrack(coverAlbum, coverTrack);
    return () => {
      playGenRef.current += 1;
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
  }, [isMobile]);

  // Cover Flow snap / drag → sync selected album. Never start audio from browsing alone —
  // only continue playback if something is already playing (e.g. mobile player / open overlay).
  useEffect(() => {
    return subscribeListeningCoverIndex((index) => {
      const next = library[index];
      if (!next || next.collectionId === albumRef.current.collectionId) return;

      // Desktop with closed overlay: selection only — playback is user-initiated in the playlist
      if (!isMobile && !getListeningCoverFlipped()) {
        albumRef.current = next;
        trackRef.current = next.tracks[0]!;
        setAlbum(next);
        setTrack(next.tracks[0]!);
        return;
      }

      if (getListeningVinylPlaying()) {
        void playTrackRef.current(next, next.tracks[0]!);
        return;
      }

      albumRef.current = next;
      trackRef.current = next.tracks[0]!;
      setAlbum(next);
      setTrack(next.tracks[0]!);
    });
  }, [isMobile]);

  const handleAlbumStep = (delta: -1 | 1) => {
    const currentIndex = library.findIndex((a) => a.collectionId === album.collectionId);
    const from = currentIndex >= 0 ? currentIndex : 0;
    const next = library[(from + delta + library.length) % library.length]!;
    if (next.collectionId === album.collectionId) return;
    void playTrack(next, next.tracks[0]!, { syncCover: true });
  };

  const handleTrackSelect = (next: NowListeningTrack) => {
    void playTrack(album, next);
  };

  const handlePlayClick = () => {
    const audio = audioRef.current;
    if (playing && audio && !audio.paused) {
      const gen = ++playGenRef.current;
      clearStopTimer();
      setPlaying(false);
      setListeningVinylPlaying(false);
      void (async () => {
        await fadeTo(audio, 0, FADE_MS);
        if (gen !== playGenRef.current) return;
        audio.pause();
      })();
      return;
    }
    void playTrack(album, track);
  };

  const stopOverlayBubble = useCallback((e: ReactPointerEvent | ReactMouseEvent) => {
    e.stopPropagation();
  }, []);

  const stopPlayback = useCallback(() => {
    playGenRef.current += 1;
    clearStopTimer();
    clearFade();
    setPlaying(false);
    setListeningVinylPlaying(false);
    const audio = audioRef.current;
    if (!audio) return;
    void (async () => {
      await fadeTo(audio, 0, FADE_MS);
      audio.pause();
    })();
  }, [fadeTo]);

  const [isClosing, setIsClosing] = useState(false);

  const beginClose = useCallback(() => {
    if (isClosing || !getListeningCoverFlipped()) return;
    stopPlayback();
    setListeningPlaylistClosing(true);
    setIsClosing(true);
  }, [isClosing, stopPlayback]);

  useEffect(() => subscribeListeningPlaylistClose(() => beginClose()), [beginClose]);

  const finishClose = useCallback(() => {
    setListeningCoverFlipped(false);
    clearListeningFlipOverlayRect();
    setListeningPlaylistClosing(false);
    setIsClosing(false);
  }, []);

  // Keep cover in the flipped (edge-on / hidden) pose until the overlay finishes closing
  const showOverlay = !isMobile && overlayRect && (flipped || isClosing);

  const body = (
    <VinylPlayerBody
      album={album}
      track={track}
      playing={playing}
      needsGesture={needsGesture}
      reduceMotion={reduceMotion}
      overlay={Boolean(showOverlay)}
      onPlayClick={handlePlayClick}
      onAlbumStep={handleAlbumStep}
      onTrackSelect={handleTrackSelect}
      onInteractPointerDown={showOverlay ? stopOverlayBubble : undefined}
    />
  );

  if (showOverlay && overlayRect) {
    return (
      <>
        <div className={styles.lofiPlayerHidden} aria-hidden />
        {createPortal(
          <ListeningPlaylistOverlay
            rect={overlayRect}
            reduceMotion={reduceMotion}
            closing={isClosing}
            onClose={beginClose}
            onCloseComplete={finishClose}
          >
            {body}
          </ListeningPlaylistOverlay>,
          document.body
        )}
      </>
    );
  }

  // Desktop: no below-banner player — playlist only via Cover Flow flip overlay
  if (!isMobile) {
    return null;
  }

  return body;
};

type ListeningPlaylistOverlayProps = {
  rect: ListeningFlipOverlayRect;
  reduceMotion: boolean | null;
  closing: boolean;
  onClose: () => void;
  onCloseComplete: () => void;
  children: ReactNode;
};

const ListeningPlaylistOverlay = ({
  rect,
  reduceMotion,
  closing,
  onClose,
  onCloseComplete,
  children
}: ListeningPlaylistOverlayProps) => {
  const { from, to } = rect;
  const closingRef = useRef(closing);
  const finishedRef = useRef(false);
  const [settled, setSettled] = useState(Boolean(reduceMotion));
  closingRef.current = closing;

  useEffect(() => {
    if (closing) finishedRef.current = false;
  }, [closing]);

  useEffect(() => {
    if (closing && reduceMotion) {
      onCloseComplete();
    }
  }, [closing, reduceMotion, onCloseComplete]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const layoutEase = [0.33, 1, 0.68, 1] as const;
  /** Match Cover Flow half-flip so the overlay continues from edge-on without a gap. */
  const handoffS = 0.34;

  return (
    <>
      <button
        type="button"
        className={styles.playlistOverlayBackdrop}
        aria-label="Close tracklist"
        onClick={onClose}
        disabled={closing}
      />
      <motion.div
        className={styles.playlistOverlay}
        data-listening-playlist-overlay
        initial={
          reduceMotion
            ? false
            : {
                top: from.top,
                left: from.left,
                width: from.width,
                height: from.height,
                rotateY: 90,
                opacity: 0
              }
        }
        animate={
          closing
            ? {
                top: from.top,
                left: from.left,
                width: from.width,
                height: from.height,
                rotateY: 90,
                opacity: 0
              }
            : {
                top: to.top,
                left: to.left,
                width: to.width,
                height: to.height,
                rotateY: 0,
                opacity: 1
              }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : closing
              ? {
                  // Reverse of open: shrink first, then flip to edge-on and hand back to the cover
                  top: { duration: 0.38, ease: layoutEase },
                  left: { duration: 0.38, ease: layoutEase },
                  width: { duration: 0.38, ease: layoutEase },
                  height: { duration: 0.38, ease: layoutEase },
                  rotateY: { duration: 0.3, delay: 0.16, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.08, delay: 0.4, ease: 'linear' }
                }
              : settled
                ? {
                    // Follow window resize / scroll without replaying the open flip
                    top: { duration: 0.18, ease: 'easeOut' },
                    left: { duration: 0.18, ease: 'easeOut' },
                    width: { duration: 0.18, ease: 'easeOut' },
                    height: { duration: 0.18, ease: 'easeOut' },
                    rotateY: { duration: 0 },
                    opacity: { duration: 0 }
                  }
                : {
                    // Appear at the cover's edge-on moment, then finish the flip + grow as one move
                    opacity: { duration: 0.06, delay: handoffS, ease: 'linear' },
                    rotateY: { duration: 0.4, delay: handoffS, ease: [0.4, 0, 0.2, 1] },
                    top: { duration: 0.5, delay: handoffS + 0.06, ease: layoutEase },
                    left: { duration: 0.5, delay: handoffS + 0.06, ease: layoutEase },
                    width: { duration: 0.5, delay: handoffS + 0.06, ease: layoutEase },
                    height: { duration: 0.5, delay: handoffS + 0.06, ease: layoutEase }
                  }
        }
        onAnimationComplete={() => {
          if (closingRef.current) {
            if (finishedRef.current) return;
            finishedRef.current = true;
            onCloseComplete();
            return;
          }
          setSettled(true);
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Album tracklist"
      >
        <button
          type="button"
          className={styles.playlistOverlayClose}
          aria-label="Close playlist"
          onClick={onClose}
          disabled={closing}
        >
          <span className={styles.playlistOverlayCloseIcon} aria-hidden />
        </button>
        <div className={styles.playlistOverlayInner}>{children}</div>
      </motion.div>
    </>
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
