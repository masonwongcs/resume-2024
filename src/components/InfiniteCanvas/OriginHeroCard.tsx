'use client';

import styles from './OriginHeroCard.module.scss';

import { useEffect, useRef, useState } from 'react';

import { CurvedLoop } from '@/components/CurvedLoop';
import { CODING_START_DATE, calculateYearDifference } from '@/utils/calculateYearDifference';

import { HandAnnotation } from './HandAnnotation';
import type { OriginCardRenderProps, Work } from './types';

const MARQUEE_TEXT =
  'Hi · Hello · 你好 · こんにちは · 안녕 · สวัสดี · Xin chào · Halo · नमस्ते · வணக்கம் · مرحبًا · שלום · Merhaba · Γεια σας · Привет · Cześć · Salut · Hallo · Hej · Olá · Ciao · Aloha · Jambo · ';

const yearsCoding = calculateYearDifference(CODING_START_DATE);

/**
 * One-shot center card face — curved multilingual hello marquee.
 */
export const OriginHeroCard = ({ active = true, onActivate, marqueeState, inFocus = false }: OriginCardRenderProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const wasInFocusRef = useRef(false);

  useEffect(() => {
    const justEntered = inFocus && !wasInFocusRef.current;
    wasInFocusRef.current = inFocus;
    if (!inFocus) {
      setHintOpen(false);
      return;
    }
    if (!justEntered) return;
    // Wait for the portrait to rise before the tip draws in
    const id = window.setTimeout(() => setHintOpen(true), 480);
    return () => window.clearTimeout(id);
  }, [inFocus]);

  return (
    <div ref={cardRef} className={styles.originHeroCard} onPointerDown={(e) => e.stopPropagation()}>
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
        <img className={styles.portrait} src="/images/work/me.png" alt="" draggable={false} />
      </div>
      <HandAnnotation
        targetRef={cardRef}
        note="that's not the actual me that's my Memoji"
        srText="That's not the actual me that's my Memoji."
        open={hintOpen}
        direction="sw"
        desktopOnly
        color="#5c5346"
        anchor={{ x: 'right', y: 'top', offsetX: -28, offsetY: -18 }}
        rotate={-8}
        labelMaxWidth={200}
      />
    </div>
  );
};

/** Metadata for the origin card focus overlay */
export const ORIGIN_HERO_WORK: Work = {
  name: 'Hello',
  image: '/images/work/me.png',
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
