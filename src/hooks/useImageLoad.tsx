import { useEffect, useState } from 'react';

/** Survives cull remounts so previously painted URLs don't flash blank or re-gate opacity. */
const loadedSrcs = new Set<string>();

const markImageLoaded = (src: string) => {
  if (src) loadedSrcs.add(src);
};

const isImageCached = (src: string) => Boolean(src) && loadedSrcs.has(src);

/**
 * Preload a single image into the shared cache.
 * Resolves on load or error (errors are not cached so remounts can retry).
 */
const preloadImage = (src: string): Promise<boolean> => {
  if (!src) return Promise.resolve(false);
  if (loadedSrcs.has(src)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const img = new Image();
    const finish = (ok: boolean) => {
      if (ok) loadedSrcs.add(src);
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      finish(true);
    }
  });
};

export type PreloadImagesProgress = {
  loaded: number;
  total: number;
};

/**
 * Preload unique image URLs. Calls onProgress after each settle.
 * Returns a cancel function (in-flight loads still finish, but callbacks stop).
 */
const preloadImages = (
  srcs: string[],
  options?: {
    onProgress?: (progress: PreloadImagesProgress) => void;
    onComplete?: () => void;
  }
): (() => void) => {
  const unique = [...new Set(srcs.filter(Boolean))];
  const total = unique.length;
  let cancelled = false;
  let settled = 0;

  if (total === 0) {
    options?.onProgress?.({ loaded: 0, total: 0 });
    options?.onComplete?.();
    return () => {
      cancelled = true;
    };
  }

  const report = () => {
    if (cancelled) return;
    options?.onProgress?.({ loaded: settled, total });
    if (settled >= total) {
      options?.onComplete?.();
    }
  };

  // Sync-cached hits
  for (const src of unique) {
    if (loadedSrcs.has(src)) {
      settled += 1;
    }
  }
  report();

  for (const src of unique) {
    if (loadedSrcs.has(src)) continue;
    preloadImage(src).then(() => {
      if (cancelled) return;
      settled += 1;
      report();
    });
  }

  return () => {
    cancelled = true;
  };
};

const useImageLoad = (src: string) => {
  const [isLoaded, setIsLoaded] = useState(() => isImageCached(src));

  useEffect(() => {
    if (!src) {
      setIsLoaded(false);
      return;
    }

    if (loadedSrcs.has(src)) {
      setIsLoaded(true);
      return;
    }

    setIsLoaded(false);

    const img = new Image();
    const mark = () => {
      loadedSrcs.add(src);
      setIsLoaded(true);
    };

    img.onload = mark;
    img.onerror = () => {
      // Don't cache failures — allow a later remount to retry
      setIsLoaded(false);
    };
    img.src = src;

    // Memory / HTTP cache hit: complete may already be true after setting src
    if (img.complete && img.naturalWidth > 0) {
      mark();
    }

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return isLoaded;
};

export { useImageLoad, markImageLoaded, isImageCached, preloadImage, preloadImages };
