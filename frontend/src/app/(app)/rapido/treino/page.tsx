import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuickWorkout } from '@/components/QuickActions';

export const metadata: Metadata = { title: 'Registrar treino' };

export default function Page() {
  return (
    <Suspense>
      <QuickWorkout />
    </Suspense>
  );
}
