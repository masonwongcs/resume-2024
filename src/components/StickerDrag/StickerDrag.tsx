'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_IMAGE =
  'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/3fb4a247-64e9-4c54-2391-86598eebfe00/w=800';

type ResponsiveImageSource =
  | string
  | {
      src?: string;
      srcSet?: string | Array<{ src?: string }>;
      url?: string;
      default?: string;
      asset?: { url?: string };
      alt?: string;
    }
  | null
  | undefined;

export interface StickerDragProps {
  image?: ResponsiveImageSource;
  imageWidth?: number;
  imageHeight?: number;
  tilt?: number;
  tiltSmoothing?: number;
  lighting?: boolean;
  lightingStrength?: number;
  lightingColor?: string;
  sheenMode?: 'sheen' | 'holo';
  elevation?: number;
  staticShadow?: string;
  dynamicShadow?: string;
  style?: React.CSSProperties;
  className?: string;
}

const MAX_RENDER_SCALE = 2;
const PAD_BASE = 20;
const MESH_GRID_SIZE = 32;
const DRAG_Z_INDEX_BASE = 1000;

let zIndexCounter = DRAG_Z_INDEX_BASE;

function getNextZIndex(): number {
  zIndexCounter += 1;
  return zIndexCounter;
}

const DRAG_TILT_SENSITIVITY = 3;
const DRAG_TILT_SMOOTHING = 0.05;
const SHEEN_TILT_SHIFT = 0.05;
const SHEEN_TILT_DEADZONE = 0.035;
const ANIM_SPEED = 1.92;
const HOLO_MOTION_BUMP = 0.15;
const HOLO_MOTION_DECAY = 0.88;

// Crossfade duration for the canvas -> <img> handoff after a drop.
const RELEASE_FADE_MS = 160;

const STATIC_SHADOW_DEFAULT = '0px 2px 5px 0px rgba(0, 0, 0, 0.07)';
const DYNAMIC_SHADOW_DEFAULT = '0px 18px 36px 0px rgba(0, 0, 0, 0.11)';
const ELEVATION_INTERNAL_MAX = 0.3;

// Tight ambient-occlusion shadow that stays under the sticker at rest.
const CONTACT_SHADOW = {
  x: 0,
  y: 1,
  blur: 2,
  opacity: 0.09
};

// Soft penumbra that blooms as the sticker lifts.
const AMBIENT_SHADOW_LIFTED = {
  x: 0,
  y: 10,
  blur: 26,
  opacity: 0.05
};

