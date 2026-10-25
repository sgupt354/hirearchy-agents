import { durationMinutes, formatWindow, fromMinutes, toMinutes } from './time';
import type { TimeWindow } from './types';

export interface MemberAvailability {
  availability: TimeWindow[];
  min_session_minutes: number;
}

export type ScheduleResult = { ok: true; window: TimeWindow } | { ok: false; reason: string };

function intersectTwo(a: TimeWindow[], b: TimeWindow[]): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(toMinutes(x.start), toMinutes(y.start));
      const end = Math.min(toMinutes(x.end), toMinutes(y.end));
      if (end > start) out.push({ start: fromMinutes(start), end: fromMinutes(end) });
    }
  }
  return out;
}

export function intersectAll(lists: TimeWindow[][]): TimeWindow[] {
  if (!lists.length) return [];
  return lists.slice(1).reduce(intersectTwo, lists[0]);
}

const requiredMinutes = (members: MemberAvailability[]) => Math.max(...members.map((m) => m.min_session_minutes));

/** Longest common window, or CONFLICT if it can't satisfy every member's minimum session length. */
export function schedule(members: MemberAvailability[]): ScheduleResult {
  const overlaps = intersectAll(members.map((m) => m.availability));
  const need = requiredMinutes(members);
  if (!overlaps.length) return { ok: false, reason: 'no overlapping availability' };
  const best = overlaps.reduce((a, b) => (durationMinutes(b) > durationMinutes(a) ? b : a));
  if (durationMinutes(best) < need) {
    return { ok: false, reason: `overlap ${formatWindow(best)} is ${durationMinutes(best)} min, shorter than the ${need} min minimum` };
  }
  return { ok: true, window: best };
}

/** True if the window sits entirely inside one of the availability windows. */
export function fits(window: TimeWindow, availability: TimeWindow[]): boolean {
  return availability.some(
    (a) => toMinutes(window.start) >= toMinutes(a.start) && toMinutes(window.end) <= toMinutes(a.end),
  );
}

/** Validate a counter-proposal against each member's PRIVATE availability. */
export function validateCounter(
  window: TimeWindow,
  members: MemberAvailability[],
): { ok: true } | { ok: false; reason: string } {
  if (durationMinutes(window) < requiredMinutes(members)) {
    return { ok: false, reason: `${formatWindow(window)} is shorter than the ${requiredMinutes(members)} min minimum` };
  }
  if (!members.every((m) => fits(window, m.availability))) {
    return { ok: false, reason: `${formatWindow(window)} is outside a member's availability` };
  }
  return { ok: true };
}
