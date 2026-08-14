import type { MetadataRoute } from 'next';

import { BASE_URL } from '@/lib/site';
import { ALL_WORK_SLUGS } from '@/lib/workSlug';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: BASE_URL,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1
    },
    {
      url: `${BASE_URL}/about`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9
    },
    {
      url: `${BASE_URL}/work`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8
    },
    ...ALL_WORK_SLUGS.map((slug) => ({
      url: `${BASE_URL}/work/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6
    }))
  ];
}
