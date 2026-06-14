'use client';

import { FC, useEffect, useRef } from 'react';

interface StickerData {
  src: string;
  alt?: string;
  startX: string;
  startY: string;
  transformEndX: number;
  transformEndY: number;
}

interface StickerCanvasProps {
  stickers: StickerData[];
  active: boolean;
  className?: string;
}

/**
 * Matches the original Sticker entrance ease: cubic-bezier(0.32, 0.72, 0, 1).
 * Returns an eased y for a linear progress x in [0, 1] using Newton-Raphson.
 */
const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-5) break;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    return sampleY(Math.max(0, Math.min(1, t)));
  };
};

const ease = cubicBezier(0.32, 0.72, 0, 1);
// Quick ease-out for the whileDrag scale pop.
const easeOut = cubicBezier(0, 0, 0.2, 1);

interface Tween {
  from: number;
  to: number;
  start: number;
  dur: number;
  ease: (x: number) => number;
}

const evalTween = (t: Tween, now: number) => {
  if (now <= t.start) return { value: t.from, done: false };
  const p = (now - t.start) / t.dur;
  if (p >= 1) return { value: t.to, done: true };
  return { value: t.from + (t.to - t.from) * t.ease(p), done: false };
};

interface Inertia {
  ampX: number;
  ampY: number;
  targetX: number;
  targetY: number;
  start: number;
}

// Mirrors framer-motion's dragTransition on the original Sticker.
const INERTIA_POWER = 0.15;
const INERTIA_TIME_CONSTANT = 0.15; // seconds
const DRAG_SCALE = 1.08;

// Direction-aware lean: map drag velocity (px/s) to an extra tilt (radians)
// so the sticker banks into the direction it's being flung.
const TILT_PER_VELOCITY = 0.00022;
const MAX_TILT = (22 * Math.PI) / 180; // ~22deg
const TILT_SMOOTH_TAU = 0.09; // seconds, how fast tilt chases its target

interface StickerState {
  data: StickerData;
  // Stable randomised look, matching the original useMemo values.
  rotate: number; // radians
  scale: number;
  duration: number; // entrance, seconds
  delay: number; // entrance, seconds
  // Live transform values.
  x: number;
  y: number;
  opacity: number;
  scaleMul: number;
  tilt: number; // current direction-aware lean (radians)
  tiltTarget: number; // where the lean is heading (radians)
  // Base geometry in CSS px (recomputed on resize).
  left: number;
  top: number;
  w: number;
  h: number;
  // Animation.
  txX: Tween | null;
  txY: Tween | null;
  txO: Tween | null;
  txS: Tween | null;
  inertia: Inertia | null;
  settled: boolean;
  dragging: boolean;
}

interface ImgEntry {
  img: HTMLImageElement;
  loaded: boolean;
  aspect: number;
}

const imageCache = new Map<string, ImgEntry>();

const loadImage = (src: string, onLoad: () => void): ImgEntry => {
  const cached = imageCache.get(src);
  if (cached) {
    if (!cached.loaded) cached.img.addEventListener('load', onLoad, { once: true });
    return cached;
  }
  const img = new Image();
  const entry: ImgEntry = { img, loaded: false, aspect: 1 };
  img.addEventListener(
    'load',
    () => {
      entry.loaded = true;
      entry.aspect = img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
      onLoad();
    },
    { once: true }
  );
  img.src = src;
  imageCache.set(src, entry);
  return entry;
};

const parseUnit = (value: string, base: number) => (parseFloat(value) / 100) * base;

