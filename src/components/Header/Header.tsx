'use client';

import styles from './Header.module.scss';

import { useCallback, useEffect, useRef, useState } from 'react';

import cx from 'classnames';
import Hamburger from 'hamburger-react';
import { Drawer } from 'vaul';
import { useWebHaptics } from 'web-haptics/react';

import { INFO } from '@/components/Contact/Contact.fixture';
import GlassSurface from '@/components/GlassSurface/GlassSurface';
import { useHomeStore, usePortfolioViewStore, useWorkStore } from '@/store';

const Header = () => {
  const { trigger } = useWebHaptics();
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  // Pre-mount drawer content on hover to avoid lag on first open
  const [shouldMountDrawer, setShouldMountDrawer] = useState(false);
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const setStickerQueue = useWorkStore((state) => state.setStickerQueue);
  const viewMode = usePortfolioViewStore((state) => state.viewMode);
  const setViewMode = usePortfolioViewStore((state) => state.setViewMode);
  const canvasFocused = useHomeStore((state) => state.canvasFocused);

  // Drag progress is kept in a ref (not state) so dragging the drawer doesn't
  // re-render Header / the expensive GlassSurface subtree on every frame.
  const percentageRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingOpenAnimationRef = useRef(false);
  const isOpenRef = useRef(false);

  const handleHamburgerHover = useCallback(() => {
    setShouldMountDrawer(true);
  }, []);

  // Compute + write the drawer CSS vars directly to the document, coalesced to
  // one write per animation frame. No React state on the drag hot path.
  const writeDrawerVars = useCallback(() => {
    rafRef.current = null;
    if (typeof window === 'undefined') return;

    const percentage = percentageRef.current;
    const padding = isMobile ? 10 : 30;
    const inset = isOpen ? padding * (1 - percentage) : 0;
    const borderRadius = isOpen ? (1 - percentage) * 40 : 0;
    const scaleX = (window.innerWidth - inset * 2) / window.innerWidth;
    const scaleY = (window.innerHeight - inset * 2) / window.innerHeight;

    const root = document.documentElement.style;
    root.setProperty('--drawer-scale-x', scaleX.toString());
    root.setProperty('--drawer-scale-y', scaleY.toString());
    root.setProperty('--drawer-percentage', percentage.toString());
    root.setProperty('--drawer-border-radius', `${borderRadius}px`);
  }, [isMobile, isOpen]);

  const scheduleDrawerVars = useCallback(() => {
    if (typeof window === 'undefined') {
      writeDrawerVars();
      return;
    }
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(writeDrawerVars);
  }, [writeDrawerVars]);

  const beginDrawerOpen = useCallback(() => {
    pendingOpenAnimationRef.current = true;
    percentageRef.current = 1;
    scheduleDrawerVars();
  }, [scheduleDrawerVars]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open === isOpenRef.current) return;

      if (open) {
        setShouldMountDrawer(true);
        beginDrawerOpen();
      } else if (isMobile) {
        setIsAnimating(true);
      }

      isOpenRef.current = open;
      setOpen(open);
      trigger();
    },
    [beginDrawerOpen, isMobile, trigger]
  );

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice =
        window.matchMedia('(max-width: 768px)').matches ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Pre-mount drawer during idle to avoid lag on first open (helps mobile/tap users)
  useEffect(() => {
    if (typeof window === 'undefined' || !('requestIdleCallback' in window)) {
      const t = setTimeout(() => setShouldMountDrawer(true), 2000);
      return () => clearTimeout(t);
    }
    const id = requestIdleCallback(() => setShouldMountDrawer(true), { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }, []);

  // Recompute drawer vars when open/mobile state changes, and on resize.
  useEffect(() => {
    scheduleDrawerVars();

    window.addEventListener('resize', scheduleDrawerVars);

    return () => {
      window.removeEventListener('resize', scheduleDrawerVars);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const root = document.documentElement.style;
      root.removeProperty('--drawer-scale-x');
      root.removeProperty('--drawer-scale-y');
      root.removeProperty('--drawer-percentage');
      root.removeProperty('--drawer-border-radius');
    };
  }, [scheduleDrawerVars]);

  useEffect(() => {
    isOpenRef.current = isOpen;

    if (isOpen) {
      document.body.classList.add('is-drawer-open');
    } else {
      document.body.classList.remove('is-drawer-open');
      percentageRef.current = 0;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !pendingOpenAnimationRef.current) return;

    pendingOpenAnimationRef.current = false;
    percentageRef.current = 1;
    scheduleDrawerVars();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        percentageRef.current = 0;
        scheduleDrawerVars();
      });
    });
  }, [isOpen, scheduleDrawerVars]);

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
        onOpenChange={handleOpenChange}
        onRelease={() => setIsDragging(false)}
        onDrag={(_, percentageDragged) => {
          percentageRef.current = percentageDragged;
          scheduleDrawerVars();
          // setState bails out once already true, so no re-render per frame.
          setIsDragging(true);
        }}
        disablePreventScroll
        noBodyStyles
      >
        <GlassSurface
          className={cx(styles.headerWrapper, {
            [styles.hidden]: isOpen || canvasFocused
          })}
          borderRadius={50}
          style={isDragging ? { transition: 'none' } : undefined}
        >
          {/*<img className={styles.logo} src="/apple-touch-icon.png" alt="I'm Mason" />*/}
          <div className={styles.name}>
            Hi, I'm Mason <span>Wong</span>
          </div>

          <div
            className={styles.hamburger}
            onMouseEnter={handleHamburgerHover}
            onFocus={handleHamburgerHover}
            onTouchStart={handleHamburgerHover}
          >
            <Hamburger
              toggled={isOpen}
              toggle={(openToggle) => {
                trigger('success');
                const nextOpen = typeof openToggle === 'function' ? openToggle(isOpenRef.current) : openToggle;
                handleOpenChange(nextOpen);
              }}
              size={24}
            />
          </div>
        </GlassSurface>

        {(shouldMountDrawer || isOpen) && (
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
                          trigger('success');
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
                <div className={cx(styles.content, styles.viewSettingContent)}>
                  <div className={styles.viewSettingCard}>
                    <div className={styles.viewSettingRow}>
                      <span className={styles.viewSettingLabel}>experience mode</span>
                      <div className={styles.viewTabPicker} role="tablist" aria-label="Experience mode">
                        {(['canvas', 'reading'] as const).map((mode) => {
                          const isActive = viewMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              role="tab"
                              aria-selected={isActive}
                              className={cx(styles.viewTab, { [styles.viewTabActive]: isActive })}
                              onClick={() => {
                                setViewMode(mode);
                                trigger('success');
                              }}
                            >
                              {mode === 'canvas' ? 'Canvas' : 'Reading'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        )}
      </Drawer.Root>
    </header>
  );
};

export { Header };
