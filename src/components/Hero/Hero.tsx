import styles from './Hero.module.scss';

const Hero = () => {
  return (
    <section className={styles.hero}>
      <div className={styles.gridWrapper}>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <div className={styles.gridItem} />
        <div className={styles.gridItem}>
          <div className={styles.nameWrapper}>
            <h1>
              UI Enthusiast &<br />
              Front-End Engineer
            </h1>
            {/*<p>UI Enthusiast & Front-End Engineer</p>*/}
          </div>
        </div>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />
      </div>
    </section>
  );
};

export { Hero };
