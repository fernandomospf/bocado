import type { SVGProps } from 'react';
import type { WorkoutType } from '@/lib/types';
import { BikeIcon, DumbbellIcon, RunIcon, WalkIcon, WorkoutOtherIcon } from './Icons';

const ICONS = { STRENGTH: DumbbellIcon, RUN: RunIcon, BIKE: BikeIcon, WALK: WalkIcon, OTHER: WorkoutOtherIcon };

export function WorkoutTypeIcon({ type, ...props }: { type: WorkoutType } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[type];
  return <Icon {...props} />;
}
