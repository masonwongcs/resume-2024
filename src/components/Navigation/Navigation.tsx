'use client';

import styles from './Navigation.module.scss';

import { memo, useLayoutEffect, useRef, useState } from 'react';

import cx from 'classnames';
import { usePathname } from 'next/navigation';

import { NavLink } from '@/components/NavLink';

import HomeIcon from '../../../public/images/navigation/home.svg';
import InfoIcon from '../../../public/images/navigation/info.svg';
import WorkIcon from '../../../public/images/navigation/work.svg';

const NAV_ITEMS = [
  { icon: HomeIcon, title: 'Home', href: '/' },
  { icon: WorkIcon, title: 'Work', href: '/work' },
  { icon: InfoIcon, title: 'Info', href: '/info' }
];

const Navigation = () => {
  const pathname = usePathname() || '/';
  const [activeIndex, setActiveIndex] = useState(NAV_ITEMS.findIndex((item) => item.href === pathname));
  const [offsetHeight, setOffsetHeight] = useState(0);
  const backgroundRef = useRef<HTMLDivElement | null>(null); // Specify the type here

  useLayoutEffect(() => {
    const index = NAV_ITEMS.findIndex((item) => item.href === pathname);
    setActiveIndex(index);
  }, [pathname]);

  useLayoutEffect(() => {
    setOffsetHeight(activeIndex * ((backgroundRef?.current?.offsetHeight || 0) + 20) + 16);
  }, [activeIndex, backgroundRef?.current]);

  return (
    <nav className={styles.navigation}>
      <div
        className={styles.activeBackground}
        ref={backgroundRef}
        style={{
          transform: `scale(${offsetHeight === 0 ? '0' : '1'}) translateY(${offsetHeight}px)`
        }}
      />
      {NAV_ITEMS.map(({ icon: Icon, href, title }, index) => {
        const isActive = href === pathname;
        const classNames = cx(styles.navigationItem, {
          [styles.active]: isActive
        });

        return (
          <NavLink className={classNames} key={href} href={href}>
            <Icon />
          </NavLink>
        );
      })}
    </nav>
  );
};

const MemoizedNavigation = memo(Navigation);

export { MemoizedNavigation as Navigation };
