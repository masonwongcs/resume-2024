import { WORK_HISTORY } from '@/fixture/Work.fixture';

export type SluggableWork = (typeof WORK_HISTORY)[number];

/**
 * Kebab-case a work name for use in `/work/[slug]`.
 * Slug identity is always derived from `name` — never the outbound `url` (see KTD3).
 */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

interface WorkSlugCatalog {
  bySlug: Map<string, SluggableWork>;
  byName: Map<string, string>;
}

/**
 * Build the slug ↔ work catalog from `WORK_HISTORY` only — Hello (origin) and Now listening
 * live outside `WORK_HISTORY` and are intentionally excluded (R12).
 * Fails fast on any slug collision so two works never resolve to the same `/work/[slug]`.
 */
const buildWorkSlugCatalog = (): WorkSlugCatalog => {
  const bySlug = new Map<string, SluggableWork>();
  const byName = new Map<string, string>();

  for (const work of WORK_HISTORY) {
    const slug = slugify(work.name);
    if (!slug) {
      throw new Error(`workSlug: unable to derive a slug for work "${work.name}"`);
    }
    const existing = bySlug.get(slug);
    if (existing) {
      throw new Error(`workSlug: slug collision "${slug}" between "${existing.name}" and "${work.name}"`);
    }
    bySlug.set(slug, work);
    byName.set(work.name, slug);
  }

  return { bySlug, byName };
};

const catalog = buildWorkSlugCatalog();

/** Every addressable work slug, one per `WORK_HISTORY` entry. */
export const ALL_WORK_SLUGS: string[] = Array.from(catalog.bySlug.keys());

/** Resolve a `/work/[slug]` slug to its work, or `null` when unknown (soft-land per KTD5). */
export const getWorkBySlug = (slug: string): SluggableWork | null => catalog.bySlug.get(slug) ?? null;

/** Resolve a work (by `name`) to its stable slug, or `null` for works outside `WORK_HISTORY`. */
export const getSlugForWork = (work: { name: string }): string | null => catalog.byName.get(work.name) ?? null;
