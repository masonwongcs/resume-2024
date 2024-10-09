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

  return (
    <nav className={styles.navigation}>
      {NAV_ITEMS.map(({ icon: Icon, href, title }, index) => {
        const isActive = href === pathname;
        const classNames = cx(styles.navigationItem, {
          [styles.active]: isActive
        });

        return (
          <NavLink className={classNames} key={href} href={href}>
            <Icon />
            <div className={styles.activeBackground} />
          </NavLink>
        );
      })}
    </nav>
  );
};

const MemoizedNavigation = memo(Navigation);

export { MemoizedNavigation as Navigation };
