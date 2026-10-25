import { describe, expect, it } from 'vitest';
import {
  anonymizeReport,
  checkIntelAccess,
  deriveContributionId,
  describeAccess,
  describeAnonymization,
  EMPTY_CREDITS,
  GENERALIZED_DATE,
  GRACE_PERIOD_HOURS,
  isIntelRelevant,
  MICROSOFT_SEED_INTEL,
  normalizeDifficulty,
  recordContribution,
  REDACTION,
  scrubIdentityText,
  selectRelevantIntel,
  type RawInterviewReport,
} from '../../../src/features/intel/logic';

const FORBIDDEN_KEYS = ['name', 'email', 'phone', 'id', 'studentid', 'userid', 'identity', 'contact', 'interviewdate'];

/** Recursively collect identity-bearing keys; exact key match only, so `candidates` is not flagged. */
function findIdentityKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => findIdentityKeys(item, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const hit = FORBIDDEN_KEYS.includes(key.toLowerCase()) ? [`${path}.${key}`] : [];
    return [...hit, ...findIdentityKeys(child, `${path}.${key}`)];
  });
}

const baseReport: RawInterviewReport = {
  company: 'Microsoft',
  round: 'Technical screen',
  topics: ['arrays', 'hash maps'],
  difficulty: 3,
  tip: 'Think out loud and state your assumptions.',
  interviewDate: '2026-10-24',
};

const HOUR = 60 * 60 * 1000;
const START = '2026-10-24T09:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(START) + ms).toISOString();

describe('anonymizeReport', () => {
  it('replaces the exact interview date with a generalized period', () => {
    expect(anonymizeReport(baseReport).when).toBe(GENERALIZED_DATE);
    expect(GENERALIZED_DATE).toBe('this week');
  });

  it('does not let the exact date survive anywhere in the serialized output', () => {
    const shared = anonymizeReport({ ...baseReport, tip: 'Interviewed on 2026-10-24, go early.' });
    expect(JSON.stringify(shared)).not.toContain('2026-10-24');
  });

  it('keeps useful intel intact', () => {
    const shared = anonymizeReport(baseReport);
    expect(shared.company).toBe('Microsoft');
    expect(shared.round).toBe('Technical screen');
    expect(shared.topics).toEqual(['arrays', 'hash maps']);
    expect(shared.tip).toBe('Think out loud and state your assumptions.');
    expect(shared.difficulty).toBe(3);
  });

  it('scrubs identity text inside topics', () => {
    const shared = anonymizeReport({ ...baseReport, topics: ['graphs', 'ping maya@example.com'] });
    expect(JSON.stringify(shared)).not.toContain('maya@example.com');
    expect(shared.topics[0]).toBe('graphs');
  });

  it('does not mutate its input', () => {
    const input = { ...baseReport, topics: [...baseReport.topics] };
    const snapshot = structuredClone(input);
    anonymizeReport(input);
    expect(input).toEqual(snapshot);
  });

  it('returns no identity-bearing fields', () => {
    expect(findIdentityKeys(anonymizeReport(baseReport))).toEqual([]);
    expect(Object.keys(anonymizeReport(baseReport)).sort()).toEqual([
      'company', 'difficulty', 'round', 'tip', 'topics', 'when',
    ]);
  });

  it('handles empty free text and a malformed date safely', () => {
    const shared = anonymizeReport({ ...baseReport, tip: '', round: '', topics: [], interviewDate: 'not-a-date' });
    expect(shared.tip).toBe('');
    expect(shared.topics).toEqual([]);
    expect(shared.when).toBe(GENERALIZED_DATE);
  });
});

