'use client';

import styles from './OriginHeroCard.module.scss';

import { CurvedLoop } from '@/components/CurvedLoop';
import { CODING_START_DATE, calculateYearDifference } from '@/utils/calculateYearDifference';

import type { OriginCardRenderProps, Work } from './InfiniteCanvas';

const MARQUEE_TEXT =
  'Hi · Hello · 你好 · こんにちは · 안녕 · สวัสดี · Xin chào · Halo · नमस्ते · வணக்கம் · مرحبًا · שלום · Merhaba · Γεια σας · Привет · Cześć · Salut · Hallo · Hej · Olá · Ciao · Aloha · Jambo · ';

const yearsCoding = calculateYearDifference(CODING_START_DATE);

/**
 * One-shot center card face — curved multilingual hello marquee.
 */
export const OriginHeroCard = ({ active = true, onActivate, marqueeState, inFocus = false }: OriginCardRenderProps) => {
  return (
    <div className={styles.originHeroCard} onPointerDown={(e) => e.stopPropagation()}>
      <CurvedLoop
        marqueeText={MARQUEE_TEXT}
        speed={2}
        curveAmount={400}
        direction="left"
        interactive
        paused={!active}
        onTap={onActivate}
        persistedState={marqueeState}
        // SVG user units (viewBox 1440×120) — scales with the card, same in grid + focus
        fontSize={220}
        className={`custom-text-style ${styles.marqueeText}`}
      />
      <div className={styles.portraitWrap} data-in-focus={inFocus ? 'true' : undefined} aria-hidden>
        <img className={styles.portrait} src="/images/work/me-cartoon.png" alt="" draggable={false} />
      </div>
    </div>
  );
};

/** Metadata for the origin card focus overlay */
export const ORIGIN_HERO_WORK: Work = {
  name: 'Hello',
  image: '/images/work/me-cartoon.png',
  description: (
    <>
      <p>
        I&apos;m Mason Wong, a UI enthusiast and front-end engineer based in Singapore, with over {yearsCoding} years of
        experience crafting thoughtful interfaces for web and mobile. What started as a self-taught design practice grew
        into a career building products people enjoy using.
      </p>
      <p>
        These days I work as a Full Stack Engineer at L&apos;Oréal, where I help shape internal data tools and GenAI
        features with a strong focus on UI/UX. Before that, I was a Front-end Engineer at Aesop, delivering campaigns
        and experiences across Aesop.com and its digital properties.
      </p>
      <p>Feel free to wander the grid, open a project, or say hello.</p>
      <p>Welcome to my corner of the web. I&apos;m glad you&apos;re here.</p>
    </>
  )
};
