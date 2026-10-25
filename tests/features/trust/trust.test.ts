import { describe, expect, it } from 'vitest';
import { MockSwap } from '../../../src/features/mock/mockSwap';
import { createMockSeed } from '../../../src/features/mock/seed';
import { TrustLedger, MIN_RATINGS } from '../../../src/features/trust/ledger';
import { discloseEvidence, mockOverall } from '../../../src/features/trust/evidence';
import { EvidenceLockedError, TrustNetwork } from '../../../src/features/trust/network';
import { personOf } from '../../../src/features/trust/people';
import { getIntelContributionCount } from '../../../src/features/intel/logic';

const yes = (helpful: number) => ({ showedUp: true, helpful });

describe('trust: no individual rating is ever exposed', () => {
  it('the ledger only ever returns a count and aggregates', () => {
    const l = new TrustLedger();
    l.add('a', 'x', 's1', yes(2));
    l.add('b', 'x', 's1', yes(5));
    const s = l.summary('x');
    expect(Object.keys(s).sort()).toEqual(['count', 'reliability', 'showUpRate']);
    expect(s).toEqual({ count: 2, reliability: 3.5, showUpRate: 1 });
    // No public method hands back rating entries.
    const methods = Object.getOwnPropertyNames(TrustLedger.prototype);
    expect(methods.sort()).toEqual(['add', 'constructor', 'hasRated', 'reliability', 'summary']);
    expect(JSON.stringify(l)).toBe('{}');
  });

  it('the evidence file and disclosures carry no individual ratings or raters', () => {
    const t = new TrustNetwork();
    const file = t.evidence('p4', 'p4');
    const all = JSON.stringify([file, t.disclose('p4', 1), t.disclose('p4', 2), t.summary('p4')]);
    for (const leak of ['q1', 'q2', 'q3', 'q4', '"rater"', '"helpful"', '"showedUp"']) expect(all).not.toContain(leak);
  });

  it('an evidence file is readable only by its owner', () => {
    const t = new TrustNetwork();
    expect(() => t.evidence('p1', 'p4')).toThrow(EvidenceLockedError);
    expect(t.evidence('p4', 'p4').owner).toBe('p4');
  });
});

describe('trust: the 2-rating threshold', () => {
  it('no reliability score until there are at least two ratings', () => {
    expect(MIN_RATINGS).toBe(2);
    const l = new TrustLedger();
    l.add('a', 'x', 's1', yes(5));
    expect(l.summary('x')).toEqual({ count: 1, reliability: null, showUpRate: null });
    l.add('b', 'x', 's2', yes(4));
    expect(l.reliability('x')).toBe(4.5);
  });

  it('seeded history: Sumit has one rating (hidden), Jordan five (4.8)', () => {
    const t = new TrustNetwork();
    expect(t.summary('p2')).toEqual({ count: 1, reliability: null, showUpRate: null });
    expect(t.reliability('p4')).toBe(4.8);
    expect(t.evidence('p2', 'p2').averageRating).toBeNull();
  });

  it('a no-show counts as 1/5 and the session as not attended', () => {
    const t = new TrustNetwork();
    expect(t.summary('p5')).toEqual({ count: 2, reliability: 2, showUpRate: 0.5 });
    expect(t.evidence('p5', 'p5').sessionsAttended).toBe(1);
  });

  it('only session members can rate each other, once, with valid values', () => {
    const t = new TrustNetwork();
    t.recordSession({ id: 'prep-x', kind: 'prep', members: ['p1', 'p2', 'p3'], taught: { p1: ['DSA'] } });
    expect(() => t.rate('p6', 'p1', 'prep-x', yes(5))).toThrow(/members/);
    expect(() => t.rate('p1', 'p1', 'prep-x', yes(5))).toThrow(/yourself/);
    expect(() => t.rate('p1', 'p2', 'prep-x', yes(6))).toThrow(/1 to 5/);
    t.rate('p1', 'p2', 'prep-x', yes(4));
    expect(() => t.rate('p1', 'p2', 'prep-x', yes(5))).toThrow(/Already/);
    expect(t.reliability('p2')).toBe(4.5); // Sumit crosses the threshold
  });
});

