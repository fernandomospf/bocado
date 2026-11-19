import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { MacroDots, MacroLegend } from '@/components/MacroLegend';
import { Rings } from '@/components/Rings';
import { ringSpecs } from '@/components/ringSpecs';
import { BarcodeIcon, CameraIcon, ChartIcon, KitchenScaleIcon, MicIcon, PotIcon, RingsIcon, UserIcon, VerifiedIcon } from '@/components/Icons';
import { WaitlistForm } from '@/components/landing/WaitlistForm';

const TITLE = 'Bocado: contagem de calorias para a comida brasileira';
const DESCRIPTION =
  'Registre refeições por foto, descrição ou código de barras. Tabela TACO, receitas caseiras e divisão com quem mora com você. Beta fechado, por convite.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website', locale: 'pt_BR', siteName: 'Bocado' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  // A resposta de "/" é esta mesma página: nada de noindex aqui
};

// Dados fictícios fixos da demonstração (os componentes são os reais do app)
const DEMO_TARGETS = { kcal: 2100, protein: 140, carbs: 240, fat: 70 };
const DEMO_TOTALS = { kcal: 1380, protein: 96, carbs: 168, fat: 41 };
const DEMO_MEALS = [
  {
    title: 'Almoço',
    kcal: 720,
    items: [
      { name: 'Arroz branco', grams: 150, kcal: 190, m: { protein: 4, carbs: 42, fat: 0 } },
      { name: 'Feijão carioca', grams: 120, kcal: 92, m: { protein: 6, carbs: 17, fat: 0 } },
      { name: 'Frango grelhado', grams: 130, kcal: 214, m: { protein: 40, carbs: 0, fat: 5 } },
    ],
  },
  {
    title: 'Café da manhã',
    kcal: 340,
    items: [
      { name: 'Pão francês', grams: 50, kcal: 150, m: { protein: 5, carbs: 29, fat: 2 } },
      { name: 'Ovo mexido', grams: 100, kcal: 190, m: { protein: 13, carbs: 1, fat: 15 } },
    ],
  },
];

const STEPS = [
  { Icon: CameraIcon, title: 'Registre como for mais fácil', text: 'Foto, descrição, código de barras ou busca. Escolha o que estiver mais à mão.' },
  { Icon: RingsIcon, title: 'Veja o dia num relance', text: 'Anéis de energia e macros mostram onde você está, sem planilha.' },
  { Icon: ChartIcon, title: 'Ajuste com calma', text: 'Uma meta que acompanha o seu peso e relatórios semanais, no seu ritmo.' },
];

const BRAZIL = [
  { Icon: BarcodeIcon, title: 'Tabela TACO integrada', text: 'Arroz, feijão, mandioca e o resto do prato brasileiro, com valores de referência.' },
  { Icon: PotIcon, title: 'Receitas caseiras', text: 'Cadastre uma vez, com o peso da panela e as porções, e registre em segundos.' },
  { Icon: UserIcon, title: 'Divisão com quem mora com você', text: 'Divida uma refeição sem que ninguém veja o diário do outro.' },
  { Icon: MicIcon, title: 'Registro por voz', text: 'Diga o que você comeu e revise o texto antes de estimar. O áudio fica com o seu aparelho; só o texto chega ao Bocado.' },
  { Icon: KitchenScaleIcon, title: 'Prato por quilo', text: 'Fotografe o prato e informe o peso da balança: as gramas dos itens sempre somam o total.' },
  { Icon: VerifiedIcon, title: 'Acervo verificado', text: 'Produtos do acervo ganham o selo Verificado quando mais de uma pessoa confere que os valores batem com o rótulo.' },
  { Icon: RingsIcon, title: 'Modo sem calorias', text: 'Acompanhe só proteína e constância, se preferir não ver os números.' },
];

