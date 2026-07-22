'use client';

import styles from '../InfiniteCanvas.module.scss';

import React from 'react';

import { AnimatePresence, motion, type MotionValue } from 'motion/react';

import { markImageLoaded } from '@/hooks/useImageLoad';

import type { FocusSnapshot, Work } from '../types';
import { FocusSwipeCard } from './FocusSwipeCard';
import { FOCUS_LINK_ARROW, FocusSwipeCopy, formatUrl } from './FocusSwipeCopy';
import { CARD_BORDER_RADIUS_RATIO, FOCUS_MOBILE_SIDE_PAD } from './focusLayout';
import {
  FOCUS_CLOSE_TRANSITION,
  FOCUS_COPY_ITEM_REVEAL,
  FOCUS_SWIPE_GAP_PX,
  type FocusSlideTargets
} from './focusMotion';

export type FocusSwipePanel = {
  work: Work;
  side: 'prev' | 'current' | 'next';
  /** Stable work key; side-prefixed only when the same work is tiled on both peeks */
  reactKey: string;
};

export type FocusOverlayProps = {
  showFocusScrim: boolean;
  showFocusHtml: boolean;
  focusedWork: Work | null;
  focusSnapshot: FocusSnapshot | null;
  isFocusSettled: boolean;
  focusedIsOriginCard: boolean;
  useMobilePanelScroll: boolean;
  useFocusSwipeGallery: boolean;
  useFocusSlidePresence: boolean;
  showFocusSwipePeeks: boolean;
  isMobile: boolean;
  canSpatialFocusNav: boolean;
  focusSwipePanels: FocusSwipePanel[];
  focusSwipeDragX: MotionValue<number>;
  focusWorkKey: string;
  /** Presence slide key — unique per nav step (avoids A→B→A freeze) */
  focusSlideKey: string;
  focusImageSrc: string;
  focusCardSlide: FocusSlideTargets;
  focusCopySlide: FocusSlideTargets;
  focusNavDirection: number;
  focusNavInstant: boolean;
  prefersReducedMotion: boolean;
  originCardKey: string | null;
  getWorkKey: (work: Work) => string;
  /** Focus-only easter egg for the currently focused custom card (if any) */
  focusedFocusExtra?: React.ReactNode;
  /** Resolve focus extra for a swipe panel work (origin / custom cards) */
  getFocusExtraForWork?: (work: Work) => React.ReactNode;
  /** Custom focus hero banner (replaces work image) for the current work */
  focusedFocusBanner?: React.ReactNode;
  /** Resolve focus hero banner for a swipe panel work */
  getFocusBannerForWork?: (work: Work) => React.ReactNode;
  requestClose: () => void;
  navigateFocus: (dir: -1 | 1) => void;
  handleFocusScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  handleFocusSwipeTouchStart: (event: React.TouchEvent) => void;
  handleFocusSwipeTouchEnd: (event: React.TouchEvent) => void;
  handleFocusSwipeTouchCancel: () => void;
  setFocusCardNode: (node: HTMLDivElement | null) => void;
  setFocusImageNode: (node: HTMLImageElement | null) => void;
  focusScrollShellRef: React.MutableRefObject<HTMLDivElement | null>;
  focusScrollRef: React.MutableRefObject<HTMLDivElement | null>;
};

