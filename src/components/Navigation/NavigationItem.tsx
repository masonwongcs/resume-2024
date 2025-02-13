'use client';

import styles from '@/components/Navigation/Navigation.module.scss';

import { FC } from 'react';

import cx from 'classnames';
import { usePathname } from 'next/navigation';

import { NavLink } from '@/components/NavLink';

interface NavigationItemProps {
  icon: React.ReactNode;
  href: string;
}

const NavigationItem: FC<NavigationItemProps> = ({ icon, href }) => {
  const pathname = usePathname() || '/';
  const isHome = pathname === '/';

  const isActive = href === pathname;
  const classNames = cx(styles.navigationItem, {
    [styles.active]: isActive
  });
  return (
    <NavLink className={classNames} key={href} href={href}>
      {icon}
      <div className={styles.activeBackground} />
    </NavLink>
  );
};

export { NavigationItem };
