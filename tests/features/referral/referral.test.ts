import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IdentityLockedError } from '../../../src/engine/identity';
import { HumanDecisionRequiredError, ReferralBridge } from '../../../src/features/referral/referralBridge';
import { fitCheck } from '../../../src/features/referral/rules';
import { DECOY, REFERRER, REFERRER_RULES, SEEKER } from '../../../src/features/referral/seed';
import type { EvidenceStage1 } from '../../../src/features/trust/evidence';
import { TrustNetwork } from '../../../src/features/trust/network';

const bridge = () => new ReferralBridge(new TrustNetwork());

/** Seeker shares, both say yes to the chat, the chat happens. Stops where only the referrer's human can act. */
function toDecision(b = bridge(), seeker = SEEKER) {
  b.offer(seeker);
  b.seekerShares(seeker, true);
  b.reply(seeker, 'accept');
  b.reply(REFERRER, 'accept');
  b.chatDone(REFERRER);
  return b;
}

const visibleTo = (b: ReferralBridge, id: string) => b.events().filter((e) => e.from === id || e.to.includes(id));

const STATS: EvidenceStage1 = { stage: 1, sessionsAttended: 3, averageRating: 4.8, mockAverage: 4.2, skillsTaught: ['DSA', 'System Design'], intelReports: 1, targetRoles: ['Stripe SWE Intern'] };

describe('referral: deterministic fit check, one result per private rule', () => {
  const check = (stats: Partial<EvidenceStage1> = {}, rules: Partial<typeof REFERRER_RULES> = {}, role = 'Stripe SWE Intern') =>
    fitCheck({ ...REFERRER_RULES, ...rules }, { ...STATS, ...stats }, role);
  const rule = (r: ReturnType<typeof check>, id: string) => r.results.find((x) => x.id === id)!.pass;

  it('the spec seeker passes every rule', () => {
    const r = check();
    expect(r.results.map((x) => x.id)).toEqual(['role', 'sessions', 'rating', 'mock', 'meet', 'limit']);
    expect(r.pass).toBe(true);
  });

  it('role: SWE / Software Engineer / Backend only', () => {
    expect(rule(check({}, {}, 'Stripe Backend Intern'), 'role')).toBe(true);
    expect(rule(check({}, {}, 'Stripe Software Engineer'), 'role')).toBe(true);
    const r = check({}, {}, 'Stripe Product Design Intern');
    expect(rule(r, 'role')).toBe(false);
    expect(r.pass).toBe(false);
  });

  it('sessions: at least 2', () => {
    expect(rule(check({ sessionsAttended: 2 }), 'sessions')).toBe(true);
    expect(rule(check({ sessionsAttended: 1 }), 'sessions')).toBe(false);
  });

  it('rating: at least 4.5, and "not enough ratings" fails', () => {
    expect(rule(check({ averageRating: 4.5 }), 'rating')).toBe(true);
    expect(rule(check({ averageRating: 4.4 }), 'rating')).toBe(false);
    expect(rule(check({ averageRating: null }), 'rating')).toBe(false);
  });

  it('mock average: at least 4.0, and no peer mocks fails', () => {
    expect(rule(check({ mockAverage: 4.0 }), 'mock')).toBe(true);
    expect(rule(check({ mockAverage: 3.9 }), 'mock')).toBe(false);
    expect(rule(check({ mockAverage: null }), 'mock')).toBe(false);
  });

  it('must meet first: always met by scheduling the chat before any decision', () => {
    expect(rule(check(), 'meet')).toBe(true);
    const b = bridge();
    b.offer(SEEKER);
    b.seekerShares(SEEKER, true);
    expect(b.state).toBe('AWAITING_HUMANS');
    expect(() => b.decide(REFERRER, 'refer')).toThrow(HumanDecisionRequiredError);
    expect(b.window).toEqual({ start: '19:00', end: '19:15' });
  });

  it('limit: fails once no referrals are left this month', () => {
    expect(rule(check({}, { usedThisMonth: 1 }), 'limit')).toBe(true);
    expect(rule(check({}, { usedThisMonth: 2 }), 'limit')).toBe(false);
  });

  it('is deterministic: same input, same result', () => {
    expect(check()).toEqual(check());
  });
});

