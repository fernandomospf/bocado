import type { Metadata } from 'next';
import { OnboardingView } from '@/components/OnboardingView';

export const metadata: Metadata = { title: 'Seus dados' };

export default function OnboardingPage() {
  return <OnboardingView />;
}
