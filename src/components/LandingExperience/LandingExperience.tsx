'use client';

import styles from './LandingExperience.module.scss';
import pageStyles from '@/app/page.module.scss';

import { useEffect } from 'react';

import cx from 'classnames';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { Background, Blob } from '@/components/Background';
import { FlyoutCSR, InfiniteCanvasCSR } from '@/components/ClientDynamicComponent';
import { Header } from '@/components/Header';
import { Loader } from '@/components/Loader';
import { usePortfolioViewStore } from '@/store';
import { calculateYearDifference } from '@/utils/calculateYearDifference';

import { ReadingPortfolio } from './ReadingPortfolio';

export interface PortfolioWork {
  name: string;
  url?: string;
  image: string;
  video?: string;
  thumbnail?: string;
  description: string;
}

interface LandingExperienceProps {
  works: PortfolioWork[];
}

const years = calculateYearDifference('2017-01-01');

const LandingExperience = ({ works }: LandingExperienceProps) => {
  const viewMode = usePortfolioViewStore((state) => state.viewMode);
  const hasHydrated = usePortfolioViewStore((state) => state.hasHydrated);
  const hydrate = usePortfolioViewStore((state) => state.hydrate);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <Loader />
      <Background />
      <Header />

      <main className={cx(pageStyles.main, { [pageStyles.readingMode]: hasHydrated && viewMode === 'reading' })}>
        <AnimatePresence mode="wait" initial={false}>
          {!hasHydrated || viewMode === 'canvas' ? (
            <motion.div
              key="canvas"
              className={styles.canvasView}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.015 }}
              transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <section className="sr-only">
                <h1>Mason Wong, Front-End Engineer in Singapore</h1>
                <p>
                  I&apos;m Mason Wong, a front-end engineer with over {years} years of experience building thoughtful
                  interfaces for web and mobile.
                </p>
              </section>
              <InfiniteCanvasCSR works={works} />
              <FlyoutCSR />
              <Blob />
            </motion.div>
          ) : (
            <motion.div
              key="reading"
              className={styles.readingView}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <ReadingPortfolio works={works} />
              <FlyoutCSR />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  );
};

export { LandingExperience };
