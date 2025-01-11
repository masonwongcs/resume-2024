import styles from './Loading.module.scss';

const Loading = () => {
  return (
    <div className={styles.loading}>
      <div className={styles.blob} />
    </div>
  );
};

const CircularLoading = () => {
  return (
    <div className={styles.circularLoading}>
      <div className={styles.container}>
        <div className={styles.ring1} />
        <div className={styles.ring2} />
        <div className={styles.ring3} />
      </div>
    </div>
  );
};

export { Loading, CircularLoading };
