import type { NextConfig } from 'next';

// URL interna da API (rede do Docker). Lida no build: as rewrites ficam gravadas no manifesto.
const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // A análise por IA pode levar alguns segundos
    proxyTimeout: 90_000,
  },
  // Mesmo domínio para web e API: cookies httpOnly funcionam sem CORS
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      // "/" muda conforme o cookie de sessão (landing x Hoje): nunca cacheável de forma compartilhada
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache' },
          { key: 'Vary', value: 'Cookie' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