describe('trust: reliability affects match order', () => {
  // Make Priya (m5) exactly as complementary as Jordan (m4) for Aditya, so only reliability differs.
  const tiedSeed = () => {
    const seed = createMockSeed();
    const priya = seed.find((p) => p.agent_id === 'm5')!;
    priya.offers = ['System Design'];
    priya.needs = ['DSA'];
    return seed;
  };

  it('with the shared trust network, the more reliable partner is matched first', () => {
    const t = new TrustNetwork();
    const m = new MockSwap(tiedSeed(), (id) => t.reliability(personOf(id)));
    m.start();
    expect(m.pair).toEqual(['m1', 'm4']); // Jordan 4.8 beats Priya 2.0
  });

  it('flipping reliability flips the order', () => {
    const scores: Record<string, number> = { m4: 3.1, m5: 4.6 };
    const m = new MockSwap(tiedSeed(), (id) => scores[id] ?? null);
    m.start();
    expect(m.pair).toEqual(['m1', 'm5']);
  });

  it('someone with a reliability score ranks above someone without one', () => {
    const m = new MockSwap(tiedSeed(), (id) => (id === 'm5' ? 3.0 : null));
    m.start();
    expect(m.pair).toEqual(['m1', 'm5']);
  });
});

describe('trust: intel contributions come from the Intel feature', () => {
  it('evidence intel count = getIntelContributionCount for the same student', () => {
    const t = new TrustNetwork();
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) expect(t.evidence(`p${n}`, `p${n}`).intelReports).toBe(getIntelContributionCount(`a${n}`));
    expect(t.disclose('p3', 1).intelReports).toBe(getIntelContributionCount('a3'));
  });
});

describe('trust: evidence file and staged disclosure', () => {
  it("Jordan's seeded proof of work", () => {
    const t = new TrustNetwork();
    const f = t.evidence('p4', 'p4');
    expect(f).toMatchObject({ sessionsAttended: 3, averageRating: 4.8, ratingCount: 5, mockCount: 1, targetRoles: ['Stripe SWE Intern', 'Microsoft SWE Intern'] });
    expect(new Set(f.skillsTaught)).toEqual(new Set(['System Design', 'DSA']));
    expect(mockOverall(f.mockAverages)).toBe(4.3);
  });

  it('stage 1 is stats only; stage 2 adds the rubric breakdown and project links; neither has identity', () => {
    const t = new TrustNetwork();
    const s1 = t.disclose('p4', 1);
    expect(Object.keys(s1).sort()).toEqual(['averageRating', 'intelReports', 'mockAverage', 'sessionsAttended', 'skillsTaught', 'stage', 'targetRoles']);
    const s2 = t.disclose('p4', 2);
    expect(s2.projectLinks.length).toBe(2);
    expect(s2.mockAverages).not.toBeNull();
    const text = JSON.stringify([s1, s2]);
    for (const id of ['Jordan', 'Ellis', 'jordan.ellis@', 'jellis#']) expect(text).not.toContain(id);
    expect(discloseEvidence(t.evidence('p4', 'p4'), 1)).toEqual(s1);
  });

  it('new sessions, ratings and mock scores update the file; reset restores the seed', () => {
    const t = new TrustNetwork();
    t.recordSession({ id: 'prep-run', kind: 'prep', members: ['p1', 'p2', 'p3'], taught: { p1: ['DSA'], p2: ['Behavioral'], p3: ['System Design'] } });
    t.rate('p2', 'p1', 'prep-run', yes(5));
    t.rate('p3', 'p1', 'prep-run', yes(5));
    t.addMockScores('p1', [{ communication: 5, problem_solving: 4, code_quality: 4, behavioral_structure: 5 }]);
    const f = t.evidence('p1', 'p1');
    expect(f.sessionsAttended).toBe(3);
    expect(f.averageRating).toBe(4.8); // 5, 4 seeded + 5, 5
    expect(f.mockCount).toBe(2);
    t.resetFor(1);
    expect(t.evidence('p1', 'p1')).toMatchObject({ sessionsAttended: 2, averageRating: 4.5, mockCount: 1 });
    expect(t.hasSession('prep-run')).toBe(false);
  });
});
