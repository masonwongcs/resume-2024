'use client';

import styles from './Header.module.scss';

import { useState } from 'react';

import cx from 'classnames';
import Hamburger from 'hamburger-react';
import { Drawer } from 'vaul';

import { INFO } from '@/components/Contact/Contact.fixture';
import { useWorkStore } from '@/store';

const Header = () => {
  const [isOpen, setOpen] = useState(false);
  const setSelectedWork = useWorkStore((state) => state.setSelectedWork);
  const setStickerQueue = useWorkStore((state) => state.setStickerQueue);

  return (
    <header className={styles.header}>
      <Drawer.Root open={isOpen} onClose={() => setOpen(false)}>
        <div
          className={cx(styles.headerWrapper, {
            [styles.hidden]: isOpen
          })}
        >
          {/*<img className={styles.logo} src="/apple-touch-icon.png" alt="I'm Mason" />*/}
          <div className={styles.name}>
            Hi, I'm Mason <span>Wong</span>
          </div>

          <Drawer.Trigger className={styles.hamburger}>
            <Hamburger toggled={isOpen} toggle={setOpen} size={24} />
          </Drawer.Trigger>
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
