'use client';

import styles from './Background.module.scss';

import { useEffect, useRef, useState } from 'react';

import { isDiscoModeActive } from '@/lib/workSearch';
import { useSearchStore } from '@/store';

const lerp = (start: number, end: number, t: number) => {
  return start + (end - start) * t;
};

// Convert hex to RGB
const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
};

// Convert RGB to hex
const rgbToHex = (r: number, g: number, b: number): string => {
  return `#${[r, g, b]
    .map((x) => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('')}`;
};

// Lerp between two colors
const lerpColor = (color1: string, color2: string, t: number): string => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const r = lerp(rgb1[0], rgb2[0], t);
  const g = lerp(rgb1[1], rgb2[1], t);
  const b = lerp(rgb1[2], rgb2[2], t);
  return rgbToHex(r, g, b);
};

// Club spotlights — warm magenta / gold / violet (not neon acid)
const DISCO_PALETTE = ['#c2185b', '#f5c542', '#7b2cbf', '#ff6b6b', '#e8a838', '#5a189a'];

const Background = () => {
  return <div className={styles.noise} />;
};

interface BlobConfig {
  height: number; // in vh
  aspectRatio: number;
  color: string;
  lerpFactor: number;
}

// Base colors (more vibrant versions)
const BASE_COLORS = [
  '#0d00a9', // blob3 - blue
  '#fd0f00', // blob2 - red
  '#e1bd00' // blob1 - yellow
];

// Target colors for interpolation (slightly shifted for animation)
const TARGET_COLORS = [
  '#1a00ff', // blob3 - brighter blue
  '#ff1a1a', // blob2 - brighter red
  '#ffd700' // blob1 - brighter yellow
];

const BLOB_CONFIGS: BlobConfig[] = [
  { height: 70, aspectRatio: 3 / 2, color: '#0d00a9', lerpFactor: 0.1 }, // blob3
  { height: 60, aspectRatio: 3 / 2, color: '#fd0f00', lerpFactor: 0.2 }, // blob2
  { height: 50, aspectRatio: 2 / 1, color: '#e1bd00', lerpFactor: 0.3 } // blob1
];

/**
 * Backing-store pixels per CSS px. The wash is blurred by 40–100px, so a quarter-res
 * buffer upscaled by the compositor is indistinguishable from full retina — and ~64×
 * fewer pixels to fill and blur every frame.
 */
const RENDER_SCALE = 0.25;
const DESKTOP_BLUR_PX = 100;
const MOBILE_BLUR_PX = 40;

/** Per-frame lerp factors are tuned at 60fps — rescale so 120Hz / dropped frames feel identical */
const frameLerp = (factor: number, dtSeconds: number) => 1 - Math.pow(1 - factor, dtSeconds * 60);

