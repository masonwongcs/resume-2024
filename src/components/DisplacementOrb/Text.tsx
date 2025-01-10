'use client';

import React, { useEffect, useRef } from 'react';

import { ScrollScene, UseCanvas, styles, useScrollRig } from '@14islands/r3f-scroll-rig';
import { WebGLText } from '@14islands/r3f-scroll-rig/powerups';
import { MeshDistortMaterial } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { useHomeStore } from '@/store';

interface TextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  wobble?: boolean;
  font?: string;
}

const AnimatedGroup = ({ children, ...props }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.Material | null>(null);
  const { immersiveModeOn } = useHomeStore();
  const opacityRef = useRef(1);

  // Update material reference
  useEffect(() => {
    const updateMaterialRef = () => {
      if (groupRef.current) {
        groupRef.current.traverse((child: any) => {
          if (child.material) {
            materialRef.current = child.material;
            // Initialize opacity
            if (materialRef.current) {
              materialRef.current.transparent = true;
              materialRef.current.opacity = opacityRef.current;
            }
          }
        });
      }
    };

    // Initial setup
    updateMaterialRef();

    // Cleanup
    return () => {
      if (materialRef.current) {
        materialRef.current.dispose();
      }
    };
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;

    const targetTranslateX = immersiveModeOn ? -2 : 0;
    groupRef.current.position.x += (targetTranslateX - groupRef.current.position.x) * 0.1;

    // Opacity animation
    if (materialRef.current) {
      const targetOpacity = immersiveModeOn ? 0 : 1;
      opacityRef.current += (targetOpacity - opacityRef.current) * 0.1;
      materialRef.current.opacity = opacityRef.current;

      // Keep material transparent
      materialRef.current.transparent = true;
      materialRef.current.needsUpdate = true;

      // Hide completely when fully transparent
      if (opacityRef.current < 0.001) {
        groupRef.current.visible = false;
      } else {
        groupRef.current.visible = true;
      }
    }
  });

  return (
    <group ref={groupRef} {...props}>
      {children}
    </group>
  );
};
export const Subtitle: React.FC<TextProps> = ({ children, ...props }) => (
  <Text font="fonts/Futura-Medium.woff" {...props}>
    {children}
  </Text>
);

export const SubHeadline: React.FC<TextProps> = ({ children, ...props }) => (
  <Text font="fonts/Poppins-Medium.woff" {...props}>
    {children}
  </Text>
);

export const Headline: React.FC<TextProps> = ({ children, ...props }) => (
  <Text font="fonts/Futura-Bold.woff" {...props}>
    {children}
  </Text>
);

export const BodyCopy: React.FC<TextProps> = Text;

export function Text({ children, wobble, className, font = 'fonts/Poppins-Regular.woff', ...props }: TextProps) {
  const el = useRef<HTMLSpanElement>(null) as any;
  const { hasSmoothScrollbar } = useScrollRig();
  const { immersiveModeOn } = useHomeStore();

  return (
    <>
      <span
        ref={el}
        className={`${styles.transparentColorWhenSmooth} ${className || ''}`}
        style={{ display: 'block' }}
        {...props}
      >
        {children}
      </span>
      {hasSmoothScrollbar && (
        <UseCanvas debug={false}>
          <ScrollScene track={el}>
            {(props) => (
              <AnimatedGroup>
                <WebGLText el={el} font={font} color="#000000" {...props}>
                  {wobble ? (
                    <MeshDistortMaterial speed={1.4} distort={0.14} transparent opacity={1} />
                  ) : (
                    <meshStandardMaterial transparent opacity={1} />
                  )}
                  {children}
                </WebGLText>
              </AnimatedGroup>
            )}
          </ScrollScene>
        </UseCanvas>
      )}
    </>
  );
}
