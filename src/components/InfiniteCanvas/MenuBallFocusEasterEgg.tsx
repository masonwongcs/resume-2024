'use client';

import styles from './MenuBallFocusEasterEgg.module.scss';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useReducedMotion } from 'motion/react';

import type { CustomCardConfig, CustomCardFocusContentProps } from './types';

const BALL_SRC = '/images/work/tennis.webp';

/** Particles including pinned anchor (first) and heavy ball (last). */
const POINT_COUNT = 14;
/** Rest length anchor → ball center. */
const ROPE_LENGTH = 190;
const GRAVITY = 2600;
const DAMPING = 0.995;
const ITERATIONS = 30;
const MAX_STRETCH = 1.5;
const THROW_SCALE = 1.05;

/** Light rope, heavy ball — constraints pull the string onto the ball. */
const ROPE_INV_MASS = 1 / 0.35;
const BALL_INV_MASS = 1 / 10;

const getBallRadius = () => (window.matchMedia('(max-width: 767px)').matches ? 26 : 38);

type Particle = {
  x: number;
  y: number;
  px: number;
  py: number;
  invMass: number;
};

type SimState = {
  points: Particle[];
  dragging: boolean;
  pointerId: number | null;
  lastPointerX: number;
  lastPointerY: number;
  lastPointerT: number;
  throwVx: number;
  throwVy: number;
  retracting: boolean;
  /** 0 → 1 over the retract animation */
  retractT: number;
  /** Smoothed ball facing (degrees). Avoids sudden 180° flips when the rope folds. */
  ballRotateDeg: number | null;
};

const getAnchor = () => {
  const closeBtn = document.querySelector<HTMLElement>('button[aria-label="Close"]');
  if (closeBtn) {
    const rect = closeBtn.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.bottom - 2
    };
  }

  const width = window.innerWidth;
  const desktop = width >= 481;
  const size = 50;
  const top = desktop ? 30 : 10;
  const right = desktop ? 30 : 10;
  return {
    x: width - right - size / 2,
    y: top + size - 2
  };
};

const createPoints = (ax: number, ay: number, bx: number, by: number): Particle[] => {
  const points: Particle[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    const t = i / (POINT_COUNT - 1);
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const isAnchor = i === 0;
    const isBall = i === POINT_COUNT - 1;
    points.push({
      x,
      y,
      px: x,
      py: y,
      invMass: isAnchor ? 0 : isBall ? BALL_INV_MASS : ROPE_INV_MASS
    });
  }
  return points;
};

const pinAnchor = (points: Particle[], ax: number, ay: number) => {
  const p = points[0];
  if (!p) return;
  p.x = ax;
  p.y = ay;
  p.px = ax;
  p.py = ay;
  p.invMass = 0;
};

/** Attach point = ball surface along the last rope segment (always on the ball). */
const getAttachPoint = (ball: Particle, prev: Particle) => {
  const r = getBallRadius();
  const dx = prev.x - ball.x;
  const dy = prev.y - ball.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) return { x: ball.x, y: ball.y - r };
  return {
    x: ball.x + (dx / dist) * r,
    y: ball.y + (dy / dist) * r
  };
};

const integrate = (points: Particle[], dt: number, skipBall: boolean) => {
  const g = GRAVITY * dt * dt;
  const last = points.length - 1;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (!p || p.invMass === 0) continue;
    if (skipBall && i === last) continue;

    const vx = (p.x - p.px) * DAMPING;
    const vy = (p.y - p.py) * DAMPING;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + g;
  }
};

/**
 * Distance constraints with inverse-mass weighting.
 * String only resists stretch (can go slack). Heavy ball barely moves; rope is pulled to it.
 */
const solveConstraints = (points: Particle[], lengthScale = 1) => {
  const rest = (ROPE_LENGTH * lengthScale) / (POINT_COUNT - 1);
  const maxLen = rest * MAX_STRETCH;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;

      if (dist <= rest) continue;

      const desired = dist > maxLen ? maxLen : rest;
      const inv = a.invMass + b.invMass;
      if (inv <= 0) continue;

      const corr = (dist - desired) / dist;
      const ox = dx * corr;
      const oy = dy * corr;
      const aShare = a.invMass / inv;
      const bShare = b.invMass / inv;

      a.x += ox * aShare;
      a.y += oy * aShare;
      b.x -= ox * bShare;
      b.y -= oy * bShare;
    }
  }
};

