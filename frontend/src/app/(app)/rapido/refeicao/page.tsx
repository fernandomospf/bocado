import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuickMeal } from '@/components/QuickActions';

export const metadata: Metadata = { title: 'Nova refeição' };

export default function Page() {
  return (
    <Suspense>
      <QuickMeal />
    </Suspense>
  );
}
