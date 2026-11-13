import type { Metadata } from 'next';
import { RecipesListView } from '@/components/RecipesListView';

export const metadata: Metadata = { title: 'Receitas' };

export default function RecipesPage() {
  return <RecipesListView />;
}