describe('referral: the monthly limit is enforced', () => {
  it('after two referrals the next passing seeker fails on the limit only', () => {
    const b = toDecision();
    b.decide(REFERRER, 'refer');
    expect(b.referrerStatus()).toMatchObject({ left: 1, used: 1, limit: 2 });

    b.nextSeeker();
    toDecision(b, SEEKER);
    b.decide(REFERRER, 'refer');
    expect(b.referrerStatus()).toMatchObject({ left: 0, used: 2, limit: 2 });

    b.nextSeeker();
    b.offer(SEEKER);
    b.seekerShares(SEEKER, true);
    expect(b.state).toBe('NOT_A_FIT');
    const failed = b.fitResult(REFERRER)!.results.filter((r) => !r.pass).map((r) => r.id);
    expect(failed).toEqual(['limit']);
    expect(b.events().some((e) => e.type === 'DISCOVER' && e.payload.stage === 2)).toBe(false);
  });

  it('"not yet" and "no" use no referral', () => {
    for (const d of ['not_yet', 'no'] as const) {
      const b = toDecision();
      b.decide(REFERRER, d, 'Do one more system design mock');
      expect(b.referrerStatus()).toMatchObject({ left: 2, used: 0, credits: 0 });
    }
  });

  it('reset restores the month; nextSeeker keeps it', () => {
    const b = toDecision();
    b.decide(REFERRER, 'refer');
    b.nextSeeker();
    expect(b.referrerStatus().left).toBe(1);
    b.reset();
    expect(b.referrerStatus()).toEqual({ left: 2, used: 0, limit: 2, credits: 0 });
  });
});

describe('referral: no identity before consent', () => {
  it('names stay locked until both say yes, then unlock for both', () => {
    const b = bridge();
    b.offer(SEEKER);
    b.seekerShares(SEEKER, true);
    expect(() => b.getIdentity(REFERRER, SEEKER)).toThrow(IdentityLockedError);
    expect(() => b.getIdentity(SEEKER, REFERRER)).toThrow(IdentityLockedError);
    b.reply(SEEKER, 'accept');
    expect(() => b.getIdentity(REFERRER, SEEKER)).toThrow(IdentityLockedError);
    expect(b.events().some((e) => e.type === 'REVEAL')).toBe(false);
    expect(JSON.stringify([b.phone(REFERRER), b.events()])).not.toMatch(/Jordan|Ellis|jordan\.ellis|jellis/);
    expect(JSON.stringify(b.phone(SEEKER))).not.toMatch(/Nadia|Brooks|nadiab/);

    b.reply(REFERRER, 'accept');
    expect(b.state).toBe('CONFIRMED');
    expect(b.getIdentity(REFERRER, SEEKER).name).toBe('Jordan Ellis');
    expect(b.getIdentity(SEEKER, REFERRER).name).toBe('Nadia Brooks');
  });

  it('stages go out in order: stats, then links only after the fit passes, then names after consent', () => {
    const b = toDecision();
    const order = b.events().map((e) => (e.type === 'DISCOVER' ? `stage${e.payload.stage}` : e.payload.kind === 'fit' ? 'fit' : e.type === 'REVEAL' ? 'stage3' : e.type === 'CONSENT' && e.payload.kind === 'chat' ? 'consent' : null)).filter(Boolean);
    expect(order).toEqual(['stage1', 'fit', 'stage2', 'consent', 'consent', 'stage3', 'stage3']);
    // Stage 1 carries no links or rubric; nothing before stage 3 carries a name.
    const s1 = b.events().find((e) => e.payload.stage === 1)!;
    expect(JSON.stringify(s1.payload)).not.toMatch(/projectLinks|mockAverages|projects\.example/);
  });

  it('a "no" to the chat dissolves it with no names shared', () => {
    const b = bridge();
    b.offer(SEEKER);
    b.seekerShares(SEEKER, true);
    b.reply(SEEKER, 'accept');
    b.reply(REFERRER, 'decline');
    expect(b.state).toBe('DECLINED');
    expect(() => b.getIdentity(SEEKER, REFERRER)).toThrow(IdentityLockedError);
    expect(b.events().some((e) => e.type === 'REVEAL')).toBe(false);
  });

  it('"not now" from the seeker shares nothing at all', () => {
    const b = bridge();
    b.offer(SEEKER);
    b.seekerShares(SEEKER, false);
    expect(b.state).toBe('WITHDRAWN');
    expect(b.phone(REFERRER)).toEqual([]);
    expect(b.events().some((e) => e.type === 'DISCOVER')).toBe(false);
  });
});

