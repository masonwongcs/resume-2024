import styles from './Background.module.scss';

import { Cursor } from '@/components/Cursor';

const Background = () => {
  return <img className={styles.noise} src={'/images/noise.png'} alt="noise" />;
};

const Blob = () => {
  return (
    <>
      <Cursor className={styles.blob3} lerpFactor={0.1} />
      <Cursor className={styles.blob2} lerpFactor={0.2} />
      <Cursor className={styles.blob1} lerpFactor={0.3} />
    </>
  );
};
export { Background, Blob };
