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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const animationRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef({ x: 0, y: 0 });
  const classNameRef = useRef(className);

  const smoothness = lerpFactor;

  // Update className ref when it changes
  useEffect(() => {
    classNameRef.current = className;
  }, [className]);

  // Get blob properties from className
  const getBlobProperties = (currentClassName?: string) => {
    // Convert vh to pixels based on viewport height
    const vhToPx = (vh: number) => (vh / 100) * window.innerHeight;

    const classToCheck = currentClassName || className;

    // Default properties
    let height = vhToPx(50);
    let aspectRatio = 2 / 1;
    let color = '#e1bd00';

    if (classToCheck?.includes('blob1')) {
      height = vhToPx(50);
      aspectRatio = 2 / 1;
      color = '#e1bd00';
    } else if (classToCheck?.includes('blob2')) {
      height = vhToPx(60);
      aspectRatio = 3 / 2;
      color = '#fd0f00';
    } else if (classToCheck?.includes('blob3')) {
      height = vhToPx(70);
      aspectRatio = 3 / 2;
      color = '#0d00a9';
    }

    return { height, aspectRatio, color };
  };

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice =
        window.matchMedia('(max-width: 768px)').matches ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Desktop mouse movement handler
  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isMobile]);

  // Draw blob on canvas
  const drawBlob = useRef(() => {
    const canvas = canvasRef.current;
    if (!canvas || isMobile) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { height, aspectRatio, color } = getBlobProperties(classNameRef.current);
    const width = height * aspectRatio;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate rotation angle using ref for latest position
    const angle = Math.atan2(
      mousePos.y - cursorPosRef.current.y,
      mousePos.x - cursorPosRef.current.x
    );

    // Save context
    ctx.save();

    // Translate to center
    ctx.translate(width / 2, height / 2);

    // Rotate
    ctx.rotate(angle);

    // Translate back
    ctx.translate(-width / 2, -height / 2);

    // Create gradient for smoother blob
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      Math.max(width, height) / 2
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');

    // Draw ellipse
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Restore context
    ctx.restore();

    // Apply blur effect using canvas filter (if supported)
    // Note: CSS filter blur is more performant, so we'll apply it via CSS
  });

  // Cursor position update animation (only for desktop)
  useEffect(() => {
    if (isMobile) return;

    const updateCursor = () => {
      // Calculate new position
      const newX = lerp(cursorPosRef.current.x, mousePos.x, smoothness);
      const newY = lerp(cursorPosRef.current.y, mousePos.y, smoothness);

      // Update ref immediately for drawing
      cursorPosRef.current = { x: newX, y: newY };

      // Update state
      setCursorPos({ x: newX, y: newY });

      // Update canvas position
      if (containerRef.current) {
        containerRef.current.style.left = `${newX}px`;
        containerRef.current.style.top = `${newY}px`;
      }

      // Draw blob
      drawBlob.current();

      animationRef.current = requestAnimationFrame(updateCursor);
    };

    animationRef.current = requestAnimationFrame(updateCursor);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mousePos, smoothness, isMobile]);

  // Initial draw and update on className change
  useEffect(() => {
    if (!isMobile) {
      drawBlob.current();
    }
  }, [isMobile, className, mousePos]);

  return (
    <div
      ref={containerRef}
      className={cx(styles.cursor, className, {
        [styles.mobile]: isMobile
      })}
      style={
        isMobile
          ? {}
          : {
              position: 'fixed',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: -1
            }
      }
    >
      {!isMobile && (
        <canvas
          ref={canvasRef}
          style={{
            filter: 'blur(100px)',
            opacity: 0.1,
            display: 'block'
          }}
        />
      )}
    </div>
  );
};

export { Cursor };
