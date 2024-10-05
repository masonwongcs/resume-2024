'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMounted } from '@/hooks/useMounted';

interface Work {
  name: string;
  url: string;
  image: string;
  description: string;
}

interface GridItem {
  id: string;
  work: Work;
  offsetX: number;
  offsetY: number;
}

interface InfiniteCanvasProps {
  works: Work[];
}

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ works }) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, GridItem>>(new Map());
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>();

  const cellSize = window.innerWidth / 4;
  const viewportPadding = 2;
  const lerpFactor = 0.1;
  const seedFactor = 1000;

  const generateItemId = (x: number, y: number) => `item_${x}_${y}`;

  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * seedFactor;
    return x - Math.floor(x);
  };

  const visibleItems = useMemo(() => {
    if (!outerContainerRef.current) return [];
    const { width, height } = outerContainerRef.current.getBoundingClientRect();
    const startX = Math.floor(-offset.x / cellSize) - viewportPadding;
    const startY = Math.floor(-offset.y / cellSize) - viewportPadding;
    const endX = Math.ceil((width - offset.x) / cellSize) + viewportPadding;
    const endY = Math.ceil((height - offset.y) / cellSize) + viewportPadding;

    const items: (GridItem & { x: number; y: number })[] = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const id = generateItemId(x, y);
        let item = itemsRef.current.get(id);
        if (!item) {
          const seed = x * seedFactor + y;
          const randomIndex = Math.floor(seededRandom(seed) * works.length);
          const offsetX = cellSize * 0.5 - cellSize * 0.25;
          const offsetY = seededRandom(seed + 1) * cellSize * 0.5 - cellSize * 0.25;
          item = {
            id,
            work: works[randomIndex],
            offsetX,
            offsetY
          };
          itemsRef.current.set(id, item);
        }
        items.push({ ...item, x, y });
      }
    }
    return items;
  }, [offset, works]);

  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  const animateOffset = useCallback(() => {
    setOffset((prevOffset) => {
      const newX = lerp(prevOffset.x, targetOffsetRef.current.x, lerpFactor);
      const newY = lerp(prevOffset.y, targetOffsetRef.current.y, lerpFactor);
      return { x: newX, y: newY };
    });

    animationFrameRef.current = requestAnimationFrame(animateOffset);
  }, []);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animateOffset);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animateOffset]);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    isDragging.current = true;
    lastPosition.current = { x: clientX, y: clientY };
  }, []);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - lastPosition.current.x;
    const dy = clientY - lastPosition.current.y;
    targetOffsetRef.current = {
      x: targetOffsetRef.current.x + dx,
      y: targetOffsetRef.current.y + dy
    };
    lastPosition.current = { x: clientX, y: clientY };
  }, []);

  const handleEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      handleStart(e.clientX, e.clientY);
    },
    [handleStart]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    },
    [handleMove]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleStart]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleMove]
  );

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (outerContainer) {
      outerContainer.addEventListener('mousemove', handleMouseMove as any);
      outerContainer.addEventListener('mouseup', handleEnd);
      outerContainer.addEventListener('mouseleave', handleEnd);
      outerContainer.addEventListener('touchmove', handleTouchMove as any, { passive: false });
      outerContainer.addEventListener('touchend', handleEnd);
    }

    return () => {
      if (outerContainer) {
        outerContainer.removeEventListener('mousemove', handleMouseMove as any);
        outerContainer.removeEventListener('mouseup', handleEnd);
        outerContainer.removeEventListener('mouseleave', handleEnd);
        outerContainer.removeEventListener('touchmove', handleTouchMove as any);
        outerContainer.removeEventListener('touchend', handleEnd);
      }
    };
  }, [handleMouseMove, handleTouchMove, handleEnd]);

  return (
    <div
      ref={outerContainerRef}
      className={styles.infiniteCanvas}
      data-total={visibleItems.length}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <div
        ref={innerContainerRef}
        className={styles.infiniteCanvasItemWrapper}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          willChange: 'transform'
        }}
      >
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className={styles.infiniteCanvasItem}
            onClick={() => console.log('clicked')}
            style={{
              width: `${cellSize}px`,
              height: `${cellSize}px`,
              transform: `translate3d(${item.x * cellSize + item.offsetX}px, ${item.y * cellSize + item.offsetY}px, 0)`,
              willChange: 'transform'
            }}
          >
            <img className={styles.infiniteCanvasItemImage} src={item.work.image} alt={item.work.name} />
            {/*<div className={styles.itemOverlay}>*/}
            {/*  <h3>{item.work.name}</h3>*/}
            {/*  <p>{item.work.description}</p>*/}
            {/*  <a href={item.work.url} target="_blank" rel="noopener noreferrer">*/}
            {/*    Visit Site*/}
            {/*  </a>*/}
            {/*</div>*/}
          </div>
        ))}
      </div>
    </div>
  );
};

export { InfiniteCanvas };