const CONTRACT = [
  'Sem anúncios. Nunca.',
  'O básico é grátis para sempre: registrar refeições, buscar alimentos, ler código de barras e ver seu histórico.',
  'Nenhuma função que você já usa será retirada nem passará a ser paga.',
  'Se um dia houver plano pago, será só para recursos com custo real de IA, com preço claro antes de qualquer cobrança e cancelamento simples.',
  'Seus dados são seus: exporte refeições, peso e treinos em CSV e exclua a conta quando quiser. Não vendemos dados.',
  'Sem culpa: o Bocado não julga o que você come, e você pode até esconder as calorias.',
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Preciso pagar?',
    a: (
      <>
        O básico é grátis para sempre e nenhuma função que você já usa será retirada nem passará a ser paga. Se um dia
        houver plano pago, será só para recursos com custo real de IA, com preço claro antes de qualquer cobrança e
        cancelamento simples. Veja o contrato do Bocado acima.
      </>
    ),
  },
  {
    q: 'Funciona no iPhone e no Android?',
    a: (
      <>
        Sim. O Bocado é um app web: abre no navegador e, no celular, dá para instalar como app com &ldquo;Adicionar à tela
        inicial&rdquo;.
        <ul className="lp-steps">
          <li>
            <strong>iPhone (Safari):</strong> toque em Compartilhar e depois em &ldquo;Adicionar à Tela de Início&rdquo;.
          </li>
          <li>
            <strong>Android (Chrome):</strong> abra o menu (três pontinhos) e toque em &ldquo;Instalar app&rdquo; ou
            &ldquo;Adicionar à tela inicial&rdquo;.
          </li>
        </ul>
      </>
    ),
  },
  {
    q: 'O que acontece com minhas fotos?',
    a: (
      <>
        A foto é enviada à API da Anthropic (Claude) só para estimar os alimentos. O Bocado não armazena as fotos: elas ficam
        só na memória durante a análise e são descartadas. Só é salvo o que você confirmar. Detalhes na{' '}
        <Link href="/privacidade" className="text-link">
          Política de Privacidade
        </Link>
        .
      </>
    ),
  },
  { q: 'Posso apagar tudo?', a: <>Pode. No Perfil você exporta seus dados em CSV e exclui a conta quando quiser; a exclusão apaga seus dados de forma definitiva.</> },
  { q: 'Isso substitui um nutricionista?', a: <>Não. As estimativas são aproximadas.</> },
  {
    q: 'Por que um beta por convite?',
    a: <>Para crescer devagar, ouvir as pessoas e manter o app estável.</>,
  },
];

