import { RefObject, useCallback, useEffect, useState } from 'react';

// Extend Document interface to include vendor prefixed properties
interface FullscreenDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

// Extend Element interface to include vendor prefixed methods
interface FullscreenElement extends Element {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface FullscreenApi {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  isEnabled: () => boolean;
}

const useFullscreen = <T extends Element>(elementRef: RefObject<T>): FullscreenApi => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Check if fullscreen is supported
  const isFullscreenEnabled = useCallback((): boolean => {
    const doc = document as FullscreenDocument;
    return Boolean(
      doc.fullscreenEnabled || doc.webkitFullscreenEnabled || doc.mozFullScreenEnabled || doc.msFullscreenEnabled
    );
  }, []);

  // Get the current fullscreen element
  const getFullscreenElement = useCallback((): Element | null => {
    const doc = document as FullscreenDocument;
    return (
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      null
    );
  }, []);

  // Request fullscreen
  const requestFullscreen = useCallback(() => {
    if (!elementRef.current) return;

    const element = elementRef.current as FullscreenElement;

    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  }, [elementRef]);

  // Exit fullscreen
  const exitFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;

    if (doc.exitFullscreen) {
      doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen();
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!isFullscreenEnabled()) return;

    if (getFullscreenElement()) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  }, [isFullscreenEnabled, getFullscreenElement, requestFullscreen, exitFullscreen]);

  // Update fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(getFullscreenElement()));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [getFullscreenElement]);

  return {
    isFullscreen,
    toggleFullscreen,
    enterFullscreen: requestFullscreen,
    exitFullscreen,
    isEnabled: isFullscreenEnabled
  };
};

export default useFullscreen;
