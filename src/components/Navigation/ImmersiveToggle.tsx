'use client';

import styles from '@/components/Navigation/Navigation.module.scss';

import cx from 'classnames';
import { usePathname } from 'next/navigation';

import MagicIcon from '@/icon/magic.svg';
import { useHomeStore } from '@/store';

const ImmersiveToggle = () => {
  const pathname = usePathname() || '/';
  const isHome = pathname === '/';
  const immersiveModeOn = useHomeStore((state) => state.immersiveModeOn);
  const setImmersiveModeOn = useHomeStore((state) => state.setImmersiveModeOn);

  return (
    <button
      className={cx(styles.immersiveToggle, {
        [styles.active]: immersiveModeOn,
        [styles.isHome]: isHome
      })}
      onClick={() => setImmersiveModeOn(!immersiveModeOn)}
    >
      <MagicIcon />
    </button>
  );
};

export { ImmersiveToggle };
