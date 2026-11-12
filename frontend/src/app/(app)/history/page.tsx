import type { Metadata } from 'next';
import { HistoryView } from '@/components/HistoryView';

export const metadata: Metadata = { title: 'Histórico' };

export default function HistoryPage() {
  return <HistoryView />;
}
