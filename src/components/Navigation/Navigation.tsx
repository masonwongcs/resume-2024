import styles from './Navigation.module.scss';

import { memo } from 'react';

import HomeIcon from '@/icon/home.svg';
import InfoIcon from '@/icon/info.svg';
import MagicIcon from '@/icon/magic.svg';
import WorkIcon from '@/icon/work.svg';

import { ImmersiveToggle } from './ImmersiveToggle';
import { NavigationItem } from './NavigationItem';

const NAV_ITEMS = [
  { icon: HomeIcon, title: 'Home', href: '/' },
  { icon: WorkIcon, title: 'Work', href: '/work' },
  { icon: InfoIcon, title: 'Info', href: '/info' }
];

const Navigation = () => {
  return (
    <>
      <nav className={styles.navigation}>
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
