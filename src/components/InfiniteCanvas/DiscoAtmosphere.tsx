'use client';

import styles from './DiscoAtmosphere.module.scss';

import { useEffect } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { isDiscoQuery } from '@/lib/workSearch';
import { useSearchStore } from '@/store';

const EXIT_MS = 650;

/**
 * Soft club frame for disco mode — vignette + floor wash.
 * Fades out smoothly when the search query leaves "disco".
 */
const DiscoAtmosphere = () => {
  const query = useSearchStore((state) => state.query);
  const active = isDiscoQuery(query);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (active) {
      document.body.classList.add('disco-mode');
      return;
    }

    // Keep night wash until the overlay finishes fading
    const id = window.setTimeout(
      () => {
        document.body.classList.remove('disco-mode');
      },
      reduceMotion ? 0 : EXIT_MS
    );

    return () => window.clearTimeout(id);
  }, [active, reduceMotion]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('disco-mode');
    };
  }, []);

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="disco-atmosphere"
          className={styles.root}
          aria-hidden="true"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0.15 : EXIT_MS / 1000,
            ease: [0.22, 1, 0.36, 1]
          }}
        >
          <div className={styles.vignette} />
          <div className={styles.floor} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export { DiscoAtmosphere };
