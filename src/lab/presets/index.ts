import { caustics } from './caustics';
import { interference } from './interference';
import { lamellae } from './lamellae';
import { mercury } from './mercury';
import type { Preset } from './types';

export type { Preset } from './types';

export const presets: readonly Preset[] = [lamellae, caustics, interference, mercury];
