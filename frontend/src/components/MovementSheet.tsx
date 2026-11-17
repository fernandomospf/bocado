'use client';

import { fmtInt } from '@/lib/format';
import { useMovementWeek } from '@/lib/hooks';
import { dayMonth } from '@/lib/date';
import { Sheet } from './Sheet';

/** Folha "Movimento da semana". Versão inicial (resumo); a Etapa 3 completa com barras, lista e ajustes. */
export function MovementSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: week } = useMovementWeek(date);

  return (
    <Sheet open title="Movimento da semana" onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">Movimento da semana</h2>
          {week && (
            <p className="caption">
              {dayMonth(week.weekStart)} a {dayMonth(week.weekEnd)}
            </p>
          )}
        </div>
        {week ? (
          <>
            <p className="headline num">
              {week.goalMin !== null ? `${fmtInt(week.doneMin)} de ${fmtInt(week.goalMin)} min` : `${fmtInt(week.doneMin)} min`}
            </p>
            {week.goalMin !== null && (
              <p className="body-2">{week.reached ? 'Meta da semana batida' : `Faltam ${fmtInt(week.remainingMin ?? 0)} min`}</p>
            )}
            <p className="caption">Dias de descanso também contam: o corpo precisa deles.</p>
          </>
        ) : (
          <div className="skeleton" style={{ height: 80 }} />
        )}
      </div>
    </Sheet>
  );
}
