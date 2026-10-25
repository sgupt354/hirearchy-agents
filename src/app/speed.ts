import type { TabProps } from '../features/types';

export type Speed = TabProps['speed'];

/** Event replay step (ms) and chat pacing multiplier for each presentation speed. */
export const SPEEDS: Record<Speed, { step: number; pace: number }> = {
  slow: { step: 700, pace: 1.6 },
  normal: { step: 260, pace: 1 },
  fast: { step: 80, pace: 0.4 },
};
