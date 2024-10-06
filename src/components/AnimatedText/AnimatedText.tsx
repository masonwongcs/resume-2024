'use client';

import styles from './AnimatedText.module.scss';

import React, { useEffect, useState } from 'react';

interface AnimatedTextProps {
  text: string;
  delay?: number;
  duration?: number;
  stagger?: number;
}

const AnimatedText: React.FC<AnimatedTextProps> = ({ text, delay = 0, duration = 0.5, stagger = 0.03 }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <span className={styles.animatedTextWrapper}>
      {text.split('').map((char, index) => (
        <span
          key={`${char}-${index}`}
          className={`${styles.animatedChar} ${isVisible ? styles.visible : ''}`}
          style={{
            transitionDelay: `${delay + index * stagger}s`,
            transitionDuration: `${duration}s`
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
};

export { AnimatedText };
