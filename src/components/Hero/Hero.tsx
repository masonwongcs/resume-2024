import styles from './Hero.module.scss';

import cx from 'classnames';

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
              UI Enthusiast &<br />
              Front-End Engineer
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
