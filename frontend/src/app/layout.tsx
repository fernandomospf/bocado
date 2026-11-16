import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { HIDE_CALORIES_INLINE_SCRIPT } from '@/lib/kcal';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
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
