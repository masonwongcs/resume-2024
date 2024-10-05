import './globals.scss';

import { Suspense } from 'react';

import cx from 'classnames';
import type { Metadata } from 'next';
import { Cormorant_Garamond, Poppins } from 'next/font/google';

import { Background } from '@/components/Background';
import { Flyout } from '@/components/Flyout';
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

export const metadata: Metadata = {
  title: 'Mason Wong | UI Enthusiast & Front-End Engineer',
  description: `With over ${years} years of experience, I aim to excel in front-end development, specializing in UI and UX design for web and mobile applications, drawing on my background as a self-taught graphic and UI designer.`
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cx(cormorantGaramond.variable, poppins.variable)}>
        <Suspense fallback={<div>Loading...</div>}>
          <Background />
          <Navigation />
          <Flyout />
          <SmoothScroll>{children}</SmoothScroll>
        </Suspense>
      </body>
    </html>
  );
}
