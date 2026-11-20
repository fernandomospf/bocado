import type { MetadataRoute } from 'next';

const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

/** Só a landing e as páginas legais são públicas para buscadores; o resto (API, admin, login, app) fica de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacidade', '/termos'],
        disallow: ['/api', '/admin', '/login', '/register', '/convite', '/onboarding', '/add', '/history', '/profile', '/recipes', '/landing', '/r/', '/relatorio'],
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
