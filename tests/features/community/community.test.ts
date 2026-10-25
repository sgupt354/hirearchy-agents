import { describe, expect, it } from 'vitest';
import { IdentityLockedError } from '../../../src/engine/identity';
import { CommunityHub, PointsCannotBuyReferralError, deadlineText } from '../../../src/features/community/community';
import { BASE_POINTS, LEVELS, PointsLedger, levelOf, multiplierFor, nextLevel, perksFor } from '../../../src/features/community/points';
import { DEMO_NEED, MENTOR, MENTOR_RULES, NEWCOMER, ONLINE_AT_START, STANDING_SEED, createCommunitySeed } from '../../../src/features/community/seed';
import { TrustNetwork } from '../../../src/features/trust/network';

const PRIVATE = ['Priya', 'Nair', 'priya.nair@', 'priyan#', 'Aditya', 'Raman', 'aditya.r@', 'adityar#'];

const hub = (online: string[] = ONLINE_AT_START, trust = new TrustNetwork()) => new CommunityHub(trust, createCommunitySeed, MENTOR_RULES, STANDING_SEED, online);

/** The golden path up to booking: Priya posts, Aditya comes online, both say yes. */
function booked(h = hub()) {
  const id = h.postNeed(NEWCOMER, DEMO_NEED);
  h.mentorOnline(MENTOR);
  h.reply(id, MENTOR, 'accept');
  h.reply(id, NEWCOMER, 'accept');
  return { h, id };
}

describe('pay it forward: points and levels', () => {
  it('multiplier by experience gap: newcomer 3x, a level below 2x, peer 1x', () => {
    expect(multiplierFor({ points: 0, completedSessions: 4 }, { points: 0, completedSessions: 0 }).multiplier).toBe(3);
    expect(multiplierFor({ points: 0, completedSessions: 4 }, { points: 0, completedSessions: 2 }).multiplier).toBe(3); // still a newcomer
    expect(multiplierFor({ points: 120, completedSessions: 9 }, { points: 40, completedSessions: 5 }).multiplier).toBe(2);
    expect(multiplierFor({ points: 40, completedSessions: 9 }, { points: 35, completedSessions: 5 }).multiplier).toBe(1);
    expect(multiplierFor({ points: 40, completedSessions: 9 }, { points: 130, completedSessions: 12 }).multiplier).toBe(1);
  });

  it('levels and what they unlock; a referral is never a perk', () => {
    expect(LEVELS.map((l) => [l.level, l.min])).toEqual([['Newcomer', 0], ['Contributor', 30], ['Mentor', 100], ['Senior mentor', 250]]);
    expect([0, 29, 30, 99, 100, 249, 250, 999].map(levelOf)).toEqual(['Newcomer', 'Newcomer', 'Contributor', 'Contributor', 'Mentor', 'Mentor', 'Senior mentor', 'Senior mentor']);
    expect(nextLevel(30)).toEqual({ level: 'Mentor', min: 100 });
    expect(nextLevel(300)).toBeNull();
    expect(perksFor('Newcomer')).toEqual({ matchingPriority: 0, badge: null, packs: 1 });
    expect(perksFor('Contributor')).toEqual({ matchingPriority: 1, badge: 'Contributor', packs: 3 });
    expect(perksFor('Mentor').packs).toBe('all');
    for (const l of LEVELS) expect(Object.keys(perksFor(l.level)).sort()).toEqual(['badge', 'matchingPriority', 'packs']);
  });

  it('no points until BOTH sides confirm; confirming twice changes nothing', () => {
    const l = new PointsLedger({ m: { points: 0, completedSessions: 5 }, n: { points: 0, completedSessions: 0 } });
    l.register({ id: 's1', helper: 'm', helped: 'n', week: 'W1', topic: 'DSA' });
    expect(l.confirm('s1', 'm')).toBeNull();
    expect(l.confirm('s1', 'm')).toBeNull();
    expect(l.pointsOf('m')).toBe(0);
    expect(l.entries()).toEqual([]);
    const e = l.confirm('s1', 'n')!;
    expect(e).toMatchObject({ person: 'm', points: BASE_POINTS * 3, multiplier: 3, capped: false, levelBefore: 'Newcomer', levelAfter: 'Contributor' });
    expect(l.confirm('s1', 'n')).toBeNull();
    expect(l.pointsOf('m')).toBe(30);
    expect(l.pointsOf('n')).toBe(0); // only the helper earns
    expect(() => l.confirm('s1', 'stranger')).toThrow();
  });

  it('a pair earns points at most twice a week; the next week counts again', () => {
    const l = new PointsLedger({ m: { points: 200, completedSessions: 20 }, n: { points: 200, completedSessions: 20 } });
    const run = (id: string, week: string, helper = 'm', helped = 'n') => {
      l.register({ id, helper, helped, week, topic: 'DSA' });
      l.confirm(id, helper);
      return l.confirm(id, helped)!;
    };
    expect(run('s1', 'W1').points).toBe(10);
    expect(run('s2', 'W1', 'n', 'm').points).toBe(10); // either direction counts for the pair
    const third = run('s3', 'W1');
    expect(third).toMatchObject({ points: 0, capped: true });
    expect(run('s4', 'W2').points).toBe(10);
  });

  it('newcomer status ends after 3 completed sessions', () => {
    const l = new PointsLedger({ m: { points: 0, completedSessions: 9 }, n: { points: 0, completedSessions: 0 } });
    const mults: number[] = [];
    for (const [i, week] of ['W1', 'W2', 'W3', 'W4'].entries()) {
      l.register({ id: `s${i}`, helper: 'm', helped: 'n', week, topic: 'DSA' });
      l.confirm(`s${i}`, 'm');
      mults.push(l.confirm(`s${i}`, 'n')!.multiplier);
    }
    // After 3 sessions the newcomer bonus stops; they're still a level below their mentor, so 2x.
    expect(mults).toEqual([3, 3, 3, 2]);
    expect(l.isNewcomer('n')).toBe(false);
  });
});

