import { useCallback, useEffect, useRef } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import type { CanvasFocusBridge, FocusUrlIntent, Work } from '@/components/InfiniteCanvas';
import { ABOUT_PAGE_PATH } from '@/lib/aboutContent';
import { ALL_WORK_SLUGS, getSlugForWork, getWorkBySlug } from '@/lib/workSlug';
import { usePortfolioViewStore, useWorkStore } from '@/store';

const WORK_PATH_PREFIX = '/work/';
const ORIGIN_WORK_NAME = 'Hello';
const LISTENING_WORK_NAME = 'Now listening';
/** Let the intro finish before warming routes */
const PREFETCH_START_DELAY_MS = 3000;
/** Assets the focus overlay mounts on settle — first open otherwise fetches them mid-morph */
const FOCUS_OVERLAY_ASSETS = ['/images/icon/close.svg'];

const slugFromPathname = (pathname: string): string | null => {
  if (!pathname.startsWith(WORK_PATH_PREFIX)) return null;
  const [slug] = pathname.slice(WORK_PATH_PREFIX.length).split('/');
  return slug || null;
};

const isOriginWork = (work: Work | null | undefined) => work?.name === ORIGIN_WORK_NAME;
const isListeningWork = (work: Work | null | undefined) => work?.name === LISTENING_WORK_NAME;

const isUnfocusedShellPath = (pathname: string) => pathname === '/' || pathname === '/work';
const isPortfolioEntryPath = (pathname: string) =>
  pathname === ABOUT_PAGE_PATH || pathname === '/work' || pathname.startsWith(WORK_PATH_PREFIX);

const pathForFocusWork = (work: Work | null): string | null => {
  if (!work) return null;
  if (isOriginWork(work)) return ABOUT_PAGE_PATH;
  if (isListeningWork(work)) return null; // listening stays URL-less
  const slug = getSlugForWork(work);
  return slug ? `${WORK_PATH_PREFIX}${slug}` : null;
};

/**
 * Keeps `/`, `/about`, `/work`, and `/work/[slug]` in sync with canvas focus + the
 * reading-mode work flyout: open from unfocused → push; neighbor/peek → replace;
 * close/Escape → back when pushed, else replace to the session shell.
 */
