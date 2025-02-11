'use client';

import '@14islands/r3f-scroll-rig/css';

import { RefObject, Suspense, memo, useEffect, useRef, useState } from 'react';

import { GlobalCanvas, SmoothScrollbar } from '@14islands/r3f-scroll-rig';
import { Environment, Html, Loader } from '@react-three/drei';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { Blob } from '@/components/Background';
import { Lens } from '@/components/DisplacementOrb/Lens';
import { Headline } from '@/components/DisplacementOrb/Text';
import { WebGLBackground } from '@/components/DisplacementOrb/WebGLBackground';
import { CircularLoading, Loading } from '@/components/Loading';
import { useHomeStore } from '@/store';

interface DisplacementOrbProps {
  children: React.ReactNode;
  showCursor?: boolean;
  showBackground?: boolean;
}

const environmentFiles = 'env/empty_warehouse_01_1k.hdr';

const DisplacementOrb = ({ children, showCursor, showBackground = true }: DisplacementOrbProps) => {
  const eventSource = useRef<HTMLDivElement>(null) as any;
  const [hovered, setHovered] = useState(false);

  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);

  useEffect(() => {
    const loader = new RGBELoader();
    loader.setPath(''); // Set your base path if needed

    loader.load(
      environmentFiles,
      () => {
        // setIsLoading(false);
        setIsLoaded();
      },
      (progress) => {
        // Optional: Handle progress if needed
        const percentComplete = (progress.loaded / progress.total) * 100;
        requestAnimationFrame(() => {
          setLoadingProgress(Number(percentComplete.toFixed(0)));
        });
        console.log(`Environment loading: ${percentComplete}%`);
      },
      (error) => {
        console.error('Error loading environment:', error);
      }
    );
  }, []);

  return (
    <div ref={eventSource} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <GlobalCanvas
        scaleMultiplier={0.01}
        eventSource={eventSource}
        eventPrefix="client"
        // flat
        camera={{ fov: 14 }}
        style={{ pointerEvents: 'none', zIndex: -1 }}
        gl={{
          preserveDrawingBuffer: true
        }}
      >
        {(globalChildren) => (
          <Lens hovered={hovered}>
            {showBackground && <WebGLBackground hovered={hovered} />}
            <Suspense
              fallback={
                <Html center>
                  <CircularLoading />
                </Html>
              }
            >
              <Environment files={environmentFiles} />
              {globalChildren}
            </Suspense>
          </Lens>
        )}
      </GlobalCanvas>
      <SmoothScrollbar config={{ syncTouch: true }} />
      {children}
      {showCursor && <Blob />}
    </div>
  );
};

const MemoizedDisplacementOrb = memo(DisplacementOrb);

export { MemoizedDisplacementOrb as DisplacementOrb };
