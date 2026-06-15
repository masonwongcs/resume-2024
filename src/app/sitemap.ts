import type { MetadataRoute } from 'next';

const BASE_URL = 'https://masonwongcs.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: BASE_URL,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1
    }
  ];
}
