'use client';

import React, { Suspense, useRef } from 'react';

import { UseCanvas, styles, useImageAsTexture, useScrollRig } from '@14islands/r3f-scroll-rig';
import { ParallaxScrollScene } from '@14islands/r3f-scroll-rig/powerups';
import { Circle, Image as DreiImage } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, MathUtils, Texture, Vector2 } from 'three';
import * as THREE from 'three';

interface ImageProps extends React.HTMLAttributes<HTMLDivElement> {
  src: string;
  parallaxSpeed?: number;
}

interface WebGLImageProps {
  imgRef: React.RefObject<HTMLImageElement>;
  scrollState: {
    visibility: number;
    progress: number;
    viewport: number;
  };
  dir?: number;
  scale?: Vector2;
  [key: string]: any;
}

interface LoadingIndicatorProps {
  scale: {
    xy: Vector2;
    min: () => number;
  };
}

interface ImageMaterial extends THREE.Material {
  grayscale: number;
  zoom: number;
  opacity: number;
}

export function Image({ src, parallaxSpeed = 1, ...props }: ImageProps) {
  const el = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const { hasSmoothScrollbar } = useScrollRig();

  return (
    <>
      <div ref={el} {...props}>
        <img
          className={styles.hiddenWhenSmooth}
          ref={img}
          src={src}
          loading="eager"
          decoding="async"
          alt=""
        />
      </div>

      {hasSmoothScrollbar && (
        <UseCanvas debug={false}>
          <ParallaxScrollScene track={el} speed={parallaxSpeed}>
            {(props: any) => (
              <Suspense fallback={<LoadingIndicator {...props} />}>
                <WebGLImage imgRef={img} {...props} />
              </Suspense>
            )}
          </ParallaxScrollScene>
        </UseCanvas>
      )}
    </>
  );
}

function WebGLImage({ imgRef, scrollState, dir, ...props }: WebGLImageProps) {
  const ref = useRef<THREE.Mesh & { material: ImageMaterial }>(null);

  // Load texture from the <img/> and suspend until it's ready
  const texture = useImageAsTexture(imgRef) as Texture;

  useFrame(({ clock }) => {
    if (!ref.current) return;

    // scrollState.visibility is 0 when image enters viewport at bottom and 1 when image is fully visible
    ref.current.material.grayscale = MathUtils.clamp(1 - scrollState.visibility ** 3, 0, 1);
    // scrollState.progress is 0 when image enters viewport at bottom and 1 when image left the viewport at the top
    ref.current.material.zoom = 1 + scrollState.progress * 0.66;
    // scrollState.viewport is 0 when image enters viewport at bottom and 1 when image reached top of viewport
    ref.current.material.opacity = MathUtils.clamp(scrollState.viewport * 3, 0, 1);
  });

  return <DreiImage ref={ref} texture={texture} transparent {...props} />;
}

function LoadingIndicator({ scale }: LoadingIndicatorProps) {
  const box = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!box.current) return;
    box.current.rotation.y = clock.getElapsedTime() * 5;
  });

  const minScale = Math.min(scale.xy.x, scale.xy.y) * 0.05;

  return (
    <group scale={minScale}>
      <Circle ref={box}>
        <meshNormalMaterial side={DoubleSide} />
      </Circle>
      <Circle>
        <meshNormalMaterial side={DoubleSide} />
      </Circle>
    </group>
  );
}
