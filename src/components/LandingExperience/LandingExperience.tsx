'use client';

import styles from './LandingExperience.module.scss';
import pageStyles from '@/app/page.module.scss';

import { useCallback, useEffect, useRef, useState } from 'react';

import cx from 'classnames';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { Background, Blob } from '@/components/Background';
import { FlyoutCSR, InfiniteCanvasCSR } from '@/components/ClientDynamicComponent';
import { Header } from '@/components/Header';
import { ORIGIN_HERO_WORK, type OriginCardConfig, OriginHeroCard, listeningCustomCard } from '@/components/InfiniteCanvas';
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

const originCard: OriginCardConfig = {
  work: ORIGIN_HERO_WORK,
  render: (props) => <OriginHeroCard {...props} />,
  focusable: true
};

const customCards = [listeningCustomCard];

const LandingExperience = ({ works }: LandingExperienceProps) => {
  const viewMode = usePortfolioViewStore((state) => state.viewMode);
  const hasHydrated = usePortfolioViewStore((state) => state.hasHydrated);
  const hydrate = usePortfolioViewStore((state) => state.hydrate);
  const reduceMotion = useReducedMotion();
  const [showRecenter, setShowRecenter] = useState(false);
  const recenterActionRef = useRef<(() => void) | null>(null);

  const handleRecenterAvailabilityChange = useCallback((visible: boolean) => {
    setShowRecenter(visible);
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hasHydrated && viewMode !== 'canvas') {
      setShowRecenter(false);
    }
  }, [hasHydrated, viewMode]);

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
              <InfiniteCanvasCSR
                works={works}
                originCard={originCard}
                customCards={customCards}
                onRecenterAvailabilityChange={handleRecenterAvailabilityChange}
                recenterActionRef={recenterActionRef}
              />
              {/* Outside InfiniteCanvas so the mobile edge mask doesn't fade it */}
              <AnimatePresence>
                {showRecenter ? (
                  <motion.div
                    key="recenter"
                    className={styles.recenterWrap}
                    initial={{ opacity: 0, y: 12, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                    exit={{ opacity: 0, y: 8, x: '-50%' }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <button
                      type="button"
                      className={styles.recenterButton}
                      aria-label="Back to start"
                      onClick={() => recenterActionRef.current?.()}
                    >
                      Back to start
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
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
