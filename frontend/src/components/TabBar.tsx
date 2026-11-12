'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartIcon, PlusIcon, RingsIcon, UserIcon } from './Icons';

const TABS = [
  { href: '/', label: 'Hoje', Icon: RingsIcon },
  { href: '/history', label: 'Histórico', Icon: ChartIcon },
  { href: '/profile', label: 'Perfil', Icon: UserIcon },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-pill glass">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="tab" aria-current={active ? 'page' : undefined}>
              <Icon />
              {label}
            </Link>
          );
        })}
      </div>
      <Link
        href="/add"
        className="tabbar-action glass"
        aria-label="Adicionar refeição"
        aria-current={pathname.startsWith('/add') ? 'page' : undefined}
      >
        <PlusIcon />
      </Link>
    </nav>
  );
}
