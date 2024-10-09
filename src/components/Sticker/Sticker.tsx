'use client';

import styles from './Sticker.module.scss';

import React, { FC, useMemo } from 'react';

import cx from 'classnames';

interface StickerProps {
  src: string;
  alt?: string;
  startX: string;
  startY: string;
  transformEndX: number;
  transformEndY: number;
}

const Sticker: FC<StickerProps> = ({ src, alt = 'Sticker', startX, startY, transformEndX, transformEndY }) => {
  const { rotate, scale, duration, delay } = useMemo(
    () => ({
      rotate: Math.random() * 50 - 25,
      scale: Math.random() * 0.2 + 0.85, // Random scale between 0.85 and 1.05
      duration: Math.random() * 0.5 + 0.3, // Random duration between 0.5s and 0.8s
      delay: Math.random() * 0.3 // Random delay between 0s and 0.3s
    }),
    []
  );

  return (
    <div
      className={cx(styles.sticker, 'sticker')}
      style={
        {
          position: 'fixed',
          left: startX,
          top: startY,
          transform: `translate(${transformEndX}px, ${transformEndY}px)`,
          // transitionDuration: `${duration}s`,
          // transitionDelay: `${delay}s`,
          '--rotate': `${rotate}deg`,
          '--scale': scale,
          '--duration': `${duration}s`,
          '--delay': `${delay}s`
        } as React.CSSProperties
      }
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />
    </div>
  );
};

export { Sticker };