const Blob = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  /** null until the context is probed — canvas `filter` is missing on older Safari */
  const [canvasBlur, setCanvasBlur] = useState<boolean | null>(null);
  const canvasBlurRef = useRef(false);
  const animationRef = useRef(0);
  const isMobileRef = useRef(false);
  const timeRef = useRef(0);
  const searchQuery = useSearchStore((state) => state.query);
  const discoEnabled = useSearchStore((state) => state.discoEnabled);
  const discoMode = isDiscoModeActive(searchQuery, discoEnabled);
  const discoModeRef = useRef(discoMode);
  const reduceMotionRef = useRef(false);

  discoModeRef.current = discoMode;

  // Track positions for each blob
  const blobPositionsRef = useRef<Array<{ x: number; y: number }>>([
    { x: 0, y: 0 }, // blob3
    { x: 0, y: 0 }, // blob2
    { x: 0, y: 0 } // blob1
  ]);

  // Track current colors for each blob (for lerping)
  const blobColorsRef = useRef<Array<string>>([
    '#0d00a9', // blob3
    '#fd0f00', // blob2
    '#e1bd00' // blob1
  ]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reduceMotionRef.current = media.matches;
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Check if device is mobile and handle resize
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice =
        window.matchMedia('(max-width: 768px)').matches ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      isMobileRef.current = isMobileDevice;
      setIsMobile(isMobileDevice);

      // Initialize blob positions on mobile
      if (isMobileDevice) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        blobPositionsRef.current = [
          { x: centerX, y: centerY }, // blob3
          { x: centerX, y: centerY }, // blob2
          { x: centerX, y: centerY } // blob1
        ];
      }
    };

    const handleResize = () => {
      checkMobile();
      sizeCanvas();
      // Redraw canvas on resize
      drawBlobs.current();
    };

    checkMobile();
    sizeCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.filter = 'blur(2px)';
    const supported = ctx.filter === 'blur(2px)';
    ctx.filter = 'none';
    canvasBlurRef.current = supported;
    setCanvasBlur(supported);
  }, []);

  // Pointer position lives in a ref — re-rendering on every mousemove restarted the rAF loop
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mousePosRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        const touch = event.touches[0];
        mousePosRef.current = { x: touch.clientX, y: touch.clientY };
      }
    };

    if (isMobile) {
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      return () => window.removeEventListener('touchmove', handleTouchMove);
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isMobile]);

  /** Resize the backing store only when the viewport changes — assigning width clears + reallocates */
  const sizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(1, Math.ceil(window.innerWidth * RENDER_SCALE));
    const height = Math.max(1, Math.ceil(window.innerHeight * RENDER_SCALE));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  };

  // Draw all blobs on canvas (canvas pixel space = CSS px × RENDER_SCALE)
  const drawBlobs = useRef(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = RENDER_SCALE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canvasBlurRef.current) {
      ctx.filter = `blur(${(isMobileRef.current ? MOBILE_BLUR_PX : DESKTOP_BLUR_PX) * s}px)`;
    }

    // Convert vh to pixels
    const vhToPx = (vh: number) => (vh / 100) * window.innerHeight;
    const disco = discoModeRef.current;
    const coreAlpha = disco ? 0.7 : 0.6;
    const midAlpha = disco ? 0.55 : 0.5;
    const outerAlpha = disco ? 0.34 : 0.3;

    BLOB_CONFIGS.forEach((config, index) => {
      const blobPos = blobPositionsRef.current[index];
      const blobHeight = vhToPx(config.height) * s;
      const blobWidth = blobHeight * config.aspectRatio;
      const currentColor = blobColorsRef.current[index];

      // Slow sweep like a rotating stage light on mobile / disco; desktop rests unrotated
      let angle = 0;
      if (isMobileRef.current || disco) {
        const spin = disco ? (reduceMotionRef.current ? 0.25 : 0.55) : 0.3;
        angle = timeRef.current * spin + index * 0.5;
      }

      ctx.save();

      // Set blend mode for additive color mixing when overlapping
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(blobPos.x * s, blobPos.y * s);
      ctx.rotate(angle);

      // Create gradient for smoother blob with transparency for blending
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(blobWidth, blobHeight) / 2);
      const rgb = hexToRgb(currentColor);
      gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${coreAlpha})`);
      gradient.addColorStop(0.3, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${midAlpha})`);
      gradient.addColorStop(0.6, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${outerAlpha})`);
      gradient.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.ellipse(0, 0, blobWidth / 2, blobHeight / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.restore();
    });
  });

  // Animation loop — skip continuous rAF on mobile unless disco (spotlight wash).
  useEffect(() => {
    if (canvasBlur === null) return;

    if (isMobile && !discoMode) {
      drawBlobs.current();
      return;
    }

    let lastTime = performance.now();

    const updateBlobs = () => {
      const currentTime = performance.now();
      // Clamp so a backgrounded tab doesn't teleport the blobs on return
      const deltaTime = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      timeRef.current += deltaTime;
      const disco = discoModeRef.current;
      const reduceMotion = reduceMotionRef.current;
      const mousePos = mousePosRef.current;

      BLOB_CONFIGS.forEach((config, index) => {
        const currentPos = blobPositionsRef.current[index];

        if (disco) {
          // Wide, slow spotlight orbits (mirror-ball wash) — not frantic chase
          const cx = isMobileRef.current ? window.innerWidth / 2 : mousePos.x || window.innerWidth / 2;
          const cy = isMobileRef.current ? window.innerHeight / 2 : mousePos.y || window.innerHeight / 2;
          const orbit = (isMobileRef.current ? 70 : 120) + index * 36;
          const speed = reduceMotion ? 0.28 : 0.65;
          const a = timeRef.current * speed + index * ((Math.PI * 2) / 3);
          const targetX = cx + Math.cos(a) * orbit;
          const targetY = cy + Math.sin(a * 0.9) * orbit * 0.7;
          const t = frameLerp(0.06, deltaTime);
          blobPositionsRef.current[index] = {
            x: lerp(currentPos.x, targetX, t),
            y: lerp(currentPos.y, targetY, t)
          };
        } else {
          // Desktop: follow mouse
          const t = frameLerp(config.lerpFactor, deltaTime);
          blobPositionsRef.current[index] = {
            x: lerp(currentPos.x, mousePos.x, t),
            y: lerp(currentPos.y, mousePos.y, t)
          };
        }

        const currentColor = blobColorsRef.current[index];

        if (disco) {
          // Slow crossfade between neighbouring club gels
          const speed = reduceMotion ? 0.12 : 0.28;
          const t = timeRef.current * speed + index * 1.35;
          const i0 = Math.floor(t) % DISCO_PALETTE.length;
          const i1 = (i0 + 1) % DISCO_PALETTE.length;
          const frac = t - Math.floor(t);
          // Ease the gel change so it reads as a wash, not a strobe
          const eased = frac * frac * (3 - 2 * frac);
          const target = lerpColor(DISCO_PALETTE[i0], DISCO_PALETTE[i1], eased);
          const blend = frameLerp(reduceMotion ? 0.05 : 0.1, deltaTime);
          blobColorsRef.current[index] = lerpColor(currentColor, target, blend);
        } else {
          // Lerp colors based on time and mouse position
          const timeOffset = index * 0.5;
          const posInfluence = Math.sin((mousePos.x + mousePos.y) * 0.001) * 0.5 + 0.5;
          const timeInfluence = Math.sin(timeRef.current * 0.5 + timeOffset) * 0.5 + 0.5;
          const lerpValue = posInfluence * 0.3 + timeInfluence * 0.7;

          const newColor = lerpColor(BASE_COLORS[index], TARGET_COLORS[index], lerpValue);

          blobColorsRef.current[index] = lerpColor(currentColor, newColor, frameLerp(0.1, deltaTime));
        }
      });

      drawBlobs.current();

      animationRef.current = requestAnimationFrame(updateBlobs);
    };

    animationRef.current = requestAnimationFrame(updateBlobs);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isMobile, discoMode, canvasBlur]);

  const canvasOpacity = discoMode ? (isMobile ? 0.38 : 0.48) : isMobile ? 0.12 : 0.15;
  const cssBlurPx = isMobile ? MOBILE_BLUR_PX : DESKTOP_BLUR_PX;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: -1,
        // Blur is baked into the low-res buffer when canvas filters exist — CSS blur is the fallback
        filter: canvasBlur ? undefined : `blur(${cssBlurPx}px)`,
        opacity: canvasOpacity,
        transition: 'opacity 650ms var(--material-cubic-bezier, cubic-bezier(0.4, 0, 0.2, 1))'
      }}
    />
  );
};

export { Background, Blob };
