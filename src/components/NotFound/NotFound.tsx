'use client';

import styles from './NotFound.module.scss';
import pageStyles from '@/app/page.module.scss';

import { useEffect, useRef } from 'react';

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import Link from 'next/link';

import { Background, Blob } from '@/components/Background';
import { Header } from '@/components/Header';
import { useHomeStore } from '@/store';

import { PaperCutDigit } from './PaperCutDigit';

const EASE = [0.16, 1, 0.3, 1] as const;

const DIGITS = [
  { char: '4', restRotate: -6, floatY: 10, duration: 3.6, delay: 0 },
  { char: '0', restRotate: 5, floatY: 14, duration: 4.2, delay: 0.35 },
  { char: '4', restRotate: -3, floatY: 8, duration: 3.2, delay: 0.7 }
] as const;

const Digit = ({
  char,
  restRotate,
  floatY,
  duration,
  delay,
  index,
  reduceMotion
}: (typeof DIGITS)[number] & { index: number; reduceMotion: boolean }) => {
  if (reduceMotion) {
    return (
      <span className={styles.digit}>
        <PaperCutDigit char={char} index={index} />
      </span>
    );
  }

  return (
    <motion.span
      className={styles.digitFloat}
      initial={{ opacity: 0, y: 28, scale: 0.92 }}
      animate={{
        opacity: 1,
        y: [0, -floatY, 0],
        scale: 1
      }}
      transition={{
        opacity: { duration: 0.55, delay: 0.08 + index * 0.1, ease: EASE },
        scale: { duration: 0.55, delay: 0.08 + index * 0.1, ease: EASE },
        y: { duration, delay, repeat: Infinity, ease: 'easeInOut' }
      }}
    >
      <motion.span
        className={styles.digit}
        drag
        dragSnapToOrigin
        dragConstraints={{ left: -88, right: 88, top: -64, bottom: 64 }}
        dragElastic={0.45}
        dragTransition={{ bounceStiffness: 380, bounceDamping: 18 }}
        whileHover={{
          scale: 1.05,
          rotate: restRotate * 0.25,
          filter: 'drop-shadow(0 18px 24px rgba(51, 51, 51, 0.2))'
        }}
        whileDrag={{
          scale: 1.1,
          cursor: 'grabbing',
          zIndex: 2,
          rotate: restRotate,
          filter: 'drop-shadow(0 26px 30px rgba(51, 51, 51, 0.28))'
        }}
        whileTap={{ scale: 1.06 }}
        animate={{ rotate: [restRotate * 0.4, -restRotate * 0.35, restRotate * 0.4] }}
        transition={{
          rotate: { duration: duration * 1.2, delay, repeat: Infinity, ease: 'easeInOut' }
        }}
        aria-hidden
      >
        <PaperCutDigit char={char} index={index} />
      </motion.span>
    </motion.span>
  );
};

const NotFound = () => {
  const reduceMotion = useReducedMotion() ?? false;
  const setIntroComplete = useHomeStore((state) => state.setIntroComplete);
  const stageRef = useRef<HTMLDivElement>(null);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, { stiffness: 120, damping: 18, mass: 0.4 });
  const springY = useSpring(rawY, { stiffness: 120, damping: 18, mass: 0.4 });
  const rotateX = useTransform(springY, [-40, 40], [6, -6]);
  const rotateY = useTransform(springX, [-40, 40], [-8, 8]);
  const glareX = useTransform(springX, [-40, 40], [20, 80]);
  const glareY = useTransform(springY, [-40, 40], [25, 75]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.55), transparent 55%)`;

  useEffect(() => {
    setIntroComplete(true);
  }, [setIntroComplete]);

  useEffect(() => {
    if (reduceMotion) return;

    const stage = stageRef.current;
    if (!stage) return;

    const onMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 80;
      const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 80;
      rawX.set(nx);
      rawY.set(ny);
    };

    const onLeave = () => {
      rawX.set(0);
      rawY.set(0);
    };

    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    return () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
    };
  }, [rawX, rawY, reduceMotion]);

  return (
    <>
      <Background />
      <Header />

      <main className={pageStyles.main}>
        <div className={styles.content} ref={stageRef}>
          <motion.div
            className={styles.stage}
            style={
              reduceMotion
                ? undefined
                : {
                    rotateX,
                    rotateY,
                    transformPerspective: 900
                  }
            }
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
          >
            <h1 className={styles.code} aria-label="404">
              {DIGITS.map((digit, index) => (
                <Digit key={`${digit.char}-${index}`} {...digit} index={index} reduceMotion={reduceMotion} />
              ))}
            </h1>
            {!reduceMotion ? <motion.div className={styles.glare} style={{ background: glare }} aria-hidden /> : null}
          </motion.div>

          <motion.p
            className={styles.message}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.28, ease: EASE }}
          >
            This page isn&apos;t on the canvas.
            {!reduceMotion ? <span className={styles.hint}> Drag the scraps or double-click to recut.</span> : null}
          </motion.p>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.4, ease: EASE }}
          >
            <motion.div
              whileHover={reduceMotion ? undefined : { scale: 1.04 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            >
              <Link href="/" className={styles.homeLink}>
                Back to start
              </Link>
            </motion.div>
          </motion.div>
        </div>
        <Blob />
      </main>
    </>
  );
};

export { NotFound };
