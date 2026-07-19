import { useEffect, useState } from 'react';

/** Survives cull remounts so previously painted URLs don't flash blank or re-gate opacity. */
const loadedSrcs = new Set<string>();

const markImageLoaded = (src: string) => {
  if (src) loadedSrcs.add(src);
};

const isImageCached = (src: string) => Boolean(src) && loadedSrcs.has(src);

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

export { useImageLoad, markImageLoaded, isImageCached };
