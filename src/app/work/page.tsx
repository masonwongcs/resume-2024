import styles from '../page.module.scss';

import dynamic from 'next/dynamic';

import { WORK_HISTORY } from '@/fixture/Work.fixture';

const InfiniteCanvasCSR = dynamic(() => import('@/components/InfiniteCanvas').then((mod) => mod.InfiniteCanvas), {
  ssr: false
});

const FlyoutCSR = dynamic(() => import('@/components/Flyout').then((mod) => mod.Flyout), {
  ssr: false
});

export default function Work() {
  return (
    <main className={styles.main}>
      <InfiniteCanvasCSR works={WORK_HISTORY} />
      <FlyoutCSR />
    </main>
  );
}
