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

const Blob = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
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

  // Base colors (more vibrant versions)
  const baseColors = [
    '#0d00a9', // blob3 - blue
    '#fd0f00', // blob2 - red
    '#e1bd00' // blob1 - yellow
  ];

  // Target colors for interpolation (slightly shifted for animation)
  const targetColors = [
    '#1a00ff', // blob3 - brighter blue
    '#ff1a1a', // blob2 - brighter red
    '#ffd700' // blob1 - brighter yellow
  ];

  const blobConfigs: BlobConfig[] = [
    { height: 70, aspectRatio: 3 / 2, color: '#0d00a9', lerpFactor: 0.1 }, // blob3
    { height: 60, aspectRatio: 3 / 2, color: '#fd0f00', lerpFactor: 0.2 }, // blob2
    { height: 50, aspectRatio: 2 / 1, color: '#e1bd00', lerpFactor: 0.3 } // blob1
  ];

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
      // Redraw canvas on resize
      drawBlobs.current();
    };

    checkMobile();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Desktop mouse movement handler
  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isMobile]);

  // Mobile touch handler
  useEffect(() => {
    if (!isMobile) return;

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        const touch = event.touches[0];
        setMousePos({ x: touch.clientX, y: touch.clientY });
      }
    };

    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isMobile]);

  // Draw all blobs on canvas
  const drawBlobs = useRef(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to full viewport
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Convert vh to pixels
    const vhToPx = (vh: number) => (vh / 100) * window.innerHeight;
    const disco = discoModeRef.current;
    const coreAlpha = disco ? 0.7 : 0.6;
    const midAlpha = disco ? 0.55 : 0.5;
    const outerAlpha = disco ? 0.34 : 0.3;

    // Draw each blob
    blobConfigs.forEach((config, index) => {
      const blobPos = blobPositionsRef.current[index];
      const blobHeight = vhToPx(config.height);
      const blobWidth = blobHeight * config.aspectRatio;
      const currentColor = blobColorsRef.current[index];

      // Calculate rotation angle
      // On mobile, use time-based rotation if no mouse/touch position
      let angle = 0;
      if (mousePos.x !== 0 || mousePos.y !== 0) {
        angle = Math.atan2(mousePos.y - blobPos.y, mousePos.x - blobPos.x);
      } else if (isMobileRef.current || disco) {
        // Slow sweep like a rotating stage light
        const spin = disco ? (reduceMotionRef.current ? 0.25 : 0.55) : 0.3;
        angle = timeRef.current * spin + index * 0.5;
      }

      // Save context
      ctx.save();

      // Set blend mode for additive color mixing when overlapping
      ctx.globalCompositeOperation = 'lighter';

      // Translate to blob position (center of blob)
      ctx.translate(blobPos.x, blobPos.y);

      // Rotate around center
      ctx.rotate(angle);

      // Create gradient for smoother blob with transparency for blending
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(blobWidth, blobHeight) / 2);
      // Use rgba with reduced opacity so blobs can overlap and blend
      const rgb = hexToRgb(currentColor);
      gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${coreAlpha})`);
      gradient.addColorStop(0.3, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${midAlpha})`);
      gradient.addColorStop(0.6, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${outerAlpha})`);
      gradient.addColorStop(1, 'transparent');

      // Draw ellipse centered at origin (after translate)
      ctx.beginPath();
      ctx.ellipse(0, 0, blobWidth / 2, blobHeight / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Restore context
      ctx.restore();
    });

    // Apply blur and opacity via composite operation
    // We'll use CSS filter for blur as it's more performant
  });

  // Animation loop — skip continuous rAF on mobile unless disco (spotlight wash).
  // Full-screen blur(100px) canvas competing with the infinite canvas is a major Android jank source.
  useEffect(() => {
    if (isMobile && !discoMode) {
      drawBlobs.current();
      return;
    }

    let lastTime = performance.now();

    const updateBlobs = () => {
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      timeRef.current += deltaTime;
      const disco = discoModeRef.current;
      const reduceMotion = reduceMotionRef.current;

      // Update positions for each blob
      blobConfigs.forEach((config, index) => {
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
          blobPositionsRef.current[index] = {
            x: lerp(currentPos.x, targetX, 0.06),
            y: lerp(currentPos.y, targetY, 0.06)
          };
        } else {
          // Desktop: follow mouse
          const newX = lerp(currentPos.x, mousePos.x, config.lerpFactor);
          const newY = lerp(currentPos.y, mousePos.y, config.lerpFactor);
          blobPositionsRef.current[index] = { x: newX, y: newY };
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
          const blend = reduceMotion ? 0.05 : 0.1;
          blobColorsRef.current[index] = lerpColor(currentColor, target, blend);
        } else {
          // Lerp colors based on time and mouse position
          const timeOffset = index * 0.5;
          const posInfluence = Math.sin((mousePos.x + mousePos.y) * 0.001) * 0.5 + 0.5;
          const timeInfluence = Math.sin(timeRef.current * 0.5 + timeOffset) * 0.5 + 0.5;
          const lerpValue = posInfluence * 0.3 + timeInfluence * 0.7;

          const baseColor = baseColors[index];
          const targetColor = targetColors[index];
          const newColor = lerpColor(baseColor, targetColor, lerpValue);

          blobColorsRef.current[index] = lerpColor(currentColor, newColor, 0.1);
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
  }, [mousePos, isMobile, discoMode, blobConfigs, baseColors, targetColors]);

  // Initial draw
  useEffect(() => {
    drawBlobs.current();
  }, [isMobile]);

  const canvasOpacity = discoMode ? (isMobile ? 0.38 : 0.48) : isMobile ? 0.12 : 0.15;

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
        // Softer blur on mobile — 100px over a moving canvas is extremely expensive
        filter: isMobile ? 'blur(40px)' : 'blur(100px)',
        opacity: canvasOpacity,
        transition: 'opacity 650ms var(--material-cubic-bezier, cubic-bezier(0.4, 0, 0.2, 1))'
      }}
    />
  );
};

export { Background, Blob };
