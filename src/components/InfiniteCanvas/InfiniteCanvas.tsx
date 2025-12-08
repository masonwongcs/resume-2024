'use client';

import styles from './InfiniteCanvas.module.scss';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import cx from 'classnames';

import { INFO } from '@/components/Contact/Contact.fixture';
import QR from '@/components/Contact/qr.svg';
import { useImageLoad } from '@/hooks/useImageLoad';
import { useHomeStore, useWorkStore } from '@/store';

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

const InfiniteCanvasItem: React.FC<{
  work: Work;
  style: React.CSSProperties;
  onClick: () => void;
  isSpecial?: boolean;
  isExpanded?: boolean;
}> = ({ work, style, onClick, isSpecial = false, isExpanded = false }) => {
  const isLoaded = useImageLoad(work.image);
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const setStickerQueue = useWorkStore((state) => state.setStickerQueue);

  if (isSpecial) {
    return (
      <div
        className={cx(styles.infiniteCanvasItem, styles.specialCardItem, {
          [styles.specialCardExpanded]: isExpanded
        })}
        onClick={onClick}
        style={style}
      >
        <div className={styles.specialCardContent}>
          <div className={styles.specialCardBorder} />
          <div className={styles.specialCardInner}>
            {!isExpanded ? (
              <div className={styles.specialCardText}>
                <h1>
                  <span>UI Enthusiast &</span>
                  <span>Front-End Engineer</span>
                </h1>
                <p>
                  <span>Mason Wong</span>
                </p>
              </div>
            ) : (
              <div className={styles.specialCardExpandedContent}>
                <button
                  className={styles.closeButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M18 6L6 18M6 6L18 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className={styles.expandedContentInner}>
                  <div className={styles.expandedContentGrid}>
                    <div className={styles.expandedContentGridItem}>
                      {INFO.map(({ title, skills, stickers }) => {
                        return (
                          <div key={title} className={styles.workItem}>
                            <h3 className={styles.subtitle}>
                              <button
                                className={styles.infoItemCta}
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent card collapse
                                  setSelectedWork({
                                    name: title,
                                    skills,
                                    stickers,
                                    type: 'info'
                                  });

                                  setStickerQueue(stickers);
                                }}
                              >
                                <img src="/images/icon/plus.svg" alt={`View more ${title}`} />
                              </button>
                              {title}
                            </h3>
                          </div>
                        );
                      })}
                    </div>

                    <div className={styles.expandedContentGridItem}>
                      <div className={styles.contactItem}>
                        <a
                          className={styles.contactItemCta}
                          href="https://www.linkedin.com/in/masonwongcs/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          LinkedIn
                          <img src="/images/icon/arrow-right.svg" alt={`Open LinkedIn url in new tab`} />
                        </a>
                      </div>
                      <div className={styles.contactItem}>
                        <a
                          className={cx(styles.contactItemCta, 'githubCta')}
                          href="https://github.com/masonwongcs"
                          target="_blank"
                          rel="noreferrer"
                        >
                          GitHub
                          <img src="/images/icon/arrow-right.svg" alt={`Open GitHub url in new tab`} />
                        </a>
                      </div>
                      <div className={styles.contactItem}>
                        <a
                          className={styles.contactItemCta}
                          href="https://masonwongcs.com/resume.pdf"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Resume
                          <img src="/images/icon/arrow-right.svg" alt={`Open resume url in new tab`} />
                        </a>
                      </div>
                      <div className={styles.contactItem}>
                        <a
                          className={styles.contactItemCta}
                          href="mailto:hello@masonwongcs.com"
                          target="_blank"
                          rel="noreferrer"
                        >
                          hello@masonwongcs.com
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.infiniteCanvasItem} onClick={onClick} style={style}>
      <div
        className={styles.infiniteCanvasItemBackground}
        style={{
          opacity: isLoaded ? 0 : 1
        }}
      />
      <img
        className={styles.infiniteCanvasItemImage}
        src={work?.thumbnail ? work?.thumbnail : work.image}
        alt={work.name}
        style={{
          opacity: isLoaded ? 1 : 0
        }}
      />
    </div>
  );
};

// Special work item for the center card
const createSpecialWork = (): Work => ({
  name: 'Profile Card',
  url: 'profile-card',
  image: '',
  description: 'A profile card in the center',
  thumbnail: ''
});

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ works }) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isSpecialCardExpanded, setIsSpecialCardExpanded] = useState(false);
  const [isInitialZoomComplete, setIsInitialZoomComplete] = useState(false);
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, GridItem>>(new Map());
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const targetZoomRef = useRef(1);
  const animationFrameRef = useRef<number | null>(null);
  const workUsageCountRef = useRef<Map<string, number>>(new Map());
  const lastTouchDistance = useRef<number | null>(null);
  const isMoving = useRef(false);
  const moveTimeout = useRef<NodeJS.Timeout | null>(null);
  const seedFactorRef = useRef(Math.random() * 1000);

  // Calculate dimensions and layout values
  const isMobile = dimensions.width > 0 ? dimensions.width <= 480 : false;
  const gapSize = dimensions.width > 0 ? (isMobile ? dimensions.width / 12 : dimensions.width / 24) : 0;
  const cellWidth = dimensions.width > 0 ? (isMobile ? dimensions.width / 2.3 : dimensions.width / 4.6) : 0;
  const cellHeight = (cellWidth * 3) / 5;
  // Base padding to prevent items from disappearing too quickly at edges
  const baseViewportPadding = isMobile ? 4 : 6;
  const maxVisibleItems = 100; // Maximum number of items to render for performance
  const lerpFactor = 0.15;
  const zoomSpeed = 0.001;
  const minZoom = 0.85;
  const maxZoom = isMobile ? 2 : 3;
  const moveTimeoutDuration = 100;
  const staggerOffset = (cellHeight + gapSize) * 0.5;

  // Calculate initial offset to center the item at (0, 0) in the viewport
  const initialOffsetX = dimensions.width > 0 ? dimensions.width / 2 - cellWidth / 2 : 0;
  const initialOffsetY = dimensions.height > 0 ? dimensions.height / 2 - cellHeight / 2 : 0;

  const generateItemId = (x: number, y: number) => `item_${x}_${y}`;

  const seededRandom = useCallback((seed: number) => {
    const x = Math.sin(seed) * seedFactorRef.current;
    return x - Math.floor(x);
  }, []);

  const selectUniqueWork = useCallback(
    (x: number, y: number, adjacentWorks: Work[]) => {
      const seed = x * seedFactorRef.current + y;
      const shuffled = [...works].sort(() => seededRandom(seed) - 0.5);

      // Sort works by usage count (the least used first)
      shuffled.sort(
        (a, b) => (workUsageCountRef.current.get(a.url) || 0) - (workUsageCountRef.current.get(b.url) || 0)
      );

      // Try to find a work that's not in adjacent cells and has been used the least
      const selectedWork = shuffled.find((work) => !adjacentWorks.includes(work)) || shuffled[0];

      // Update usage count
      workUsageCountRef.current.set(selectedWork.url, (workUsageCountRef.current.get(selectedWork.url) || 0) + 1);

      return selectedWork;
    },
    [works, seededRandom]
  );

  const getAdjacentWorks = useCallback((x: number, y: number) => {
    const adjacent: Work[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const id = generateItemId(x + dx, y + dy);
        const item = itemsRef.current.get(id);
        if (item) adjacent.push(item.work);
      }
    }
    return adjacent;
  }, []);

  const visibleItems = useMemo(() => {
    if (!outerContainerRef.current || dimensions.width === 0 || dimensions.height === 0 || cellWidth === 0) {
      return [];
    }

    const { width, height } = outerContainerRef.current.getBoundingClientRect();

    // Padding scales with zoom - more padding when zoomed out to prevent items disappearing too quickly
    // But limit padding to keep total items under maxVisibleItems
    let viewportPadding = Math.max(baseViewportPadding, Math.ceil(baseViewportPadding / zoom));

    // Calculate initial bounds
    let startX = Math.floor((-offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) - viewportPadding;
    let startY = Math.floor((-offset.y + initialOffsetY) / ((cellHeight + gapSize) * zoom)) - viewportPadding;
    let endX = Math.ceil((width - offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) + viewportPadding;
    let endY = Math.ceil((height - offset.y + initialOffsetY) / ((cellHeight + gapSize) * zoom)) + viewportPadding;

    // Estimate total items and reduce padding if needed
    let estimatedItems = (endX - startX + 1) * (endY - startY + 1);
    if (estimatedItems > maxVisibleItems) {
      // Reduce padding to limit items
      const reductionFactor = Math.sqrt(maxVisibleItems / estimatedItems);
      viewportPadding = Math.max(1, Math.floor(viewportPadding * reductionFactor));

      // Recalculate bounds with reduced padding
      startX = Math.floor((-offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) - viewportPadding;
      startY = Math.floor((-offset.y + initialOffsetY) / ((cellHeight + gapSize) * zoom)) - viewportPadding;
      endX = Math.ceil((width - offset.x + initialOffsetX) / ((cellWidth + gapSize) * zoom)) + viewportPadding;
      endY = Math.ceil((height - offset.y + initialOffsetY) / ((cellHeight + gapSize) * zoom)) + viewportPadding;
    }

    const specialWork = createSpecialWork();
    const items: (GridItem & { x: number; y: number })[] = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        // Stop if we've reached the max items
        if (items.length >= maxVisibleItems) {
          break;
        }

        const id = generateItemId(x, y);
        let item = itemsRef.current.get(id);
        if (!item) {
          // Use special work for item at (0, 0)
          const isCenterItem = x === 0 && y === 0;
          const offsetX = 0;
          const offsetY = x % 2 === 0 ? 0 : staggerOffset;

          let selectedWork: Work;
          if (isCenterItem) {
            selectedWork = specialWork;
          } else {
            const adjacentWorks = getAdjacentWorks(x, y);
            selectedWork = selectUniqueWork(x, y, adjacentWorks);
          }

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
      // Break outer loop if we've reached max items
      if (items.length >= maxVisibleItems) {
        break;
      }
    }

    // Periodically reset usage counts to allow for long-term variety
    if (items.length > works.length * 2) {
      workUsageCountRef.current.clear();
    }

    return items;
  }, [
    offset,
    zoom,
    works,
    initialOffsetX,
    initialOffsetY,
    cellWidth,
    cellHeight,
    gapSize,
    staggerOffset,
    dimensions,
    getAdjacentWorks,
    selectUniqueWork,
    baseViewportPadding,
    maxVisibleItems
  ]);

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
        }, moveTimeoutDuration);
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

  // Initialize dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (outerContainerRef.current) {
        const rect = outerContainerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Set initial offset when dimensions are available
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && cellWidth > 0) {
      // Set initial zoom to be zoomed in on the center card
      const initialZoom = isMobile ? 2 : 3;

      // The special card is at grid position (0, 0)
      // In container coordinates, the card's top-left is at (0, 0)
      // The card's center is at (cellWidth/2, cellHeight/2) in container coordinates
      // With transform-origin '0 0', scaling happens from top-left
      // After transform: screenX = offset.x + containerX * zoom
      // For card center: screenX = offset.x + (cellWidth/2) * zoom
      // We want this at viewport center: viewportWidth/2
      // So: offset.x = viewportWidth/2 - (cellWidth/2) * zoom
      const viewportCenterX = dimensions.width / 2;
      const viewportCenterY = dimensions.height / 2;

      // Card center in container coordinates (at grid 0,0)
      const cardCenterX = cellWidth / 2;
      const cardCenterY = cellHeight / 2;

      // Calculate offset to center the card
      const newOffsetX = viewportCenterX - cardCenterX * initialZoom;
      const newOffsetY = viewportCenterY - cardCenterY * initialZoom;

      setOffset({ x: newOffsetX, y: newOffsetY });
      targetOffsetRef.current = { x: newOffsetX, y: newOffsetY };

      setZoom(initialZoom);
      targetZoomRef.current = initialZoom;
    }
  }, [dimensions.width, dimensions.height, cellWidth, cellHeight, isMobile]);

  // Zoom out after initial delay
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && !isInitialZoomComplete && cellWidth > 0) {
      const zoomOutDelay = 2000; // 2 seconds delay
      const zoomOutDuration = 1500; // 1.5 seconds to zoom out

      const timeoutId = setTimeout(() => {
        // Calculate zoom out while keeping the viewport center fixed
        // The viewport center in container coordinate space
        const viewportCenterX = dimensions.width / 2;
        const viewportCenterY = dimensions.height / 2;
        const currentZoom = targetZoomRef.current;
        const newZoom = 1;

        // Calculate the point in content space (before zoom)
        const contentPointX = (viewportCenterX - targetOffsetRef.current.x) / currentZoom;
        const contentPointY = (viewportCenterY - targetOffsetRef.current.y) / currentZoom;

        // Calculate new offset to keep the viewport center point stationary
        const newOffsetX = viewportCenterX - contentPointX * newZoom;
        const newOffsetY = viewportCenterY - contentPointY * newZoom;

        targetZoomRef.current = newZoom;
        targetOffsetRef.current = { x: newOffsetX, y: newOffsetY };

        // After zoom animation completes, enable panning
        setTimeout(() => {
          setIsInitialZoomComplete(true);
        }, zoomOutDuration);
      }, zoomOutDelay);

      return () => clearTimeout(timeoutId);
    }
  }, [dimensions.width, dimensions.height, isInitialZoomComplete, cellWidth]);

  useEffect(() => {
    let isActive = true;

    const runAnimation = () => {
      if (!isActive) return;
      animateOffset();
    };

    animationFrameRef.current = requestAnimationFrame(runAnimation);

    return () => {
      isActive = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (moveTimeout.current) {
        clearTimeout(moveTimeout.current);
        moveTimeout.current = null;
      }
    };
  }, [animateOffset]);

  const handleItemClick = useCallback(
    (work: Work) => {
      if (!isMoving.current) {
        if (work.url === 'profile-card') {
          setIsSpecialCardExpanded((prev) => !prev);
        } else {
          setSelectedWork({
            ...work,
            ...{
              type: 'work'
            }
          });
        }
      }
    },
    [setSelectedWork]
  );

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      // Prevent dragging during initial zoom
      if (!isInitialZoomComplete) return;
      isDragging.current = true;
      lastPosition.current = { x: clientX, y: clientY };
    },
    [isInitialZoomComplete]
  );

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
      // Prevent mouse interaction during initial zoom
      if (!isInitialZoomComplete) return;
      handleStart(e.clientX, e.clientY);
    },
    [handleStart, isInitialZoomComplete]
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
      // zoomPoint is in viewport coordinates (relative to the container)
      // Convert to container-relative coordinates (accounting for container position)
      const containerRelativeX = zoomPoint.x;
      const containerRelativeY = zoomPoint.y;

      // Calculate the point in the content space (before zoom)
      // The content point is: (viewportPoint - offset) / currentZoom
      const contentPointX = (containerRelativeX - targetOffsetRef.current.x) / targetZoomRef.current;
      const contentPointY = (containerRelativeY - targetOffsetRef.current.y) / targetZoomRef.current;

      // Calculate new offset to keep the zoom point stationary
      // After zoom: viewportPoint = newOffset + contentPoint * newZoom
      // So: newOffset = viewportPoint - contentPoint * newZoom
      const newOffsetX = containerRelativeX - contentPointX * newZoom;
      const newOffsetY = containerRelativeY - contentPointY * newZoom;

      targetZoomRef.current = newZoom;
      targetOffsetRef.current = { x: newOffsetX, y: newOffsetY };
    }
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Prevent interaction during initial zoom
      if (!isInitialZoomComplete) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom functionality
        const delta = -e.deltaY * zoomSpeed;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current * (1 + delta)));

        if (newZoom !== targetZoomRef.current) {
          const rect = outerContainerRef.current?.getBoundingClientRect();
          if (rect) {
            // Calculate zoom point relative to the container (not viewport center)
            // e.clientX/Y are screen coordinates, rect.left/top is container position
            const zoomPoint = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top
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
    [handleZoom, zoomSpeed, minZoom, maxZoom, isInitialZoomComplete]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Prevent touch interaction during initial zoom
      if (!isInitialZoomComplete) return;

      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        lastTouchDistance.current = distance;
      } else if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleStart, isInitialZoomComplete]
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
                x: (touch1.clientX + touch2.clientX) / 2 - rect.left - dimensions.width / 2,
                y: (touch1.clientY + touch2.clientY) / 2 - rect.top - dimensions.height / 2
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
    [handleMove, handleZoom, minZoom, maxZoom, dimensions]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = null;
    handleEnd();
  }, [handleEnd]);

  useEffect(() => {
    const outerContainer = outerContainerRef.current;
    if (!outerContainer) return;

    const mouseMoveHandler = handleMouseMove as any;
    const touchMoveHandler = handleTouchMove as any;

    outerContainer.addEventListener('mousemove', mouseMoveHandler);
    outerContainer.addEventListener('mouseup', handleEnd);
    outerContainer.addEventListener('mouseleave', handleEnd);
    outerContainer.addEventListener('touchmove', touchMoveHandler, { passive: false });
    outerContainer.addEventListener('touchend', handleEnd);
    outerContainer.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      outerContainer.removeEventListener('mousemove', mouseMoveHandler);
      outerContainer.removeEventListener('mouseup', handleEnd);
      outerContainer.removeEventListener('mouseleave', handleEnd);
      outerContainer.removeEventListener('touchmove', touchMoveHandler);
      outerContainer.removeEventListener('touchend', handleEnd);
      outerContainer.removeEventListener('wheel', handleWheel);
    };
  }, [handleMouseMove, handleTouchMove, handleEnd, handleWheel]);

  useEffect(() => {
    setLoadingProgress(100);
    setIsLoaded();
  }, [setLoadingProgress, setIsLoaded]);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (moveTimeout.current) {
        clearTimeout(moveTimeout.current);
        moveTimeout.current = null;
      }
      // Clear refs to prevent stale state on hot reload
      itemsRef.current.clear();
      workUsageCountRef.current.clear();
    };
  }, []);

  return (
    <div
      ref={outerContainerRef}
      className={cx(styles.infiniteCanvas, {
        [styles.specialCardExpanded]: isSpecialCardExpanded
      })}
      data-total={visibleItems.length}
      onMouseDown={isSpecialCardExpanded ? undefined : handleMouseDown}
      onTouchStart={isSpecialCardExpanded ? undefined : handleTouchStart}
      onTouchMove={isSpecialCardExpanded ? undefined : handleTouchMove}
      onTouchEnd={isSpecialCardExpanded ? undefined : handleTouchEnd}
    >
      <div
        ref={innerContainerRef}
        className={styles.infiniteCanvasItemWrapper}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform'
        }}
      >
        {visibleItems.map((item) => {
          const isSpecial = item.x === 0 && item.y === 0;
          const isExpanded = isSpecialCardExpanded && isSpecial;
          const expandedScale = isMobile ? 2 : 1.5; // Scale factor when expanded
          const expandedWidth = cellWidth * expandedScale;
          const expandedHeight = cellHeight * expandedScale;

          // Calculate position to keep card centered when expanding
          const baseX = item.x * (cellWidth + gapSize) + item.offsetX;
          const baseY = item.y * (cellHeight + gapSize) + item.offsetY;

          // When expanded, adjust position to keep center point the same
          const offsetX = isExpanded ? -(expandedWidth - cellWidth) / 2 : 0;
          const offsetY = isExpanded ? -(expandedHeight - cellHeight) / 2 : 0;

          return (
            <InfiniteCanvasItem
              key={item.id}
              onClick={() => handleItemClick(item.work)}
              work={item.work}
              isSpecial={isSpecial}
              isExpanded={isExpanded}
              style={{
                width: isExpanded ? `${expandedWidth}px` : `${cellWidth}px`,
                height: isExpanded ? `${expandedHeight}px` : `${cellHeight}px`,
                transform: `translate3d(${baseX + offsetX}px, ${baseY + offsetY}px, 0)`,
                transformOrigin: 'center center',
                willChange: 'transform',
                // For special card, apply smooth transitions for expansion
                // For regular items, no transitions to prevent flickering during panning
                transition: isSpecial
                  ? 'width 600ms var(--material-cubic-bezier), height 600ms var(--material-cubic-bezier), transform 600ms var(--material-cubic-bezier)'
                  : 'none'
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export { InfiniteCanvas };