describe('scrubIdentityText', () => {
  it.each([
    ['email', 'reach me at maya@example.com ok?', 'maya@example.com'],
    ['dashed phone', 'call 555-123-4567 later', '555-123-4567'],
    ['parenthesized phone', 'call (555) 123-4567 later', '123-4567'],
    ['compact phone', 'my number is 5551234567 thanks', '5551234567'],
    ['+1 phone', 'ring +1 555 123 4567 tonight', '555 123 4567'],
    ['handle', 'dm me @maya123 anytime', '@maya123'],
    ['iso date', 'interviewed 2026-10-24 early', '2026-10-24'],
  ])('scrubs a %s', (_label, input, secret) => {
    const scrubbed = scrubIdentityText(input);
    expect(scrubbed).not.toContain(secret);
    expect(scrubbed).toContain(REDACTION);
  });

  it('leaves safe text useful', () => {
    expect(scrubIdentityText('Practice BFS on grids and explain tradeoffs.')).toBe(
      'Practice BFS on grids and explain tradeoffs.',
    );
  });

  it('never throws on arbitrary input', () => {
    for (const junk of ['', '   ', '@@@@', '+++', '😀'.repeat(40), 'a'.repeat(5000), '((((']) {
      expect(() => scrubIdentityText(junk)).not.toThrow();
    }
  });
});

describe('normalizeDifficulty', () => {
  it.each([1, 2, 3, 4, 5])('keeps the valid difficulty %i', (d) => {
    expect(normalizeDifficulty(d)).toBe(d);
  });

  it.each([
    [0, 1],
    [-10, 1],
    [6, 5],
    [99, 5],
    // Non-finite input is not clamped but treated as unusable, so it falls to the lowest level.
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('clamps %p to %i', (input, expected) => {
    expect(normalizeDifficulty(input)).toBe(expected);
  });
});

describe('checkIntelAccess', () => {
  it('exports a 48 hour grace period', () => {
    expect(GRACE_PERIOD_HOURS).toBe(48);
  });

  it('allows a student who contributed', () => {
    const decision = checkIntelAccess({ hasContributed: true, gracePeriodStart: START, now: at(0) });
    expect(decision).toEqual({ allowed: true, reason: 'contributed' });
  });

  it('allows a fresh grace period with no contribution', () => {
    const decision = checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now: at(HOUR) });
    expect(decision).toEqual({ allowed: true, reason: 'grace-period' });
  });

  it('allows 47h59m59s', () => {
    const now = at(48 * HOUR - 1000);
    expect(checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now }).allowed).toBe(true);
  });

  it('blocks at exactly 48h', () => {
    const decision = checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now: at(48 * HOUR) });
    expect(decision).toEqual({ allowed: false, reason: 'contribution-required' });
  });

  it('blocks after 48h', () => {
    const decision = checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now: at(72 * HOUR) });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('contribution-required');
  });

  it('keeps a contributor allowed long after the grace period expires', () => {
    const decision = checkIntelAccess({ hasContributed: true, gracePeriodStart: START, now: at(1000 * HOUR) });
    expect(decision).toEqual({ allowed: true, reason: 'contributed' });
  });

  it('fails closed on an unparseable timestamp', () => {
    expect(checkIntelAccess({ hasContributed: false, gracePeriodStart: 'nonsense', now: at(0) }).allowed).toBe(false);
  });
});

describe('give-back credits', () => {
  it('awards exactly one credit for a first valid contribution', () => {
    const after = recordContribution(EMPTY_CREDITS, baseReport);
    expect(EMPTY_CREDITS.credits).toBe(0);
    expect(after.credits).toBe(1);
  });

  it('does not double-credit the same contribution', () => {
    const once = recordContribution(EMPTY_CREDITS, baseReport);
    const twice = recordContribution(once, baseReport);
    const thrice = recordContribution(twice, { ...baseReport });
    expect(twice.credits).toBe(1);
    expect(thrice.credits).toBe(1);
  });

  it('credits a genuinely different contribution', () => {
    const once = recordContribution(EMPTY_CREDITS, baseReport);
    const other = recordContribution(once, { ...baseReport, round: 'Final round', interviewDate: '2026-11-02' });
    expect(other.credits).toBe(2);
  });

  it('ignores a contribution with no usable intel', () => {
    expect(recordContribution(EMPTY_CREDITS, { ...baseReport, topics: [] }).credits).toBe(0);
    expect(recordContribution(EMPTY_CREDITS, { ...baseReport, company: '  ' }).credits).toBe(0);
  });

  it('does not mutate the previous credit state', () => {
    const start = { credits: 1, contributionIds: ['existing'] };
    const snapshot = structuredClone(start);
    recordContribution(start, baseReport);
    expect(start).toEqual(snapshot);
  });

  it('derives a stable id from content alone', () => {
    expect(deriveContributionId(baseReport)).toBe(deriveContributionId({ ...baseReport }));
    expect(deriveContributionId(baseReport)).not.toBe(deriveContributionId({ ...baseReport, round: 'Final' }));
  });
});