/** Draw rope through particles, but end exactly on the ball surface. */
const pathFromPoints = (points: Particle[]) => {
  if (points.length < 2) return '';
  const ball = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  const tip = getAttachPoint(ball, prev);

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    d += ` L ${points[i]!.x} ${points[i]!.y}`;
  }
  d += ` L ${tip.x} ${tip.y}`;
  return d;
};

/** Shortest signed delta between two angles in degrees (−180…180). */
const shortestAngleDelta = (fromDeg: number, toDeg: number) => {
  let d = ((toDeg - fromDeg) % 360) + 360;
  d %= 360;
  if (d > 180) d -= 360;
  return d;
};

/**
 * Target facing so the ball's top aims up the rope.
 * Uses a point a few segments above the ball so a local tangle doesn't invert it.
 */
const getBallTargetRotationDeg = (points: Particle[]): number | null => {
  const ball = points[points.length - 1];
  if (!ball) return null;
  const guide = points[Math.max(0, points.length - 4)] ?? points[points.length - 2];
  if (!guide) return null;
  const dx = guide.x - ball.x;
  const dy = guide.y - ball.y;
  if (Math.hypot(dx, dy) < 8) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
};

const updateBallRotation = (sim: SimState, dt: number) => {
  const target = getBallTargetRotationDeg(sim.points);
  if (target == null) return;
  if (sim.ballRotateDeg == null) {
    sim.ballRotateDeg = target;
    return;
  }
  const delta = shortestAngleDelta(sim.ballRotateDeg, target);
  const follow = 1 - Math.exp(-dt * 12);
  let step = delta * follow;
  const maxStep = 380 * dt; // deg/s cap — blocks split-second flips
  if (Math.abs(step) > maxStep) step = Math.sign(step) * maxStep;
  sim.ballRotateDeg += step;
};

const RETRACT_DURATION = 0.48;

