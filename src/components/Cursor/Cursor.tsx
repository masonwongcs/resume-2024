'use client';

import styles from './Cursor.module.scss';

import { FC, useEffect, useRef, useState } from 'react';

import cx from 'classnames';

const lerp = (start: number, end: number, t: number) => {
  return start + (end - start) * t;
};

interface ICursorProps {
  className?: string;
  lerpFactor?: number;
}

const Cursor: FC<ICursorProps> = ({ className, lerpFactor = 0.1 }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const animationRef = useRef(0);

  const smoothness = lerpFactor;

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const updateCursor = () => {
      setCursorPos((prev) => ({
        x: lerp(prev.x, mousePos.x, smoothness),
        y: lerp(prev.y, mousePos.y, smoothness)
      }));

      animationRef.current = requestAnimationFrame(updateCursor);
    };

    animationRef.current = requestAnimationFrame(updateCursor);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mousePos]);

  // Calculate the rotation angle
  const angle = Math.atan2(mousePos.y - cursorPos.y, mousePos.x - cursorPos.x) * (180 / Math.PI);

  return (
    <div
      className={cx(styles.cursor, className)}
      style={{
        top: `${cursorPos.y}px`,
        left: `${cursorPos.x}px`,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`
      }}
    />
  );
};

export { Cursor };
