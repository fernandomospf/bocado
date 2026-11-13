import type { Metadata } from 'next';
import { RecipeEditorView } from '@/components/RecipeEditorView';

export const metadata: Metadata = { title: 'Receita' };

/** "/recipes/new" cria; "/recipes/<id>" edita (ou mostra, se for de outra pessoa da casa). */
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipeEditorView key={id} id={id} />;
}
