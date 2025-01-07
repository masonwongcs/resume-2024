'use client';

import '@14islands/r3f-scroll-rig/css';

import { RefObject, Suspense, memo, useRef, useState } from 'react';

import { GlobalCanvas, SmoothScrollbar } from '@14islands/r3f-scroll-rig';
import { Environment, Loader } from '@react-three/drei';

import { Lens } from '@/components/DisplacementOrb/Lens';
import { Headline } from '@/components/DisplacementOrb/Text';
import { WebGLBackground } from '@/components/DisplacementOrb/WebGLBackground';

interface DisplacementOrbProps {
  children: React.ReactNode;
}

const DisplacementOrb = ({ children }: DisplacementOrbProps) => {
  const eventSource = useRef<HTMLDivElement>(null) as any;
  const [hovered, setHovered] = useState(false);

  return (
    <div ref={eventSource} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <GlobalCanvas
        debug={true}
        scaleMultiplier={0.01}
        eventSource={eventSource}
        eventPrefix="client"
        flat
        camera={{ fov: 14 }}
        style={{ pointerEvents: 'none', zIndex: -1 }}
        gl={{
          preserveDrawingBuffer: true
        }}
      >
        {(globalChildren) => (
          <Lens hovered={hovered}>
            <Suspense fallback="">
              <Environment files="env/empty_warehouse_01_1k.hdr" />
              {globalChildren}
            </Suspense>
          </Lens>
        )}
      </GlobalCanvas>
      <SmoothScrollbar config={{ syncTouch: true }} />
      {children}
    </div>
  );
};

const MemoizedDisplacementOrb = memo(DisplacementOrb);

export { MemoizedDisplacementOrb as DisplacementOrb };
