'use client';

import { useEffect } from 'react';

import { ReactLenis, useLenis } from '@studio-freight/react-lenis';
import { usePathname, useSearchParams } from 'next/navigation';

const SmoothScroll: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lenis = useLenis();

  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true });
  }, [pathname, searchParams, lenis]);

  return (
    <ReactLenis root>
      {children}
    </ReactLenis>
  );
};

export { SmoothScroll };
