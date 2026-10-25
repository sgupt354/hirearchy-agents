import { describe, expect, it } from 'vitest';
import {
  getPipelineInspector,
  getPublicPipelineStats,
  HIDDEN_DISPLAY,
  MIN_REPORTS,
  SEED_COHORTS,
  STAT_KEYS,
  type CompanyCohort,
  type PublicStat,
  type StatKey,
} from '../../../src/features/pipeline/logic';

/** Field names that must never reach any public or inspector output. */
const FORBIDDEN_KEYS = ['name', 'email', 'studentid', 'userid', 'reporterid', 'identity', 'id'];

/** Recursively scan an object graph for identity-bearing keys so a future refactor cannot sneak one in. */
function findIdentityKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => findIdentityKeys(item, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const lowered = key.toLowerCase();
    const hit = FORBIDDEN_KEYS.includes(lowered) ? [`${path}.${key}`] : [];
    return [...hit, ...findIdentityKeys(child, `${path}.${key}`)];
  });
}

/** Build a one-company cohort where every stat carries the same report count. */
const cohortWith = (reportCount: number, value = 42): CompanyCohort[] => [
  {
    company: 'Testco',
    stats: {
      pipeline: { value, reportCount },
      interview: { value, reportCount },
      offers: { value, reportCount },
    },
  },
];

/** Cohort where exactly one stat has the given report count and the others comfortably clear it. */
const cohortWhereOnly = (stat: StatKey, reportCount: number): CompanyCohort[] => {
  const base = { value: 10, reportCount: 9 };
  const stats = { pipeline: { ...base }, interview: { ...base }, offers: { ...base } };
  stats[stat] = { value: 10, reportCount };
  return [{ company: 'Testco', stats }];
};

describe('threshold', () => {
  it('requires three reports', () => {
    expect(MIN_REPORTS).toBe(3);
  });

  it.each([0, 1, 2])('hides a stat backed by only %i reports', (reportCount) => {
    const stats = getPublicPipelineStats('Testco', cohortWith(reportCount));
    for (const key of STAT_KEYS) {
      expect(stats[key].visible).toBe(false);
      expect(stats[key].display).toBe(HIDDEN_DISPLAY);
    }
  });

  it('shows a stat at exactly three reports', () => {
    const stats = getPublicPipelineStats('Testco', cohortWith(3, 11));
    for (const key of STAT_KEYS) expect(stats[key].visible).toBe(true);
    expect(stats.pipeline.display).toBe('11 in your pipeline');
  });

  it.each([4, 5, 50])('shows a stat backed by %i reports', (reportCount) => {
    const stats = getPublicPipelineStats('Testco', cohortWith(reportCount, 11));
    for (const key of STAT_KEYS) expect(stats[key].visible).toBe(true);
  });

  // Guards the exact boundary: a comparison loosened to >= 2 fails here.
  it.each(STAT_KEYS)('enforces the boundary independently for %s', (stat) => {
    const atTwo = getPublicPipelineStats('Testco', cohortWhereOnly(stat, 2));
    expect(atTwo[stat].visible).toBe(false);

    const atThree = getPublicPipelineStats('Testco', cohortWhereOnly(stat, 3));
    expect(atThree[stat].visible).toBe(true);
  });

  it('hiding one stat never hides the unrelated eligible stats', () => {
    const stats = getPublicPipelineStats('Testco', cohortWhereOnly('offers', 1));
    expect(stats.offers.visible).toBe(false);
    expect(stats.pipeline.visible).toBe(true);
    expect(stats.interview.visible).toBe(true);
  });
});

describe('seeded cohorts', () => {
  it('Microsoft shows pipeline and interview but hides offers', () => {
    const stats = getPublicPipelineStats('Microsoft');
    expect(stats).toEqual({
      company: 'Microsoft',
      pipeline: { visible: true, display: '23 in your pipeline' },
      interview: { visible: true, display: '6 at interview' },
      offers: { visible: false, display: HIDDEN_DISPLAY },
    });
  });

  it('Stripe hides only the interview stat', () => {
    const stats = getPublicPipelineStats('Stripe');
    expect(stats.pipeline.visible).toBe(true);
    expect(stats.interview.visible).toBe(false);
    expect(stats.offers.visible).toBe(true);
  });

  it('Datadog hides the stats with too few reports', () => {
    const stats = getPublicPipelineStats('Datadog');
    expect(stats.pipeline.visible).toBe(true);
    expect(stats.interview.visible).toBe(false);
    expect(stats.offers.visible).toBe(false);
  });

  it('seeds all three demo companies deterministically', () => {
    expect(SEED_COHORTS.map((c) => c.company)).toEqual(['Microsoft', 'Stripe', 'Datadog']);
    expect(getPublicPipelineStats('Microsoft')).toEqual(getPublicPipelineStats('Microsoft'));
  });
});

