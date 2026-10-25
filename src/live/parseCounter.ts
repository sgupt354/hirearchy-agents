import { durationMinutes, fromMinutes, toMinutes } from '../engine/time.js';
import type { TimeWindow } from '../engine/types.js';

// Same rules as src/engine/voice.parseCounter (do not import voice.ts from api/ — it has extensionless imports).

const TIME = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;

function toHHMM(h: number, m: number, suffix: string | undefined): string | null {
  if (suffix) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (suffix.toLowerCase() === 'pm' ? 12 : 0);
  } else if (h >= 1 && h <= 11) {
    h += 12;
  }
  if (h > 23 || m > 59) return null;
  return fromMinutes(h * 60 + m);
}

export function parseCounter(text: string, current: TimeWindow): TimeWindow | null {
  const times: string[] = [];
  for (const m of text.matchAll(TIME)) {
    const t = toHHMM(Number(m[1]), Number(m[2] ?? 0), m[3]);
    if (t) times.push(t);
  }
  if (!times.length) return null;
  if (times.length >= 2) return { start: times[0], end: times[1] };
  const start = times[0];
  if (toMinutes(start) < toMinutes(current.end)) return { start, end: current.end };
  return { start, end: fromMinutes(toMinutes(start) + durationMinutes(current)) };
}
