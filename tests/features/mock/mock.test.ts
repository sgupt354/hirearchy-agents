import { describe, expect, it } from 'vitest';
import { IdentityLockedError } from '../../../src/engine/identity';
import { InvalidTransitionError } from '../../../src/engine/stateMachine';
import { complementarity, filterMockListings, rankPeers, type MockListing } from '../../../src/features/mock/matching';
import { MockSwap, NoPeerError } from '../../../src/features/mock/mockSwap';
import { REPORTS, questionPack } from '../../../src/features/mock/questions';
import { ScoresLockedError, type Rubric } from '../../../src/features/mock/scores';
import { createMockSeed } from '../../../src/features/mock/seed';

const R1: Rubric = { communication: 4, problem_solving: 3, code_quality: 4, behavioral_structure: 5 };
const R2: Rubric = { communication: 5, problem_solving: 4, code_quality: 4, behavioral_structure: 4 };
const NOTE_FOR_JORDAN = 'Great clarifying questions on the grid problem';
const NOTE_FOR_ADITYA = 'Explain tradeoffs before diving into the design';

/** Full golden path: Aditya (m1) and Jordan (m4) swap mocks and score each other. */
function fullMock() {
  const m = new MockSwap();
  m.start();
  m.reply('m1', 'accept');
  m.reply('m4', 'accept');
  m.endRound('m1');
  m.endRound('m4');
  m.submitScores('m1', R1, NOTE_FOR_JORDAN);
  m.submitScores('m4', R2, NOTE_FOR_ADITYA);
  return m;
}

const listingsOf = (m: MockSwap) =>
  m.events().flatMap((e) => (e.payload.listing ? [e.payload.listing as MockListing] : []));

describe('mock interview: round matching', () => {
  it('only pairs students in the same pipeline AND round', () => {
    const m = new MockSwap();
    m.start();
    const ls = listingsOf(m);
    const seeker = ls.find((l) => l.handle === 'm1')!;
    const { kept, filtered } = filterMockListings(seeker, ls.filter((l) => l.handle !== 'm1'));
    const reasons = Object.fromEntries(filtered.map((f) => [f.handle, f.reason]));
    expect(reasons.m2).toMatch(/different round/);
    expect(reasons.m8).toMatch(/different pipeline/);
    expect(kept.every((l) => l.round === 'Technical' && l.pipeline.company === 'Microsoft')).toBe(true);
    expect(m.pair).toEqual(['m1', 'm4']);
  });

  it('moves on when the best partner is in a different round', () => {
    const seed = createMockSeed();
    seed.find((p) => p.agent_id === 'm4')!.round = 'Final';
    const m = new MockSwap(seed);
    m.start();
    expect(m.pair).toEqual(['m1', 'm5']);
  });

  it('filters partners with less than 60 minutes together or a different difficulty', () => {
    const m = new MockSwap();
    m.start();
    const filtered = Object.fromEntries(m.events().filter((e) => e.type === 'FILTERED').map((e) => [e.payload.handle, e.payload.reason]));
    expect(filtered.m6).toMatch(/60 minutes/);
    expect(filtered.m7).toMatch(/difficulty/);
  });

  it('prefers complementary weak areas', () => {
    const ls = new MockSwap();
    ls.start();
    const all = listingsOf(ls);
    const [seeker, jordan, priya] = ['m1', 'm4', 'm5'].map((h) => all.find((l) => l.handle === h)!);
    expect(complementarity(seeker, jordan)).toBe(2);
    expect(complementarity(seeker, priya)).toBe(0);
    expect(rankPeers(seeker, [priya, jordan]).map((l) => l.handle)).toEqual(['m4', 'm5']);
  });

  it('uses reliability only to break ties, and unknown reliability sorts last', () => {
    const ls = new MockSwap();
    ls.start();
    const all = listingsOf(ls);
    const [seeker, maya, jordan] = ['m1', 'm3', 'm4'].map((h) => all.find((l) => l.handle === h)!);
    expect(rankPeers(seeker, [maya, jordan], (h) => (h === 'm4' ? 4.6 : null)).map((l) => l.handle)).toEqual(['m4', 'm3']);
    expect(rankPeers(seeker, [maya, jordan], (h) => (h === 'm4' ? 3.1 : 4.8)).map((l) => l.handle)).toEqual(['m3', 'm4']);
  });
});

