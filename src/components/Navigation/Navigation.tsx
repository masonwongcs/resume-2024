'use client';

import styles from './Navigation.module.scss';

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';

import cx from 'classnames';
import { usePathname } from 'next/navigation';

import { NavLink } from '@/components/NavLink';
import HomeIcon from '@/icon/home.svg';
import InfoIcon from '@/icon/info.svg';
import WorkIcon from '@/icon/work.svg';

const NAV_ITEMS = [
  { icon: HomeIcon, title: 'Home', href: '/' },
  { icon: WorkIcon, title: 'Work', href: '/work' },
  { icon: InfoIcon, title: 'Info', href: '/info' }
];

const Navigation = () => {
  const pathname = usePathname() || '/';
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NAV_ITEMS.findIndex((item) => item.href === pathname));
  const [offsetHeight, setOffsetHeight] = useState(0);
  const backgroundRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    setOffsetHeight(activeIndex * ((backgroundRef?.current?.offsetHeight || 0) + 20) + 16);
  }, [activeIndex, backgroundRef?.current]);

  useEffect(() => {
    setShouldAnimate(true);
  }, []);

  return (
    <nav className={styles.navigation}>
      <div
        className={styles.activeBackground}
        ref={backgroundRef}
        style={{
          transform: `scale(${offsetHeight === 0 ? '0' : '1'}) translateY(${offsetHeight}px)`,
          transitionDuration: shouldAnimate ? '400ms' : '0s'
        }}
      />
      {NAV_ITEMS.map(({ icon: Icon, href, title }, index) => {
        const isActive = href === pathname;
        const classNames = cx(styles.navigationItem, {
          [styles.active]: isActive,
          [styles.shouldAnimate]: shouldAnimate
        });

        return (
          <NavLink className={classNames} key={href} href={href} onClick={() => setActiveIndex(index)}>
            <Icon />
          </NavLink>
        );
      })}
    </nav>
  );
};

const MemoizedNavigation = memo(Navigation);

export { MemoizedNavigation as Navigation };