export default function LandingPage() {
  const year = new Date().getFullYear();
  return (
    <div className="lp">
      {/* A resposta de "/" é esta página: o canônico aponta para a raiz */}
      <link rel="canonical" href="/" />

      <header className="lp-header">
        <Link href="/" className="lp-brand" aria-label="Bocado">
          <Logo size={34} />
          <span className="title">Bocado</span>
        </Link>
        <nav className="lp-nav" aria-label="Acesso">
          <Link href="/login" className="btn btn-plain lp-btn">
            Entrar
          </Link>
          <Link href="/register" className="btn btn-primary lp-btn">
            Tenho um convite
          </Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero lp-wrap" aria-labelledby="lp-title">
          <div className="lp-hero-text stack-lg">
            <span className="badge lp-badge">Beta fechado</span>
            <h1 className="lp-h1" id="lp-title">
              Contar calorias sem complicar, do jeito que a gente come no Brasil.
            </h1>
            <p className="lp-lead">
              Tire uma foto, descreva a refeição ou leia o código de barras. O Bocado conhece arroz, feijão e a comida que você
              faz em casa.
            </p>
            <div className="lp-cta">
              <a href="#lista-de-espera" className="btn btn-primary lp-btn-lg">
                Entrar na lista de espera
              </a>
              <Link href="/register" className="btn btn-glass lp-btn-lg">
                Tenho um convite
              </Link>
            </div>
          </div>

          <div className="lp-demo" role="img" aria-label="Exemplo da tela Hoje do Bocado, com dados fictícios">
            <span className="badge lp-demo-tag">Exemplo</span>
            <div className="card glass lp-demo-rings" aria-hidden>
              <div className="rings-card">
                <Rings rings={ringSpecs(DEMO_TOTALS, DEMO_TARGETS)} size={212} stroke={20} gap={5} />
                <MacroLegend totals={DEMO_TOTALS} targets={DEMO_TARGETS} />
              </div>
            </div>
            {DEMO_MEALS.map((meal) => (
              <div key={meal.title} className="card glass lp-demo-meal" aria-hidden>
                <div className="meal-head">
                  <p className="headline">{meal.title}</p>
                  <span className="list-row-end">{meal.kcal} kcal</span>
                </div>
                <div className="list">
                  {meal.items.map((i) => (
                    <div key={i.name} className="list-row">
                      <span className="list-row-main">
                        <span className="list-row-title" style={{ display: 'block' }}>
                          {i.name}
                        </span>
                        <span className="list-row-sub">
                          <span style={{ marginRight: 10 }}>{i.grams} g</span>
                          <MacroDots m={i.m} />
                        </span>
                      </span>
                      <span className="list-row-end">{i.kcal}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section lp-wrap" aria-labelledby="como-funciona">
          <h2 className="lp-h2" id="como-funciona">
            Como funciona
          </h2>
          <ol className="lp-grid lp-grid-3">
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title} className="card glass lp-card">
                <span className="lp-icon" aria-hidden>
                  <Icon width={26} height={26} />
                </span>
                <h3 className="headline">
                  <span className="lp-step-n">{i + 1}.</span> {title}
                </h3>
                <p className="body-2">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-wrap" aria-labelledby="comida-brasileira">
          <h2 className="lp-h2" id="comida-brasileira">
            Feito para a comida brasileira
          </h2>
          <ul className="lp-grid lp-grid-2">
            {BRAZIL.map(({ Icon, title, text }) => (
              <li key={title} className="card glass lp-card">
                <span className="lp-icon" aria-hidden>
                  <Icon width={26} height={26} />
                </span>
                <h3 className="headline">{title}</h3>
                <p className="body-2">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-wrap" aria-labelledby="contrato">
          <div className="card glass lp-contract">
            <h2 className="lp-h2" id="contrato">
              O contrato do Bocado
            </h2>
            <ul className="lp-contract-list">
              {CONTRACT.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="caption lp-contract-foot">Escrito pelo Fernando, que desenvolve e mantém o Bocado.</p>
          </div>
        </section>

        <section className="lp-section lp-wrap lp-narrow" aria-labelledby="faq">
          <h2 className="lp-h2" id="faq">
            Perguntas frequentes
          </h2>
          <div className="stack">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="card glass lp-faq">
                <summary>{q}</summary>
                <div className="lp-faq-body body-2">{a}</div>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-section lp-wrap lp-narrow" id="lista-de-espera" aria-labelledby="lista">
          <h2 className="lp-h2" id="lista">
            Lista de espera
          </h2>
          <p className="lp-lead">O Bocado está em beta fechado. Deixe seu e-mail e avisamos quando abrir uma vaga.</p>
          <WaitlistForm />
        </section>
      </main>

      <footer className="lp-footer lp-wrap">
        <nav className="lp-footer-links" aria-label="Rodapé">
          <Link href="/privacidade">Política de Privacidade</Link>
          <Link href="/termos">Termos de Uso</Link>
          <a href="mailto:fernandomosp@gmail.com">fernandomosp@gmail.com</a>
        </nav>
        <p className="caption">© {year} Bocado</p>
        <p className="caption">As estimativas do Bocado são aproximadas e não substituem orientação de nutricionista ou médico.</p>
      </footer>
    </div>
  );
}
