'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  children: React.ReactNode;
  href: string;
  activeClassName?: string;
  nonActiveClassName?: string;
  className?: string;
  [rest: string]: any; // For additional props
}

const NavLink: React.FC<NavLinkProps> = ({
  children,
  href,
  activeClassName = 'active',
  nonActiveClassName = 'inactive',
  className = '',
  ...rest
}) => {
  const pathname = usePathname();
  const isActive = pathname.endsWith(href) || (href.includes(pathname) && pathname !== '/');
  const newClassName = `${isActive ? activeClassName : nonActiveClassName} ${className}`.trim();

  return (
    <Link href={href} className={newClassName} {...rest}>
      {children}
    </Link>
  );
};

export { NavLink };
