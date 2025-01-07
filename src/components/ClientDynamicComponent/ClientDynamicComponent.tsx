'use client';

import dynamic from 'next/dynamic';

export const InfiniteCanvasCSR = dynamic(
  () => import('@/components/InfiniteCanvas').then((mod) => mod.InfiniteCanvas),
  {
    ssr: false
  }
);

export const FlyoutCSR = dynamic(() => import('@/components/Flyout').then((mod) => mod.Flyout), {
  ssr: false
});
