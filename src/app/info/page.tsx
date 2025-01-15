import styles from '../page.module.scss';

import { Blob } from '@/components/Background';
import { Contact } from '@/components/Contact';
import { Flyout } from '@/components/Flyout';

export default function Home() {
  return (
    <main className={styles.main}>
      <Contact />
      <Blob />
      <Flyout type="info" />
    </main>
  );
}