const VERTEX_SHADER = `
attribute vec2 aPos;
attribute vec2 aUV;
uniform float uPeel;
uniform float uLift;
uniform float uPeelAngle;
uniform float uPasting;
uniform vec2 uScale;
uniform float uElevation;
varying vec2 vUV;
varying float vHi;
varying float vSh;

void main() {
    vUV = aUV;
    vec2 p = aPos;
    vHi = 0.0;
    vSh = 0.0;

    if (uPeel > 0.0) {
        vec2 peelAxis = vec2(cos(uPeelAngle), sin(uPeelAngle));
        vec2 uvCentered = aUV - vec2(0.5);
        float proj = dot(uvCentered, peelAxis);
        float diag = 0.5 - proj;
        float peelLine = -0.3 + uPeel * 2.0;
        float rampWidth = 0.6;
        float lifted = smoothstep(peelLine - rampWidth, peelLine, diag);
        lifted = 1.0 - lifted;
        float scale = 1.0 + lifted * uElevation;
        p *= scale;
        float inRamp = smoothstep(peelLine - rampWidth, peelLine - rampWidth * 0.5, diag) *
                       smoothstep(peelLine + 0.05, peelLine - rampWidth * 0.3, diag);
        float curveAmount = uPasting > 0.5 ? 0.06 : 0.12;
        p += (-peelAxis) * inRamp * curveAmount;
        float t = smoothstep(peelLine - rampWidth, peelLine, diag);
        vHi = inRamp * 0.75 * pow(1.0 - t, 1.2);
        vSh = inRamp * 0.75 * pow(t, 1.2);
    }

    gl_Position = vec4(p * uScale, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uTilt;
uniform float uSheenStrength;
uniform float uSheenTiltShift;
uniform float uSheenTiltDeadzone;
uniform float uMaxTiltDeg;
uniform float uHoloMode;
uniform float uHoloMotion;
uniform vec3 uSheenColor;
varying vec2 vUV;
varying float vHi;
varying float vSh;

vec3 overlayBlend(vec3 base, vec3 blend) {
    return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
}

vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);
    return rgb + m;
}

void main() {
    vec4 tex = texture2D(uTex, vUV);
    if (tex.a < 0.01) discard;

    vec3 c = tex.rgb * 0.95;

    float maxTilt = max(0.001, uMaxTiltDeg);
    float tiltMag = clamp(length(uTilt) / maxTilt, 0.0, 1.0);
    float tiltGate = smoothstep(uSheenTiltDeadzone, 1.0, tiltMag);
    float gradient = fract(vUV.x * 0.5 + vUV.y * 0.5 + uTilt.x * uSheenTiltShift + uTilt.y * uSheenTiltShift);

    if (uHoloMode > 0.5) {
        float holoStrength = uSheenStrength * uHoloMotion;
        float distFromWhite = length(tex.rgb - vec3(1.0));
        float nonWhiteMask = smoothstep(0.06, 0.22, distFromWhite);
        vec3 rainbow = hsl2rgb(gradient, 0.8, 0.55);
        c = mix(c, rainbow, holoStrength * nonWhiteMask * tex.a);
    } else {
        float effectStrength = uSheenStrength * tiltGate;
        float sheen = smoothstep(0.2, 0.5, gradient) * (1.0 - smoothstep(0.5, 0.8, gradient));
        c = mix(c, uSheenColor, sheen * effectStrength * tex.a);
    }

    float hiW = clamp(vHi, 0.0, 1.0) * 0.55;
    float shW = clamp(vSh, 0.0, 1.0) * 0.60;

    vec3 hi = overlayBlend(c, vec3(1.0));
    c = mix(c, hi, hiW);

    vec3 sh = overlayBlend(c, vec3(0.0));
    c = mix(c, sh, shW);
    c *= (1.0 - shW * 0.35);

    c = clamp(c, 0.0, 1.0);
    gl_FragColor = vec4(c, tex.a);
}
`;

const resolveImageSource = (input?: ResponsiveImageSource): string | undefined => {
  if (!input) return undefined;
  if (typeof input === 'string') return input.trim() || undefined;
  return input.src || input.url || input.asset?.url || undefined;
};

function parseColorToRgb(input?: string): [number, number, number] {
  if (!input) return [1, 1, 1];
  const s = input.trim();
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  let h = s.replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }
  return [1, 1, 1];
}

interface ParsedShadow {
  x: number;
  y: number;
  blur: number;
  opacity: number;
}

function parseShadowOpacity(color: string): number {
  const rgba = color.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
  if (rgba) return Math.max(0, Math.min(1, parseFloat(rgba[1])));
  return 0.12;
}

function parseBoxShadow(shadow: string): ParsedShadow {
  const result: ParsedShadow = {
    x: 0,
    y: 0,
    blur: 0,
    opacity: 0.12
  };

  if (!shadow) return result;

  const colorMatch = shadow.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|\b[a-z]+\b(?=\s*$))/i);
  if (colorMatch) {
    result.opacity = parseShadowOpacity(colorMatch[0]);
  }

  const numbers = shadow.match(/-?\d+(\.\d+)?(px)?/g);
  if (numbers) {
    const vals = numbers.map((n) => parseFloat(n));
    if (vals.length >= 1) result.x = vals[0];
    if (vals.length >= 2) result.y = vals[1];
    if (vals.length >= 3) result.blur = vals[2];
  }

  return result;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function shadowLayer(x: number, y: number, blur: number, opacity: number) {
  const alpha = Math.max(0, Math.min(1, opacity));
  if (alpha < 0.005) return '';
  return `drop-shadow(${x.toFixed(2)}px ${y.toFixed(2)}px ${blur.toFixed(2)}px rgba(0, 0, 0, ${alpha.toFixed(3)}))`;
}

