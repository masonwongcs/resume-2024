import styles from '../page.module.scss';

import { Contact } from '@/components/Contact';

export default function Home() {
  return (
    <main className={styles.main}>
      <Contact />
    </main>
  );
}
