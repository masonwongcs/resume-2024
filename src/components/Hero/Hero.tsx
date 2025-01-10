import styles from './Hero.module.scss';

import cx from 'classnames';

import { Headline, Subtitle } from '@/components/DisplacementOrb';

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
              <span>
                <Headline>UI Enthusiast &</Headline>
              </span>
              <span>
                <Headline>Front-End Engineer</Headline>
              </span>
            </h1>
            <p>
              <Subtitle>Mason Wong</Subtitle>
            </p>
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
