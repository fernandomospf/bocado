'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusIcon } from './Icons';
import { isActive, NAV_ITEMS } from './Sidebar';

/** Barra de abas flutuante do celular e do tablet. O CSS a esconde a partir de 1100px (lá aparece a Sidebar). */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-pill glass">
        {NAV_ITEMS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="tab" aria-current={isActive(pathname, href) ? 'page' : undefined}>
            <Icon />
            {label}
          </Link>
        ))}
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
