'use client';

import styles from './Flyout.module.scss';

import { createPortal } from 'react-dom';

import cx from 'classnames';

import { useWorkStore } from '@/store';

const formatUrl = (url?: string) => {
  if (!url) return;
  let formattedUrl = url.replace(/^(https?:\/\/)/, '');

  formattedUrl = formattedUrl.replace(/\/$/, '');

  formattedUrl = formattedUrl.replace(/^www\./, '');

  return formattedUrl;
};

const Flyout = () => {
  const { selectedWork, removeSelectedWork } = useWorkStore();
  const isOpen = !!selectedWork;

  return createPortal(
    <section
      className={cx(styles.flyout, {
        [styles.open]: isOpen
      })}
    >
      <div className={styles.flyoutContent}>
        <button className={styles.closeBtn} onClick={removeSelectedWork}>
          <img src="/images/icon/close.svg" alt="Close modal" />
        </button>
        <img className={styles.image} src={selectedWork?.image} alt={selectedWork?.description} />
        <h1 className={styles.title}>{selectedWork?.name}</h1>
        <p className={styles.description}>{selectedWork?.description}</p>
        <a className={styles.cta} href={selectedWork?.url} target="_blank" rel="noopener">
          {formatUrl(selectedWork?.url)}
          <img src="/images/icon/arrow-right.svg" alt={`Open ${selectedWork?.name} in new tab`} />
        </a>
      </div>
    </section>,
    document.body
  );
};

export { Flyout };
