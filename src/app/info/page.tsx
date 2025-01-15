import styles from '../page.module.scss';

import { Blob } from '@/components/Background';
import { FlyoutCSR } from '@/components/ClientDynamicComponent';
import { Contact } from '@/components/Contact';

export default function Home() {
  return (
    <main className={styles.main}>
      <Contact />
      <Blob />
      <FlyoutCSR type="info" />
    </main>
  );
}
