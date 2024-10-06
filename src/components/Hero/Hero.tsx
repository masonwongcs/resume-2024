import styles from './Hero.module.scss';

import cx from 'classnames';

import { AnimatedText } from '@/components/AnimatedText';

const Hero = () => {
  return (
    <section className={styles.hero}>
      <div className={styles.gridWrapper}>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <div className={styles.gridItem} />
        <div className={styles.gridItem}>
          <div className={styles.nameWrapper}>
            <h1>
              <span>UI Enthusiast &</span>
              <span>Front-End Engineer</span>
            </h1>
            <p>Mason Wong</p>
          </div>
        </div>
        <div className={cx(styles.gridItem, styles.transparent)} />
        <div className={styles.gridItem} />

        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
      </div>
    </section>
  );
};

export { Hero };
