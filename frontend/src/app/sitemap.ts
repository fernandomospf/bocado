import type { MetadataRoute } from 'next';

const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/privacidade', '/termos'].map((path) => ({ url: `${base}${path}` }));
}
