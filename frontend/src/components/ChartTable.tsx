import type { ReactNode } from 'react';

/**
 * Alternativa em tabela de um gráfico ("Ver em tabela"): os mesmos números, para leitor de tela, zoom e quem prefere ler a
 * ver. Fechada por padrão; a região rolável é focável pelo teclado.
 */
export function ChartTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <details className="chart-table">
      <summary>Ver em tabela</summary>
      <div className="chart-table-scroll" role="region" aria-label={caption} tabIndex={0}>
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className="num">{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