export const useWorkUrlSync = (canvasBridgeRef: React.RefObject<CanvasFocusBridge | null>, bridgeVersion: number) => {
  const pathname = usePathname();
  const router = useRouter();
  const forceCanvasView = usePortfolioViewStore((state) => state.forceCanvasView);
  const selectedWork = useWorkStore((state) => state.selectedWork);
  const removeSelectedWork = useWorkStore((state) => state.removeSelectedWork);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  /** True once we've pushed a history entry for the current focus/flyout session. */
  const hasPushedRef = useRef(false);
  /** Last unfocused shell we saw — where Close/Back-less flows return to. */
  const sessionShellRef = useRef<'/' | '/work'>('/work');
  /** Path we most recently asked the router to navigate to — distinguishes our own
   *  push/replace from external nav (browser back/forward, cold load, typed URL). */
  const lastSelfNavRef = useRef<string | null>(null);
  const prevSelectedWorkRef = useRef(selectedWork);

  useEffect(() => {
    if (isUnfocusedShellPath(pathname)) {
      sessionShellRef.current = pathname === '/' ? '/' : '/work';
    }
  }, [pathname]);

  // Opening a card pushes /work/[slug]; uncached, its RSC fetch + commit lands mid-morph.
  // Warm every focus route (one per idle slot) so first opens match repeat opens.
  useEffect(() => {
    const paths = [ABOUT_PAGE_PATH, ...ALL_WORK_SLUGS.map((slug) => `${WORK_PATH_PREFIX}${slug}`)];
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 2000 })
        : (cb: () => void) => window.setTimeout(cb, 50);
    const cancelIdle =
      typeof window.cancelIdleCallback === 'function'
        ? (id: number) => window.cancelIdleCallback(id)
        : (id: number) => window.clearTimeout(id);

    let idleId: number | null = null;
    let index = 0;
    const next = () => {
      const path = paths[index++];
      if (!path) return;
      router.prefetch(path);
      idleId = idle(next);
    };
    const startId = window.setTimeout(() => {
      for (const src of FOCUS_OVERLAY_ASSETS) {
        const img = new Image();
        img.src = src;
        void img.decode().catch(() => {});
      }
      idleId = idle(next);
    }, PREFETCH_START_DELAY_MS);

    return () => {
      window.clearTimeout(startId);
      if (idleId != null) cancelIdle(idleId);
    };
  }, [router]);

  const selfNavigate = useCallback(
    (path: string, mode: 'push' | 'replace') => {
      lastSelfNavRef.current = path;
      if (mode === 'push') router.push(path);
      else router.replace(path);
    },
    [router]
  );

  const selfClose = useCallback(() => {
    const shell = sessionShellRef.current;
    if (hasPushedRef.current) {
      hasPushedRef.current = false;
      lastSelfNavRef.current = shell;
      router.back();
    } else {
      selfNavigate(shell, 'replace');
    }
  }, [router, selfNavigate]);

  const navigateToFocusPath = useCallback(
    (target: string, preferPushFromShell: boolean) => {
      if (pathnameRef.current === target) return;
      if (preferPushFromShell && !hasPushedRef.current && isUnfocusedShellPath(pathnameRef.current)) {
        selfNavigate(target, 'push');
        hasPushedRef.current = true;
        return;
      }
      if (preferPushFromShell && !hasPushedRef.current) {
        // Open from a non-shell path (e.g. already on /about) still needs a history step
        // when entering addressable focus for the first time in the session.
        selfNavigate(target, 'push');
        hasPushedRef.current = true;
        return;
      }
      selfNavigate(target, 'replace');
    },
    [selfNavigate]
  );

  // --- Gesture intents from canvas focus (open / peek / close) --------------------------
  const handleFocusIntent = useCallback(
    (intent: FocusUrlIntent) => {
      if (intent.type === 'open') {
        if (prevSelectedWorkRef.current?.type === 'work') removeSelectedWork();
        if (isListeningWork(intent.work)) return; // no URL for listening
        const target = pathForFocusWork(intent.work);
        if (!target) return;
        navigateToFocusPath(target, true);
        return;
      }
      if (intent.type === 'peek') {
        const target = pathForFocusWork(intent.work) ?? sessionShellRef.current;
        // First addressable URL in a session must push so we don't replace `/` away.
        const isAddressable = target === ABOUT_PAGE_PATH || Boolean(slugFromPathname(target));
        navigateToFocusPath(target, isAddressable);
        return;
      }
      selfClose();
    },
    [removeSelectedWork, navigateToFocusPath, selfClose]
  );

  // --- Reading flyout writes the same URLs (work type only — info never touches these) --
  useEffect(() => {
    const prev = prevSelectedWorkRef.current;
    prevSelectedWorkRef.current = selectedWork;

    const prevIsWork = prev?.type === 'work';
    const nextIsWork = selectedWork?.type === 'work';

    if (!prevIsWork && nextIsWork) {
      const slug = selectedWork?.name ? getSlugForWork({ name: selectedWork.name }) : null;
      if (!slug) return;
      const target = `${WORK_PATH_PREFIX}${slug}`;
      if (pathnameRef.current === target) return;
      const canvasHasFocus = Boolean(canvasBridgeRef.current?.getFocusedWork());
      if (isUnfocusedShellPath(pathnameRef.current) && !canvasHasFocus) {
        selfNavigate(target, 'push');
        hasPushedRef.current = true;
      } else {
        selfNavigate(target, 'replace');
      }
      return;
    }

    if (prevIsWork && !nextIsWork) {
      if (slugFromPathname(pathnameRef.current) || pathnameRef.current === ABOUT_PAGE_PATH) selfClose();
      return;
    }

    if (prevIsWork && nextIsWork && prev?.name !== selectedWork?.name) {
      const slug = selectedWork?.name ? getSlugForWork({ name: selectedWork.name }) : null;
      if (!slug) return;
      const target = `${WORK_PATH_PREFIX}${slug}`;
      if (pathnameRef.current !== target) selfNavigate(target, 'replace');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWork]);

  // --- Pathname → apply (cold load, browser back/forward, manual URL edits) -------------
  useEffect(() => {
    const isSelfNav = lastSelfNavRef.current === pathname;
    lastSelfNavRef.current = null;

    if (!isSelfNav && isPortfolioEntryPath(pathname)) {
      forceCanvasView();
    }

    // Gesture-driven push/replace already updated focus — don't re-seat (avoids arrow jumps).
    if (isSelfNav) return;

    const bridge = canvasBridgeRef.current;
    const focused = bridge?.getFocusedWork() ?? null;

    if (pathname === ABOUT_PAGE_PATH) {
      if (isOriginWork(focused)) return;
      bridge?.applyFocusOrigin();
      return;
    }

    const targetSlug = slugFromPathname(pathname);
    if (targetSlug === null) {
      bridge?.applyFocusWork(null);
      return;
    }

    const work = getWorkBySlug(targetSlug);
    if (work && focused && getSlugForWork(focused) === targetSlug) return;

    bridge?.applyFocusWork(work ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, bridgeVersion, forceCanvasView]);

  return { handleFocusIntent };
};

export type UseWorkUrlSyncResult = ReturnType<typeof useWorkUrlSync>;
