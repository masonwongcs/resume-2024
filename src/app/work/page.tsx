import styles from '../page.module.scss';

import { Blob } from '@/components/Background';
import { FlyoutCSR, InfiniteCanvasCSR } from '@/components/ClientDynamicComponent';
import { WORK_HISTORY } from '@/fixture/Work.fixture';

export default function Work() {
  return (
    <main className={styles.main}>
      {/*<InfiniteCanvas works={WORK_HISTORY}/>*/}
      {/*<Flyout/>*/}
      <InfiniteCanvasCSR works={WORK_HISTORY} />
      <FlyoutCSR />
      <Blob />
    </main>
  );
}
