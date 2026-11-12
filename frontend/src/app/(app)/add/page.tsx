import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AddMealView } from '@/components/AddMealView';

export const metadata: Metadata = { title: 'Nova refeição' };

export default function AddPage() {
  return (
    <Suspense>
      <AddMealView />
    </Suspense>
  );
}
