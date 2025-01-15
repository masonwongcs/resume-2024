'use client';

import styles from './Flyout.module.scss';

import { FC, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import cx from 'classnames';

import { Sticker } from '@/components/Sticker';
import { useWorkStore } from '@/store';

const formatUrl = (url?: string) => {
  if (!url) return;
  let formattedUrl = url.replace(/^(https?:\/\/)/, '');

  formattedUrl = formattedUrl.replace(/\/$/, '');

  formattedUrl = formattedUrl.replace(/^www\./, '');

  return formattedUrl;
};

interface FlyoutProps {
  type: 'work' | 'info';
}

const Flyout: FC<FlyoutProps> = ({ type = 'work' }) => {
  const { selectedWork, removeSelectedWork } = useWorkStore();
  const isOpen = !!selectedWork;
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isOpen && type === 'info') {
      // Reset the active state when closed
      setIsActive(false);
      // Set active state after 100ms when opened
      timeoutId = setTimeout(() => {
        setIsActive(true);
      }, 100);
    } else {
      setIsActive(false);
    }

    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isOpen, type]);

  const content = useMemo(() => {
    if (type === 'work') {
      return (
        <div className={styles.workContentWrapper}>
          <img className={styles.image} src={selectedWork?.image} alt={selectedWork?.description} />
          <div className={styles.textWrapper}>
            <h1 className={styles.title}>{selectedWork?.name}</h1>
            <p className={styles.description}>{selectedWork?.description}</p>
            <a className={styles.cta} href={selectedWork?.url} target="_blank" rel="noopener">
              {formatUrl(selectedWork?.url)}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M20.7806 12.5306L14.0306 19.2806C13.8899 19.4213 13.699 19.5004 13.5 19.5004C13.301 19.5004 13.1101 19.4213 12.9694 19.2806C12.8286 19.1399 12.7496 18.949 12.7496 18.75C12.7496 18.551 12.8286 18.3601 12.9694 18.2194L18.4397 12.75H3.75C3.55109 12.75 3.36032 12.671 3.21967 12.5303C3.07902 12.3897 3 12.1989 3 12C3 11.8011 3.07902 11.6103 3.21967 11.4697C3.36032 11.329 3.55109 11.25 3.75 11.25H18.4397L12.9694 5.78061C12.8286 5.63988 12.7496 5.44901 12.7496 5.24999C12.7496 5.05097 12.8286 4.8601 12.9694 4.71936C13.1101 4.57863 13.301 4.49957 13.5 4.49957C13.699 4.49957 13.8899 4.57863 14.0306 4.71936L20.7806 11.4694C20.8504 11.539 20.9057 11.6217 20.9434 11.7128C20.9812 11.8038 21.0006 11.9014 21.0006 12C21.0006 12.0986 20.9812 12.1961 20.9434 12.2872C20.9057 12.3782 20.8504 12.461 20.7806 12.5306Z"
                  fill="#ffffff"
                />
              </svg>
            </a>
          </div>
        </div>
      );
    }

    if (type === 'info') {
      return (
        <div className={styles.infoContentWrapper}>
          <h1 className={styles.title}>{selectedWork?.name}</h1>
          <div className={styles.skills}>
            {selectedWork?.skills?.map((skill) => (
              <div key={skill} className={styles.skillItem}>
                {skill}
              </div>
            ))}
          </div>
          {createPortal(
            <div
              className={cx(styles.stickerWrapper, {
                [styles.active]: isActive
              })}
            >
              {selectedWork?.stickers?.map(({ src, alt, startX, startY, transformEndX, transformEndY }, index) => (
                <Sticker
                  key={src}
                  src={src}
                  alt={alt}
                  startX={startX}
                  startY={startY}
                  transformEndX={transformEndX}
                  transformEndY={transformEndY}
                />
              ))}
            </div>,
            document.body
          )}
        </div>
      );
    }
  }, [type, selectedWork, isActive]);

  return createPortal(
    <section
      className={cx(styles.flyout, {
        [styles.open]: isOpen
      })}
    >
      {createPortal(
        <button
          className={cx(styles.closeBtn, {
            [styles.open]: isOpen
          })}
          onClick={removeSelectedWork}
        >
          <img src="/images/icon/close.svg" alt="Close modal" />
        </button>,
        document.body
      )}
      <div className={styles.flyoutContent}>{content}</div>
    </section>,
    document.body
  );
};

export { Flyout };
