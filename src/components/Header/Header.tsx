'use client';

import styles from './Header.module.scss';

import { useEffect, useState } from 'react';

import cx from 'classnames';
import Hamburger from 'hamburger-react';
import { Drawer } from 'vaul';

import { INFO } from '@/components/Contact/Contact.fixture';
import { useWorkStore } from '@/store';

const Header = () => {
  const isMobile = window.innerWidth <= 480;
  const [percentageDragged, setPercentageDragged] = useState(0);
  const [isOpen, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const setStickerQueue = useWorkStore((state) => state.setStickerQueue);

  const SCALE_DOWN_SIZE = isMobile ? 10 : 30;

  useEffect(() => {
    const updateScale = () => {
      if (typeof window === 'undefined') return;

      // Calculate scale to reduce by [N]px for both width and height
      // Scale = (dimension - [N]) / dimension
      const scaleDownX = (window.innerWidth - SCALE_DOWN_SIZE) / window.innerWidth;
      const scaleDownY = (window.innerHeight - SCALE_DOWN_SIZE) / window.innerHeight;
      const scaleX = (isMobile ? scaleDownX : 0.98) + percentageDragged * 0.05;
      const scaleY = (isMobile ? scaleDownY : 0.98) + percentageDragged * 0.05;

      // When drawer is closed, scale is 1.0 (normal size)
      // When drawer is open, interpolate from 1.0 to the [N]px scale down based on drag percentage
      const finalScaleX = isOpen
        ? scaleX > 1
          ? 1
          : scaleX // Interpolate from 1.0 to [N]px down
        : 1;

      const finalScaleY = isOpen
        ? scaleY > 1
          ? 1
          : scaleY // Interpolate from 1.0 to [N]px down
        : 1;

      document.documentElement.style.setProperty('--drawer-scale-x', finalScaleX.toString());
      document.documentElement.style.setProperty('--drawer-scale-y', finalScaleY.toString());
    };

    // Initial calculation
    updateScale();

    // Update on window resize
    window.addEventListener('resize', updateScale);

    // Cleanup
    return () => {
      window.removeEventListener('resize', updateScale);
      document.documentElement.style.removeProperty('--drawer-scale-x');
      document.documentElement.style.removeProperty('--drawer-scale-y');
    };
  }, [isOpen, percentageDragged]);

  useEffect(() => {
    // Calculate border radius based on drag percentage
    // When fully open (percentageDragged = 1), border radius is 40px
    // When closed (percentageDragged = 0), border radius is 0px
    const borderRadius = isOpen ? (1 - percentageDragged) * 40 : 0; // Smoothly animate from 0 to 40px
    document.documentElement.style.setProperty('--drawer-border-radius', `${borderRadius}px`);

    // Cleanup: reset border radius when component unmounts
    return () => {
      document.documentElement.style.removeProperty('--drawer-border-radius');
    };
  }, [isOpen, percentageDragged]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('is-drawer-open');
    } else {
      document.body.classList.remove('is-drawer-open');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isDragging) {
      document.body.classList.add('is-dragging');
    } else {
      document.body.classList.remove('is-dragging');
    }
  }, [isDragging]);

  useEffect(() => {
    if (isAnimating) {
      document.body.classList.add('is-animating');
    } else {
      document.body.classList.remove('is-animating');
    }
  }, [isAnimating]);

  return (
    <header className={styles.header}>
      <Drawer.Root
        open={isOpen}
        onAnimationEnd={() => setIsAnimating(false)}
        onClose={() => {
          if (!isAnimating || isDragging) {
            setOpen(false);
          }

          if (isMobile) {
            setIsAnimating(true);
          }

          setPercentageDragged(0);
        }}
        onRelease={() => setIsDragging(false)}
        onDrag={(_, percentageDragged) => {
          setPercentageDragged(percentageDragged);
          setIsDragging(true);
        }}
        disablePreventScroll
        noBodyStyles
      >
        <div
          className={cx(styles.headerWrapper, {
            [styles.hidden]: isOpen
          })}
        >
          {/*<img className={styles.logo} src="/apple-touch-icon.png" alt="I'm Mason" />*/}
          <div className={styles.name}>
            Hi, I'm Mason <span>Wong</span>
          </div>

          <div className={styles.hamburger}>
            <Hamburger
              toggled={isOpen}
              toggle={(openToggle) => {
                setOpen(openToggle);
                if (isMobile) {
                  setIsAnimating(true);
                }
              }}
              size={24}
            />
          </div>
        </div>

        <Drawer.Portal>
          <Drawer.Overlay className={styles.overlay} />
          <Drawer.Content className={styles.drawer}>
            <div className={styles.handle}></div>
            <div className={styles.container}>
              <Drawer.Title className={styles.title} />
              <div className={styles.content}>
                <h2 className={styles.contentTitle}>skills</h2>
                {INFO.map(({ title, skills, stickers }) => {
                  return (
                    <button
                      key={title}
                      className={styles.subtitle}
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
                      {title}
                      <span className={styles.infoItemCta}>
                        <img src="/images/icon/plus.svg" alt={`View more ${title}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.content}>
                <h2 className={styles.contentTitle}>contact</h2>
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
                <div className={cx(styles.contactItem, styles.email)}>
                  <a
                    className={styles.contactItemCta}
                    href="mailto:hello@masonwongcs.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    hello@masonwongcs.com
                  </a>
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </header>
  );
};

export { Header };
