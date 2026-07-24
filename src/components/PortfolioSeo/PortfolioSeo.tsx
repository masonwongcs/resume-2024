import { ABOUT_PAGE_PATH } from '@/lib/aboutContent';
import { ALL_WORK_SLUGS, getWorkBySlug } from '@/lib/workSlug';

/** First 1–2 sentences (or up to `maxChars`) for case summaries / meta descriptions. */
export const summarizeWorkCopy = (description: string, maxChars = 320): string => {
  const cleaned = description.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) ?? [cleaned];
  let summary = '';
  for (const sentence of sentences.slice(0, 2)) {
    const next = summary ? `${summary} ${sentence}` : sentence;
    if (next.length > maxChars && summary) break;
    summary = next;
    if (summary.length >= maxChars * 0.6) break;
  }
  if (summary.length > maxChars) {
    return `${summary.slice(0, maxChars - 1).trimEnd()}…`;
  }
  return summary;
};

export const getWorkMetaDescription = (description: string) => summarizeWorkCopy(description, 155);

const resolvePublicPath = (image: string) => {
  if (image.startsWith('http') || image.startsWith('/')) return image;
  return `/${image.replace(/^\.\//, '')}`;
};

type ProjectIndexProps = {
  /** Omit the current project from the list (still linked elsewhere on the page). */
  excludeSlug?: string;
};

/** SSR internal-link graph for project discovery (home, about, work pages). */
export function ProjectIndex({ excludeSlug }: ProjectIndexProps) {
  const items = ALL_WORK_SLUGS.map((slug) => {
    const work = getWorkBySlug(slug);
    return work ? { slug, name: work.name } : null;
  }).filter((item): item is { slug: string; name: string } => item != null);

  return (
    <nav aria-label="Selected projects">
      <h2>Selected projects</h2>
      <ul>
        {items
          .filter((item) => item.slug !== excludeSlug)
          .map((item) => (
            <li key={item.slug}>
              <a href={`/work/${item.slug}`}>{item.name}</a>
            </li>
          ))}
      </ul>
      <p>
        <a href={ABOUT_PAGE_PATH}>About Mason Wong</a>
      </p>
    </nav>
  );
}

type WorkCaseArticleProps = {
  slug: string;
};

/**
 * Crawlable case summary for a work slug — same substance as the focus overlay,
 * plus internal links. Visually hidden so the fixed canvas shell stays the UI;
 * content matches what interactive users can open in focus (not cloaking).
 */
export function WorkCaseArticle({ slug }: WorkCaseArticleProps) {
  const work = getWorkBySlug(slug);
  if (!work) return null;

  const description = typeof work.description === 'string' ? work.description : '';
  const summary = summarizeWorkCopy(description);
  const imageSrc = resolvePublicPath(work.thumbnail || work.image);

  return (
    <article className="sr-only" aria-label={`${work.name} project summary`}>
      <h1>{work.name}</h1>
      {summary ? <p>{summary}</p> : null}
      {description && description !== summary ? <p>{description}</p> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- static crawl companion */}
      <img src={imageSrc} alt={`${work.name} project preview`} />
      {work.url ? (
        <p>
          <a href={work.url} rel="noopener noreferrer">
            {work.linkLabel ?? `Visit ${work.name}`}
          </a>
        </p>
      ) : null}
      <ProjectIndex excludeSlug={slug} />
    </article>
  );
}

/** Home / work-index crawl block: intro + full project link graph. */
export function PortfolioHubSeo() {
  return (
    <section className="sr-only" aria-label="Mason Wong portfolio">
      <h1>Mason Wong — Front-End Engineer in Singapore</h1>
      <p>
        Portfolio of selected product and marketing work across fintech, e-commerce, education, and experimental
        front-end projects. Open any project for a short case summary, or visit About for background.
      </p>
      <ProjectIndex />
    </section>
  );
}

/** JSON-LD CreativeWork for a project page. */
export function workCreativeWorkJsonLd(slug: string) {
  const work = getWorkBySlug(slug);
  if (!work || typeof work.description !== 'string') return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: work.name,
    description: summarizeWorkCopy(work.description, 200),
    url: `https://masonwongcs.com/work/${slug}`,
    image: `https://masonwongcs.com${resolvePublicPath(work.thumbnail || work.image)}`,
    author: {
      '@type': 'Person',
      name: 'Mason Wong',
      url: 'https://masonwongcs.com'
    },
    ...(work.url ? { sameAs: work.url } : {})
  };
}