describe('pay it forward: help requests', () => {
  it("Priya's need is published anonymously with the deadline abstracted, and waits for a mentor", () => {
    const h = hub();
    const id = h.postNeed(NEWCOMER, DEMO_NEED);
    expect(h.listing(id)).toEqual({ need: id, handle: 'Newcomer #9', company: 'Microsoft', round: 'Technical', topic: 'DSA', deadline: 'this week', newcomer: true });
    expect(h.need(id)!.state).toBe('OPEN');
    expect(h.events().some((e) => e.payload.kind === 'no-circle')).toBe(true);
    // Leo doesn't teach DSA; Sam is already at 2 of 2 newcomers this week.
    const checks = h.events().filter((e) => e.payload.kind === 'capacity');
    expect(checks.map((e) => [e.from, e.type])).toEqual([['a6', 'REJECT'], ['a7', 'REJECT']]);
    expect(checks.every((e) => e.to.length === 1 && e.to[0] === e.from)).toBe(true); // rules stay with their own agent
    expect(JSON.stringify(h.events())).not.toContain('2026-10-29');
    expect(deadlineText('2026-11-05', '2026-10-25')).toBe('next week');
  });

  it('a mentor coming online re-matches the open need; capacity rules are respected', () => {
    const h = hub();
    const id = h.postNeed(NEWCOMER, DEMO_NEED);
    h.mentorOnline(MENTOR);
    const n = h.need(id)!;
    expect(n.state).toBe('MATCHED');
    expect(n.mentor).toBe(MENTOR);
    expect(n.window).toEqual({ start: '19:30', end: '20:15' }); // evenings only, 45 minutes
    expect(h.rulesFor(MENTOR, MENTOR)!.newcomersThisWeek).toBe(1);
    expect(h.rulesFor(NEWCOMER, MENTOR)).toBeNull();
  });

  it('a mentor at capacity is never matched, even when online first', () => {
    const rules = { ...MENTOR_RULES, a1: { ...MENTOR_RULES.a1, newcomersThisWeek: 2 } };
    const h = new CommunityHub(new TrustNetwork(), createCommunitySeed, rules, STANDING_SEED, ['a1']);
    const id = h.postNeed(NEWCOMER, DEMO_NEED);
    expect(h.need(id)!.state).toBe('OPEN');
    const check = h.events().find((e) => e.payload.kind === 'capacity')!;
    expect(check.type).toBe('REJECT');
  });

  it('a higher-level asker is matched first (priority perk); a mentor gets one ask at a time', () => {
    const h = new CommunityHub(new TrustNetwork(), createCommunitySeed, MENTOR_RULES, STANDING_SEED, []);
    const priya = h.postNeed(NEWCOMER, DEMO_NEED); // Newcomer level, posted first
    const sam = h.postNeed('a7', DEMO_NEED); // Mentor level (120 points), posted later
    h.mentorOnline(MENTOR);
    expect(h.need(sam)!.state).toBe('MATCHED');
    expect(h.need(priya)!.state).toBe('OPEN'); // Aditya is waiting on one answer already
    h.reply(sam, MENTOR, 'decline');
    expect(h.need(priya)!.state).toBe('MATCHED'); // freed up: Priya is next
    expect(h.need(priya)!.mentor).toBe(MENTOR);
  });

  it('identity stays hidden until both say yes', () => {
    const h = hub();
    const id = h.postNeed(NEWCOMER, DEMO_NEED);
    h.mentorOnline(MENTOR);
    h.reply(id, MENTOR, 'accept');
    expect(() => h.getIdentity(MENTOR, NEWCOMER)).toThrow(IdentityLockedError);
    expect(() => h.getIdentity(NEWCOMER, MENTOR)).toThrow(IdentityLockedError);
    const before = JSON.stringify([h.events(), h.phone(MENTOR), h.phone(NEWCOMER), h.listing(id)]);
    for (const s of PRIVATE) expect(before).not.toContain(s);
    h.reply(id, NEWCOMER, 'accept');
    expect(h.getIdentity(MENTOR, NEWCOMER).name).toBe('Priya Nair');
    expect(h.getIdentity(NEWCOMER, MENTOR).name).toBe('Aditya Raman');
    expect(h.need(id)!.state).toBe('BOOKED');
  });

  it('declining costs no points, frees the capacity, and keeps the need open', () => {
    const h = hub();
    const id = h.postNeed(NEWCOMER, DEMO_NEED);
    h.mentorOnline(MENTOR);
    const before = h.points.standing(MENTOR);
    h.reply(id, MENTOR, 'decline');
    expect(h.points.standing(MENTOR)).toEqual(before);
    expect(h.points.entries()).toEqual([]);
    expect(h.need(id)!.state).toBe('OPEN');
    expect(h.rulesFor(MENTOR, MENTOR)!.newcomersThisWeek).toBe(0);
    expect(() => h.getIdentity(MENTOR, NEWCOMER)).toThrow(IdentityLockedError);
  });

  it('the golden path: both confirm, Aditya earns 30 (3x newcomer) and becomes a Contributor', () => {
    const trust = new TrustNetwork();
    const { h, id } = booked(hub(ONLINE_AT_START, trust));
    expect(h.confirm(id, MENTOR)).toBeNull();
    expect(h.points.pointsOf(MENTOR)).toBe(0); // one confirmation is not enough
    const entry = h.confirm(id, NEWCOMER)!;
    expect(entry).toMatchObject({ points: 30, multiplier: 3, levelBefore: 'Newcomer', levelAfter: 'Contributor' });
    expect(h.points.levelOf(MENTOR)).toBe('Contributor');
    expect(h.events().filter((e) => e.payload.kind === 'level-up')).toHaveLength(1);
    expect(h.need(id)!.state).toBe('DONE');
    // Ratings go to the shared trust ledger; the mentoring shows up in Aditya's evidence, never the points.
    h.rate(id, NEWCOMER, { showedUp: true, helpful: 5 });
    h.rate(id, MENTOR, { showedUp: true, helpful: 5 });
    const file = trust.evidence('p1', 'p1');
    expect(file.mentoring).toEqual({ sessions: 1, newcomersHelped: 1, averageRating: null, ratingCount: 1 });
    expect(file.skillsTaught).toContain('DSA');
    expect(JSON.stringify(trust.disclose('p1', 1))).not.toMatch(/points/i);
    expect(trust.disclose('p1', 1).mentoring).toEqual(file.mentoring);
  });

  it('points can never buy a referral', () => {
    const { h, id } = booked();
    h.confirm(id, MENTOR);
    h.confirm(id, NEWCOMER);
    const points = h.points.pointsOf(MENTOR);
    expect(() => h.redeemForReferral(MENTOR)).toThrow(PointsCannotBuyReferralError);
    expect(h.points.pointsOf(MENTOR)).toBe(points);
  });

  it('needs expire after the deadline and can be cancelled anytime before booking', () => {
    const h = hub();
    const a = h.postNeed(NEWCOMER, DEMO_NEED);
    expect(h.expire('2026-10-29')).toEqual([]); // the deadline day itself is still open
    expect(h.expire('2026-10-30')).toEqual([a]);
    expect(h.need(a)!.state).toBe('EXPIRED');
    h.mentorOnline(MENTOR);
    expect(h.need(a)!.state).toBe('EXPIRED'); // never re-matched

    const h2 = hub();
    const b = h2.postNeed(NEWCOMER, DEMO_NEED);
    h2.mentorOnline(MENTOR);
    expect(() => h2.cancel(b, MENTOR)).toThrow();
    h2.cancel(b, NEWCOMER);
    expect(h2.need(b)!.state).toBe('CANCELLED');
    expect(h2.rulesFor(MENTOR, MENTOR)!.newcomersThisWeek).toBe(0);
    expect(h2.phone(MENTOR).at(-1)!.text).toMatch(/No names were shared/);
    expect(() => h2.getIdentity(MENTOR, NEWCOMER)).toThrow(IdentityLockedError);
  });

  it('reset restores the seed', () => {
    const { h, id } = booked();
    h.confirm(id, MENTOR);
    h.confirm(id, NEWCOMER);
    h.reset();
    expect(h.needs()).toEqual([]);
    expect(h.events()).toEqual([]);
    expect(h.points.pointsOf(MENTOR)).toBe(0);
    expect(h.online()).toEqual(ONLINE_AT_START);
  });
});