export const FocusOverlay: React.FC<FocusOverlayProps> = ({
  showFocusScrim,
  showFocusHtml,
  focusedWork,
  focusSnapshot,
  isFocusSettled,
  focusedIsOriginCard,
  useMobilePanelScroll,
  useFocusSwipeGallery,
  useFocusSlidePresence,
  showFocusSwipePeeks,
  isMobile,
  canSpatialFocusNav,
  focusSwipePanels,
  focusSwipeDragX,
  focusWorkKey,
  focusSlideKey,
  focusImageSrc,
  focusCardSlide,
  focusCopySlide,
  focusNavDirection,
  focusNavInstant,
  prefersReducedMotion,
  originCardKey,
  getWorkKey,
  focusedFocusExtra,
  getFocusExtraForWork,
  focusedFocusBanner,
  getFocusBannerForWork,
  requestClose,
  navigateFocus,
  handleFocusScroll,
  handleFocusSwipeTouchStart,
  handleFocusSwipeTouchEnd,
  handleFocusSwipeTouchCancel,
  setFocusCardNode,
  setFocusImageNode,
  focusScrollShellRef,
  focusScrollRef
}) => (
  <>
    <AnimatePresence>
      {showFocusScrim && (
        <motion.button
          key="focus-scrim"
          type="button"
          aria-label="Dismiss project"
          className={styles.infiniteCanvasFocusScrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onClick={requestClose}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {showFocusHtml && focusedWork && focusSnapshot && (
        <>
          <AnimatePresence>
            {isFocusSettled ? (
              <motion.button
                key="focus-close"
                type="button"
                className={styles.infiniteCanvasFocusClose}
                aria-label="Close"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={FOCUS_CLOSE_TRANSITION}
                onClick={requestClose}
              >
                <img src="/images/icon/close.svg" alt="" />
              </motion.button>
            ) : null}
          </AnimatePresence>
          <div
            key="focus-scroll"
            ref={(node) => {
              focusScrollShellRef.current = node;
              if (!useMobilePanelScroll) focusScrollRef.current = node;
            }}
            className={styles.infiniteCanvasFocusScroll}
            data-ready={isFocusSettled ? 'true' : undefined}
            data-origin={focusedIsOriginCard ? 'true' : undefined}
            data-panel-scroll={useMobilePanelScroll ? 'true' : undefined}
            onScroll={
              !useMobilePanelScroll && focusedIsOriginCard ? handleFocusScroll : undefined
            }
            onTouchStart={handleFocusSwipeTouchStart}
            onTouchEnd={handleFocusSwipeTouchEnd}
            onTouchCancel={handleFocusSwipeTouchCancel}
            onWheel={(e) => e.stopPropagation()}
            style={{
              opacity: isFocusSettled ? 1 : 0,
              pointerEvents: isFocusSettled ? 'auto' : 'none'
            }}
          >
            <div
              className={styles.infiniteCanvasFocusScrollInner}
              style={
                useMobilePanelScroll
                  ? {
                      // Keep the 24px side inset on the shell so detailWidth matches the morph
                      paddingLeft: FOCUS_MOBILE_SIDE_PAD,
                      paddingRight: FOCUS_MOBILE_SIDE_PAD
                    }
                  : { paddingTop: focusSnapshot.cardTopScreenY }
              }
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={styles.infiniteCanvasFocusDetail}
                style={{ width: focusSnapshot.detailWidth }}
              >
                <motion.div
                  className={styles.infiniteCanvasFocusSwipeTrack}
                  style={{ x: showFocusSwipePeeks ? focusSwipeDragX : 0 }}
                >
                  {useFocusSwipeGallery ? (
                    focusSwipePanels.map(({ work, side, reactKey }) => {
                      const panelKey = getWorkKey(work);
                      const isCurrent = side === 'current';
                      const isOriginWork = Boolean(originCardKey && panelKey === originCardKey);
                      const panelSrc = work.thumbnail || work.image;
                      const panelBanner = getFocusBannerForWork?.(work);
                      return (
                        <div
                          key={reactKey}
                          className={styles.infiniteCanvasFocusSwipePanel}
                          data-side={side}
                          aria-hidden={!isCurrent}
                          ref={
                            isCurrent && useMobilePanelScroll
                              ? (node) => {
                                  focusScrollRef.current = node;
                                }
                              : undefined
                          }
                          onScroll={
                            isCurrent && useMobilePanelScroll && isOriginWork
                              ? handleFocusScroll
                              : undefined
                          }
                          style={
                            useMobilePanelScroll
                              ? { paddingTop: focusSnapshot.cardTopScreenY }
                              : undefined
                          }
                        >
                          <FocusSwipeCard
                            side={side}
                            dragX={focusSwipeDragX}
                            panelStride={focusSnapshot.detailWidth + FOCUS_SWIPE_GAP_PX}
                            reducedMotion={Boolean(prefersReducedMotion)}
                            softIncoming={!isMobile}
                            isCurrent={isCurrent}
                            isOriginWork={isOriginWork}
                            detailWidth={focusSnapshot.detailWidth}
                            scaledScreenHeight={focusSnapshot.scaledScreenHeight}
                            borderRadius={focusSnapshot.detailWidth * CARD_BORDER_RADIUS_RATIO}
                            panelSrc={panelSrc}
                            workName={work.name}
                            banner={panelBanner}
                            setFocusCardNode={isCurrent ? setFocusCardNode : undefined}
                            setFocusImageNode={isCurrent ? setFocusImageNode : undefined}
                          />
                          {isFocusSettled ? (
                            <FocusSwipeCopy
                              work={work}
                              side={side}
                              dragX={focusSwipeDragX}
                              panelStride={focusSnapshot.detailWidth + FOCUS_SWIPE_GAP_PX}
                              isCurrent={isCurrent}
                              firstOpenReveal={
                                isCurrent && focusNavDirection === 0 && !focusNavInstant
                              }
                              reducedMotion={Boolean(prefersReducedMotion)}
                              focusExtra={getFocusExtraForWork?.(work)}
                            />
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.infiniteCanvasFocusSwipePanel} data-side="current">
                      <div className={styles.infiniteCanvasFocusCardStage}>
                        {useFocusSlidePresence ? (
                          <AnimatePresence mode="sync" initial={false}>
                            <motion.div
                              key={focusSlideKey}
                              className={styles.infiniteCanvasFocusSlide}
                              initial={focusCardSlide.initial}
                              animate={focusCardSlide.animate}
                              exit={focusCardSlide.exit}
                              transition={focusCardSlide.transition}
                            >
                              <div
                                ref={setFocusCardNode}
                                className={styles.infiniteCanvasFocusCard}
                                data-origin={focusedIsOriginCard ? 'true' : undefined}
                                style={{
                                  width: focusSnapshot.detailWidth,
                                  height: focusSnapshot.scaledScreenHeight,
                                  borderRadius:
                                    focusSnapshot.detailWidth * CARD_BORDER_RADIUS_RATIO
                                }}
                              >
                                {focusedIsOriginCard ? (
                                  <div
                                    className={styles.infiniteCanvasFocusCardCustom}
                                    aria-hidden
                                  />
                                ) : focusedFocusBanner ? (
                                  <div className={styles.infiniteCanvasFocusCardBanner}>
                                    {focusedFocusBanner}
                                  </div>
                                ) : (
                                  <img
                                    ref={setFocusImageNode}
                                    className={styles.infiniteCanvasFocusCardImage}
                                    src={focusImageSrc}
                                    alt={focusedWork.name}
                                    draggable={false}
                                    decoding="async"
                                    fetchPriority="high"
                                    onLoad={() => markImageLoaded(focusImageSrc)}
                                  />
                                )}
                              </div>
                            </motion.div>
                          </AnimatePresence>
                        ) : (
                          <div className={styles.infiniteCanvasFocusSlide}>
                            <div
                              ref={setFocusCardNode}
                              className={styles.infiniteCanvasFocusCard}
                              data-origin={focusedIsOriginCard ? 'true' : undefined}
                              style={{
                                width: focusSnapshot.detailWidth,
                                height: focusSnapshot.scaledScreenHeight,
                                borderRadius: focusSnapshot.detailWidth * CARD_BORDER_RADIUS_RATIO
                              }}
                            >
                              {focusedIsOriginCard ? (
                                <div
                                  className={styles.infiniteCanvasFocusCardCustom}
                                  aria-hidden
                                />
                              ) : focusedFocusBanner ? (
                                <div className={styles.infiniteCanvasFocusCardBanner}>
                                  {focusedFocusBanner}
                                </div>
                              ) : (
                                <img
                                  ref={setFocusImageNode}
                                  className={styles.infiniteCanvasFocusCardImage}
                                  src={focusImageSrc}
                                  alt={focusedWork.name}
                                  draggable={false}
                                  decoding="async"
                                  fetchPriority="high"
                                  onLoad={() => markImageLoaded(focusImageSrc)}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {isFocusSettled ? (
                        <div className={styles.infiniteCanvasFocusCopyStage}>
                          {useFocusSlidePresence ? (
                            <AnimatePresence mode="sync">
                              <motion.div
                                key={focusSlideKey}
                                className={styles.infiniteCanvasFocusCopy}
                                initial={focusCopySlide.initial}
                                animate={focusCopySlide.animate}
                                exit={focusCopySlide.exit}
                                transition={focusCopySlide.transition}
                              >
                                <h1 className={styles.infiniteCanvasFocusTitle}>
                                  {focusedWork.name}
                                </h1>
                                <div className={styles.infiniteCanvasFocusDescription}>
                                  {focusedWork.description}
                                </div>
                                {focusedWork.url ? (
                                  <a
                                    className={styles.infiniteCanvasFocusLink}
                                    href={focusedWork.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {formatUrl(focusedWork.url)}
                                    {FOCUS_LINK_ARROW}
                                  </a>
                                ) : null}
                                {focusedFocusExtra}
                              </motion.div>
                            </AnimatePresence>
                          ) : (
                            <motion.div
                              key={focusSlideKey}
                              className={styles.infiniteCanvasFocusCopy}
                              initial={
                                focusNavDirection === 0 && !focusNavInstant
                                  ? { opacity: 0, y: 16 }
                                  : false
                              }
                              animate={{ opacity: 1, x: 0, y: 0 }}
                              transition={
                                focusNavDirection === 0 && !focusNavInstant
                                  ? FOCUS_COPY_ITEM_REVEAL.body
                                  : { duration: 0 }
                              }
                            >
                              <h1 className={styles.infiniteCanvasFocusTitle}>
                                {focusedWork.name}
                              </h1>
                              <div className={styles.infiniteCanvasFocusDescription}>
                                {focusedWork.description}
                              </div>
                              {focusedWork.url ? (
                                <a
                                  className={styles.infiniteCanvasFocusLink}
                                  href={focusedWork.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {formatUrl(focusedWork.url)}
                                  {FOCUS_LINK_ARROW}
                                </a>
                              ) : null}
                              {focusedFocusExtra}
                            </motion.div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {isFocusSettled && !isMobile && canSpatialFocusNav ? (
              <>
                <motion.button
                  key="focus-prev"
                  type="button"
                  className={styles.infiniteCanvasFocusNavPrev}
                  aria-label="Previous project"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => navigateFocus(-1)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M14.5 5.5L8 12l6.5 6.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.button>
                <motion.button
                  key="focus-next"
                  type="button"
                  className={styles.infiniteCanvasFocusNavNext}
                  aria-label="Next project"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => navigateFocus(1)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M9.5 5.5L16 12l-6.5 6.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.button>
              </>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  </>
);
