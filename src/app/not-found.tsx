import type { Metadata } from 'next';

import { NotFound } from '@/components/NotFound';

export const metadata: Metadata = {
  title: 'Page not found | Mason Wong',
  robots: {
    index: false,
    follow: true
  }
};

export default function NotFoundPage() {
  return <NotFound />;
}
