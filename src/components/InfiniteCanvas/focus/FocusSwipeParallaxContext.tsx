'use client';

import { createContext, useContext } from 'react';

import type { MotionValue } from 'motion/react';

/** Live mobile focus-gallery swipe — tips use the same copy parallax as FocusSwipeCopy */
export type FocusSwipeParallaxValue = {
  dragX: MotionValue<number>;
  panelStride: number;
  /** True while the swipe gallery is settled and interactive */
  active: boolean;
};

export const FocusSwipeParallaxContext = createContext<FocusSwipeParallaxValue | null>(null);

export const useFocusSwipeParallax = () => useContext(FocusSwipeParallaxContext);
