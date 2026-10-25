// Pay it forward: points and levels. Deterministic code only; no model ever decides a point.
// Points are earned for helping and are never spent: there is nothing to buy with them, least of all a referral.

export const BASE_POINTS = 10;
/** One pair (either direction) earns points at most this many times per week. */
export const PAIR_CAP_PER_WEEK = 2;
/** Newcomer status ends once someone has this many completed sessions. */
export const NEWCOMER_SESSIONS = 3;

export type Level = 'Newcomer' | 'Contributor' | 'Mentor' | 'Senior mentor';

export const LEVELS: { level: Level; min: number }[] = [
  { level: 'Newcomer', min: 0 },
  { level: 'Contributor', min: 30 },
  { level: 'Mentor', min: 100 },
  { level: 'Senior mentor', min: 250 },
];

export const levelOf = (points: number): Level => LEVELS.filter((l) => points >= l.min).at(-1)!.level;
export const levelRank = (level: Level): number => LEVELS.findIndex((l) => l.level === level);

/** The next level up and the points it needs, or null at the top. */
export function nextLevel(points: number): { level: Level; min: number } | null {
  return LEVELS.find((l) => l.min > points) ?? null;
}

export interface Perks {
  /** Higher asks are matched first when several needs fit the same helper. */
  matchingPriority: number;
  /** Shown on the proof-of-work card. */
  badge: Level | null;
  /** Question packs unlocked (Phase B): 'all' from Mentor up. */
  packs: number | 'all';
}

/** What a level unlocks. A referral is deliberately not on this list, at any level. */
export function perksFor(level: Level): Perks {
  const rank = levelRank(level);
  return { matchingPriority: rank, badge: rank >= 1 ? level : null, packs: rank >= 2 ? 'all' : rank === 1 ? 3 : 1 };
}

export interface Standing {
  points: number;
  completedSessions: number;
}

export const isNewcomer = (s: Standing) => s.completedSessions < NEWCOMER_SESSIONS;

/**
 * Experience-gap multiplier for the helper: helping a newcomer 3x, someone a level below 2x, a peer 1x.
 * Computed from both sides' standing before the session counts.
 */
export function multiplierFor(helper: Standing, helped: Standing): { multiplier: 1 | 2 | 3; reason: string } {
  if (isNewcomer(helped)) return { multiplier: 3, reason: `helped a newcomer (${helped.completedSessions} completed sessions)` };
  if (levelRank(levelOf(helped.points)) < levelRank(levelOf(helper.points))) return { multiplier: 2, reason: 'helped someone a level below' };
  return { multiplier: 1, reason: 'helped a peer' };
}

export interface HelpSession {
  id: string;
  helper: string;
  helped: string;
  /** ISO week, e.g. "2026-W44": the pair cap counts per week. */
  week: string;
  topic: string;
}

export interface PointEntry {
  session: string;
  person: string;
  points: number;
  base: number;
  multiplier: 1 | 2 | 3;
  reason: string;
  /** True when the pair already earned twice this week: the session still counts, the points don't. */
  capped: boolean;
  levelBefore: Level;
  levelAfter: Level;
}

export class SessionNotFoundError extends Error {}

/**
 * The points ledger. A session earns points only once BOTH sides confirm it happened; declining a request
 * never touches it. Only the helper earns points.
 */
export class PointsLedger {
  #standing = new Map<string, Standing>();
  #sessions = new Map<string, HelpSession>();
  #confirmed = new Map<string, Set<string>>();
  #entries: PointEntry[] = [];

  constructor(seed: Record<string, Standing> = {}) {
    for (const [person, s] of Object.entries(seed)) this.#standing.set(person, { ...s });
  }

  standing(person: string): Standing {
    return { ...(this.#standing.get(person) ?? { points: 0, completedSessions: 0 }) };
  }

  pointsOf(person: string) {
    return this.standing(person).points;
  }

  levelOf(person: string): Level {
    return levelOf(this.pointsOf(person));
  }

  isNewcomer(person: string) {
    return isNewcomer(this.standing(person));
  }

  entries(): PointEntry[] {
    return this.#entries.map((e) => ({ ...e }));
  }

  /** A booked session. Nothing is earned until both confirm. */
  register(session: HelpSession): void {
    if (session.helper === session.helped) throw new Error('A session needs two people');
    if (!this.#sessions.has(session.id)) this.#sessions.set(session.id, { ...session });
  }

  confirmedBy(sessionId: string): string[] {
    return [...(this.#confirmed.get(sessionId) ?? [])];
  }

  isSettled(sessionId: string) {
    return this.#entries.some((e) => e.session === sessionId);
  }

  /**
   * One side confirms the session happened. Returns the entry once both have confirmed (null before that).
   * Confirming twice is harmless.
   */
  confirm(sessionId: string, person: string): PointEntry | null {
    const s = this.#sessions.get(sessionId);
    if (!s) throw new SessionNotFoundError('No such session');
    if (person !== s.helper && person !== s.helped) throw new Error('Only the two people in a session can confirm it');
    const set = this.#confirmed.get(sessionId) ?? new Set<string>();
    set.add(person);
    this.#confirmed.set(sessionId, set);
    if (!(set.has(s.helper) && set.has(s.helped)) || this.isSettled(sessionId)) return null;
    return this.#settle(s);
  }

  #settle(s: HelpSession): PointEntry {
    const helper = this.standing(s.helper);
    const helped = this.standing(s.helped);
    const { multiplier, reason } = multiplierFor(helper, helped);
    const pair = [s.helper, s.helped].sort().join('|');
    const earnedThisWeek = this.#entries.filter((e) => !e.capped && e.points > 0 && this.#pairOf(e.session) === pair && this.#sessions.get(e.session)?.week === s.week).length;
    const capped = earnedThisWeek >= PAIR_CAP_PER_WEEK;
    const points = capped ? 0 : BASE_POINTS * multiplier;
    const entry: PointEntry = {
      session: s.id,
      person: s.helper,
      points,
      base: BASE_POINTS,
      multiplier,
      reason: capped ? `pair limit: ${PAIR_CAP_PER_WEEK} sessions a week already earned points` : reason,
      capped,
      levelBefore: levelOf(helper.points),
      levelAfter: levelOf(helper.points + points),
    };
    this.#entries.push(entry);
    this.#standing.set(s.helper, { points: helper.points + points, completedSessions: helper.completedSessions + 1 });
    this.#standing.set(s.helped, { points: helped.points, completedSessions: helped.completedSessions + 1 });
    return { ...entry };
  }

  /**
   * Closing the loop: one-shot points for sharing an interview intel report. Same BASE_POINTS as a
   * mentoring session, once per shareId; does not change completedSessions (that counts real sessions).
   */
  awardIntelShare(person: string, shareId: string, company: string): PointEntry | null {
    if (this.#entries.some((e) => e.session === shareId)) return null;
    const before = this.standing(person);
    const points = BASE_POINTS;
    const entry: PointEntry = {
      session: shareId,
      person,
      points,
      base: BASE_POINTS,
      multiplier: 1,
      reason: `shared ${company} interview intel`,
      capped: false,
      levelBefore: levelOf(before.points),
      levelAfter: levelOf(before.points + points),
    };
    this.#entries.push(entry);
    this.#standing.set(person, { points: before.points + points, completedSessions: before.completedSessions });
    return { ...entry };
  }

  #pairOf(sessionId: string) {
    const s = this.#sessions.get(sessionId)!;
    return [s.helper, s.helped].sort().join('|');
  }
}
