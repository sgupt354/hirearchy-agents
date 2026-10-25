import { durationMinutes, fromMinutes, toMinutes } from './time';
import type { TimeWindow } from './types';

// Template text for messages an agent sends its own human. This is the single source of the fallback
// text; the UI routes these through generateMessage() (integrations) and falls back to this.

export type MessageKind = 'proposal' | 'counter' | 'reveal' | 'complete';

export function messageText(kind: MessageKind, d: Record<string, string>): string {
  switch (kind) {
    case 'proposal': {
      const lead =
        d.updated === 'true'
          ? `Updated time for your ${d.company} ${d.role} prep circle.`
          : `Your agent found a ${d.circleSize}-person prep circle in your ${d.company} ${d.role} pipeline.`;
      return (
        `${lead} You'd get help with ${d.gets} and help someone with ${d.gives}. ` +
        `Time: ${d.window}. Names and contacts stay hidden until everyone accepts. ` +
        `Accept, counter, or decline?`
      );
    }
    case 'counter':
      if (d.status === 'proposing') return `Proposing ${d.window} to the others…`;
      if (d.status === 'rejected') return `Your counter didn't fit everyone. ${d.reason}`;
      if (d.status === 'own_conflict') return `${d.window} doesn't work with your own availability.`;
      return `I couldn't find a time in "${d.text}". Try "8pm" or "20:00-21:00".`;
    case 'reveal':
      return `Everyone said yes! Your circle: ${d.members}.`;
    case 'complete':
      return `Prep Circle Created ✓ · ${d.window} · ${d.skills}`;
  }
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
