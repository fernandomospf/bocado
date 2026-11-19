import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuickWeight } from '@/components/QuickActions';

export const metadata: Metadata = { title: 'Registrar peso' };

export default function Page() {
  return (
    <Suspense>
      <QuickWeight />
    </Suspense>
  );
}
