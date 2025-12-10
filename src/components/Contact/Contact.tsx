'use client';

import styles from './Contact.module.scss';

import { useEffect } from 'react';

import cx from 'classnames';

import { GitHubCard } from '@/components/GitHubCard';
import { useHomeStore, useWorkStore } from '@/store';

import { INFO } from './Contact.fixture';
import QR from './qr.svg';

const Group = () => {
  return (
    <>
      <div className={styles.gridItem} />
      <div className={styles.gridItem} />
      <div className={styles.gridItem} />
      <div className={styles.gridItem} />
    </>
  );
};

const Contact = () => {
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const setStickerQueue = useWorkStore((state) => state.setStickerQueue);
  const setLoadingProgress = useHomeStore((state) => state.setLoadingProgress);
  const setIsLoaded = useHomeStore((state) => state.setIsLoaded);

  useEffect(() => {
    setLoadingProgress(100);
    setIsLoaded();
  }, []);

  return (
    <section className={styles.contact}>
      <div className={styles.gridWrapper}>
        <Group />
        <Group />

        <div className={styles.gridItem} />
        <div className={cx(styles.gridItem, styles.transparent)}>
          <div className={styles.innerGrid}>
            <div className={styles.innerGridItem}>
              <h2 className={styles.title}>skills</h2>
            </div>

            {INFO.map(({ title, skills, stickers }) => {
              return (
                <div key={title} className={cx(styles.innerGridItem, styles.alignCenter)}>
                  <h3 className={styles.subtitle}>
                    {title}
                    <button
                      className={styles.infoItemCta}
                      onClick={() => {
                        setSelectedWork({
                          name: title,
                          skills,
                          stickers,
                          type: 'info'
                        });

                        setStickerQueue(stickers);
                      }}
                    >
                      <img src="/images/icon/plus.svg" alt={`View more ${title}`} />
                    </button>
                  </h3>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <Group />
        <Group />
      </div>

      <div className={styles.gridWrapper}>
        <Group />
        <Group />

        <div className={styles.gridItem} />
        <div className={cx(styles.gridItem, styles.transparent)}>
          <div className={styles.innerGrid}>
            <div className={styles.innerGridItem}>
              <h2 className={styles.title}>contact</h2>

              <div className={styles.contactItem}>
                <a
                  className={styles.contactItemCta}
                  href="https://www.linkedin.com/in/masonwongcs/"
                  target="_blank"
                  rel="noreferrer"
                >
                  LinkedIn
                  <img src="/images/icon/arrow-right.svg" alt={`Open LinkedIn url in new tab`} />
                </a>
              </div>
              <div className={styles.contactItem}>
                <a
                  className={cx(styles.contactItemCta, 'githubCta')}
                  href="https://github.com/masonwongcs"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                  <img src="/images/icon/arrow-right.svg" alt={`Open GitHub url in new tab`} />
                </a>
              </div>
              <div className={styles.contactItem}>
                <a
                  className={styles.contactItemCta}
                  href="https://masonwongcs.com/resume.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Resume
                  <img src="/images/icon/arrow-right.svg" alt={`Open resume url in new tab`} />
                </a>
              </div>
              <div className={styles.contactItem}>
                <a
                  className={styles.contactItemCta}
                  href="mailto:hello@masonwongcs.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  hello@masonwongcs.com
                </a>
              </div>
              <h2 className={styles.subtitle}>or scan</h2>
              <QR />
            </div>
          </div>
        </div>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <div className={styles.gridItem} />
        <div className={cx(styles.gridItem, styles.githubCard)}>
          <GitHubCard />
        </div>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <Group />
      </div>
    </section>
  );
};

export { Contact };
