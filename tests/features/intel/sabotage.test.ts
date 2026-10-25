/**
 * Privacy proof. Each test here fails loudly if a privacy rule is weakened — an identity
 * surviving anonymization, the gate opening up, credits inflating, or the pipeline threshold
 * dropping. Production code is expected to pass all of it.
 */
import { describe, expect, it } from 'vitest';
import {
  anonymizeReport,
  checkIntelAccess,
  describeAnonymization,
  EMPTY_CREDITS,
  recordContribution,
  type RawInterviewReport,
} from '../../../src/features/intel/logic';
import { getPublicPipelineStats, MIN_REPORTS } from '../../../src/features/pipeline/logic';

const SECRETS = {
  email: 'maya@example.com',
  dashedPhone: '555-123-4567',
  parenPhone: '(555) 123-4567',
  compactPhone: '5551234567',
  intlPhone: '+1 555 123 4567',
  handle: '@maya123',
  exactDate: '2026-10-24',
} as const;

/** One report carrying every category of identity data at once. */
const hostileReport: RawInterviewReport = {
  company: 'Microsoft',
  round: `Screen with recruiter ${SECRETS.handle}`,
  topics: ['arrays', `ping ${SECRETS.email}`, `call ${SECRETS.dashedPhone}`],
  difficulty: 3,
  tip: `Reach me at ${SECRETS.email} or ${SECRETS.parenPhone} / ${SECRETS.compactPhone} / ${SECRETS.intlPhone}. Interviewed ${SECRETS.exactDate}.`,
  interviewDate: SECRETS.exactDate,
};

const FORBIDDEN_KEYS = ['name', 'email', 'phone', 'id', 'studentid', 'userid', 'identity', 'contact', 'interviewdate'];

/** Exact key match only, so benign keys that merely contain these words are not falsely flagged. */
function findIdentityKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => findIdentityKeys(item, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const hit = FORBIDDEN_KEYS.includes(key.toLowerCase()) ? [`${path}.${key}`] : [];
    return [...hit, ...findIdentityKeys(child, `${path}.${key}`)];
  });
}

describe('A. identity leak sabotage', () => {
  const serialized = JSON.stringify(anonymizeReport(hostileReport));

  it.each(Object.entries(SECRETS))('does not let the %s survive anonymization', (_label, secret) => {
    expect(serialized).not.toContain(secret);
  });

  it('leaves no email, phone, handle or date pattern at all', () => {
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(serialized).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
    expect(serialized).not.toMatch(/(^|[^\w@/])@\w{2,}/);
    expect(serialized).not.toMatch(/\d{4}-\d{1,2}-\d{1,2}/);
  });

  it('keeps the legitimate intel so scrubbing is not just deleting everything', () => {
    const shared = anonymizeReport(hostileReport);
    expect(shared.company).toBe('Microsoft');
    expect(shared.topics).toContain('arrays');
    expect(shared.difficulty).toBe(3);
  });

  it('never echoes a secret into the privacy events', () => {
    const events = JSON.stringify(describeAnonymization(hostileReport));
    for (const secret of Object.values(SECRETS)) expect(events).not.toContain(secret);
  });

  it('the leak scanner itself detects a planted secret', () => {
    expect(JSON.stringify({ tip: SECRETS.email })).toContain(SECRETS.email);
  });
});

describe('B. identity field sabotage', () => {
  it('exposes no identity-bearing keys on the shared report', () => {
    expect(findIdentityKeys(anonymizeReport(hostileReport))).toEqual([]);
  });

  it('exposes no identity-bearing keys on the privacy events', () => {
    expect(findIdentityKeys(describeAnonymization(hostileReport))).toEqual([]);
  });

  it('does not falsely flag benign keys, and does catch real ones', () => {
    expect(findIdentityKeys({ candidates: 3, roundId: 'x' })).toEqual([]);
    expect(findIdentityKeys({ nested: [{ email: 'x' }] })).toEqual(['$.nested[0].email']);
  });
});

