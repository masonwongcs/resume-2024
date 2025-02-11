'use client';

import styles from './Loader.module.scss';

import { useState } from 'react';

import NumberFlow from '@number-flow/react';
import cx from 'classnames';

import { useHomeStore } from '@/store';

const size = 250;
const strokeWidth = 1;
const strokeColor = 'rgba(0,0,0,0.5)';
const bgColor = 'rgba(0,0,0,0.1)';

const Loader = () => {
  const loadingProgress = useHomeStore((state) => state.loadingProgress);
  const loaded = useHomeStore((state) => state.loaded);
  const [shouldRender, setShouldRender] = useState(true);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (loadingProgress / 100) * circumference;

  if (!shouldRender) return null;

  return (
    <div
      className={cx(styles.loader, {
        [styles.loaded]: loaded
      })}
      onAnimationEnd={() => setShouldRender(false)}
    >
      <div className={styles.progressWrapper}>
        <svg className={styles.circle} width={size} height={size}>
          <circle stroke={bgColor} strokeWidth={strokeWidth} fill="none" r={radius} cx={size / 2} cy={size / 2} />
          <circle
            className={styles.circleProgressBar}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        <div className={styles.progress}>
          <NumberFlow value={loadingProgress} suffix="%" />
        </div>
      </div>
    </div>
  );
};

export { Loader };
