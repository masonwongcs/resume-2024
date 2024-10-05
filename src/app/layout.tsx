import './globals.scss';

import { Suspense } from 'react';

import cx from 'classnames';
import type { Metadata } from 'next';
import { Cormorant_Garamond, Poppins } from 'next/font/google';

import { Background } from '@/components/Background';
import { Flyout } from '@/components/Flyout';
import { Loading } from '@/components/Loading';
import { Navigation } from '@/components/Navigation';
import { SmoothScroll } from '@/components/SmoothScroll';
import { calculateYearDifference } from '@/utils/calculateYearDifference';

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-cormorantGaramond'
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-poppins'
});

const years = calculateYearDifference('2017-01-01');

const BASE_URL = 'https://masonwongcs.com';
const title = 'Mason Wong | UI Enthusiast & Front-End Engineer';
const description = `With over ${years} years of experience, I aim to excel in front-end development, specializing in UI and UX design for web and mobile applications, drawing on my background as a self-taught graphic and UI designer.`;
export const metadata: Metadata = {
  title,
  description,
  icons: {
    icon: [
      {
        url: 'favicon-32x32.png',
        type: 'image/png',
        sizes: '32x32'
      },
      {
        url: 'favicon-16x16.png',
        type: 'image/png',
        sizes: '16x16'
      }
    ],
    apple: {
      url: 'apple-touch-icon.png',
      sizes: '180x180'
    }
  },
  keywords: [
    'Mason Wong',
    'masonwongcs',
    'mason wong',
    'UI/UX',
    'frontend',
    'front-end',
    'front-end developer',
    'front-end engineer',
    'ui/ux engineer'
  ],
  alternates: {
    canonical: BASE_URL
  },
  openGraph: {
    title: title,
    description: description,
    url: BASE_URL,
    siteName: title,
    images: `${BASE_URL}/banner-og.jpg`,
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    title: title,
    description: description,
    site: BASE_URL,
    images: `${BASE_URL}/banner-twitter.jpg`
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cx(cormorantGaramond.variable, poppins.variable)}>
        <Suspense fallback={<Loading />}>
          <Background />
          <Navigation />
          <Flyout />
          <SmoothScroll>{children}</SmoothScroll>
        </Suspense>
      </body>
    </html>
  );
}
