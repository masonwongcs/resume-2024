import styles from '../page.module.scss';

import dynamic from 'next/dynamic';

import { WORK_HISTORY } from '@/fixture/Work.fixture';

const InfiniteCanvasWork = dynamic(() => import('@/components/InfiniteCanvas').then((mod) => mod.InfiniteCanvas), {
  ssr: false
});

export default function Work() {
  return (
    <main className={styles.main}>
      <InfiniteCanvasWork works={WORK_HISTORY} />
    </main>
  );
}
