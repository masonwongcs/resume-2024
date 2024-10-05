import styles from './Background.module.scss';

import { Cursor } from '@/components/Cursor';

const Background = () => {
  return (
    <>
      <Cursor className={styles.blob3} lerpFactor={0.1} />
      <Cursor className={styles.blob2} lerpFactor={0.2} />
      <Cursor className={styles.blob1} lerpFactor={0.3} />
      <img className={styles.noise} src={'/images/noise.png'} alt="noise" />
    </>
  );
};
export { Background };