describe('company targeting', () => {
  const report = MICROSOFT_SEED_INTEL[0];

  it('matches a student waiting on the same company', () => {
    expect(isIntelRelevant(report, 'Microsoft')).toBe(true);
  });

  it('rejects a student waiting on a different company', () => {
    expect(isIntelRelevant(report, 'Stripe')).toBe(false);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(isIntelRelevant(report, '  mIcRoSoFt ')).toBe(true);
  });

  it('selects only the relevant reports', () => {
    expect(selectRelevantIntel(MICROSOFT_SEED_INTEL, 'Microsoft')).toHaveLength(4);
    expect(selectRelevantIntel(MICROSOFT_SEED_INTEL, 'Stripe')).toEqual([]);
  });
});

describe('seeded Microsoft intel', () => {
  it('provides exactly four reports', () => {
    expect(MICROSOFT_SEED_INTEL).toHaveLength(4);
  });

  it('is already anonymized and carries no exact date', () => {
    for (const report of MICROSOFT_SEED_INTEL) {
      expect(report.when).toBe(GENERALIZED_DATE);
      expect(anonymizeReport({ ...report, interviewDate: '2026-10-24' })).toEqual(report);
      expect(JSON.stringify(report)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it('contains no identity fields or identity text', () => {
    expect(findIdentityKeys(MICROSOFT_SEED_INTEL)).toEqual([]);
    const serialized = JSON.stringify(MICROSOFT_SEED_INTEL);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(serialized).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
    expect(serialized).not.toMatch(/(^|[^\w@/])@\w{2,}/);
  });

  it('varies difficulty across the 1-5 range', () => {
    const levels = MICROSOFT_SEED_INTEL.map((r) => r.difficulty);
    expect(new Set(levels).size).toBeGreaterThan(1);
    for (const level of levels) expect(level).toBeGreaterThanOrEqual(1);
    for (const level of levels) expect(level).toBeLessThanOrEqual(5);
  });
});

describe('privacy events', () => {
  const hostile: RawInterviewReport = {
    ...baseReport,
    tip: 'email maya@example.com or call 555-123-4567, dm @maya123',
  };

  it('never echoes a removed value', () => {
    const events = describeAnonymization(hostile);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('maya@example.com');
    expect(serialized).not.toContain('555-123-4567');
    expect(serialized).not.toContain('@maya123');
    expect(events).toContainEqual({ kind: 'hidden', detail: 'Identity/contact details removed' });
  });

  it('always reports what was shared and summarized', () => {
    const events = describeAnonymization(baseReport);
    expect(events).toContainEqual({ kind: 'shared', detail: 'Topics and difficulty shared' });
    expect(events).toContainEqual({ kind: 'summarized', detail: `Interview date → ${GENERALIZED_DATE}` });
  });

  it('omits the hidden event when there was nothing to remove', () => {
    expect(describeAnonymization(baseReport).some((e) => e.kind === 'hidden')).toBe(false);
  });

  it('reflects the gate decision accurately', () => {
    expect(describeAccess({ allowed: true, reason: 'grace-period' })).toEqual({
      kind: 'gate',
      detail: 'Intel unlocked: grace period',
    });
    expect(describeAccess({ allowed: true, reason: 'contributed' }).detail).toBe('Intel unlocked: report contributed');
    expect(describeAccess({ allowed: false, reason: 'contribution-required' })).toEqual({
      kind: 'gate',
      detail: 'Intel locked: contribution required',
    });
  });
});
