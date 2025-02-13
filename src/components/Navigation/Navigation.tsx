'use client';

import styles from './Navigation.module.scss';

import { memo } from 'react';

import cx from 'classnames';

import HomeIcon from '@/icon/home.svg';
import InfoIcon from '@/icon/info.svg';
import MagicIcon from '@/icon/magic.svg';
import WorkIcon from '@/icon/work.svg';
import { useHomeStore } from '@/store';

import { ImmersiveToggle } from './ImmersiveToggle';
import { NavigationItem } from './NavigationItem';

const NAV_ITEMS = [
  { icon: HomeIcon, title: 'Home', href: '/' },
  { icon: WorkIcon, title: 'Work', href: '/work' },
  { icon: InfoIcon, title: 'Info', href: '/info' }
];

const Navigation = () => {
  const immersiveModeOn = useHomeStore((state) => state.immersiveModeOn);

  return (
    <>
      <nav
        className={cx(styles.navigation, {
          [styles.hide]: immersiveModeOn
        })}
      >
        {NAV_ITEMS.map(({ icon: Icon, href, title }, index) => (
          <NavigationItem key={href} icon={<Icon />} href={href} />
        ))}
      </nav>
      <ImmersiveToggle />
    </>
  );
};

const MemoizedNavigation = memo(Navigation);

export { MemoizedNavigation as Navigation };
