'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '@/lib/hooks';
import { Avatar } from './Avatar';
import { ChartIcon, PlusIcon, PotIcon, RingsIcon, UserIcon } from './Icons';
import { Logo } from './Logo';

/** Abas da TabBar e itens da Sidebar (mesma ordem nos dois). */
export const NAV_ITEMS = [
  { href: '/', label: 'Hoje', Icon: RingsIcon },
  { href: '/history', label: 'Histórico', Icon: ChartIcon },
  { href: '/recipes', label: 'Receitas', Icon: PotIcon },
  { href: '/profile', label: 'Perfil', Icon: UserIcon },
];

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

/** Navegação lateral do desktop. Sempre renderizada; o CSS só a mostra a partir de 1100px. */
export function Sidebar() {
  const pathname = usePathname();
  const { data: me } = useMe();

  return (
    <aside className="sidebar glass" aria-label="Navegação lateral">
      <Link href="/" className="sidebar-brand">
        <Logo size={34} />
        <span className="title">Bocado</span>
      </Link>

      <Link
        href="/add"
        className="btn btn-primary btn-block"
        aria-current={pathname.startsWith('/add') ? 'page' : undefined}
        title="Nova refeição (N)"
      >
        <PlusIcon width={20} height={20} />
        Nova refeição
      </Link>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        {NAV_ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="sidebar-link"
            aria-current={isActive(pathname, href) ? 'page' : undefined}
          >
            <Icon width={22} height={22} />
            {label}
          </Link>
        ))}
      </nav>

      {me && (
        <Link href="/profile" className="sidebar-user">
          <Avatar name={me.name} url={me.avatarUrl} />
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{me.name}</span>
            <span className="caption sidebar-user-email">{me.email}</span>
          </span>
        </Link>
      )}
    </aside>
  );
}
