import styles from './page.module.scss';

import { DisplacementOrb } from '@/components/DisplacementOrb';
import { Hero } from '@/components/Hero';

export default function Home() {
  return (
    <DisplacementOrb>
      <main className={styles.main}>
        <Hero />
      </main>
    </DisplacementOrb>
  );
}
