import styles from './page.module.scss';

import { StickerCarouselCSR } from '@/components/ClientDynamicComponent';
import { ALL_STICKERS } from '@/fixture/Stickers.fixture';

export default function StickersPage() {
  return (
    <main className={styles.main}>
      <StickerCarouselCSR stickers={ALL_STICKERS} />
    </main>
  );
}
