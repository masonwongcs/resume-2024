'use client';

import '@14islands/r3f-scroll-rig/css';

import { RefObject, Suspense, memo, useRef, useState } from 'react';

import { GlobalCanvas, SmoothScrollbar } from '@14islands/r3f-scroll-rig';
import { Environment, Html, Loader } from '@react-three/drei';

import { Blob } from '@/components/Background';
import { Lens } from '@/components/DisplacementOrb/Lens';
import { Headline } from '@/components/DisplacementOrb/Text';
import { WebGLBackground } from '@/components/DisplacementOrb/WebGLBackground';
import { CircularLoading, Loading } from '@/components/Loading';

interface DisplacementOrbProps {
  children: React.ReactNode;
  showCursor?: boolean;
  showBackground?: boolean;
}

const DisplacementOrb = ({ children, showCursor, showBackground = true }: DisplacementOrbProps) => {
  const eventSource = useRef<HTMLDivElement>(null) as any;
  const [hovered, setHovered] = useState(false);

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
              <Environment files="env/empty_warehouse_01_1k.hdr" />
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
