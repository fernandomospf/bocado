import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { HIDE_CALORIES_INLINE_SCRIPT } from '@/lib/kcal';
import { Providers } from '@/components/Providers';
import './globals.css';

// URL pública (build arg NEXT_PUBLIC_APP_URL): torna absolutos os links do Open Graph. Sem ela, vale o padrão local
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: { default: 'Bocado', template: '%s · Bocado' },
  description: 'Contagem de calorias e macronutrientes, por foto ou à mão.',
  applicationName: 'Bocado',
  appleWebApp: { capable: true, title: 'Bocado', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e6ebf4' },
    { media: '(prefers-color-scheme: dark)', color: '#060a14' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: o script abaixo põe data-hide-calories no <html> antes da hidratação
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HIDE_CALORIES_INLINE_SCRIPT }} />
      </head>
      <body>
        <div className="backdrop" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