function buildShadowFilter(
  staticShadow: ParsedShadow,
  dynamicShadow: ParsedShadow,
  liftT: number,
  tiltX: number,
  tiltY: number,
  maxTilt: number
): string {
  const t = liftT * liftT * (3 - 2 * liftT);
  const tiltScale = Math.max(0.001, maxTilt);
  const tiltNormX = tiltX / tiltScale;
  const tiltNormY = tiltY / tiltScale;

  // Overhead light: tilt shifts the cast shadow opposite the lifted edge.
  const tiltOffsetX = tiltNormY * (2 + t * 10);
  const tiltOffsetY = tiltNormX * (2 + t * 8);

  const contactY = CONTACT_SHADOW.y + t * 1.5;
  const contactBlur = CONTACT_SHADOW.blur + t * 1.2;
  const contactOpacity = lerp(CONTACT_SHADOW.opacity, CONTACT_SHADOW.opacity * 0.45, t);

  const castX = lerp(staticShadow.x, dynamicShadow.x, t) + tiltOffsetX;
  const castY = lerp(staticShadow.y, dynamicShadow.y, t) + tiltOffsetY + t * 6;
  const castBlur = lerp(staticShadow.blur, dynamicShadow.blur, t) + t * 6;
  const castOpacity = lerp(staticShadow.opacity, dynamicShadow.opacity, t);

  const ambientOpacity = AMBIENT_SHADOW_LIFTED.opacity * t * t;
  const ambientY = lerp(AMBIENT_SHADOW_LIFTED.y * 0.35, AMBIENT_SHADOW_LIFTED.y, t) + tiltOffsetY * 0.6;
  const ambientBlur = lerp(AMBIENT_SHADOW_LIFTED.blur * 0.4, AMBIENT_SHADOW_LIFTED.blur, t) + t * 10;

  return [
    shadowLayer(CONTACT_SHADOW.x + tiltOffsetX * 0.25, contactY + tiltOffsetY * 0.25, contactBlur, contactOpacity),
    shadowLayer(castX, castY, castBlur, castOpacity),
    shadowLayer(tiltOffsetX * 0.4, ambientY, ambientBlur, ambientOpacity)
  ]
    .filter(Boolean)
    .join(' ');
}

