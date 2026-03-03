'use client';

import styles from './Flyout.module.scss';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import cx from 'classnames';
import { useWebHaptics } from 'web-haptics/react';

import { Sticker } from '@/components/Sticker';
import { useWorkStore } from '@/store';

const formatUrl = (url?: string) => {
  if (!url) return;
  let formattedUrl = url.replace(/^(https?:\/\/)/, '');

  formattedUrl = formattedUrl.replace(/\/$/, '');

  formattedUrl = formattedUrl.replace(/^www\./, '');

  return formattedUrl;
};

const Flyout: FC = () => {
  const { trigger } = useWebHaptics();
  const selectedWork = useWorkStore((state) => state.selectedWork);
  const removeSelectedWork = useWorkStore((state) => state.removeSelectedWork);

  const isOpen = !!selectedWork;
  const [isActive, setIsActive] = useState(false);
  // Defer .open class by one frame so flyout can mount in closed state and fade in
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const TRANSITION_MS = 600;

  useEffect(() => {
    if (selectedWork) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = undefined;
      }
      setIsClosing(false);
    }
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [selectedWork]);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setIsVisible(false);
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frameId);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isOpen && selectedWork?.type === 'info') {
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
  }, [isOpen, selectedWork?.type]);

  const content = useMemo(() => {
    if (selectedWork?.type === 'work') {
      return (
        <div className={styles.workContentWrapper}>
          {selectedWork?.video ? (
            <video className={styles.image} src={selectedWork?.video} autoPlay playsInline muted loop />
          ) : (
            <img className={styles.image} src={selectedWork?.image} alt={selectedWork?.description} />
          )}

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

    if (selectedWork?.type === 'info') {
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
                [styles.active]: isActive && !isClosing
              })}
            >
              {selectedWork?.stickers?.map(({ src, alt, startX, startY, transformEndX, transformEndY }) => (
                <Sticker
                  key={src}
                  src={src}
                  alt={alt}
                  startX={startX}
                  startY={startY}
                  transformEndX={transformEndX}
                  transformEndY={transformEndY}
                  active={isActive && !isClosing}
                />
              ))}
            </div>,
            document.body
          )}
        </div>
      );
    }
  }, [selectedWork?.type, selectedWork, isActive, isClosing]);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    trigger();
    closeTimeoutRef.current = setTimeout(() => {
      removeSelectedWork();
      setIsClosing(false);
      closeTimeoutRef.current = undefined;
    }, TRANSITION_MS);
  };

  // Don't render when closed - keep mounted during fade out
  if (!selectedWork && !isClosing) {
    return null;
  }

  const showOpen = isOpen && isVisible && !isClosing;

  return createPortal(
    <section
      className={cx(styles.flyout, {
        [styles.open]: showOpen
      })}
    >
      {createPortal(
        <button
          className={cx(styles.closeBtn, {
            [styles.open]: showOpen
          })}
          onClick={handleClose}
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
