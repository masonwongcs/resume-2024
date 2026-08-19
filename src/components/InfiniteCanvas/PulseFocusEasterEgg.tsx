'use client';

import styles from './PulseFocusEasterEgg.module.scss';

import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useReducedMotion } from 'motion/react';

import type { CustomCardConfig, CustomCardFocusContentProps } from './types';

const PULSE_WORK_URL = 'https://apps.apple.com/app/pulse-alarm/id6795580583';
const PULSE_IMAGE = '/images/work/pulse.jpg';
const FADE_MS = 320;

const findCanvas = () => document.querySelector<HTMLElement>('[data-focused="true"]');
const findClose = () => document.querySelector<HTMLElement>('button[aria-label="Close"]');

const PulseOrb = ({ fading, reduceMotion }: { fading: boolean; reduceMotion: boolean }) => {
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const orb = orbRef.current;
      const host = orb?.parentElement?.parentElement;
      const canvas = host?.parentElement;
      const closeBtn = findClose();
      if (closeBtn && canvas && host && orb) {
        const cr = closeBtn.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        orb.style.setProperty('--pulse-size', `${cr.width * 12}px`);
        orb.style.visibility = 'visible';
        orb.style.transform = `translate3d(${cr.left - hr.left + cr.width / 2}px, ${
          cr.top - hr.top + cr.height / 2
        }px, 0) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={styles.layer} data-fading={fading ? 'true' : undefined} aria-hidden>
      <div ref={orbRef} className={styles.orb} data-static={reduceMotion ? 'true' : undefined}>
        <span className={styles.glow} />
        {reduceMotion ? null : (
          <>
            <span className={styles.ring} />
            <span className={styles.ring} data-delay="1" />
            <span className={styles.ring} data-delay="2" />
          </>
        )}
      </div>
    </div>
  );
};

type HostState = {
  host: HTMLDivElement | null;
  root: Root | null;
  open: boolean;
  fading: boolean;
  reduceMotion: boolean;
  fadeTimer: number;
};

const hostState: HostState = {
  host: null,
  root: null,
  open: false,
  fading: false,
  reduceMotion: false,
  fadeTimer: 0
};

const renderPulseHost = () => {
  if (typeof document === 'undefined') return;
  if (!hostState.open || !hostState.host) {
    hostState.root?.render(null);
    return;
  }
  hostState.root?.render(
    <PulseOrb fading={hostState.fading} reduceMotion={hostState.reduceMotion} />
  );
};

const ensureHost = () => {
  const canvas = findCanvas();
  if (!canvas) return false;
  if (hostState.host && hostState.host.parentElement === canvas) return true;

  hostState.host?.remove();
  const node = document.createElement('div');
  node.setAttribute('data-pulse-host', '');
  node.setAttribute(
    'style',
    'position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden;'
  );
  canvas.appendChild(node);
  hostState.host = node;
  hostState.root?.unmount();
  hostState.root = createRoot(node);
  return true;
};

const pulseHost = {
  setReduceMotion(value: boolean) {
    hostState.reduceMotion = value;
  },
  open() {
    if (hostState.fadeTimer) {
      window.clearTimeout(hostState.fadeTimer);
      hostState.fadeTimer = 0;
    }
    hostState.fading = false;
    hostState.open = true;
    if (!ensureHost()) return;
    renderPulseHost();
  },
  fadeOut() {
    if (!hostState.open || hostState.fading) return;
    hostState.fading = true;
    renderPulseHost();
    const ms = hostState.reduceMotion ? 0 : FADE_MS;
    hostState.fadeTimer = window.setTimeout(() => {
      hostState.open = false;
      hostState.fading = false;
      hostState.fadeTimer = 0;
      hostState.root?.unmount();
      hostState.root = null;
      hostState.host?.remove();
      hostState.host = null;
    }, ms);
  }
};

export const PulseFocusEasterEgg = ({ isFocusSettled }: CustomCardFocusContentProps) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    pulseHost.setReduceMotion(Boolean(reduceMotion));
    if (isFocusSettled) pulseHost.open();
    else pulseHost.fadeOut();

    return () => {
      pulseHost.fadeOut();
    };
  }, [isFocusSettled, reduceMotion]);

  return null;
};

export const pulseCustomCard: CustomCardConfig = {
  id: 'pulse',
  placement: 'none',
  focusable: false,
  work: {
    name: 'Pulse',
    url: PULSE_WORK_URL,
    image: PULSE_IMAGE,
    description: ''
  },
  renderFocusContent: (props) => <PulseFocusEasterEgg {...props} />
};
