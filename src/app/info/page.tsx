import styles from '../page.module.scss';

import { Contact } from '@/components/Contact';
import { DisplacementOrb } from '@/components/DisplacementOrb';

export default function Home() {
  return (
    <DisplacementOrb showCursor showBackground={false}>
      <main className={styles.main}>
        <Contact />
      </main>
    </DisplacementOrb>
  );
}
