import type { Metadata } from 'next';

import { ProjectIndex } from '@/components/PortfolioSeo/PortfolioSeo';
import { ABOUT_PAGE_PATH, getAboutMetaDescription, getAboutParagraphs } from '@/lib/aboutContent';
import { BASE_URL } from '@/lib/site';

const title = 'About Mason Wong — Front-End Engineer in Singapore';
const description = getAboutMetaDescription();
const canonical = `${BASE_URL}${ABOUT_PAGE_PATH}`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: {
    title,
    description,
    url: canonical,
    images: `${BASE_URL}/images/work/me.webp`,
    type: 'profile'
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: `${BASE_URL}/images/work/me.webp`
  }
};

/**
 * SSR crawlable About copy (same text as the Hello / origin focus card).
 * Visually hidden — the `(portfolio)` layout canvas shell owns the UI.
 */
export default function AboutPage() {
  const paragraphs = getAboutParagraphs();

  return (
    <article className="sr-only" aria-label="About Mason Wong">
      <h1>About Mason Wong</h1>
      {paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 24)}>{paragraph}</p>
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- static crawl companion */}
      <img src="/images/work/me.webp" alt="Mason Wong" />
      <ProjectIndex />
    </article>
  );
}
