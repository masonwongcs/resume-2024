import './globals.scss';

import { GoogleAnalytics } from '@next/third-parties/google';
import cx from 'classnames';
import type { Metadata } from 'next';
import { Cormorant_Garamond, Crimson_Text, Poppins } from 'next/font/google';
import localFont from 'next/font/local';

import { Background, Blob } from '@/components/Background';
import { Header } from '@/components/Header';
import { Loader } from '@/components/Loader';
import { Navigation } from '@/components/Navigation';
import { calculateYearDifference } from '@/utils/calculateYearDifference';

//
// const futura = localFont({
//   src: [
//     {
//       path: 'fonts/Futura-Regular.woff',
//       weight: '400',
//       style: 'normal',
//     },
//     {
//       path: 'fonts/Futura-Bold.woff',
//       weight: '700',
//       style: 'normal'
//     }
//   ]
// });

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-cormorantGaramond'
});

const crimsonText = Crimson_Text({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-crimsonText'
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
  metadataBase: new URL(BASE_URL),
  title,
  description,
  manifest: '/site.webmanifest',
  authors: [{ name: 'Mason Wong', url: BASE_URL }],
  creator: 'Mason Wong',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  },
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
    card: 'summary_large_image',
    title: title,
    description: description,
    site: BASE_URL,
    images: `${BASE_URL}/banner-twitter.jpg`
  }
};

const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Mason Wong',
  alternateName: 'masonwongcs',
  url: BASE_URL,
  image: `${BASE_URL}/banner-og.jpg`,
  jobTitle: 'Front-End Engineer',
  description,
  email: 'hello@masonwongcs.com',
  knowsAbout: [
    'Front-End Development',
    'UI Design',
    'UX Design',
    'React',
    'Next.js',
    'TypeScript',
    'Web Development'
  ],
  sameAs: ['https://github.com/masonwongcs', 'https://www.linkedin.com/in/masonwongcs/']
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
        {children}
        {/*<Navigation />*/}
      </body>
      <GoogleAnalytics gaId="G-M70FVE23DR" />
    </html>
  );
}
