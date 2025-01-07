'use client';

import React, { useRef } from 'react';

import { ScrollScene, UseCanvas, styles, useScrollRig } from '@14islands/r3f-scroll-rig';
import { WebGLText } from '@14islands/r3f-scroll-rig/powerups';
import { MeshDistortMaterial } from '@react-three/drei';

interface TextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  wobble?: boolean;
  font?: string;
}

interface WebGLTextProps {
  el: React.RefObject<HTMLElement>;
  font: string;
  glyphGeometryDetail: number;
  children: React.ReactNode;
  [key: string]: any;
}

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
              <WebGLText el={el} font={font} color="#000000" {...props}>
                {wobble && <MeshDistortMaterial speed={1.4} distort={0.14} />}
                {children}
              </WebGLText>
            )}
          </ScrollScene>
        </UseCanvas>
      )}
    </>
  );
}
