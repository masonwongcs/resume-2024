'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWorkStore } from '@/store';

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
  const [zoom, setZoom] = useState(1);
  const { setSelectedWork } = useWorkStore();

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, GridItem>>(new Map());
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const targetZoomRef = useRef(1);
  const animationFrameRef = useRef<number>();
  const lastTouchDistance = useRef<number | null>(null);
  const isMoving = useRef(false);
  const moveTimeout = useRef<NodeJS.Timeout>();

  const isMobile = innerWidth <= 480;

  const gapSize = isMobile ? window.innerWidth / 8 : window.innerWidth / 24; // Size of the gap between grid items
  const cellWidth = isMobile ? window.innerWidth / 2.3 : window.innerWidth / 4.5;
  const cellHeight = (cellWidth * 3) / 5;
  const viewportPadding = 2;
  const lerpFactor = 0.15;
  const seedFactor = 1000;
  const zoomSpeed = 0.001;
  const minZoom = 0.75; // Maximum zoom out
  const maxZoom = isMobile ? 2 : 3; // Maximum zoom in
  const moveTimeoutDuration = 100;
  const staggerOffset = (cellHeight + gapSize) * 0.5;
  const initialOffsetX = cellWidth / 2 + gapSize / 2;

  const generateItemId = (x: number, y: number) => `item_${x}_${y}`;

  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * seedFactor;
    return x - Math.floor(x);
  };

  const visibleItems = useMemo(() => {
    if (!outerContainerRef.current) return [];
    const { width, height } = outerContainerRef.current.getBoundingClientRect();

    const startX = Math.floor((-offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) - viewportPadding;
    const startY = Math.floor(-offset.y / ((cellHeight + gapSize) * zoom)) - viewportPadding;
    const endX = Math.ceil((width - offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) + viewportPadding;
    const endY = Math.ceil((height - offset.y) / ((cellHeight + gapSize) * zoom)) + viewportPadding;

    const items: (GridItem & { x: number; y: number })[] = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const id = generateItemId(x, y);
        let item = itemsRef.current.get(id);
        if (!item) {
          const seed = x * seedFactor + y;
          const randomIndex = Math.floor(seededRandom(seed) * works.length);
          // const offsetX = cellWidth * 0.5 - cellWidth * 0.25;
          const offsetX = 0;
          const offsetY = x % 2 === 0 ? 0 : staggerOffset;
          // const offsetY = seededRandom(seed + 1) * cellSize * 0.5 - cellSize * 0.25;
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
  }, [offset, zoom, works, initialOffsetX]);

  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  const animateOffset = useCallback(() => {
    setOffset((prevOffset) => {
      const newX = lerp(prevOffset.x, targetOffsetRef.current.x, lerpFactor);
      const newY = lerp(prevOffset.y, targetOffsetRef.current.y, lerpFactor);

      if (Math.abs(newX - targetOffsetRef.current.x) > 0.1 || Math.abs(newY - targetOffsetRef.current.y) > 0.1) {
        isMoving.current = true;
        if (moveTimeout.current) {
          clearTimeout(moveTimeout.current);
        }
        moveTimeout.current = setTimeout(() => {
          isMoving.current = false;
        }, moveTimeoutDuration); // Wait for 300ms of no movement before considering it stopped
      }

      return { x: newX, y: newY };
    });

    setZoom((prevZoom) => {
      const newZoom = lerp(prevZoom, targetZoomRef.current, lerpFactor);

      // Also check zoom changes for movement
      if (Math.abs(newZoom - targetZoomRef.current) > 0.001) {
        isMoving.current = true;
        if (moveTimeout.current) {
          clearTimeout(moveTimeout.current);
        }
        moveTimeout.current = setTimeout(() => {
          isMoving.current = false;
        }, moveTimeoutDuration);
      }

      return newZoom;
    });

    animationFrameRef.current = requestAnimationFrame(animateOffset);
  }, []);

  useEffect(() => {
    // Set initial offset
    setOffset({ x: initialOffsetX, y: 0 });
    targetOffsetRef.current = { x: initialOffsetX, y: 0 };
  }, [initialOffsetX]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animateOffset);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animateOffset]);

  const handleItemClick = useCallback(
    (work: Work) => {
      if (!isMoving.current) {
        setSelectedWork(work);
      }
    },
    [setSelectedWork]
  );

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

  const handleZoom = useCallback((zoomPoint: { x: number; y: number }, newZoom: number) => {
    const rect = outerContainerRef.current?.getBoundingClientRect();
    if (rect) {
      const zoomFactor = newZoom / targetZoomRef.current;

      // Calculate the point in the content space
      const contentPointX = (zoomPoint.x - targetOffsetRef.current.x) / targetZoomRef.current;
      const contentPointY = (zoomPoint.y - targetOffsetRef.current.y) / targetZoomRef.current;

      // Calculate new offset to keep the zoom point stationary
      const newOffsetX = zoomPoint.x - contentPointX * newZoom;
      const newOffsetY = zoomPoint.y - contentPointY * newZoom;

      targetZoomRef.current = newZoom;
      targetOffsetRef.current = { x: newOffsetX, y: newOffsetY };
    }
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * zoomSpeed;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current * (1 + delta)));

        if (newZoom !== targetZoomRef.current) {
          const rect = outerContainerRef.current?.getBoundingClientRect();
          if (rect) {
            const zoomPoint = {
              x: e.clientX - rect.left - window.innerWidth / 2,
              y: e.clientY - rect.top - window.innerHeight / 2
            };
            handleZoom(zoomPoint, newZoom);
          }
        }
      } else if (e.shiftKey) {
        targetOffsetRef.current.x += e.deltaX;
      } else {
        targetOffsetRef.current.y += e.deltaY;
      }
    },
    [handleZoom]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        lastTouchDistance.current = distance;
      } else if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleStart]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);

        if (lastTouchDistance.current !== null) {
          const delta = distance - lastTouchDistance.current;
          const newZoom = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current * (1 + delta * 0.01)));

          if (newZoom !== targetZoomRef.current) {
            const rect = outerContainerRef.current?.getBoundingClientRect();
            if (rect) {
              const zoomPoint = {
                x: (touch1.clientX + touch2.clientX) / 2 - rect.left - window.innerWidth / 2,
                y: (touch1.clientY + touch2.clientY) / 2 - rect.top - window.innerHeight / 2
              };
              handleZoom(zoomPoint, newZoom);
            }
          }
        }
        lastTouchDistance.current = distance;
      } else if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleMove, handleZoom]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = null;
    handleEnd();
  }, [handleEnd]);

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (outerContainer) {
      outerContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (outerContainer) {
        outerContainer.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (outerContainer) {
      outerContainer.addEventListener('mousemove', handleMouseMove as any);
      outerContainer.addEventListener('mouseup', handleEnd);
      outerContainer.addEventListener('mouseleave', handleEnd);
      outerContainer.addEventListener('touchmove', handleTouchMove as any, { passive: false });
      outerContainer.addEventListener('touchend', handleEnd);
      outerContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (outerContainer) {
        outerContainer.removeEventListener('mousemove', handleMouseMove as any);
        outerContainer.removeEventListener('mouseup', handleEnd);
        outerContainer.removeEventListener('mouseleave', handleEnd);
        outerContainer.removeEventListener('touchmove', handleTouchMove as any);
        outerContainer.removeEventListener('touchend', handleEnd);
        outerContainer.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleMouseMove, handleTouchMove, handleEnd, handleWheel]);

  return (
    <div
      ref={outerContainerRef}
      className={styles.infiniteCanvas}
      data-total={visibleItems.length}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={innerContainerRef}
        className={styles.infiniteCanvasItemWrapper}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          willChange: 'transform'
        }}
      >
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className={styles.infiniteCanvasItem}
            onClick={() => handleItemClick(item.work)}
            style={{
              width: `${cellWidth}px`,
              height: `${cellHeight}px`,
              transform: `translate3d(${item.x * (cellWidth + gapSize) + item.offsetX}px, ${item.y * (cellHeight + gapSize) + item.offsetY}px, 0)`,
              willChange: 'transform'
            }}
          >
            <img className={styles.infiniteCanvasItemImage} src={item.work.image} alt={item.work.name} />
          </div>
        ))}
      </div>
    </div>
  );
};

export { InfiniteCanvas };
