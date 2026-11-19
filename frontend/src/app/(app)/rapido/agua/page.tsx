import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuickWater } from '@/components/QuickActions';

export const metadata: Metadata = { title: 'Água' };

export default function Page() {
  return (
    <Suspense>
      <QuickWater />
    </Suspense>
  );
}
