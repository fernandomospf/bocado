import type { Metadata } from 'next';
import { InviteView } from '@/components/InviteView';

// O código nunca aparece em índice de busca nem vai em Referer para terceiros
export const metadata: Metadata = {
  title: 'Convite para a casa',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InviteView rawCode={code} />;
}
