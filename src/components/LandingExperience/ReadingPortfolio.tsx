'use client';

import styles from './ReadingPortfolio.module.scss';

import { useEffect, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';

import { OptionWheel } from '@/components/OptionWheel';
import { useWorkStore } from '@/store';

import type { PortfolioWork } from './LandingExperience';

interface ReadingPortfolioProps {
  works: PortfolioWork[];
}

const fadeTransition = {
  duration: 0.95,
  ease: [0.22, 1, 0.36, 1] as const
};

const getImageSource = (work: PortfolioWork) => (work.thumbnail ?? work.image).replace('.', '');

const toFlyoutWork = (work: PortfolioWork) => ({
  name: work.name,
  url: work.url,
  image: work.image.replace('.', ''),
  video: work.video?.replace('.', ''),
  description: work.description,
  type: 'work' as const
});

interface ProjectImageSlideProps {
  work: PortfolioWork;
  reduceMotion: boolean | null;
  priority?: boolean;
}

const ProjectImageSlide = ({ work, reduceMotion, priority = false }: ProjectImageSlideProps) => {
  const imageSource = getImageSource(work);

  return (
    <motion.div
      className={styles.imageFrame}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : fadeTransition}
    >
      <Image src={imageSource} alt={`${work.name} project preview`} fill priority={priority} sizes="60vw" />
    </motion.div>
  );
};

const ReadingPortfolio = ({ works }: ReadingPortfolioProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const reduceMotion = useReducedMotion();
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const selectedWork = works[selectedIndex] ?? works[0];

  const openFlyout = (work: PortfolioWork) => {
    setSelectedWork(toFlyoutWork(work));
  };

  const handleItemClick = (index: number) => {
    const work = works[index];
    if (!work) return;
    openFlyout(work);
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    works.forEach((work, index) => {
      if (Math.abs(index - selectedIndex) > 2) return;
      const img = new window.Image();
      img.src = getImageSource(work);
    });
  }, [selectedIndex, works]);

  if (!selectedWork) return null;

  return (
    <section className={styles.experience} aria-label="Reading portfolio">
      <div className={styles.wheelPanel}>
        <div className={styles.wheelFrame}>
          <OptionWheel
            items={works.sort((a, b) => a.name.localeCompare(b.name)).map((work) => work.name)}
            defaultSelected={0}
            onChange={setSelectedIndex}
            onItemClick={handleItemClick}
            textColor="var(--wheel-text)"
            activeColor="var(--wheel-active)"
            fontSize={isMobile ? 1.5 : 3}
            spacing={isMobile ? 2 : 1.85}
            tilt={isMobile ? 0 : 6}
            blur={reduceMotion ? 0 : 2}
            fade={0.25}
            smoothing={reduceMotion ? 1 : 200}
            inset={48}
          />
        </div>
      </div>

      <div className={styles.visualPanel}>
        <button
          type="button"
          className={styles.imageStage}
          aria-label={`Open ${selectedWork.name} project details`}
          onClick={() => openFlyout(selectedWork)}
        >
          <div className={styles.imageBackdrop} aria-hidden />
          <AnimatePresence initial={false}>
            <ProjectImageSlide
              key={selectedWork.name}
              work={selectedWork}
              reduceMotion={reduceMotion}
              priority={selectedIndex === 0}
            />
          </AnimatePresence>
        </button>
      </div>
    </section>
  );
};

export { ReadingPortfolio };
