import styles from '../page.module.scss';

import { InfiniteCanvas } from '@/components/InfiniteCanvas';
import { WORK_HISTORY } from '@/fixture/Work.fixture';

export default function Home() {
  return (
    <main className={styles.main}>
      <InfiniteCanvas works={WORK_HISTORY} />
    </main>
  );
}