describe('referral: no referral without a human', () => {
  it('the agents stop at the decision and wait for the referrer', () => {
    const b = toDecision();
    expect(b.state).toBe('CHAT_DONE');
    expect(b.events().some((e) => e.payload.kind === 'referred')).toBe(false);
    expect(b.phone(REFERRER).at(-1)).toMatchObject({ kind: 'ask-decide', needsHuman: true });
  });

  it('only the referrer, only after the chat', () => {
    const b = toDecision();
    expect(() => b.decide(SEEKER, 'refer')).toThrow(HumanDecisionRequiredError);
    expect(() => b.decide('broker', 'refer')).toThrow(HumanDecisionRequiredError);
    expect(b.state).toBe('CHAT_DONE');

    const early = bridge();
    early.offer(SEEKER);
    early.seekerShares(SEEKER, true);
    early.reply(SEEKER, 'accept');
    early.reply(REFERRER, 'accept');
    expect(() => early.decide(REFERRER, 'refer')).toThrow(HumanDecisionRequiredError);
    expect(() => early.chatDone(SEEKER)).toThrow();
  });

  it('decide() is the only code path to REFERRED', () => {
    const src = readFileSync('src/features/referral/referralBridge.ts', 'utf8');
    const decide = src.slice(src.indexOf('  decide(by: string'), src.indexOf('  // ---- internals'));
    expect(src.match(/#set\('REFERRED'\)/g)).toHaveLength(1);
    expect(decide).toContain("#set('REFERRED')");
  });

  it('refer: the seeker hears it, the referrer earns give-back credit', () => {
    const b = toDecision();
    b.decide(REFERRER, 'refer');
    expect(b.state).toBe('REFERRED');
    expect(b.referrerStatus().credits).toBe(1);
    expect(b.phone(SEEKER).at(-1)!.text).toMatch(/Nadia referred you to Stripe SWE Intern/);
    expect(b.events().some((e) => e.payload.kind === 'credit' && e.to.includes(REFERRER))).toBe(true);
  });

  it('not yet: the seeker gets the coaching note', () => {
    const b = toDecision();
    b.decide(REFERRER, 'not_yet', 'Do one more system design mock');
    expect(b.state).toBe('NOT_YET');
    expect(b.phone(SEEKER).at(-1)!.text).toContain('Do one more system design mock');
  });
});

describe('referral: the decoy never learns the private rules', () => {
  const run = () => {
    const b = bridge();
    b.offer(DECOY);
    b.seekerShares(DECOY, true);
    return b;
  };

  it('Theo fails on rating only and is declined', () => {
    const b = run();
    expect(b.state).toBe('NOT_A_FIT');
    expect(b.fitResult(REFERRER)!.results.filter((r) => !r.pass).map((r) => r.id)).toEqual(['rating']);
  });

  it('nothing Theo can see names a rule, a threshold or the referrer', () => {
    const b = run();
    // Theo's own stage-1 stats are theirs to see; everything else must carry no rule, threshold or name.
    const seen = JSON.stringify([visibleTo(b, DECOY).map(({ created_at: _, ...e }) => e), b.phone(DECOY)]);
    for (const leak of ['4.5', '4.0', '≥', 'At least', 'Peer rating', 'Mock average', 'referrals a month', 'left this month', 'Must meet', 'private rules', '"results"', '"kind":"fit"', 'Nadia', 'Brooks', 'nadiab']) {
      expect(seen).not.toContain(leak);
    }
    expect(b.fitResult(DECOY)).toBeNull();
    // The fit-check event is addressed to the referrer's own agent only.
    expect(b.events().filter((e) => e.payload.kind === 'fit').every((e) => e.to.length === 1 && e.to[0] === REFERRER)).toBe(true);
  });

  it('Theo shared no stage 2, and no names went either way', () => {
    const b = run();
    expect(b.events().some((e) => e.payload.stage === 2)).toBe(false);
    expect(b.events().some((e) => e.type === 'REVEAL')).toBe(false);
    expect(() => b.getIdentity(REFERRER, DECOY)).toThrow(IdentityLockedError);
    expect(JSON.stringify(b.phone(REFERRER))).not.toMatch(/Theo|Park|theop|t5w1/);
  });
});