const StickerCanvas: FC<StickerCanvasProps> = ({ stickers, active, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statesRef = useRef<StickerState[]>([]);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const runningRef = useRef(false);
  const activeRef = useRef(active);
  const dragRef = useRef<{
    state: StickerState;
    pointerId: number;
    grabX: number;
    grabY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    vx: number;
    vy: number;
  } | null>(null);

  // Build per-sticker state once (and when the sticker list identity changes).
  useEffect(() => {
    statesRef.current = stickers.map((data) => {
      const entry = loadImage(data.src, kick);
      const state: StickerState = {
        data,
        rotate: ((Math.random() * 50 - 25) * Math.PI) / 180,
        scale: Math.random() * 0.2 + 0.85,
        duration: Math.random() * 0.3 + 0.3,
        delay: Math.random() * 0.15,
        x: data.transformEndX,
        y: data.transformEndY,
        opacity: 0,
        scaleMul: 1,
        tilt: 0,
        tiltTarget: 0,
        left: 0,
        top: 0,
        w: 0,
        h: 0,
        txX: null,
        txY: null,
        txO: null,
        txS: null,
        inertia: null,
        settled: false,
        dragging: false
      };
      // Cache aspect resolves lazily; geometry is recomputed each layout pass.
      (state as StickerState & { _entry: ImgEntry })._entry = entry;
      return state;
    });
    layout();
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickers]);

  // Recompute base geometry from current viewport + image aspect ratios.
  const layout = () => {
    const isMobile = window.matchMedia('(max-width: 480px)').matches;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const widthFactor = isMobile ? 0.3 : 0.12;
    statesRef.current.forEach((s) => {
      const entry = (s as StickerState & { _entry: ImgEntry })._entry;
      const w = widthFactor * vw;
      s.w = w;
      s.h = w / (entry?.aspect || 1);
      s.left = parseUnit(s.data.startX, vw);
      s.top = parseUnit(s.data.startY, vh);
    });
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // Trigger entrance / exit animations whenever `active` flips.
  useEffect(() => {
    activeRef.current = active;
    const now = performance.now();
    statesRef.current.forEach((s) => {
      s.inertia = null;
      s.dragging = false;
      s.tilt = 0;
      s.tiltTarget = 0;
      if (active) {
        s.settled = false;
        s.txX = { from: s.x, to: 0, start: now + s.delay * 1000, dur: s.duration * 1000, ease };
        s.txY = { from: s.y, to: 0, start: now + s.delay * 1000, dur: s.duration * 1000, ease };
        s.txO = { from: s.opacity, to: 1, start: now + s.delay * 1000, dur: 300, ease };
        s.txS = { from: s.scaleMul, to: 1, start: now, dur: 150, ease: easeOut };
      } else {
        s.settled = false;
        s.txX = { from: s.x, to: s.data.transformEndX, start: now, dur: 300, ease };
        s.txY = { from: s.y, to: s.data.transformEndY, start: now, dur: 300, ease };
        s.txO = { from: s.opacity, to: 0, start: now, dur: 300, ease };
        s.txS = { from: s.scaleMul, to: 1, start: now, dur: 150, ease: easeOut };
      }
    });
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const render = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const now = performance.now();
    const frameDt = lastFrameRef.current ? Math.min((now - lastFrameRef.current) / 1000, 0.05) : 0;
    lastFrameRef.current = now;
    let animating = false;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (const s of statesRef.current) {
      // Advance tweens.
      if (s.txX) {
        const r = evalTween(s.txX, now);
        s.x = r.value;
        if (r.done) s.txX = null;
        else animating = true;
      }
      if (s.txY) {
        const r = evalTween(s.txY, now);
        s.y = r.value;
        if (r.done) s.txY = null;
        else animating = true;
      }
      if (s.txO) {
        const r = evalTween(s.txO, now);
        s.opacity = r.value;
        if (r.done) s.txO = null;
        else animating = true;
      }
      if (s.txS) {
        const r = evalTween(s.txS, now);
        s.scaleMul = r.value;
        if (r.done) s.txS = null;
        else animating = true;
      }

      // Advance inertia (drag release momentum).
      if (s.inertia) {
        const t = (now - s.inertia.start) / 1000;
        const factor = Math.exp(-t / INERTIA_TIME_CONSTANT);
        s.x = s.inertia.targetX - s.inertia.ampX * factor;
        s.y = s.inertia.targetY - s.inertia.ampY * factor;
        const speed = (Math.hypot(s.inertia.ampX, s.inertia.ampY) * factor) / INERTIA_TIME_CONSTANT;
        if (speed < 8) {
          s.x = s.inertia.targetX;
          s.y = s.inertia.targetY;
          s.inertia = null;
        } else {
          animating = true;
        }
      }

      // Ease the direction-aware lean toward its target.
      if (Math.abs(s.tilt - s.tiltTarget) > 1e-4) {
        const k = frameDt > 0 ? 1 - Math.exp(-frameDt / TILT_SMOOTH_TAU) : 1;
        s.tilt += (s.tiltTarget - s.tilt) * k;
        animating = true;
      } else {
        s.tilt = s.tiltTarget;
      }

      if (s.dragging) animating = true;

      // Settle once the entrance has finished (enables the drop-shadow).
      if (activeRef.current && !s.txX && !s.txY && !s.txO && !s.inertia && !s.dragging) {
        s.settled = true;
      }

      const entry = (s as StickerState & { _entry: ImgEntry })._entry;
      if (!entry?.loaded || s.opacity <= 0.001) continue;

      const cx = s.left + s.w / 2 + s.x;
      const cy = s.top + s.h / 2 + s.y;
      const totalScale = s.scale * s.scaleMul;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity));
      ctx.translate(cx, cy);
      ctx.rotate(s.rotate + s.tilt);
      ctx.scale(totalScale, totalScale);
      if (s.settled) {
        // drop-shadow(12px 12px 12px rgba(107,107,107,0.1))
        ctx.shadowColor = 'rgba(107, 107, 107, 0.1)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 12;
        ctx.shadowOffsetY = 12;
      }
      ctx.drawImage(entry.img, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }

    if (animating) {
      rafRef.current = requestAnimationFrame(render);
    } else {
      runningRef.current = false;
    }
  };

  // Restart the render loop if it has gone idle.
  const kick = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(render);
  };

  // Hit-test stickers (topmost first) accounting for rotation + scale.
  const stickerAt = (px: number, py: number): StickerState | null => {
    const states = statesRef.current;
    for (let i = states.length - 1; i >= 0; i--) {
      const s = states[i];
      if (s.opacity < 0.5) continue;
      const cx = s.left + s.w / 2 + s.x;
      const cy = s.top + s.h / 2 + s.y;
      const dx = px - cx;
      const dy = py - cy;
      const cos = Math.cos(-s.rotate);
      const sin = Math.sin(-s.rotate);
      const total = s.scale * s.scaleMul || 1;
      const lx = (dx * cos - dy * sin) / total;
      const ly = (dx * sin + dy * cos) / total;
      if (lx >= -s.w / 2 && lx <= s.w / 2 && ly >= -s.h / 2 && ly <= s.h / 2) {
        return s;
      }
    }
    return null;
  };

  // Pointer + resize wiring.
  useEffect(() => {
    resizeCanvas();
    layout();

    const onResize = () => {
      resizeCanvas();
      layout();
      kick();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!activeRef.current || dragRef.current) return;
      const s = stickerAt(e.clientX, e.clientY);
      if (!s) return;
      e.preventDefault();
      s.dragging = true;
      s.settled = false;
      s.txX = null;
      s.txY = null;
      s.inertia = null;
      s.txS = { from: s.scaleMul, to: DRAG_SCALE, start: performance.now(), dur: 150, ease: easeOut };
      dragRef.current = {
        state: s,
        pointerId: e.pointerId,
        grabX: e.clientX - s.x,
        grabY: e.clientY - s.y,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
        vx: 0,
        vy: 0
      };
      kick();
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      e.preventDefault();
      const now = performance.now();
      const dt = (now - drag.lastT) / 1000;
      if (dt > 0) {
        drag.vx = (e.clientX - drag.lastX) / dt;
        drag.vy = (e.clientY - drag.lastY) / dt;
      }
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.lastT = now;
      drag.state.x = e.clientX - drag.grabX;
      drag.state.y = e.clientY - drag.grabY;
      // Bank into the horizontal drag direction.
      drag.state.tiltTarget = Math.max(
        -MAX_TILT,
        Math.min(MAX_TILT, drag.vx * TILT_PER_VELOCITY)
      );
      kick();
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const s = drag.state;
      s.dragging = false;
      const now = performance.now();
      const ampX = drag.vx * INERTIA_POWER;
      const ampY = drag.vy * INERTIA_POWER;
      s.inertia = { ampX, ampY, targetX: s.x + ampX, targetY: s.y + ampY, start: now };
      s.txS = { from: s.scaleMul, to: 1, start: now, dur: 150, ease: easeOut };
      s.tiltTarget = 0; // ease back upright on release
      dragRef.current = null;
      kick();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
};

export { StickerCanvas };
