'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { useLastWorkout, useProfile } from '@/lib/hooks';
import { useWorkoutActions } from '@/lib/useWorkouts';
import { workoutSummary } from '@/lib/workouts';
import { useHasActiveSupplements } from '@/lib/useSupplements';
import { useSpeechSupported } from '@/lib/speech';
import { CapsuleIcon, DropIcon, DumbbellIcon, HourglassIcon, MicIcon, PlusIcon, PotIcon, RepeatIcon, ScaleIcon } from './Icons';
import { useQuickSheets } from './QuickSheets';

/**
 * O "+" da TabBar: abre um menu de ações rápidas (refeição, treino, peso). Fecha por toque fora, Esc, escolha de um
 * item ou novo toque no botão, e devolve o foco ao "+". Setas movem o foco entre os itens.
 */
export function QuickAddMenu() {
  const pathname = usePathname();
  const { openWorkout, openWeight, openWater, openSupplements, openFasting, defaultDate } = useQuickSheets();
  const hasSupplements = useHasActiveSupplements();
  const canSpeak = useSpeechSupported();
  const { data: profile } = useProfile();
  const { data: last } = useLastWorkout();
  const { repeat } = useWorkoutActions();
  const [open, setOpen] = useState(false);
  // Dia usado pelo item "Refeição": o da Hoje, se for o caso; calculado ao abrir
  const [mealHref, setMealHref] = useState('/add');
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function toggle() {
    tap();
    if (open) return close();
    const date = defaultDate();
    setMealHref(date === todayISO() ? '/add' : `/add?date=${date}`);
    setOpen(true);
  }

  // Foco inicial no item principal (Refeição)
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  // Toque fora e Esc (o toque em outra aba navega normalmente e só fecha o menu)
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Navegou para outra rota: o menu não fica aberto
  useEffect(() => setOpen(false), [pathname]);

  function onMenuKey(e: KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'Home') list[0]?.focus();
    else if (e.key === 'End') list.at(-1)?.focus();
    else if (e.key === 'Tab') return close(false);
    else return;
    e.preventDefault();
  }

  const choose = (action?: () => void) => {
    tap();
    close(false);
    action?.();
  };

  return (
    <div className="tabbar-action-wrap" ref={wrap}>
      {open && (
        <div ref={menu} className="quick-menu glass" role="menu" aria-label="Adicionar" onKeyDown={onMenuKey}>
          <Link href={mealHref} role="menuitem" className="quick-item quick-item-primary" onClick={() => choose()}>
            <span className="quick-icon">
              <PotIcon width={22} height={22} />
            </span>
            <span className="quick-text">
              <strong>Refeição</strong>
              <span className="caption">Buscar, fotografar ou descrever</span>
            </span>
          </Link>

          {/* Só existe se o navegador reconhece voz; abre a Nova refeição em Descrever, já ouvindo */}
          {canSpeak && (
            <Link
              href={`${mealHref}${mealHref.includes('?') ? '&' : '?'}voice=1`}
              role="menuitem"
              className="quick-item"
              onClick={() => choose()}
            >
              <span className="quick-icon">
                <MicIcon width={22} height={22} />
              </span>
              <span className="quick-text">
                <strong>Falar refeição</strong>
                <span className="caption">Diga o que você comeu</span>
              </span>
            </Link>
          )}

          <button type="button" role="menuitem" className="quick-item" onClick={() => choose(() => openWorkout())}>
            <span className="quick-icon">
              <DumbbellIcon width={22} height={22} />
            </span>
            <span className="quick-text">
              <strong>Treino</strong>
              <span className="caption">Tipo, duração e intensidade</span>
            </span>
          </button>
          {last && (
            <button
              type="button"
              role="menuitem"
              className="quick-sub"
              onClick={() => choose(() => void repeat(last.id, todayISO()))}
            >
              <RepeatIcon width={16} height={16} />
              Repetir último · {workoutSummary(last).replace(', ', ' ')}
            </button>
          )}

          {/* Contador de água: não aparece se a pessoa o desligou nas preferências */}
          {profile?.waterEnabled !== false && (
            <button type="button" role="menuitem" className="quick-item" onClick={() => choose(() => openWater())}>
              <span className="quick-icon">
                <DropIcon width={22} height={22} />
              </span>
              <span className="quick-text">
                <strong>Água</strong>
                <span className="caption">Registrar um copo ou uma garrafa</span>
              </span>
            </button>
          )}

          {/* Dado sensível: o atalho só existe com o módulo ativo e ao menos um item cadastrado */}
          {hasSupplements && (
            <button type="button" role="menuitem" className="quick-item" onClick={() => choose(openSupplements)}>
              <span className="quick-icon">
                <CapsuleIcon width={22} height={22} />
              </span>
              <span className="quick-text">
                <strong>Suplementos</strong>
                <span className="caption">Registrar o que você toma hoje</span>
              </span>
            </button>
          )}

          {/* Jejum: só com a preferência ligada (menores de 18 anos não conseguem ligá-la) */}
          {profile?.fastingEnabled && (
            <button type="button" role="menuitem" className="quick-item" onClick={() => choose(openFasting)}>
              <span className="quick-icon">
                <HourglassIcon width={22} height={22} />
              </span>
              <span className="quick-text">
                <strong>Jejum</strong>
                <span className="caption">Iniciar ou ver sua janela</span>
              </span>
            </button>
          )}

          <button type="button" role="menuitem" className="quick-item" onClick={() => choose(openWeight)}>
            <span className="quick-icon">
              <ScaleIcon width={22} height={22} />
            </span>
            <span className="quick-text">
              <strong>Peso</strong>
              <span className="caption">Registrar a pesagem de hoje</span>
            </span>
          </button>
        </div>
      )}

      <button
        ref={button}
        type="button"
        className="tabbar-action glass"
        aria-label="Adicionar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={pathname.startsWith('/add') ? 'page' : undefined}
        data-open={open || undefined}
        onClick={toggle}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
