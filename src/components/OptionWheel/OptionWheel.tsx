'use client';

import styles from './OptionWheel.module.scss';

import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type Side = 'left' | 'right';

export type OptionWheelProps = {
  items: string[];
  defaultSelected?: number;
  onChange?: (index: number, item: string) => void;
  onItemClick?: (index: number, item: string) => void;
  textColor?: string;
  activeColor?: string;
  side?: Side;
  fontSize?: number;
  spacing?: number;
  curve?: number;
  tilt?: number;
  blur?: number;
  fade?: number;
  minOpacity?: number;
  smoothing?: number;
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  scrollContainerRef?: { current: HTMLElement | null };
  className?: string;
};

interface WheelConfig {
  count: number;
  items: string[];
  rowHeight: number;
  curve: number;
  tilt: number;
  blur: number;
  fade: number;
  minOpacity: number;
  side: Side;
  loop: boolean;
  smoothing: number;
  draggable: boolean;
}

const OptionWheel = ({
  items,
  defaultSelected = 0,
  onChange,
  onItemClick,
  textColor = 'var(--wheel-text, #74746e)',
  activeColor = 'var(--wheel-active, #242420)',
  side = 'left',
  fontSize = 3,
  spacing = 1.4,
  curve = 1,
  tilt = 6,
  blur = 2,
  fade = 0.25,
  minOpacity = 0.05,
  smoothing = 200,
  inset = 80,
  loop = false,
  draggable = true,
  scrollContainerRef,
  className = ''
}: OptionWheelProps): React.JSX.Element => {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const positionRef = useRef(defaultSelected);
  const targetRef = useRef(defaultSelected);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const configRef = useRef<WheelConfig>({} as WheelConfig);
  const onChangeRef = useRef(onChange);
  const onItemClickRef = useRef(onItemClick);
  const selectedRef = useRef(defaultSelected);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const dragMovedRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(defaultSelected);
  const [isDragging, setIsDragging] = useState(false);

  const rootFontSize =
    typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;

  onChangeRef.current = onChange;
  onItemClickRef.current = onItemClick;
  configRef.current = {
    count: items.length,
    items,
    rowHeight: Math.max(fontSize * spacing * rootFontSize, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable
  };

  const runFrame = useCallback((now: number) => {
    const deltaTime = Math.min((now - lastFrameRef.current) / 1000, 0.05);
    lastFrameRef.current = now;
    const config = configRef.current;
    const easingTime = Math.max(config.smoothing, 1) / 1000;
    const easing = 1 - Math.exp(-deltaTime / easingTime);
    const target = targetRef.current;
    const current = positionRef.current;
    let next = current + (target - current) * easing;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    positionRef.current = next;

    const mirror = config.side === 'right' ? -1 : 1;
    const tiltRadians = (config.tilt * Math.PI) / 180;
    const radius = tiltRadians > 0.0005 ? config.rowHeight / tiltRadians : 0;

    itemRefs.current.forEach((element, index) => {
      if (!element) return;
      let distanceFromSelection = index - next;
      if (config.loop && config.count > 1) {
        distanceFromSelection = ((distanceFromSelection % config.count) + config.count) % config.count;
        if (distanceFromSelection > config.count / 2) distanceFromSelection -= config.count;
      }

      const distance = Math.abs(distanceFromSelection);
      let x = 0;
      let y = distanceFromSelection * config.rowHeight;
      let rotation = 0;

      if (radius > 0) {
        const angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, distanceFromSelection * tiltRadians));
        y = radius * Math.sin(angle);
        x = -mirror * radius * (1 - Math.cos(angle)) * config.curve;
        rotation = (mirror * angle * 180) / Math.PI;
      }

      element.style.transform = `translate3d(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%), 0) rotate(${rotation.toFixed(3)}deg)`;
      element.style.opacity = String(Math.max(config.minOpacity, 1 - distance * config.fade));
      element.style.filter =
        config.blur > 0 && distance > 0.08 ? `blur(${(distance * config.blur).toFixed(2)}px)` : 'none';
      element.style.setProperty('--wheel-progress', Math.max(0, 1 - Math.min(distance, 1)).toFixed(4));
    });

    animationFrameRef.current = settled ? null : requestAnimationFrame(runFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    lastFrameRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const applyTarget = useCallback(
    (value: number, snap: boolean) => {
      const config = configRef.current;
      if (!config.count) return;
      let nextValue = value;
      if (!config.loop) nextValue = Math.min(Math.max(nextValue, 0), config.count - 1);
      if (snap) nextValue = Math.round(nextValue);
      targetRef.current = nextValue;
      const index = ((Math.round(nextValue) % config.count) + config.count) % config.count;

      if (index !== selectedRef.current) {
        selectedRef.current = index;
        setSelectedIndex(index);
        onChangeRef.current?.(index, config.items[index]);
      }
      startLoop();
    },
    [startLoop]
  );

  useEffect(() => {
    const elements = [rootRef.current, scrollContainerRef?.current].filter(
      (element): element is HTMLElement => element !== null
    );
    if (!elements.length) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const config = configRef.current;
      const delta = event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
      const step = Math.max(-1, Math.min(1, delta / config.rowHeight));
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140);
    };

    elements.forEach((element) => element.addEventListener('wheel', handleWheel, { passive: false }));
    return () => {
      elements.forEach((element) => element.removeEventListener('wheel', handleWheel));
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget, scrollContainerRef]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!configRef.current.draggable) return;
    dragRef.current = { y: event.clientY, start: targetRef.current, id: event.pointerId };
    dragMovedRef.current = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaY = event.clientY - drag.y;
      if (!dragMovedRef.current && Math.abs(deltaY) > 4) {
        dragMovedRef.current = true;
        rootRef.current?.setPointerCapture(drag.id);
      }
      if (dragMovedRef.current) applyTarget(drag.start - deltaY / configRef.current.rowHeight, false);
    },
    [applyTarget]
  );

  const handlePointerEnd = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
  }, [applyTarget]);

  const handleItemClick = useCallback(
    (index: number) => {
      if (dragMovedRef.current) return;
      const config = configRef.current;
      const current = targetRef.current;
      let delta = index - (((current % config.count) + config.count) % config.count);
      if (config.loop && config.count > 1) {
        if (delta > config.count / 2) delta -= config.count;
        else if (delta < -config.count / 2) delta += config.count;
      }
      applyTarget(current + delta, true);
      onItemClickRef.current?.(index, config.items[index]);
    },
    [applyTarget]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let delta: number | null = null;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') delta = -1;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') delta = 1;
      if (delta === null) return;
      event.preventDefault();
      applyTarget(Math.round(targetRef.current) + delta, true);
    },
    [applyTarget]
  );

  useLayoutEffect(() => {
    lastFrameRef.current = performance.now();
    runFrame(lastFrameRef.current);
  }, [runFrame, items, fontSize, spacing, curve, tilt, blur, fade, minOpacity, side, loop, smoothing]);

  useEffect(() => {
    applyTarget(targetRef.current, false);
  }, [items, fontSize, spacing, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, applyTarget]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    },
    []
  );

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label="Project wheel"
      className={`${styles.wheel} ${side === 'right' ? styles.right : ''} ${isDragging ? styles.dragging : ''} ${className}`}
      style={
        {
          '--wheel-text': textColor,
          '--wheel-active': activeColor,
          '--wheel-font-size': `${fontSize}rem`,
          '--wheel-inset': `${inset}px`
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {items.map((label, index) => (
        <button
          key={`${label}-${index}`}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          role="option"
          aria-selected={selectedIndex === index}
          className={`${styles.item} ${selectedIndex === index ? styles.selected : ''}`}
          onClick={() => handleItemClick(index)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default OptionWheel;
