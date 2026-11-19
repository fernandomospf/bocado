'use client';

import { useEffect, useState } from 'react';
import { useProfile } from '@/lib/hooks';
import {
  DEFAULTS_KEY,
  FAST_MAX_H,
  FAST_MIN_H,
  QUICK_PATHS,
  readDefaults,
  SHORTCUT_DEFAULTS,
  type ShortcutDefaults,
  WATER_MAX_ML,
  WATER_MIN_ML,
  WORKOUT_INTENSITY_PARAM,
  WORKOUT_MAX_MIN,
  WORKOUT_MIN_MIN,
  WORKOUT_TYPE_PARAM,
  type WorkoutIntensityParam,
  type WorkoutTypeParam,
} from '@/lib/quickActions';
import { INTENSITY_LABEL, WORKOUT_LABEL } from '@/lib/workouts';
import { useToast } from './Toast';

/**
 * Perfil > Atalhos: links prontos para a Siri (app Atalhos do iPhone) e para o ícone no Android, com os valores que a
 * pessoa escolher (ficam neste aparelho). Abrir o link só mostra um cartão de confirmação; nada é registrado sozinho.
 */
export function ShortcutsSection() {
  const toast = useToast();
  const { data: profile } = useProfile();
  const [d, setD] = useState<ShortcutDefaults>(SHORTCUT_DEFAULTS);
  const [origin, setOrigin] = useState('');
  const [text, setText] = useState({ waterMl: String(SHORTCUT_DEFAULTS.waterMl), workoutMin: String(SHORTCUT_DEFAULTS.workoutMin), fastHours: String(SHORTCUT_DEFAULTS.fastHours) });

  useEffect(() => {
    const saved = readDefaults(window.localStorage);
    setD(saved);
    setText({ waterMl: String(saved.waterMl), workoutMin: String(saved.workoutMin), fastHours: String(saved.fastHours) });
    setOrigin(window.location.origin);
  }, []);

  function save(next: ShortcutDefaults) {
    setD(next);
    try {
      window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
    } catch {
      // Sem armazenamento: os valores valem só nesta tela
    }
  }

  /** Campo numérico: só salva quando está dentro do limite; fora dele, o texto fica e o campo avisa. */
  function num(key: 'waterMl' | 'workoutMin' | 'fastHours', raw: string, min: number, max: number) {
    const clean = raw.replace(/\D/g, '').slice(0, 4);
    setText((t) => ({ ...t, [key]: clean }));
    const n = Number(clean);
    if (clean && Number.isInteger(n) && n >= min && n <= max) save({ ...d, [key]: n });
  }
  const bad = (raw: string, min: number, max: number) => !(Number.isInteger(Number(raw)) && raw !== '' && Number(raw) >= min && Number(raw) <= max);

  async function copy(path: string) {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      toast.show({ message: 'Link copiado' });
    } catch {
      toast.show({ message: 'Não foi possível copiar. Selecione o link e copie à mão.', tone: 'error' });
    }
  }

  if (!profile) return null;
  const items: { key: string; title: string; hint: string; path: string; show: boolean }[] = [
    { key: 'agua', title: 'Água', hint: 'Ex.: "Bebi água"', path: QUICK_PATHS.agua(d), show: profile.waterEnabled !== false },
    { key: 'treino', title: 'Treino', hint: 'Ex.: "Treinei"', path: QUICK_PATHS.treino(d), show: true },
    { key: 'peso', title: 'Peso', hint: 'Ex.: "Me pesei"', path: QUICK_PATHS.peso(), show: true },
    { key: 'voz', title: 'Falar refeição', hint: 'Ex.: "Anotar refeição"', path: QUICK_PATHS.refeicaoVoz(), show: true },
    { key: 'foto', title: 'Foto da refeição', hint: 'Ex.: "Foto do prato"', path: QUICK_PATHS.refeicaoFoto(), show: true },
    { key: 'busca', title: 'Buscar alimento', hint: 'Ex.: "Buscar alimento"', path: QUICK_PATHS.refeicaoBusca(), show: true },
    { key: 'jejum', title: 'Jejum', hint: 'Ex.: "Iniciar jejum"', path: QUICK_PATHS.jejum(d), show: !!profile.fastingEnabled },
  ];

  return (
    <div className="screen-group profile-o4" id="atalhos">
      <h2 className="section-title">Atalhos</h2>
      <section className="card glass stack-lg">
        <p className="body-2">
          Abra uma ação do Bocado com um toque ou com a voz. O link só mostra um cartão de confirmação: nada é registrado até você
          tocar em &ldquo;Registrar&rdquo;.
        </p>

        <div className="stack">
          <h3 className="headline">Valores padrão</h3>
          <label className="field">
            <span className="field-label">Água (ml)</span>
            <div className="input-suffix">
              <input className="input num" inputMode="numeric" value={text.waterMl} aria-invalid={bad(text.waterMl, WATER_MIN_ML, WATER_MAX_ML)} aria-describedby="sc-water-help" onChange={(e) => num('waterMl', e.target.value, WATER_MIN_ML, WATER_MAX_ML)} />
              <span>ml</span>
            </div>
            <span className="caption" id="sc-water-help">
              De {WATER_MIN_ML} a {WATER_MAX_ML} ml.
            </span>
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Treino: tipo</span>
              <select className="input" value={d.workoutType} onChange={(e) => save({ ...d, workoutType: e.target.value as WorkoutTypeParam })}>
                {(Object.keys(WORKOUT_TYPE_PARAM) as WorkoutTypeParam[]).map((t) => (
                  <option key={t} value={t}>
                    {WORKOUT_LABEL[WORKOUT_TYPE_PARAM[t]]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Treino: intensidade</span>
              <select className="input" value={d.workoutInt} onChange={(e) => save({ ...d, workoutInt: e.target.value as WorkoutIntensityParam })}>
                {(Object.keys(WORKOUT_INTENSITY_PARAM) as WorkoutIntensityParam[]).map((i) => (
                  <option key={i} value={i}>
                    {INTENSITY_LABEL[WORKOUT_INTENSITY_PARAM[i]]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">Treino: duração (min)</span>
            <div className="input-suffix">
              <input className="input num" inputMode="numeric" value={text.workoutMin} aria-invalid={bad(text.workoutMin, WORKOUT_MIN_MIN, WORKOUT_MAX_MIN)} aria-describedby="sc-min-help" onChange={(e) => num('workoutMin', e.target.value, WORKOUT_MIN_MIN, WORKOUT_MAX_MIN)} />
              <span>min</span>
            </div>
            <span className="caption" id="sc-min-help">
              De {WORKOUT_MIN_MIN} a {WORKOUT_MAX_MIN} minutos.
            </span>
          </label>
          {profile.fastingEnabled && (
            <label className="field">
              <span className="field-label">Jejum (horas)</span>
              <div className="input-suffix">
                <input className="input num" inputMode="numeric" value={text.fastHours} aria-invalid={bad(text.fastHours, FAST_MIN_H, FAST_MAX_H)} aria-describedby="sc-fast-help" onChange={(e) => num('fastHours', e.target.value, FAST_MIN_H, FAST_MAX_H)} />
                <span>h</span>
              </div>
              <span className="caption" id="sc-fast-help">
                De {FAST_MIN_H} a {FAST_MAX_H} horas.
              </span>
            </label>
          )}
          <p className="caption">Esses valores ficam neste aparelho e entram nos links abaixo.</p>
        </div>

        <ul className="list" aria-label="Links dos atalhos">
          {items
            .filter((i) => i.show)
            .map((i) => (
              <li key={i.key} className="list-row shortcut-row">
                <span className="list-row-main">
                  <span className="list-row-title">{i.title}</span>
                  <span className="list-row-sub">{i.hint}</span>
                  <code className="shortcut-link">
                    {origin}
                    {i.path}
                  </code>
                </span>
                <button type="button" className="btn btn-glass btn-sm" onClick={() => void copy(i.path)} aria-label={`Copiar o link de ${i.title}`}>
                  Copiar
                </button>
              </li>
            ))}
        </ul>

        <div className="stack">
          <h3 className="headline">Como usar</h3>
          <details className="adaptive-how">
            <summary>iPhone: com a Siri</summary>
            <ol className="stack-sm import-steps" style={{ marginTop: 8 }}>
              <li>Copie o link do atalho que você quer.</li>
              <li>Abra o app Atalhos, toque em + (Novo atalho) e escolha a ação &ldquo;Abrir URLs&rdquo;.</li>
              <li>Cole o link e dê um nome, por exemplo &ldquo;Bebi água&rdquo;.</li>
              <li>Diga &ldquo;E aí Siri, bebi água&rdquo;. O Bocado abre com o cartão de confirmação.</li>
            </ol>
          </details>
          <details className="adaptive-how">
            <summary>Android: ícone na tela inicial</summary>
            <p className="caption" style={{ marginTop: 8 }}>
              Com o Bocado instalado, mantenha o ícone pressionado na tela inicial: aparecem os atalhos Água 200 ml, Falar refeição e
              Registrar treino.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
