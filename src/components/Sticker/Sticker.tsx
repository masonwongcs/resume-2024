'use client';

import styles from './Sticker.module.scss';

import React, { FC, useEffect, useMemo, useState } from 'react';

import cx from 'classnames';
import { motion } from 'motion/react';

interface StickerProps {
  src: string;
  alt?: string;
  startX: string;
  startY: string;
  transformEndX: number;
  transformEndY: number;
  active?: boolean;
}

const StickerComponent: FC<StickerProps> = ({
  src,
  alt = 'Sticker',
  startX,
  startY,
  transformEndX,
  transformEndY,
  active = false
}) => {
  const { rotate, scale, duration, delay } = useMemo(
    () => ({
      rotate: Math.random() * 50 - 25,
      scale: Math.random() * 0.2 + 0.85,
      // Lighter entrance: shorter, tighter spread so 7 stickers animate cheaper.
      duration: Math.random() * 0.3 + 0.3,
      delay: Math.random() * 0.15
    }),
    []
  );

  // Drop-shadow is expensive to blur every frame, so only enable it once the
  // sticker has settled (after the entrance animation completes).
  const [settled, setSettled] = useState(false);

  // Reset settled state whenever the sticker animates back out.
  useEffect(() => {
    if (!active) setSettled(false);
  }, [active]);

  return (
    <motion.div
      className={cx(styles.sticker, 'sticker', { [styles.settled]: settled })}
      style={
        {
          position: 'fixed',
          left: startX,
          top: startY,
          rotate,
          scale,
          // Promote to its own layer only while animating; dropped once settled.
          willChange: settled ? 'auto' : 'transform'
        } as unknown as React.CSSProperties
      }
      initial={false}
      animate={
        active
          ? {
              x: 0,
              y: 0,
              opacity: 1,
              transition: {
                x: { duration, delay, ease: [0.32, 0.72, 0, 1] },
                y: { duration, delay, ease: [0.32, 0.72, 0, 1] },
                opacity: { duration: 0.3, delay }
              }
            }
          : {
              x: transformEndX,
              y: transformEndY,
              opacity: 0,
              transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] }
            }
      }
      onAnimationComplete={() => {
        if (active) setSettled(true);
      }}
      drag={active}
      dragElastic={0.05}
      dragTransition={{
        power: 0.15,
        bounceStiffness: 500,
        bounceDamping: 35,
        timeConstant: 150
      }}
      whileDrag={{ scale: scale * 1.08, cursor: 'grabbing' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
        draggable={false}
      />
    </motion.div>
  );
};

const Sticker = React.memo(StickerComponent);

export { Sticker };
