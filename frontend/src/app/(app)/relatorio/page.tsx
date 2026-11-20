import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NutritionistReportView } from '@/components/NutritionistReport';

export const metadata: Metadata = { title: 'Relatório para o nutricionista' };

export default function Page() {
  return (
    <Suspense>
      <NutritionistReportView />
    </Suspense>
  );
}
