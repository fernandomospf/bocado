import type { Metadata } from 'next';
import { PublicReport } from '@/components/PublicReport';

// Página privada: fora dos buscadores e sem enviar o endereço (que contém o token) a outros sites
export const metadata: Metadata = {
  title: 'Relatório de alimentação',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicReport token={token} />;
}
