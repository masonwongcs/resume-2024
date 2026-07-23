import { CODING_START_DATE, calculateYearDifference } from '@/utils/calculateYearDifference';

const yearsCoding = () => calculateYearDifference(CODING_START_DATE);

/** Plain paragraphs shared by the Hello focus card and the `/about` SSR crawl page. */
export const getAboutParagraphs = (): string[] => {
  const years = yearsCoding();
  return [
    `I'm Mason Wong, a UI enthusiast and front-end engineer based in Singapore, with over ${years} years of experience crafting thoughtful interfaces for web and mobile. What started as a self-taught design practice grew into a career building products people enjoy using.`,
    `These days I work as a Full Stack Engineer at L'Oréal, where I help shape internal data tools and GenAI features with a strong focus on UI/UX. Before that, I was a Front-end Engineer at Aesop, delivering campaigns and experiences across Aesop.com and its digital properties.`,
    'Feel free to wander the grid, open a project, or say hello.',
    "Welcome to my corner of the web. I'm glad you're here."
  ];
};

export const ABOUT_PAGE_PATH = '/about';

export const getAboutMetaDescription = () => getAboutParagraphs()[0] ?? '';
