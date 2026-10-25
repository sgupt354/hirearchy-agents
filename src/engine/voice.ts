import { durationMinutes, formatWindow12h, fromMinutes, toMinutes } from './time';
import type { Skill, TimeWindow } from './types';

// Template messages from an agent to its own human. Phase 4 adds a Claude rewrite with this as the fallback.

export interface ProposalContext {
  pipeline: { company: string; role: string };
  circleSize: number;
  gives: Skill[];
  gets: Skill[];
  window: TimeWindow;
  updated: boolean;
}

export function proposalMessage(c: ProposalContext): string {
  const lead = c.updated
    ? `Updated time for your ${c.pipeline.company} ${c.pipeline.role} prep circle.`
    : `Your agent found a ${c.circleSize}-person prep circle in your ${c.pipeline.company} ${c.pipeline.role} pipeline.`;
  return (
    `${lead} You'd get help with ${c.gets.join(', ')} and help someone with ${c.gives.join(', ')}. ` +
    `Time: ${formatWindow12h(c.window)}. Names and contacts stay hidden until everyone accepts. ` +
    `Accept, counter, or decline?`
  );
}

const TIME = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;

function toHHMM(h: number, m: number, suffix: string | undefined): string | null {
  if (suffix) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (suffix.toLowerCase() === 'pm' ? 12 : 0);
  } else if (h >= 1 && h <= 11) {
    h += 12; // bare "8" in a prep-session context means the evening
  }
  if (h > 23 || m > 59) return null;
  return fromMinutes(h * 60 + m);
}

/**
 * Regex parse of a human reply like "8pm instead?" or "20:00-21:00".
 * One time = new start (keeps the current end); two times = start and end. Null if no time found.
 */
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