const MenuBallToy = ({
  retracting,
  onRetractComplete
}: {
  retracting: boolean;
  onRetractComplete: () => void;
}) => {
  const reduceMotion = useReducedMotion();
  const layerRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLButtonElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const simRef = useRef<SimState | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onRetractComplete);
  onCompleteRef.current = onRetractComplete;

  const paint = (points: Particle[], rotateDeg: number) => {
    const ball = points[points.length - 1];
    if (!ball) return;

    const el = ballRef.current;
    const path = pathRef.current;
    if (el) {
      el.style.transform = `translate3d(${ball.x}px, ${ball.y}px, 0) rotate(${rotateDeg}deg)`;
    }
    if (path) path.setAttribute('d', pathFromPoints(points));
  };

  const paintSim = (sim: SimState, dt = 1 / 60) => {
    updateBallRotation(sim, dt);
    paint(sim.points, sim.ballRotateDeg ?? 0);
  };

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (retracting && !sim.retracting) {
      sim.retracting = true;
      sim.retractT = 0;
      sim.dragging = false;
      sim.pointerId = null;
      if (reduceMotion) {
        onCompleteRef.current();
      }
    }
  }, [retracting, reduceMotion]);

  useEffect(() => {
    const anchor = getAnchor();
    const r = getBallRadius();
    const startX = anchor.x + (Math.random() - 0.5) * 20;
    const startY = reduceMotion ? anchor.y + ROPE_LENGTH * 0.9 : anchor.y + r + 20;
    const points = createPoints(anchor.x, anchor.y, startX, startY);

    if (!reduceMotion) {
      const ball = points[points.length - 1]!;
      ball.px = ball.x - (Math.random() - 0.5) * 3;
      ball.py = ball.y - 1.5;
    }

    simRef.current = {
      points,
      dragging: false,
      pointerId: null,
      lastPointerX: startX,
      lastPointerY: startY,
      lastPointerT: performance.now(),
      throwVx: 0,
      throwVy: 0,
      retracting: false,
      retractT: 0,
      ballRotateDeg: null
    };

    pinAnchor(points, anchor.x, anchor.y);
    solveConstraints(points);
    pinAnchor(points, anchor.x, anchor.y);
    paintSim(simRef.current, 1 / 60);

    const step = (ts: number) => {
      const sim = simRef.current;
      if (!sim) return;

      const prevTs = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      let dt = (ts - prevTs) / 1000;
      if (dt > 0.033) dt = 0.033;

      const a = getAnchor();
      const floorY = window.innerHeight - 36;
      const wallPad = 28;
      const last = sim.points.length - 1;
      const ball = sim.points[last]!;

      pinAnchor(sim.points, a.x, a.y);

      if (sim.retracting) {
        sim.retractT = Math.min(1, sim.retractT + dt / RETRACT_DURATION);
        const ease = 1 - Math.pow(1 - sim.retractT, 3);
        const pull = 1 - Math.exp(-dt * 16);

        // Reel the ball into the anchor
        ball.x += (a.x - ball.x) * pull;
        ball.y += (a.y - ball.y) * pull;
        ball.px = ball.x;
        ball.py = ball.y;

        // Collapse rope points onto the shrinking segment
        for (let i = 1; i < last; i++) {
          const p = sim.points[i];
          if (!p) continue;
          const t = i / last;
          const tx = a.x + (ball.x - a.x) * t;
          const ty = a.y + (ball.y - a.y) * t;
          p.x += (tx - p.x) * pull;
          p.y += (ty - p.y) * pull;
          p.px = p.x;
          p.py = p.y;
        }

        const lengthScale = Math.max(0.02, 1 - ease);
        solveConstraints(sim.points, lengthScale);
        pinAnchor(sim.points, a.x, a.y);
        ball.x += (a.x - ball.x) * 0.35;
        ball.y += (a.y - ball.y) * 0.35;
        ball.px = ball.x;
        ball.py = ball.y;

        if (layerRef.current) {
          layerRef.current.style.opacity = String(1 - ease);
        }

        paintSim(sim, dt);

        const dist = Math.hypot(ball.x - a.x, ball.y - a.y);
        if (sim.retractT >= 1 || dist < 10) {
          onCompleteRef.current();
          return;
        }

        rafRef.current = requestAnimationFrame(step);
        return;
      }

      if (sim.dragging) {
        ball.x = sim.lastPointerX;
        ball.y = sim.lastPointerY;
        ball.px = ball.x;
        ball.py = ball.y;
        integrate(sim.points, dt, true);
      } else {
        integrate(sim.points, dt, false);
      }

      solveConstraints(sim.points);
      pinAnchor(sim.points, a.x, a.y);

      let bounced = false;
      if (ball.y > floorY) {
        const vy = ball.y - ball.py;
        ball.y = floorY;
        ball.py = ball.y + vy * 0.35;
        bounced = true;
      }
      if (ball.x < wallPad) {
        const vx = ball.x - ball.px;
        ball.x = wallPad;
        ball.px = ball.x + vx * 0.35;
        bounced = true;
      } else if (ball.x > window.innerWidth - wallPad) {
        const vx = ball.x - ball.px;
        ball.x = window.innerWidth - wallPad;
        ball.px = ball.x + vx * 0.35;
        bounced = true;
      }
      if (bounced) {
        solveConstraints(sim.points);
        pinAnchor(sim.points, a.x, a.y);
      }

      if (sim.dragging) {
        ball.x = sim.lastPointerX;
        ball.y = sim.lastPointerY;
        ball.px = ball.x;
        ball.py = ball.y;
      }

      paintSim(sim, dt);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    const onResize = () => {
      const sim = simRef.current;
      if (!sim) return;
      const a = getAnchor();
      pinAnchor(sim.points, a.x, a.y);
      solveConstraints(sim.points);
      paintSim(sim);
    };
    window.addEventListener('resize', onResize);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      simRef.current = null;
      lastTsRef.current = null;
    };
  }, [reduceMotion]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sim = simRef.current;
    const el = ballRef.current;
    if (!sim || !el || sim.retracting) return;
    event.preventDefault();
    event.stopPropagation();
    el.setPointerCapture(event.pointerId);

    sim.dragging = true;
    sim.pointerId = event.pointerId;
    sim.lastPointerX = event.clientX;
    sim.lastPointerY = event.clientY;
    sim.lastPointerT = performance.now();
    sim.throwVx = 0;
    sim.throwVy = 0;

    const ball = sim.points[sim.points.length - 1]!;
    ball.x = event.clientX;
    ball.y = event.clientY;
    ball.px = ball.x;
    ball.py = ball.y;

    paintSim(sim);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sim = simRef.current;
    if (!sim?.dragging || sim.pointerId !== event.pointerId || sim.retracting) return;
    event.preventDefault();

    const now = performance.now();
    const dt = Math.max((now - sim.lastPointerT) / 1000, 0.001);
    sim.throwVx = ((event.clientX - sim.lastPointerX) / dt) * THROW_SCALE;
    sim.throwVy = ((event.clientY - sim.lastPointerY) / dt) * THROW_SCALE;
    sim.lastPointerX = event.clientX;
    sim.lastPointerY = event.clientY;
    sim.lastPointerT = now;

    const ball = sim.points[sim.points.length - 1]!;
    ball.x = event.clientX;
    ball.y = event.clientY;
    ball.px = ball.x;
    ball.py = ball.y;

    const a = getAnchor();
    pinAnchor(sim.points, a.x, a.y);
    solveConstraints(sim.points);
    pinAnchor(sim.points, a.x, a.y);
    ball.x = event.clientX;
    ball.y = event.clientY;
    ball.px = ball.x;
    ball.py = ball.y;
    paintSim(sim, Math.min(dt, 0.033));
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sim = simRef.current;
    const el = ballRef.current;
    if (!sim?.dragging || sim.pointerId !== event.pointerId) return;
    if (el?.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }

    let vx = sim.throwVx;
    let vy = sim.throwVy;
    const speed = Math.hypot(vx, vy);
    const maxSpeed = 2400;
    if (speed > maxSpeed) {
      const s = maxSpeed / speed;
      vx *= s;
      vy *= s;
    }

    const ball = sim.points[sim.points.length - 1]!;
    const dt = 1 / 60;
    ball.px = ball.x - vx * dt;
    ball.py = ball.y - vy * dt;

    sim.dragging = false;
    sim.pointerId = null;
  };

  return (
    <div ref={layerRef} className={styles.layer} data-retracting={retracting ? 'true' : undefined}>
      <svg className={styles.string} aria-hidden>
        <path ref={pathRef} className={styles.stringPath} fill="none" d="" />
      </svg>
      <button
        ref={ballRef}
        type="button"
        className={styles.ball}
        aria-label="Drag the MenuBall tennis ball"
        tabIndex={retracting ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img className={styles.ballImage} src={BALL_SRC} alt="" draggable={false} />
      </button>
    </div>
  );
};

