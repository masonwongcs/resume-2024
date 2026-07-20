'use client';

import styles from './PaperCutDigit.module.scss';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

/** Deterministic PRNG — unique scrap per digit. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(char: string, index: number, salt: number) {
  return ((char.charCodeAt(0) * 2654435761) ^ (index * 1597334677) ^ salt ^ 0x9e3779b9) >>> 0;
}

/** Magazine / ransom-note scrap palettes */
const SCRAP_STYLES = [
  { scrap: '#1c1c1c', ink: '#f4efe6', weight: 700 },
  { scrap: '#c24b3c', ink: '#fff8f0', weight: 700 },
  { scrap: '#e7d7b8', ink: '#1a1a1a', weight: 700 },
  { scrap: '#0d00a9', ink: '#fffef0', weight: 700 },
  { scrap: '#fd0f00', ink: '#ffffff', weight: 800 },
  { scrap: '#e1bd00', ink: '#1a1200', weight: 800 },
  { scrap: '#f0e4d4', ink: '#8b2f45', weight: 600 },
  { scrap: '#2e2e2e', ink: '#e8a0b4', weight: 700 },
  { scrap: '#d8cfc2', ink: '#111111', weight: 500 },
  { scrap: '#5a6b4e', ink: '#f3efe4', weight: 700 },
  { scrap: '#f7f2ea', ink: '#c01d1d', weight: 800 },
  { scrap: '#3d3a36', ink: '#f0c94d', weight: 700 }
] as const;

const FONT_STACKS = [
  "var(--font-futuraBold), 'Futura Bold', 'Arial Black', sans-serif",
  "var(--font-futura), 'Futura Regular', Arial, sans-serif",
  "var(--font-crimson), 'Crimson Text', Georgia, serif",
  "Georgia, 'Times New Roman', Times, serif",
  "'Courier New', Courier, monospace",
  "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
  "'Trebuchet MS', 'Lucida Grande', sans-serif",
  "Arial Black, Gadget, sans-serif",
  "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif"
] as const;

/** Irregular quad: 4 straight sides, unequal lengths — scissors-cut rectangle, not jagged. */
function buildIrregularQuad(rand: () => number, x: number, y: number, w: number, h: number) {
  // Nudge each corner independently so sides end up different lengths
  const maxInsetX = w * 0.18;
  const maxInsetY = h * 0.16;

  const tl = {
    x: x + rand() * maxInsetX,
    y: y + rand() * maxInsetY
  };
  const tr = {
    x: x + w - rand() * maxInsetX,
    y: y + rand() * maxInsetY
  };
  const br = {
    x: x + w - rand() * maxInsetX,
    y: y + h - rand() * maxInsetY
  };
  const bl = {
    x: x + rand() * maxInsetX,
    y: y + h - rand() * maxInsetY
  };

  return [tl, tr, br, bl].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function buildScrapStyle(seed: number) {
  const rand = mulberry32(seed);
  const palette = SCRAP_STYLES[Math.floor(rand() * SCRAP_STYLES.length)];
  const font = FONT_STACKS[Math.floor(rand() * FONT_STACKS.length)];

  const scrapW = 96 + rand() * 22;
  const scrapH = 112 + rand() * 22;
  const scrapX = (140 - scrapW) / 2 + (rand() - 0.5) * 4;
  const scrapY = (170 - scrapH) / 2 + (rand() - 0.5) * 4;

  return {
    scrap: palette.scrap,
    ink: palette.ink,
    weight: palette.weight,
    font,
    tilt: -14 + rand() * 28,
    yNudge: -8 + rand() * 16,
    scale: 0.92 + rand() * 0.16,
    fontSize: 78 + rand() * 28,
    letterOffsetY: 8 + rand() * 10,
    outline: buildIrregularQuad(rand, scrapX, scrapY, scrapW, scrapH),
    turbulenceSeed: Math.floor(rand() * 1000),
    edgeDisplace: 0.6 + rand() * 0.9,
    grainStrength: 0.28 + rand() * 0.35,
    inkBleed: rand() > 0.55,
    underline: rand() > 0.78
  };
}

interface PaperCutDigitProps {
  char: string;
  index: number;
  salt: number;
  onReshuffle?: () => void;
}

const PaperCutDigit = ({ char, index, salt, onReshuffle }: PaperCutDigitProps) => {
  const uid = useId().replace(/:/g, '');
  const style = useMemo(() => buildScrapStyle(hashSeed(char, index, salt)), [char, index, salt]);

  const grainId = `rn-grain-${uid}`;
  const roughId = `rn-rough-${uid}`;

  return (
    <svg
      className={styles.svg}
      viewBox="0 0 140 170"
      aria-hidden
      focusable="false"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onReshuffle?.();
      }}
    >
      <defs>
        <filter id={roughId} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.06"
            numOctaves="2"
            seed={style.turbulenceSeed}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={style.edgeDisplace}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter id={grainId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.95"
            numOctaves="3"
            seed={style.turbulenceSeed + 41}
            result="grain"
          />
          <feColorMatrix
            in="grain"
            type="matrix"
            values={`0 0 0 0 0.15
                     0 0 0 0 0.13
                     0 0 0 0 0.1
                     0 0 0 ${style.grainStrength.toFixed(3)} 0`}
            result="mono"
          />
          <feBlend in="SourceGraphic" in2="mono" mode="multiply" />
        </filter>
      </defs>

      <g
        transform={`translate(70 ${85 + style.yNudge}) rotate(${style.tilt.toFixed(2)}) scale(${style.scale.toFixed(3)}) translate(-70 -85)`}
      >
        <g filter={`url(#${roughId})`}>
          <polygon points={style.outline} fill={style.scrap} filter={`url(#${grainId})`} />
          <polygon
            points={style.outline}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <polygon
            points={style.outline}
            fill="none"
            stroke="rgba(0,0,0,0.12)"
            strokeWidth="0.7"
            strokeLinejoin="round"
            transform="translate(0.6 0.8)"
          />
        </g>

        <text
          x="70"
          y={92 + style.letterOffsetY}
          textAnchor="middle"
          fill={style.ink}
          fontFamily={style.font}
          fontWeight={style.weight}
          fontSize={style.fontSize}
          className={styles.ink}
          style={style.inkBleed ? { filter: `url(#${roughId})`, opacity: 0.92 } : undefined}
        >
          {char}
        </text>

        {style.underline ? (
          <line
            x1={70 - style.fontSize * 0.28}
            y1={98 + style.letterOffsetY}
            x2={70 + style.fontSize * 0.28}
            y2={100 + style.letterOffsetY}
            stroke={style.ink}
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.55"
          />
        ) : null}
      </g>
    </svg>
  );
};

interface PaperCutDigitControllerProps {
  char: string;
  index: number;
}

const PaperCutDigitLive = ({ char, index }: PaperCutDigitControllerProps) => {
  const [salt, setSalt] = useState(() => hashSeed(char, index, 0xc0ffee));
  const reshuffle = useCallback(() => {
    setSalt(Math.floor(Math.random() * 1_000_000_000));
  }, []);

  useEffect(() => {
    setSalt(Math.floor(Math.random() * 1_000_000_000));
  }, []);

  return <PaperCutDigit char={char} index={index} salt={salt} onReshuffle={reshuffle} />;
};

export { PaperCutDigitLive as PaperCutDigit };