describe('mock interview: repeat-partner limit', () => {
  it("never pairs someone you've practiced with twice; the broker only learns 'skip'", () => {
    const m = new MockSwap();
    m.start();
    const skip = m.events().find((e) => e.type === 'REJECT' && e.payload.handle === 'm3')!;
    expect(skip.from).toBe('m1');
    expect(skip.payload.reason).toBe('private preference');
    expect(JSON.stringify(m.events())).not.toMatch(/practiced"?:|"m3":2/);
    expect(m.pair).not.toContain('m3');
  });

  it('allows a partner practiced with only once', () => {
    const seed = createMockSeed();
    seed.find((p) => p.agent_id === 'm1')!.practiced = { m3: 1 };
    const m = new MockSwap(seed);
    m.start();
    expect(m.pair).toEqual(['m1', 'm3']);
  });
});

describe('mock interview: scores stay private', () => {
  it('scores are readable only by the person scored', () => {
    const m = fullMock();
    expect(m.state).toBe('COMPLETED');
    expect(m.getScores('m1', 'm1')[0]).toMatchObject({ rubric: R2, note: NOTE_FOR_ADITYA });
    expect(m.getScores('m4', 'm4')[0]).toMatchObject({ rubric: R1, note: NOTE_FOR_JORDAN });
    expect(() => m.getScores('m4', 'm1')).toThrow(ScoresLockedError);
    expect(() => m.getScores('m1', 'm4')).toThrow(ScoresLockedError);
    expect(() => m.getScores('m5', 'm1')).toThrow(ScoresLockedError);
  });

  it('no event and no other phone ever carries scores or notes', () => {
    const m = fullMock();
    const feed = JSON.stringify(m.events());
    for (const s of [NOTE_FOR_ADITYA, NOTE_FOR_JORDAN, '"rubric":', '"communication":', '"problem_solving":']) expect(feed).not.toContain(s);
    // Each phone only ever shows its owner's own scores (read through the vault at render time).
    expect(JSON.stringify(m.phone('m4'))).not.toContain(NOTE_FOR_ADITYA);
    expect(JSON.stringify(m.phone('m1'))).not.toContain(NOTE_FOR_JORDAN);
    expect(m.phone('m1').filter((x) => x.kind === 'scores').every((x) => x.data?.subject === 'm1')).toBe(true);
  });

  it('sharing scores needs the subject to grant it', () => {
    const m = fullMock();
    m.grantScores('m1', 'm9-referrer');
    expect(m.getScores('m9-referrer', 'm1')).toHaveLength(1);
    expect(() => m.getScores('m9-referrer', 'm4')).toThrow(ScoresLockedError);
    expect(m.scoreAverages('m1', 'm1')).toEqual(R2);
  });

  it('rubric scores must be whole numbers from 1 to 5', () => {
    const m = new MockSwap();
    m.start();
    m.reply('m1', 'accept');
    m.reply('m4', 'accept');
    m.endRound('m1');
    m.endRound('m1');
    expect(() => m.submitScores('m1', { ...R1, communication: 6 }, '')).toThrow(/1 to 5/);
    expect(() => m.submitScores('m1', { ...R1, code_quality: 2.5 }, '')).toThrow(/1 to 5/);
  });
});

describe('mock interview: consent, names and question packs', () => {
  it('names are locked until both say yes', () => {
    const m = new MockSwap();
    m.start();
    expect(() => m.getIdentity('m1', 'm4')).toThrow(IdentityLockedError);
    m.reply('m1', 'accept');
    expect(() => m.getIdentity('m1', 'm4')).toThrow(IdentityLockedError);
    expect(JSON.stringify(m.events())).not.toContain('Jordan Ellis');
    m.reply('m4', 'accept');
    expect(m.getIdentity('m1', 'm4').name).toBe('Jordan Ellis');
    expect(() => m.getIdentity('m5', 'm1')).toThrow(IdentityLockedError);
  });

  it('A interviews B, then B interviews A, each with a pack for the other side’s weak areas', () => {
    const m = new MockSwap();
    m.start();
    m.reply('m1', 'accept');
    m.reply('m4', 'accept');
    expect(m.seats).toEqual({ interviewer: 'm1', candidate: 'm4' });
    m.endRound('m4');
    expect(m.seats).toEqual({ interviewer: 'm4', candidate: 'm1' });
    const adityaPack = m.phone('m1').find((x) => x.kind === 'pack')!.data!.questions as { area: string; prompt: string }[];
    const jordanPack = m.phone('m4').find((x) => x.kind === 'pack')!.data!.questions as { area: string; prompt: string }[];
    expect(adityaPack.every((q) => q.area === 'DSA')).toBe(true); // Jordan's weak area
    expect(jordanPack[0].area).toBe('System Design'); // Aditya's weak area
    // You never see the questions you'll be asked.
    for (const q of jordanPack) expect(JSON.stringify(m.phone('m1'))).not.toContain(q.prompt);
  });

  it('question packs come only from anonymized reports for that company and round', () => {
    const pack = questionPack('Microsoft', 'Technical', ['DSA'], 'medium');
    expect(pack).toHaveLength(3);
    for (const q of pack) {
      const r = REPORTS.find((x) => x.id === q.id)!;
      expect([r.company, r.round]).toEqual(['Microsoft', 'Technical']);
    }
    expect(REPORTS.every((r) => !Object.keys(r).some((k) => /author|name|email|by/i.test(k)))).toBe(true);
  });

  it('a decline moves to the backup without naming who left', () => {
    const m = new MockSwap();
    m.start();
    const before = m.events().length;
    m.reply('m4', 'decline');
    expect(m.pair).toEqual(['m1', 'm5']);
    const seenByAditya = m.events().slice(before).filter((e) => e.from === 'm1' || e.to.includes('m1'));
    expect(JSON.stringify(seenByAditya)).not.toMatch(/m4|Applicant #4|Jordan/);
  });

  it('rejects out-of-order actions', () => {
    const m = new MockSwap();
    expect(() => m.endRound('m1')).toThrow();
    m.start();
    expect(() => m.endRound('m1')).toThrow(/No round/);
    expect(() => m.submitScores('m1', R1, '')).toThrow();
    expect(() => m.reply('m5', 'accept')).toThrow(/No pending/);
    expect(() => m.start()).toThrow();
    expect(InvalidTransitionError).toBeDefined();
  });
});

describe('mock interview: practice with your agent', () => {
  it('is offered only when no peer matches', () => {
    const m = new MockSwap();
    expect(() => m.practiceWithAgent('m1')).toThrow(NoPeerError);
    m.start();
    expect(m.state).toBe('AWAITING_HUMANS');
    expect(() => m.practiceWithAgent('m1')).toThrow(NoPeerError);

    const solo = new MockSwap();
    solo.start('m8'); // Riya: the only Google student
    expect(solo.state).toBe('NO_PEER');
    expect(solo.phone('m8').at(-1)!.kind).toBe('solo-offer');
    solo.practiceWithAgent('m8');
    expect(solo.state).toBe('SOLO');
  });

  it('becomes available after every peer declines', () => {
    const m = new MockSwap();
    m.start();
    m.reply('m4', 'decline');
    m.reply('m5', 'decline');
    expect(m.state).toBe('NO_PEER');
    m.practiceWithAgent('m1');
    expect(m.state).toBe('SOLO');
  });

  it('runs a scripted mock from the question pack and keeps self-scores private', () => {
    const m = new MockSwap();
    m.start('m8');
    m.practiceWithAgent('m8');
    expect(() => m.submitSelfScores('m8', R1)).toThrow();
    m.soloDone('m8');
    m.soloDone('m8');
    m.soloDone('m8');
    m.submitSelfScores('m8', R1);
    expect(m.state).toBe('COMPLETED');
    expect(m.getScores('m8', 'm8')[0]).toMatchObject({ practice: true, rubric: R1 });
    expect(m.scoreAverages('m8', 'm8')).toBeNull(); // practice doesn't count as peer evidence
    expect(() => m.getScores('m1', 'm8')).toThrow(ScoresLockedError);
  });
});

describe('mock interview: reset', () => {
  it('reset reproduces an identical run', () => {
    const m = fullMock();
    const first = JSON.stringify({ e: m.events(), h: m.history(), p: [m.phone('m1'), m.phone('m4')] });
    m.reset();
    expect(m.state).toBe('IDLE');
    m.start();
    m.reply('m1', 'accept');
    m.reply('m4', 'accept');
    m.endRound('m1');
    m.endRound('m4');
    m.submitScores('m1', R1, NOTE_FOR_JORDAN);
    m.submitScores('m4', R2, NOTE_FOR_ADITYA);
    expect(JSON.stringify({ e: m.events(), h: m.history(), p: [m.phone('m1'), m.phone('m4')] })).toBe(first);
  });
});
