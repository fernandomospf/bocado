import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuickFast } from '@/components/QuickActions';

export const metadata: Metadata = { title: 'Jejum' };

export default function Page() {
  return (
    <Suspense>
      <QuickFast />
    </Suspense>
  );
}