describe('C. gate bypass sabotage', () => {
  const START = '2026-10-24T09:00:00.000Z';
  const HOUR = 60 * 60 * 1000;
  const at = (ms: number) => new Date(Date.parse(START) + ms).toISOString();

  it('denies a non-contributor whose grace period expired long ago', () => {
    const decision = checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now: at(100 * HOUR) });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('contribution-required');
  });

  it.each([49, 72, 240, 10_000])('still denies after %i hours', (hours) => {
    expect(checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now: at(hours * HOUR) }).allowed).toBe(
      false,
    );
  });

  // A gate hardcoded to `allowed: true` passes the tests above only if it also fails this one.
  it('does not simply allow everyone', () => {
    const allowed = checkIntelAccess({ hasContributed: true, gracePeriodStart: START, now: at(0) });
    const denied = checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now: at(100 * HOUR) });
    expect(allowed.allowed).not.toBe(denied.allowed);
  });
});

describe('D. 48-hour boundary sabotage', () => {
  const START = '2026-10-24T09:00:00.000Z';
  const HOUR = 60 * 60 * 1000;
  const at = (ms: number) => new Date(Date.parse(START) + ms).toISOString();
  const allowedAt = (ms: number) =>
    checkIntelAccess({ hasContributed: false, gracePeriodStart: START, now: at(ms) }).allowed;

  it('allows one millisecond before the boundary', () => {
    expect(allowedAt(48 * HOUR - 1)).toBe(true);
  });

  // Catches a `<=` written where `<` belongs.
  it('denies at exactly 48 hours', () => {
    expect(allowedAt(48 * HOUR)).toBe(false);
  });

  it('denies one millisecond after the boundary', () => {
    expect(allowedAt(48 * HOUR + 1)).toBe(false);
  });
});

describe('E. credit inflation sabotage', () => {
  const report: RawInterviewReport = {
    company: 'Microsoft',
    round: 'Technical screen',
    topics: ['arrays'],
    difficulty: 2,
    tip: 'Think out loud.',
    interviewDate: '2026-10-24',
  };

  it('awards exactly one credit no matter how often the same report is processed', () => {
    let state = EMPTY_CREDITS;
    for (let i = 0; i < 25; i += 1) state = recordContribution(state, { ...report });
    expect(state.credits).toBe(1);
  });

  it('awards exactly one credit for a first contribution, not more', () => {
    expect(recordContribution(EMPTY_CREDITS, report).credits).toBe(1);
  });

  it('still distinguishes a genuinely different contribution', () => {
    const once = recordContribution(EMPTY_CREDITS, report);
    expect(recordContribution(once, { ...report, round: 'Final round' }).credits).toBe(2);
  });
});

describe('F. pipeline threshold sabotage', () => {
  it('keeps the minimum at three reports', () => {
    expect(MIN_REPORTS).toBe(3);
  });

  it('hides a statistic supported by only two reports', () => {
    const cohorts = [
      {
        company: 'Testco',
        stats: {
          pipeline: { value: 40, reportCount: 9 },
          interview: { value: 11, reportCount: 9 },
          offers: { value: 8888, reportCount: 2 },
        },
      },
    ];
    const stats = getPublicPipelineStats('Testco', cohorts);

    expect(stats.offers.visible).toBe(false);
    expect(stats.offers.display).toBe('Not enough reports yet');
    expect(JSON.stringify(stats)).not.toContain('8888');
  });

  it('still shows a statistic supported by exactly three reports', () => {
    const cohorts = [
      {
        company: 'Testco',
        stats: {
          pipeline: { value: 40, reportCount: 3 },
          interview: { value: 11, reportCount: 3 },
          offers: { value: 7, reportCount: 3 },
        },
      },
    ];
    expect(getPublicPipelineStats('Testco', cohorts).offers.visible).toBe(true);
  });

  it('hides the Microsoft offers stat in the seeded data', () => {
    expect(getPublicPipelineStats('Microsoft').offers.visible).toBe(false);
  });
});