describe('privacy of the public result', () => {
  it('never carries the suppressed number in any field', () => {
    const offers = getPublicPipelineStats('Microsoft').offers as PublicStat & Record<string, unknown>;

    expect(Object.keys(offers).sort()).toEqual(['display', 'visible']);
    expect(offers.value).toBeUndefined();
    expect(offers.count).toBeUndefined();
    expect(offers.raw).toBeUndefined();
    expect(offers.reportCount).toBeUndefined();
  });

  it('a suppressed value never appears anywhere in the serialized result', () => {
    // A distinctive value so the check cannot be satisfied by coincidence.
    const stats = getPublicPipelineStats('Testco', cohortWhereOnly('offers', 2).map((c) => ({
      ...c,
      stats: { ...c.stats, offers: { value: 7777, reportCount: 2 } },
    })));

    expect(stats.offers.visible).toBe(false);
    expect(JSON.stringify(stats)).not.toContain('7777');
    expect(JSON.stringify(getPipelineInspector('Microsoft'))).not.toContain('"value"');
  });

  it('exposes no identity-bearing fields', () => {
    for (const company of ['Microsoft', 'Stripe', 'Datadog', 'Unknown']) {
      expect(findIdentityKeys(getPublicPipelineStats(company))).toEqual([]);
    }
  });

  it('the identity scanner actually detects a planted field', () => {
    expect(findIdentityKeys({ nested: [{ email: 'a@b.c' }] })).toEqual(['$.nested[0].email']);
  });
});

describe('inspector', () => {
  it('names the hidden statistic and explains the threshold', () => {
    const entries = getPipelineInspector('Microsoft');
    const offers = entries.find((e) => e.stat === 'offers')!;

    expect(offers.status).toBe('hidden');
    expect(offers.reportCount).toBe(2);
    expect(offers.minReports).toBe(MIN_REPORTS);
    expect(offers.reason).toBe('2 reports < minimum 3');
  });

  it('marks the stats that cleared the bar as visible', () => {
    const entries = getPipelineInspector('Microsoft');
    expect(entries.filter((e) => e.status === 'visible').map((e) => e.stat)).toEqual(['pipeline', 'interview']);
  });

  it('reports every stat exactly once', () => {
    expect(getPipelineInspector('Stripe').map((e) => e.stat)).toEqual([...STAT_KEYS]);
  });

  it('exposes no identity-bearing fields', () => {
    for (const company of ['Microsoft', 'Stripe', 'Datadog', 'Unknown']) {
      expect(findIdentityKeys(getPipelineInspector(company))).toEqual([]);
    }
  });
});

describe('robustness', () => {
  it.each(['Unknown Corp', '', '   ', 'MICROSOFT!!'])('handles the unrecognized company %j safely', (company) => {
    const stats = getPublicPipelineStats(company);
    for (const key of STAT_KEYS) {
      expect(stats[key].visible).toBe(false);
      expect(stats[key].display).toBe(HIDDEN_DISPLAY);
    }
  });

  it('reports zero counts for an unknown company in the inspector', () => {
    const entries = getPipelineInspector('Unknown Corp');
    expect(entries).toHaveLength(STAT_KEYS.length);
    for (const entry of entries) {
      expect(entry.status).toBe('hidden');
      expect(entry.reportCount).toBe(0);
      expect(entry.reason).toBe('0 reports < minimum 3');
    }
  });

  it('matches a known company case-insensitively', () => {
    expect(getPublicPipelineStats('microsoft').pipeline.visible).toBe(true);
  });

  it('does not mutate its inputs', () => {
    const cohorts = cohortWith(5, 9);
    const snapshot = structuredClone(cohorts);

    getPublicPipelineStats('Testco', cohorts);
    getPipelineInspector('Testco', cohorts);

    expect(cohorts).toEqual(snapshot);
    expect(structuredClone(SEED_COHORTS)).toEqual(SEED_COHORTS);
  });
});
