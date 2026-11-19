import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bocado — calorias e macros',
    short_name: 'Bocado',
    description: 'Contagem de calorias e macronutrientes, por foto ou à mão.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#e6ebf4',
    theme_color: '#e6ebf4',
    lang: 'pt-BR',
    // Atalhos do ícone (Android, com o app instalado): abrem o cartão de confirmação; nada é registrado ao abrir
    shortcuts: [
      { name: 'Água 200 ml', short_name: 'Água', description: 'Registrar 200 ml de água', url: '/rapido/agua?ml=200', icons: [{ src: '/shortcuts/agua.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'Falar refeição', short_name: 'Falar', description: 'Descrever a refeição por voz', url: '/rapido/refeicao?modo=voz', icons: [{ src: '/shortcuts/voz.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'Registrar treino', short_name: 'Treino', description: 'Registrar um treino', url: '/rapido/treino', icons: [{ src: '/shortcuts/treino.png', sizes: '96x96', type: 'image/png' }] },
    ],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
