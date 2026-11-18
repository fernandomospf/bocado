'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe, useProfile } from '@/lib/hooks';
import { useHasActiveSupplements } from '@/lib/useSupplements';
import { Avatar } from './Avatar';
import { CapsuleIcon, ChartIcon, DropIcon, DumbbellIcon, PlusIcon, PotIcon, RingsIcon, ScaleIcon, UserIcon } from './Icons';
import { Logo } from './Logo';
import { useQuickSheets } from './QuickSheets';

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
  const { openWorkout, openWeight, openWater, openSupplements } = useQuickSheets();
  const { data: profile } = useProfile();
  const hasSupplements = useHasActiveSupplements();

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

      <div className="sidebar-quick">
        <button type="button" className="btn btn-glass btn-block" onClick={() => openWorkout()} title="Registrar treino (T)">
          <DumbbellIcon width={20} height={20} />
          Registrar treino
        </button>
        {profile?.waterEnabled !== false && (
          <button type="button" className="btn btn-glass btn-block" onClick={() => openWater()} title="Registrar água (W)">
            <DropIcon width={20} height={20} />
            Registrar água
          </button>
        )}
        <button type="button" className="btn btn-glass btn-block" onClick={openWeight}>
          <ScaleIcon width={20} height={20} />
          Registrar peso
        </button>
        {hasSupplements && (
          <button type="button" className="btn btn-glass btn-block" onClick={openSupplements}>
            <CapsuleIcon width={20} height={20} />
            Suplementos
          </button>
        )}
      </div>

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
