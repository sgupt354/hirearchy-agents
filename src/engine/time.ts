import type { TimeWindow } from './types.js';

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export const durationMinutes = (w: TimeWindow): number => toMinutes(w.end) - toMinutes(w.start);

export const formatWindow = (w: TimeWindow): string => `${w.start}-${w.end}`;

/** "20:00" -> "8:00 PM" */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const formatWindow12h = (w: TimeWindow): string => `${to12h(w.start)}-${to12h(w.end)}`;
