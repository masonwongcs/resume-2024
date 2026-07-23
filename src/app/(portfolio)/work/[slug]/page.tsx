import type { Metadata } from 'next';

import {
  WorkCaseArticle,
  getWorkMetaDescription,
  workCreativeWorkJsonLd
} from '@/components/PortfolioSeo/PortfolioSeo';
import { ALL_WORK_SLUGS, getWorkBySlug } from '@/lib/workSlug';

const BASE_URL = 'https://masonwongcs.com';

interface WorkSlugPageParams {
  slug: string;
}

const resolveOgImage = (image: string) => {
  if (image.startsWith('http')) return image;
  const path = image.startsWith('/') ? image : `/${image.replace(/^\.\//, '')}`;
  return `${BASE_URL}${path}`;
};

// Prerender every known work slug; unknown slugs still render (soft-land, no 404 — KTD5)
// via the default `dynamicParams: true` fallback.
export function generateStaticParams() {
  return ALL_WORK_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<WorkSlugPageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const work = getWorkBySlug(slug);

  if (!work) {
    // Unknown slugs soft-land on the unfocused canvas — never `notFound()` (KTD5). A
    // conservative noindex keeps junk URLs out of search results without a 404 UI.
    return {
      robots: { index: false, follow: true }
    };
  }

  const title = `${work.name} — Front-end project by Mason Wong`;
  const rawDescription = typeof work.description === 'string' ? work.description : undefined;
  const description = rawDescription ? getWorkMetaDescription(rawDescription) : undefined;
  const canonical = `${BASE_URL}/work/${slug}`;
  const image = resolveOgImage(work.thumbnail || work.image);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: image,
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image
    }
  };
}

/**
 * SSR crawlable case summary + project index for this slug.
 * Visually hidden so the canvas shell stays the UI; included in the initial HTML for
 * crawlers that don't depend on client JS.
 */
export default async function WorkSlugPage({ params }: { params: Promise<WorkSlugPageParams> }) {
  const { slug } = await params;
  const work = getWorkBySlug(slug);

  if (!work) return null;

  const jsonLd = workCreativeWorkJsonLd(slug);

  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      <WorkCaseArticle slug={slug} />
    </>
  );
}
