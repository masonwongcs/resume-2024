'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useReducedMotion } from 'motion/react';

import { useHomeStore, useWorkStore } from '@/store';

import { InfiniteCanvasItem, type InfiniteCanvasItemIntro } from './InfiniteCanvasItem';

interface Work {
  name: string;
  url: string;
  image: string;
  video?: string;
  thumbnail?: string;
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

// Matches Loader.module.scss exit: clip-path 1s @ 400ms + fade 200ms @ 1.4s
const INTRO_SPREAD_DELAY_MS = 2000;
const INTRO_SPREAD_RIPPLE_S = 0.42;
const INTRO_SPREAD_SAFETY_MS = 2800;
const INTRO_CLUSTER_ROTATION_RANGE = 32;

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ works }) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);
  const loaded = useHomeStore((state) => state.loaded);

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, GridItem>>(new Map());
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const targetZoomRef = useRef(1);
  const animationFrameRef = useRef<number>(null);
  const workUsageCountRef = useRef<Map<string, number>>(new Map());
  const lastTouchDistance = useRef<number | null>(null);
  const isMoving = useRef(false);
  const moveTimeout = useRef<NodeJS.Timeout>(null);
  const prefersReducedMotion = useReducedMotion();
  const introConfigRef = useRef<Map<string, InfiniteCanvasItemIntro> | null>(null);
  const introCompletedIdsRef = useRef<Set<string>>(new Set());
  const [shouldSpread, setShouldSpread] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(() => !prefersReducedMotion);

  const isMobile = window.innerWidth <= 480;

  const gapSize = isMobile ? window.innerWidth / 8 : window.innerWidth / 24; // Size of the gap between grid items
  const cellWidth = isMobile ? window.innerWidth / 2.3 : window.innerWidth / 4.6;
  const cellHeight = (cellWidth * 3) / 5;
  const viewportPadding = 2;
  const lerpFactor = 0.15;
  const seedFactor = Math.random() * 1000;
  const zoomSpeed = 0.001;
  const minZoom = 0.75; // Maximum zoom out
  const maxZoom = isMobile ? 2 : 3; // Maximum zoom in
  const moveTimeoutDuration = 100;
  const staggerOffset = (cellHeight + gapSize) * 0.5;
  const initialOffsetX = cellWidth / 2 + gapSize / 2;

  const generateItemId = (x: number, y: number) => `item_${x}_${y}`;

  const seededRandom = (seed: number) => {
    // Improved random function with better distribution
    const x = Math.sin(seed) * seedFactor;
    const y = Math.cos(seed * 0.5) * (seedFactor * 0.7);
    return x + y - Math.floor(x + y);
  };

  const getAdjacentWorks = (x: number, y: number, radius: number = 2) => {
    const adjacent: Work[] = [];
    const seen = new Set<string>();
    // Check a larger radius to avoid duplicates in a wider area
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx === 0 && dy === 0) continue;
        // Use Manhattan distance to prioritize closer cells
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance > radius) continue;
        const id = generateItemId(x + dx, y + dy);
        const item = itemsRef.current.get(id);
        if (item && !seen.has(item.work.url)) {
          adjacent.push(item.work);
          seen.add(item.work.url);
        }
      }
    }
    return adjacent;
  };

  const selectUniqueWork = (x: number, y: number, adjacentWorks: Work[]) => {
    const seed = x * seedFactor + y * seedFactor * 0.7;

    // Create a set of adjacent work URLs for faster lookup
    const adjacentUrls = new Set(adjacentWorks.map((w) => w.url));

    // Filter out adjacent works first
    const availableWorks = works.filter((work) => !adjacentUrls.has(work.url));

    // If no works are available (edge case), use all works
    const candidateWorks = availableWorks.length > 0 ? availableWorks : works;

    // Create a weighted selection based on usage count and randomness
    const weightedWorks = candidateWorks.map((work) => {
      const usageCount = workUsageCountRef.current.get(work.url) || 0;
      // Lower usage = higher weight, add randomness
      const randomWeight = seededRandom(seed + work.description.length);
      const weight = (1 / (usageCount + 1)) * (0.7 + randomWeight * 0.3);
      return { work, weight };
    });

    // Sort by weight (highest first)
    weightedWorks.sort((a, b) => b.weight - a.weight);

    // Select from top candidates with some randomness
    const topCandidates = Math.min(3, weightedWorks.length);
    const randomIndex = Math.floor(seededRandom(seed) * topCandidates);
    const selectedWork = weightedWorks[randomIndex]?.work || weightedWorks[0]?.work || works[0];

    // Update usage count
    workUsageCountRef.current.set(selectedWork.url, (workUsageCountRef.current.get(selectedWork.url) || 0) + 1);

    return selectedWork;
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
          const adjacentWorks = getAdjacentWorks(x, y, 3); // Increased radius to 2
          const selectedWork = selectUniqueWork(x, y, adjacentWorks);
          const offsetX = 0;
          const offsetY = x % 2 === 0 ? 0 : staggerOffset;
          item = {
            id,
            work: selectedWork,
            offsetX,
            offsetY
          };
          itemsRef.current.set(id, item);
        }
        items.push({ ...item, x, y });
      }
    }

    // Periodically reset usage counts to allow for long-term variety
    if (items.length > works.length * 2) {
      workUsageCountRef.current.clear();
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
        setSelectedWork({ ...work, ...{ type: 'work' } });
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
        // Zoom functionality remains the same
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
      } else {
        const deltaX = e.deltaX;
        const deltaY = e.deltaY;

        targetOffsetRef.current.x -= deltaX;
        targetOffsetRef.current.y -= deltaY;
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

  useEffect(() => {
    setLoadingProgress(100);
    setIsLoaded();
  }, []);

  const getItemPosition = useCallback(
    (item: GridItem & { x: number; y: number }) => ({
      x: item.x * (cellWidth + gapSize) + item.offsetX,
      y: item.y * (cellHeight + gapSize) + item.offsetY
    }),
    [cellWidth, cellHeight, gapSize]
  );

  const getViewportContentBounds = useCallback(
    (viewportWidth: number, viewportHeight: number, viewportOffsetX: number, viewportOffsetY: number, viewportZoom: number) => {
      const originOffsetX = (viewportWidth / 2) * (1 - 1 / viewportZoom);
      const originOffsetY = (viewportHeight / 2) * (1 - 1 / viewportZoom);

      return {
        left: originOffsetX - viewportOffsetX / viewportZoom,
        top: originOffsetY - viewportOffsetY / viewportZoom,
        right: originOffsetX - viewportOffsetX / viewportZoom + viewportWidth / viewportZoom,
        bottom: originOffsetY - viewportOffsetY / viewportZoom + viewportHeight / viewportZoom
      };
    },
    []
  );

  const isItemInViewport = useCallback(
    (
      item: GridItem & { x: number; y: number },
      bounds: ReturnType<typeof getViewportContentBounds>,
      itemWidth: number,
      itemHeight: number
    ) => {
      const pos = getItemPosition(item);

      return (
        pos.x + itemWidth > bounds.left &&
        pos.x < bounds.right &&
        pos.y + itemHeight > bounds.top &&
        pos.y < bounds.bottom
      );
    },
    [getItemPosition]
  );

  // Capture a one-shot clustered intro layout for viewport items only
  if (visibleItems.length > 0 && !introConfigRef.current && !prefersReducedMotion && outerContainerRef.current) {
    const { width, height } = outerContainerRef.current.getBoundingClientRect();
    const viewportZoom = targetZoomRef.current;
    const centerX = width / 2 - initialOffsetX / viewportZoom;
    const centerY = height / 2;

    const viewportBounds = getViewportContentBounds(width, height, initialOffsetX, 0, viewportZoom);
    const viewportItems = visibleItems.filter((item) =>
      isItemInViewport(item, viewportBounds, cellWidth, cellHeight)
    );

    const itemTargets = viewportItems.map((item) => {
      const pos = getItemPosition(item);
      const targetCenterX = pos.x + cellWidth / 2;
      const targetCenterY = pos.y + cellHeight / 2;
      const dx = targetCenterX - centerX;
      const dy = targetCenterY - centerY;
      return {
        item,
        distance: Math.hypot(dx, dy)
      };
    });

    const maxDistance = Math.max(...itemTargets.map((target) => target.distance), 1);
    const minStackOpacity = 0.32;
    const clusterX = centerX - cellWidth / 2;
    const clusterY = centerY - cellHeight / 2;

    const stackEntries = itemTargets.map(({ item, distance }) => {
      const seed = item.x * 12.9898 + item.y * 78.233 + item.id.length * 3.17;
      const randB = seededRandom(seed + 1);
      const randC = seededRandom(seed + 2);
      const randD = seededRandom(seed + 3);
      const randE = seededRandom(seed * 1.73 + 9.41);
      const rotationMix = randD * 0.55 + randE * 0.45;

      return {
        item,
        distance,
        stackOrder: randC,
        x: clusterX,
        y: clusterY,
        rotate: (rotationMix - 0.5) * INTRO_CLUSTER_ROTATION_RANGE,
        scale: 1,
        delay: 0.03 + (distance / maxDistance) * INTRO_SPREAD_RIPPLE_S + randB * 0.04
      };
    });

    // Lower cards in the stack fade out gradually
    stackEntries.sort((a, b) => a.stackOrder - b.stackOrder);

    const configs = new Map<string, InfiniteCanvasItemIntro>();
    stackEntries.forEach((entry, stackIndex) => {
      const stackDepth = stackEntries.length <= 1 ? 1 : stackIndex / (stackEntries.length - 1);
      const opacity = minStackOpacity + stackDepth * (1 - minStackOpacity);

      configs.set(entry.item.id, {
        x: entry.x,
        y: entry.y,
        rotate: entry.rotate,
        scale: entry.scale,
        delay: entry.delay,
        opacity,
        zIndex: stackIndex + 1
      });
    });

    introConfigRef.current = configs.size > 0 ? configs : new Map();
    introCompletedIdsRef.current = new Set();
  }

  const isClusterHold = Boolean(introConfigRef.current?.size) && !shouldSpread && !prefersReducedMotion;

  // Hold the cluster until the interstitial finishes, then spread
  useEffect(() => {
    if (prefersReducedMotion) {
      setShouldSpread(true);
      setIsIntroPlaying(false);
      return;
    }
    if (!loaded || !introConfigRef.current) return;
    const timeout = setTimeout(() => setShouldSpread(true), INTRO_SPREAD_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [loaded, visibleItems.length, prefersReducedMotion]);

  const handleIntroComplete = useCallback(
    (itemId: string) => {
      const total = introConfigRef.current?.size ?? 0;
      if (total === 0 || !isIntroPlaying) return;

      introCompletedIdsRef.current.add(itemId);
      if (introCompletedIdsRef.current.size >= total) {
        setIsIntroPlaying(false);
      }
    },
    [isIntroPlaying]
  );

  // Safety timeout in case some items never fire onAnimationComplete
  useEffect(() => {
    if (!shouldSpread || !isIntroPlaying) return;
    const timeout = setTimeout(() => setIsIntroPlaying(false), INTRO_SPREAD_SAFETY_MS);
    return () => clearTimeout(timeout);
  }, [shouldSpread, isIntroPlaying]);

  return (
    <div
      ref={outerContainerRef}
      className={styles.infiniteCanvas}
      data-total={visibleItems.length}
      onMouseDown={isClusterHold ? undefined : handleMouseDown}
      onTouchStart={isClusterHold ? undefined : handleTouchStart}
      onTouchMove={isClusterHold ? undefined : handleTouchMove}
      onTouchEnd={isClusterHold ? undefined : handleTouchEnd}
      style={{ pointerEvents: isClusterHold ? 'none' : undefined }}
    >
      <div
        ref={innerContainerRef}
        className={styles.infiniteCanvasItemWrapper}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          willChange: 'transform'
        }}
      >
        {visibleItems.map((item) => {
          const position = getItemPosition(item);
          const intro = introConfigRef.current?.get(item.id);

          return (
            <InfiniteCanvasItem
              key={item.id}
              onClick={() => handleItemClick(item.work)}
              work={item.work}
              x={position.x}
              y={position.y}
              width={cellWidth}
              height={cellHeight}
              intro={intro}
              shouldSpread={shouldSpread}
              onIntroComplete={intro ? () => handleIntroComplete(item.id) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};

export { InfiniteCanvas };
