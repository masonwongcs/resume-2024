'use client';

import styles from './Loader.module.scss';

import { useEffect, useRef, useState } from 'react';

import NumberFlow from '@number-flow/react';
import cx from 'classnames';

import { useHomeStore } from '@/store';

const size = 250;
const strokeWidth = 1;
const pillStrokeWidth = 2;
const strokeColor = 'rgba(0,0,0,0.5)';
const bgColor = 'rgba(0,0,0,0.1)';

const RoundLoader = () => {
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

const RoundedRectLoader = () => {
  const loadingProgress = useHomeStore((state) => state.loadingProgress);
  const loaded = useHomeStore((state) => state.loaded);
  const [shouldRender, setShouldRender] = useState(true);

  const pathRef = useRef<SVGPathElement | null>(null);
  const [pathLength, setPathLength] = useState(555);

  const strokeDashoffset = pathLength - (loadingProgress / 100) * pathLength;

  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, []);

  if (!shouldRender) return null;

  return (
    <div
      className={cx(styles.loader, styles.roundedRectangle, {
        [styles.loaded]: loaded
      })}
      onAnimationEnd={() => {
        setShouldRender(false);
        if (!document.body.classList.contains('is-ready')) {
          document.body.classList.add('is-ready');
        }
      }}
    >
      <div className={styles.roundedRectangleWrapper}>
        <svg className={styles.roundedRectangle} viewBox="0 0 185 65">
          <g transform="matrix(1,0,0,1,0.5,0.5)">
            <g transform="matrix(0.836563,0,0,0.686342,-10.6198,-0.821561)">
              <path
                d="M50.946,1.197L194.39,1.197C215.502,1.197 232.642,22.089 232.642,47.821C232.642,73.553 215.502,94.445 194.39,94.445L50.946,94.445C29.835,94.445 12.695,73.553 12.695,47.821C12.695,22.089 29.835,1.197 50.946,1.197Z"
                fill="none"
                strokeWidth={pillStrokeWidth}
                stroke={bgColor}
              />
            </g>
          </g>

          <g transform="matrix(1,0,0,1,0.5,0.5)">
            <g transform="matrix(0.836563,0,0,0.686342,-10.6198,-0.821561)">
              <path
                className={styles.roundedRectangleProgressBar}
                d="M50.946,1.197L194.39,1.197C215.502,1.197 232.642,22.089 232.642,47.821C232.642,73.553 215.502,94.445 194.39,94.445L50.946,94.445C29.835,94.445 12.695,73.553 12.695,47.821C12.695,22.089 29.835,1.197 50.946,1.197Z"
                fill="none"
                strokeWidth={pillStrokeWidth}
                stroke={strokeColor}
                ref={pathRef}
                strokeDasharray={pathLength}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </g>
          </g>
        </svg>
        <div className={styles.progress}>
          <NumberFlow value={loadingProgress} suffix="%" />
        </div>
      </div>
    </div>
  );
};

const PillLoader = () => {
  const loadingProgress = useHomeStore((state) => state.loadingProgress);
  const loaded = useHomeStore((state) => state.loaded);
  const [shouldRender, setShouldRender] = useState(true);

  const pathRef = useRef<SVGPathElement | null>(null);
  const [pathLength, setPathLength] = useState(606);

  const strokeDashoffset = pathLength - (loadingProgress / 100) * pathLength;

  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, []);

  if (!shouldRender) return null;

  return (
    <div
      className={cx(styles.loader, styles.pills, {
        [styles.loaded]: loaded
      })}
      onAnimationEnd={() => setShouldRender(false)}
    >
      <div className={styles.pillsWrapper}>
        {/*<div*/}
        {/*  className={styles.pillsProgress}*/}
        {/*  style={{*/}
        {/*    transform: `translateY(${(1 - loadingProgress / 100) * 100}%)`*/}
        {/*  }}*/}
        {/*/>*/}
        <svg className={styles.pills} viewBox="0 0 78 208">
          <g transform="matrix(1,0,0,1,0.5,0.5)">
            <g transform="matrix(0.813626,0,0,0.834126,-1.08002,-1.91487)">
              <path
                d="M95.965,48.452L95.965,204.303C95.965,229.778 74.763,250.46 48.646,250.46C22.53,250.46 1.327,229.778 1.327,204.303L1.327,48.452C1.327,22.978 22.53,2.296 48.646,2.296C74.763,2.296 95.965,22.978 95.965,48.452Z"
                fill="none"
                strokeWidth={pillStrokeWidth}
                stroke={bgColor}
              />
            </g>
          </g>

          <g transform="matrix(1,0,0,1,0.5,0.5)">
            <g transform="matrix(0.813626,0,0,0.834126,-1.08002,-1.91487)">
              <path
                className={styles.pillsProgressBar}
                d="M95.965,48.452L95.965,204.303C95.965,229.778 74.763,250.46 48.646,250.46C22.53,250.46 1.327,229.778 1.327,204.303L1.327,48.452C1.327,22.978 22.53,2.296 48.646,2.296C74.763,2.296 95.965,22.978 95.965,48.452Z"
                fill="none"
                strokeWidth={pillStrokeWidth}
                stroke={strokeColor}
                ref={pathRef}
                strokeDasharray={pathLength}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </g>
          </g>
        </svg>
        <div className={styles.progress}>
          <NumberFlow value={loadingProgress} suffix="%" />
        </div>
      </div>
    </div>
  );
};

const Loader = () => {
  return (
    <>
      <RoundedRectLoader />
      {/*<PillLoader />*/}
    </>
  );
};

export { Loader, RoundLoader, RoundedRectLoader, PillLoader };