export const MenuBallFocusEasterEgg = ({ isFocusSettled }: CustomCardFocusContentProps) => {
  useEffect(() => {
    if (isFocusSettled) menuBallHost.open();
    else menuBallHost.retract();

    return () => {
      // Swipe / route away while the ball is out
      menuBallHost.retract();
    };
  }, [isFocusSettled]);

  return null;
};

type HostState = {
  container: HTMLDivElement | null;
  root: Root | null;
  open: boolean;
  retracting: boolean;
  session: number;
};

const hostState: HostState = {
  container: null,
  root: null,
  open: false,
  retracting: false,
  session: 0
};

const renderMenuBallHost = () => {
  if (typeof document === 'undefined') return;
  if (!hostState.container) {
    hostState.container = document.createElement('div');
    hostState.container.setAttribute('data-menuball-host', '');
    document.body.appendChild(hostState.container);
    hostState.root = createRoot(hostState.container);
  }
  if (!hostState.open) {
    hostState.root?.render(null);
    return;
  }
  hostState.root?.render(
    <MenuBallToy
      key={hostState.session}
      retracting={hostState.retracting}
      onRetractComplete={() => {
        hostState.open = false;
        hostState.retracting = false;
        hostState.root?.render(null);
      }}
    />
  );
};

const menuBallHost = {
  open() {
    hostState.session += 1;
    hostState.open = true;
    hostState.retracting = false;
    renderMenuBallHost();
  },
  retract() {
    if (!hostState.open || hostState.retracting) return;
    hostState.retracting = true;
    renderMenuBallHost();
  }
};

export const menuBallCustomCard: CustomCardConfig = {
  id: 'menuball',
  placement: 'none',
  focusable: false,
  work: {
    name: 'MenuBall',
    url: 'https://apps.apple.com/us/app/menuball/id6759548000',
    image: '/images/work/menuball.webp',
    description: ''
  },
  renderFocusContent: (props) => <MenuBallFocusEasterEgg {...props} />
};
