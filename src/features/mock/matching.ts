import { schedule } from '../../engine/scheduler';
import { toMinutes, fromMinutes } from '../../engine/time';
import type { Listing, Skill, TimeWindow } from '../../engine/types';
import { MOCK_MINUTES, type Difficulty } from './seed';

/** What a mock agent publishes: the engine listing plus its round and difficulty preference. */
export interface MockListing extends Listing {
  round: string;
  difficulty: Difficulty;
}

export const difficultyFits = (a: Difficulty, b: Difficulty) => a === 'any' || b === 'any' || a === b;

/** Skills each side can cover for the other: A's strengths on B's weak spots and vice versa. */
export function complementarity(a: Pick<Listing, 'offers' | 'needs'>, b: Pick<Listing, 'offers' | 'needs'>): number {
  const cover = (x: Skill[], y: Skill[]) => x.filter((s) => y.includes(s)).length;
  return cover(a.offers, b.needs) + cover(b.offers, a.needs);
}

/** Earliest MOCK_MINUTES slot inside the shared windows, or null. */
export function mockSlot(a: TimeWindow[], b: TimeWindow[]): TimeWindow | null {
  const r = schedule([
    { availability: a, min_session_minutes: MOCK_MINUTES },
    { availability: b, min_session_minutes: MOCK_MINUTES },
  ]);
  if (!r.ok) return null;
  const start = toMinutes(r.window.start);
  return { start: r.window.start, end: fromMinutes(start + MOCK_MINUTES) };
}

/** Broker-side filter over anonymized listings, in order: pipeline → round → difficulty → 60 minutes together. */
export function filterMockListings(seeker: MockListing, others: MockListing[]) {
  const filtered: { handle: string; reason: string }[] = [];
  const kept: MockListing[] = [];
  for (const l of others) {
    if (l.pipeline.company !== seeker.pipeline.company || l.pipeline.role !== seeker.pipeline.role) {
      filtered.push({ handle: l.handle, reason: `different pipeline (${l.pipeline.company} ${l.pipeline.role})` });
    } else if (l.round !== seeker.round) {
      filtered.push({ handle: l.handle, reason: `different round (${l.round})` });
    } else if (!difficultyFits(l.difficulty, seeker.difficulty)) {
      filtered.push({ handle: l.handle, reason: 'wants a different difficulty' });
    } else if (!l.availability || !seeker.availability || !mockSlot(seeker.availability, l.availability)) {
      filtered.push({ handle: l.handle, reason: `less than ${MOCK_MINUTES} minutes free together` });
    } else {
      kept.push(l);
    }
  }
  return { kept, filtered };
}

/**
 * Rank peers: most complementary first, then (Phase D) most reliable, then listing order.
 * `reliability` returns a score or null (not enough ratings yet); unknown sorts after known.
 */
export function rankPeers(seeker: MockListing, peers: MockListing[], reliability: (handle: string) => number | null = () => null) {
  return [...peers].sort((a, b) => {
    const c = complementarity(seeker, b) - complementarity(seeker, a);
    if (c) return c;
    const [ra, rb] = [reliability(a.handle), reliability(b.handle)];
    if (ra !== rb) return (rb ?? -1) - (ra ?? -1);
    return peers.indexOf(a) - peers.indexOf(b);
  });
}