const StickerDrag: React.FC<StickerDragProps> = ({
  image,
  imageWidth = 200,
  imageHeight = 200,
  tilt = 10,
  tiltSmoothing = DRAG_TILT_SMOOTHING,
  lighting = true,
  lightingStrength = 10,
  lightingColor = '#ffffff',
  sheenMode = 'sheen',
  elevation: elevationLevel = 10,
  staticShadow = STATIC_SHADOW_DEFAULT,
  dynamicShadow = DYNAMIC_SHADOW_DEFAULT,
  style,
  className
}) => {
  const tiltSensitivity = DRAG_TILT_SENSITIVITY;
  const maxTilt = Math.max(1, tilt);
  const sheenStrength = lighting ? Math.max(1, Math.min(10, lightingStrength)) / 10 : 0;
  const sheenColor = useMemo(() => parseColorToRgb(lightingColor), [lightingColor]);
  const elevation = (Math.max(1, Math.min(10, elevationLevel)) / 10) * ELEVATION_INTERNAL_MAX;
  const resolvedSrc = useMemo(() => resolveImageSource(image) || DEFAULT_IMAGE, [image]);

  // The WebGL context only exists while the sticker is being interacted with;
  // at rest a plain <img> is shown instead. This keeps the number of live
  // WebGL contexts at ~1 no matter how many stickers are mounted.
  const [interactive, setInteractive] = useState(false);
  // True once the canvas has real content, so the <img> can be hidden.
  const [glLive, setGlLive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const vboRef = useRef<WebGLBuffer | null>(null);
  const iboRef = useRef<WebGLBuffer | null>(null);
  const indexCountRef = useRef<number>(0);
  const locsRef = useRef<{
    aPos: number;
    aUV: number;
    uPeel: WebGLUniformLocation | null;
    uLift: WebGLUniformLocation | null;
    uPeelAngle: WebGLUniformLocation | null;
    uPasting: WebGLUniformLocation | null;
    uScale: WebGLUniformLocation | null;
    uElevation: WebGLUniformLocation | null;
    uTilt: WebGLUniformLocation | null;
    uSheenStrength: WebGLUniformLocation | null;
    uSheenColor: WebGLUniformLocation | null;
    uSheenTiltShift: WebGLUniformLocation | null;
    uSheenTiltDeadzone: WebGLUniformLocation | null;
    uMaxTiltDeg: WebGLUniformLocation | null;
    uHoloMode: WebGLUniformLocation | null;
    uHoloMotion: WebGLUniformLocation | null;
    uTex: WebGLUniformLocation | null;
  } | null>(null);

  const stateRef = useRef({
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 200,
    scaleX: 1.0,
    scaleY: 1.0,
    held: false,
    peeling: false,
    sticking: false,
    settling: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOrigX: 0,
    dragOrigY: 0,
    peel: 0,
    lift: 0,
    peelAngle: -Math.PI / 4,
    dragTiltX: 0,
    dragTiltY: 0,
    currentTiltX: 0,
    currentTiltY: 0,
    prevTiltX: 0,
    prevTiltY: 0,
    holoMotion: 0,
    lastMoveX: 0,
    lastMoveY: 0,
    lastMoveT: 0,
    texReady: false
  });

  const animationRef = useRef<number | null>(null);
  const lastTickTRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Distinguishes the release handoff from the initial mount (both have
  // glLive === false) so the fade-out only runs on release.
  const releasingRef = useRef(false);

  const cancelScheduledRelease = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    releasingRef.current = false;
  }, []);

  const draw = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const texture = textureRef.current;
    const locs = locsRef.current;
    const state = stateRef.current;

    if (!gl || !program || !texture || !locs || !state.texReady) return;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, vboRef.current);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iboRef.current);

    gl.enableVertexAttribArray(locs.aPos);
    gl.enableVertexAttribArray(locs.aUV);
    gl.vertexAttribPointer(locs.aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(locs.aUV, 2, gl.FLOAT, false, 16, 8);

    gl.uniform1f(locs.uPeel, state.peel);
    gl.uniform1f(locs.uLift, state.lift);
    gl.uniform1f(locs.uPeelAngle, state.peelAngle);
    gl.uniform1f(locs.uPasting, state.sticking ? 1.0 : 0.0);
    gl.uniform2f(locs.uScale, state.scaleX, state.scaleY);
    gl.uniform1f(locs.uElevation, elevation);

    gl.uniform2f(locs.uTilt, state.currentTiltX, state.currentTiltY);
    gl.uniform1f(locs.uSheenStrength, sheenStrength);
    gl.uniform3f(locs.uSheenColor, sheenColor[0], sheenColor[1], sheenColor[2]);
    gl.uniform1f(locs.uSheenTiltShift, SHEEN_TILT_SHIFT);
    gl.uniform1f(locs.uSheenTiltDeadzone, SHEEN_TILT_DEADZONE);
    gl.uniform1f(locs.uMaxTiltDeg, maxTilt);
    gl.uniform1f(locs.uHoloMode, sheenMode === 'holo' ? 1.0 : 0.0);
    gl.uniform1f(locs.uHoloMotion, state.holoMotion);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(locs.uTex, 0);

    gl.drawElements(gl.TRIANGLES, indexCountRef.current, gl.UNSIGNED_SHORT, 0);
  }, [sheenStrength, sheenColor, sheenMode, elevation, maxTilt]);

  const parsedStaticShadow = useMemo(() => parseBoxShadow(staticShadow), [staticShadow]);
  const parsedDynamicShadow = useMemo(() => parseBoxShadow(dynamicShadow), [dynamicShadow]);

  // brightness(0.95) mirrors the shader's `tex.rgb * 0.95` so the static
  // <img> and the GL render are pixel-identical at rest (no blink on swap).
  const restShadowFilter = useMemo(
    () => `brightness(0.95) ${buildShadowFilter(parsedStaticShadow, parsedDynamicShadow, 0, 0, 0, maxTilt)}`,
    [parsedStaticShadow, parsedDynamicShadow, maxTilt]
  );

  const lastFilterRef = useRef('');

  const updateShadowCSS = useCallback(() => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas) return;

    const liftT = Math.max(state.lift, state.peel);

    const filter = buildShadowFilter(
      parsedStaticShadow,
      parsedDynamicShadow,
      liftT,
      state.currentTiltX,
      state.currentTiltY,
      maxTilt
    );

    // Reassigning an identical filter still forces a re-rasterization.
    if (filter === lastFilterRef.current) return;
    lastFilterRef.current = filter;
    canvas.style.filter = filter;
  }, [parsedStaticShadow, parsedDynamicShadow, maxTilt]);

  // Release handoff: in the same paint that reveals the <img>, move the
  // shadow to it (a doubled shadow blinks dark) and start fading the canvas
  // out on top of the identical image so any residual difference blends in.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!glLive && releasingRef.current && canvas) {
      canvas.style.filter = 'none';
      lastFilterRef.current = '';
      canvas.style.opacity = '0';
    }
  }, [glLive]);

  const tick = useCallback(
    (timestamp: number) => {
      const state = stateRef.current;

      if (lastTickTRef.current === null) {
        lastTickTRef.current = timestamp;
      }

      const dt = Math.min((timestamp - lastTickTRef.current) / 1000, 0.1);
      lastTickTRef.current = timestamp;

      const step = ANIM_SPEED * dt;
      let changed = false;

      if (state.peeling) {
        if (state.peel < 1 || state.lift < 1) {
          state.peel = Math.min(1, state.peel + step);
          state.lift = Math.min(1, state.lift + step);
          changed = true;
        }
      }

      if (state.sticking) {
        if (state.peel > 0 || state.lift > 0) {
          state.peel = Math.max(0, state.peel - step);
          state.lift = Math.max(0, state.lift - step);
          changed = true;
        } else {
          state.sticking = false;
        }
      }

      if (state.settling) {
        state.dragTiltX *= 0.9;
        state.dragTiltY *= 0.9;

        if (Math.abs(state.dragTiltX) < 0.1 && Math.abs(state.dragTiltY) < 0.1) {
          state.dragTiltX = 0;
          state.dragTiltY = 0;
          state.prevTiltX = 0;
          state.prevTiltY = 0;
          state.settling = false;
        }

        state.currentTiltX = state.dragTiltX;
        state.currentTiltY = state.dragTiltY;

        const inner = innerRef.current;
        if (inner) {
          inner.style.transform = state.settling
            ? `rotateX(${state.dragTiltX}deg) rotateY(${state.dragTiltY}deg)`
            : '';
        }
        changed = true;
      }

      const holoDecayActive = sheenMode === 'holo' && state.holoMotion > 0.005;
      if (holoDecayActive) {
        state.holoMotion *= HOLO_MOTION_DECAY;
        if (state.holoMotion < 0.005) state.holoMotion = 0;
        changed = true;
      }

      // Shadow also tracks tilt while dragging, even if peel state is stable.
      if (changed || state.held) {
        updateShadowCSS();
      }

      if (changed || state.held || holoDecayActive) {
        draw();
      }

      if (state.held || state.peeling || state.sticking || state.settling || holoDecayActive) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
        lastTickTRef.current = null;
        // Fully at rest: swap back to the static <img> and release the GL
        // context. The <img> is revealed first, the canvas crossfades out on
        // top of it, then the canvas is unmounted once the fade completes.
        if (state.peel === 0 && state.lift === 0) {
          releasingRef.current = true;
          setGlLive(false);
          releaseTimerRef.current = setTimeout(() => {
            releaseTimerRef.current = null;
            releasingRef.current = false;
            setInteractive(false);
          }, RELEASE_FADE_MS + 80);
        }
      }
    },
    [draw, updateShadowCSS, sheenMode]
  );

  const ensureTickRunning = useCallback(() => {
    if (animationRef.current !== null) return;
    lastTickTRef.current = null;
    animationRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Stop the animation loop on unmount (the GL teardown lives in the
  // interactive layout effect below).
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      cancelScheduledRelease();
    };
  }, [cancelScheduledRelease]);

  const handleResize = useCallback(() => {
    const container = containerRef.current;
    const sticker = stickerRef.current;
    const state = stateRef.current;

    if (!container || !sticker) return;

    const containerWidth = container.clientWidth || 200;
    const containerHeight = container.clientHeight || 200;

    const width = imageWidth > 0 ? imageWidth : containerWidth;
    const height = imageHeight > 0 ? imageHeight : containerHeight;

    const maxDim = Math.max(width, height);
    const elevationPad = maxDim * elevation * 0.6;
    const effectivePad = PAD_BASE + elevationPad;
    const canvasWidth = width + effectivePad * 2;
    const canvasHeight = height + effectivePad * 2;

    // Per-axis scale so the rest-state quad covers exactly the sticker rect
    // (a shared min() scale distorts non-square stickers and would make the
    // canvas <-> <img> swap visibly jump).
    const scaleX = width / canvasWidth;
    const scaleY = height / canvasHeight;

    const x = (containerWidth - width) / 2;
    const y = (containerHeight - height) / 2;

    sticker.style.width = `${width}px`;
    sticker.style.height = `${height}px`;
    sticker.style.left = `${x}px`;
    sticker.style.top = `${y}px`;

    state.width = width;
    state.height = height;
    state.x = x;
    state.y = y;
    state.scaleX = scaleX;
    state.scaleY = scaleY;

    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (canvas && gl) {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
      canvas.width = Math.round(canvasWidth * dpr);
      canvas.height = Math.round(canvasHeight * dpr);
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      canvas.style.left = `${-effectivePad}px`;
      canvas.style.top = `${-effectivePad}px`;

      gl.viewport(0, 0, canvas.width, canvas.height);

      if (state.texReady) {
        draw();
      }
    }
  }, [draw, elevation, imageWidth, imageHeight]);

  // Uploads the rendered <img> as the GL texture. No-ops until both the GL
  // context and the image are ready; called from GL init and the img onLoad.
  const uploadTexture = useCallback(() => {
    const gl = glRef.current;
    const img = imgRef.current;
    const state = stateRef.current;

    if (!gl || !img || !img.complete || img.naturalWidth === 0) return;

    // Ensure state.width/height reflect the current layout before rasterizing.
    handleResize();

    // Rasterize at display resolution: SVGs would otherwise be uploaded at
    // their (small) intrinsic size and look blurrier than the crisp <img>.
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
    const texW = Math.max(1, Math.round(state.width * dpr));
    const texH = Math.max(1, Math.round(state.height * dpr));

    let source: TexImageSource = img;
    const off = document.createElement('canvas');
    off.width = texW;
    off.height = texH;
    const ctx = off.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, texW, texH);
      source = off;
    }

    if (textureRef.current) {
      gl.deleteTexture(textureRef.current);
    }

    const texture = gl.createTexture();
    if (!texture) return;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    textureRef.current = texture;
    state.texReady = true;

    updateShadowCSS();
    draw();
    setGlLive(true);
  }, [draw, handleResize, updateShadowCSS]);

  // Lazily create the WebGL context when a drag starts and tear it down once
  // the sticker settles. Layout effect so the canvas has content before paint,
  // making the <img> -> canvas swap seamless.
  useLayoutEffect(() => {
    if (!interactive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Edges come from texture alpha, so MSAA adds cost without visual benefit.
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false
    });
    if (!gl) return;

    glRef.current = gl;

    const compileShader = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(VERTEX_SHADER, gl.VERTEX_SHADER);
    const fs = compileShader(FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    programRef.current = program;

    locsRef.current = {
      aPos: gl.getAttribLocation(program, 'aPos'),
      aUV: gl.getAttribLocation(program, 'aUV'),
      uPeel: gl.getUniformLocation(program, 'uPeel'),
      uLift: gl.getUniformLocation(program, 'uLift'),
      uPeelAngle: gl.getUniformLocation(program, 'uPeelAngle'),
      uPasting: gl.getUniformLocation(program, 'uPasting'),
      uScale: gl.getUniformLocation(program, 'uScale'),
      uElevation: gl.getUniformLocation(program, 'uElevation'),
      uTilt: gl.getUniformLocation(program, 'uTilt'),
      uSheenStrength: gl.getUniformLocation(program, 'uSheenStrength'),
      uSheenColor: gl.getUniformLocation(program, 'uSheenColor'),
      uSheenTiltShift: gl.getUniformLocation(program, 'uSheenTiltShift'),
      uSheenTiltDeadzone: gl.getUniformLocation(program, 'uSheenTiltDeadzone'),
      uMaxTiltDeg: gl.getUniformLocation(program, 'uMaxTiltDeg'),
      uHoloMode: gl.getUniformLocation(program, 'uHoloMode'),
      uHoloMotion: gl.getUniformLocation(program, 'uHoloMotion'),
      uTex: gl.getUniformLocation(program, 'uTex')
    };

    const N = MESH_GRID_SIZE;
    const verts: number[] = [];
    const inds: number[] = [];

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        verts.push((i / N) * 2 - 1, (j / N) * 2 - 1, i / N, 1 - j / N);
      }
    }

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i;
        inds.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1);
      }
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    vboRef.current = vbo;

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(inds), gl.STATIC_DRAW);
    iboRef.current = ibo;
    indexCountRef.current = inds.length;

    lastFilterRef.current = '';
    uploadTexture();

    return () => {
      setGlLive(false);
      stateRef.current.texReady = false;

      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
      if (vboRef.current) gl.deleteBuffer(vboRef.current);
      if (iboRef.current) gl.deleteBuffer(iboRef.current);
      if (textureRef.current) gl.deleteTexture(textureRef.current);

      vboRef.current = null;
      iboRef.current = null;
      textureRef.current = null;
      programRef.current = null;
      locsRef.current = null;
      glRef.current = null;
      lastFilterRef.current = '';

      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [interactive, uploadTexture]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    handleResize();

    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, [handleResize]);

  const stopCarouselPropagation = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      const state = stateRef.current;
      const container = containerRef.current;
      const sticker = stickerRef.current;
      const inner = innerRef.current;
      if (!container || !sticker || !inner) return;

      const rect = sticker.getBoundingClientRect();

      const grabOffsetX = clientX - rect.left;
      const grabOffsetY = clientY - rect.top;
      inner.style.transformOrigin = `${grabOffsetX}px ${grabOffsetY}px`;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      state.peelAngle = Math.atan2(dy, dx);

      state.dragStartX = clientX;
      state.dragStartY = clientY;
      state.dragOrigX = state.offsetX;
      state.dragOrigY = state.offsetY;

      state.peel = 0;
      state.lift = 0;

      state.held = true;
      state.peeling = true;
      state.sticking = false;
      state.settling = false;

      state.lastMoveX = clientX;
      state.lastMoveY = clientY;
      state.lastMoveT = performance.now();

      container.style.zIndex = `${getNextZIndex()}`;

      ensureTickRunning();
    },
    [ensureTickRunning]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Re-grabbed during the release handoff: keep the live context and
      // fade the canvas back in from wherever the fade-out got to.
      cancelScheduledRelease();
      if (glRef.current && stateRef.current.texReady) {
        if (canvasRef.current) {
          canvasRef.current.style.opacity = '1';
        }
        setGlLive(true);
      }
      setInteractive(true);
      beginDrag(e.clientX, e.clientY);
    },
    [beginDrag, cancelScheduledRelease]
  );

  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      const state = stateRef.current;
      if (!state.held) return;

      const sticker = stickerRef.current;
      const inner = innerRef.current;
      if (!sticker || !inner) return;

      // Translate via transform so dragging stays on the compositor
      // instead of triggering layout each pointermove.
      state.offsetX = state.dragOrigX + (clientX - state.dragStartX);
      state.offsetY = state.dragOrigY + (clientY - state.dragStartY);
      sticker.style.transform = `translate3d(${state.offsetX}px, ${state.offsetY}px, 0)`;

      const now = performance.now();
      const dt = Math.max(1, now - state.lastMoveT);
      const velX = ((clientX - state.lastMoveX) / dt) * 16;
      const velY = ((clientY - state.lastMoveY) / dt) * 16;
      state.lastMoveX = clientX;
      state.lastMoveY = clientY;
      state.lastMoveT = now;

      const targetTiltY = Math.max(-maxTilt, Math.min(maxTilt, velX * tiltSensitivity));
      const targetTiltX = Math.max(-maxTilt, Math.min(maxTilt, -velY * tiltSensitivity));

      state.dragTiltX += (targetTiltX - state.dragTiltX) * tiltSmoothing;
      state.dragTiltY += (targetTiltY - state.dragTiltY) * tiltSmoothing;

      state.currentTiltX = state.dragTiltX;
      state.currentTiltY = state.dragTiltY;

      if (sheenMode === 'holo') {
        const tiltDelta =
          Math.abs(state.dragTiltX - state.prevTiltX) + Math.abs(state.dragTiltY - state.prevTiltY);
        state.holoMotion = Math.min(1, state.holoMotion + tiltDelta * HOLO_MOTION_BUMP);
        state.prevTiltX = state.dragTiltX;
        state.prevTiltY = state.dragTiltY;
      }

      // Shadow is updated by the rAF tick, not per pointermove event.
      inner.style.transform = `rotateX(${state.dragTiltX}deg) rotateY(${state.dragTiltY}deg)`;
    },
    [maxTilt, tiltSensitivity, tiltSmoothing, sheenMode]
  );

  const endDrag = useCallback(() => {
    const state = stateRef.current;
    if (!state.held) return;

    const inner = innerRef.current;

    state.held = false;
    state.peeling = false;
    state.sticking = true;
    // Tilt decay is handled by the main tick loop rather than a parallel
    // rAF loop, so shadow/draw updates happen once per frame.
    state.settling = true;

    if (state.peel >= 0.95 && inner) {
      const rect = inner.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = state.lastMoveX - centerX;
      const dy = state.lastMoveY - centerY;
      state.peelAngle = Math.atan2(-dy, -dx);
      state.peel = 1;
    }

    ensureTickRunning();
  }, [ensureTickRunning]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    const handlePointerUp = () => {
      endDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handleDragMove, endDrag]);

  return (
    <div
      ref={containerRef}
      data-sticker-drag=""
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'visible',
        perspective: '800px',
        ...style
      }}
      onPointerDown={stopCarouselPropagation}
    >
      <div
        ref={stickerRef}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          cursor: 'grab',
          userSelect: 'none',
          perspective: '800px',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          overflow: 'visible',
          touchAction: 'none'
        }}
        onPointerDown={handlePointerDown}
      >
        <div
          ref={innerRef}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            overflow: 'visible'
          }}
        >
          <img
            ref={imgRef}
            src={resolvedSrc}
            alt=""
            crossOrigin="anonymous"
            draggable={false}
            onLoad={uploadTexture}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              userSelect: 'none',
              filter: restShadowFilter,
              visibility: interactive && glLive ? 'hidden' : 'visible'
            }}
          />
          {interactive && (
            <canvas
              ref={canvasRef}
              style={{
                display: 'block',
                pointerEvents: 'none',
                position: 'absolute'
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export { StickerDrag };
