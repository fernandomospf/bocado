import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SupplementsView } from '@/components/SupplementsView';

export const metadata: Metadata = { title: 'Suplementos e medicações', robots: { index: false, follow: false } };

export default function SupplementsPage() {
  return (
    <Suspense>
      <SupplementsView />
    </Suspense>
  );
}
