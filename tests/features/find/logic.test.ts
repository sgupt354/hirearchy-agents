import { describe, expect, it } from 'vitest';
import {
  EMPTY_FIND_STATE,
  SEED_JOBS,
  STUDENT_FILTERS,
  describeDismiss,
  describeMatch,
  describeTrack,
  dismissJob,
  filterJobs,
  getApplicationStatus,
  isTracked,
  matchesFilters,
  surfacedMatches,
  trackJob,
} from '../../../src/features/find/logic';

const byCompany = (company: string) => SEED_JOBS.find((j) => j.company === company)!;
const companies = (jobs: { company: string }[]) => jobs.map((j) => j.company);

describe('seed postings', () => {
  it('seeds exactly three jobs', () => {
    expect(SEED_JOBS).toHaveLength(3);
  });

  it.each(['Microsoft', 'Stripe', 'Datadog'])('includes a %s SWE Intern posting', (company) => {
    const job = byCompany(company);
    expect(job).toBeDefined();
    expect(job.role).toBe('SWE Intern');
    expect(job.level).toBe('Intern');
  });

  it('posts everything as "2h ago"', () => {
    for (const job of SEED_JOBS) expect(job.posted).toBe('2h ago');
  });

  it('gives every job a stable unique id and a US location', () => {
    const ids = SEED_JOBS.map((j) => j.id);
    expect(new Set(ids).size).toBe(3);
    for (const job of SEED_JOBS) {
      expect(job.id).toMatch(/^job-[a-z-]+$/);
      expect(job.location).toMatch(/, [A-Z]{2}$/);
    }
  });

  it('gives every job concise match reasons', () => {
    for (const job of SEED_JOBS) {
      expect(job.reasons.length).toBeGreaterThan(0);
      for (const reason of job.reasons) expect(reason.length).toBeGreaterThan(0);
    }
    expect(byCompany('Stripe').reasons).toContain('SWE internship');
  });
});

describe('filtering', () => {
  it('surfaces the seeded roles for the student profile', () => {
    expect(companies(filterJobs(SEED_JOBS, STUDENT_FILTERS))).toEqual(['Microsoft', 'Stripe', 'Datadog']);
  });

  it.each(['SWE Intern', 'swe intern', 'SWE INTERN', '  swe   intern  '])(
    'matches the role %j case- and whitespace-insensitively',
    (role) => {
      expect(filterJobs(SEED_JOBS, { role })).toHaveLength(3);
    },
  );

  it('does not match a different role', () => {
    expect(filterJobs(SEED_JOBS, { role: 'Product Manager' })).toEqual([]);
  });

  it.each(['Intern', 'intern', '  INTERN '])('matches the level %j', (level) => {
    expect(filterJobs(SEED_JOBS, { level })).toHaveLength(3);
  });

  it('does not match a different level', () => {
    expect(filterJobs(SEED_JOBS, { level: 'Senior' })).toEqual([]);
  });

  it('combines role and level', () => {
    expect(filterJobs(SEED_JOBS, { role: 'swe intern', level: 'intern' })).toHaveLength(3);
    expect(filterJobs(SEED_JOBS, { role: 'swe intern', level: 'senior' })).toEqual([]);
  });

  it('treats a missing or blank filter as no constraint', () => {
    expect(filterJobs(SEED_JOBS, {})).toHaveLength(3);
    expect(filterJobs(SEED_JOBS, { role: '   ' })).toHaveLength(3);
    expect(matchesFilters(byCompany('Stripe'))).toBe(true);
  });

  it('never throws on arbitrary filter strings', () => {
    for (const junk of ['', '   ', '((((', '😀', 'a'.repeat(5000)]) {
      expect(() => filterJobs(SEED_JOBS, { role: junk, level: junk })).not.toThrow();
    }
  });

  it('does not mutate the seed data', () => {
    const snapshot = structuredClone(SEED_JOBS);
    filterJobs(SEED_JOBS, STUDENT_FILTERS);
    surfacedMatches(EMPTY_FIND_STATE);
    expect(structuredClone(SEED_JOBS)).toEqual(snapshot);
  });
});

describe('tracking', () => {
  const stripe = byCompany('Stripe');

  it('marks the job applied', () => {
    const next = trackJob(EMPTY_FIND_STATE, stripe.id);
    expect(next.tracked).toEqual([{ jobId: stripe.id, company: 'Stripe', status: 'applied' }]);
    expect(getApplicationStatus(next, stripe.id)).toBe('applied');
  });

  it('returns a new state without mutating the old one', () => {
    const before = structuredClone(EMPTY_FIND_STATE);
    const next = trackJob(EMPTY_FIND_STATE, stripe.id);
    expect(next).not.toBe(EMPTY_FIND_STATE);
    expect(EMPTY_FIND_STATE).toEqual(before);
  });

  it('does not duplicate a job tracked twice', () => {
    let state = trackJob(EMPTY_FIND_STATE, stripe.id);
    state = trackJob(state, stripe.id);
    state = trackJob(state, stripe.id);
    expect(state.tracked).toHaveLength(1);
  });

  it('does not disturb another tracked job', () => {
    const state = trackJob(trackJob(EMPTY_FIND_STATE, stripe.id), byCompany('Datadog').id);
    expect(state.tracked.map((t) => t.company)).toEqual(['Stripe', 'Datadog']);
    expect(isTracked(state, stripe.id)).toBe(true);
  });

  it('ignores an unknown job id', () => {
    expect(trackJob(EMPTY_FIND_STATE, 'nope').tracked).toEqual([]);
    expect(trackJob(EMPTY_FIND_STATE, '').tracked).toEqual([]);
    expect(getApplicationStatus(EMPTY_FIND_STATE, 'nope')).toBe('not-tracked');
  });
});

describe('dismissal', () => {
  const microsoft = byCompany('Microsoft');

  it('dismisses the job without marking it applied', () => {
    const next = dismissJob(EMPTY_FIND_STATE, microsoft.id);
    expect(next.dismissed).toEqual([microsoft.id]);
    expect(next.tracked).toEqual([]);
    expect(getApplicationStatus(next, microsoft.id)).toBe('not-tracked');
  });

  it('is harmless when repeated', () => {
    let state = dismissJob(EMPTY_FIND_STATE, microsoft.id);
    state = dismissJob(state, microsoft.id);
    expect(state.dismissed).toEqual([microsoft.id]);
  });

  it('removes the job from the surfaced matches', () => {
    const state = dismissJob(EMPTY_FIND_STATE, microsoft.id);
    expect(companies(surfacedMatches(state))).toEqual(['Stripe', 'Datadog']);
  });

  it('does not mutate the previous state', () => {
    const start = { tracked: [], dismissed: ['x'] };
    const snapshot = structuredClone(start);
    dismissJob(start, microsoft.id);
    expect(start).toEqual(snapshot);
  });
});

describe('surfaced matches', () => {
  it('starts with all three', () => {
    expect(companies(surfacedMatches(EMPTY_FIND_STATE))).toEqual(['Microsoft', 'Stripe', 'Datadog']);
  });

  it('drops both tracked and dismissed jobs', () => {
    let state = trackJob(EMPTY_FIND_STATE, byCompany('Stripe').id);
    state = dismissJob(state, byCompany('Microsoft').id);
    expect(companies(surfacedMatches(state))).toEqual(['Datadog']);
  });

  it('empties once every job is decided', () => {
    const state = SEED_JOBS.reduce((s, job) => trackJob(s, job.id), EMPTY_FIND_STATE);
    expect(surfacedMatches(state)).toEqual([]);
  });
});

describe('match events', () => {
  const stripe = byCompany('Stripe');

  it('explains the role and level that matched', () => {
    expect(describeMatch(stripe)).toEqual([
      { kind: 'matched', detail: 'Role: SWE Intern' },
      { kind: 'matched', detail: 'Level: Intern' },
    ]);
  });

  it('omits a rule that was not applied', () => {
    expect(describeMatch(stripe, { role: 'SWE Intern' })).toEqual([{ kind: 'matched', detail: 'Role: SWE Intern' }]);
  });

  it('describes tracking and dismissal without private data', () => {
    expect(describeTrack(stripe)).toEqual({ kind: 'tracked', detail: 'Stripe pipeline status → applied' });
    expect(describeDismiss(stripe)).toEqual({ kind: 'dismissed', detail: 'Stripe SWE Intern · not for me' });

    const serialized = JSON.stringify([describeMatch(stripe), describeTrack(stripe), describeDismiss(stripe)]);
    for (const key of ['email', 'phone', 'studentId', 'name']) expect(serialized).not.toContain(key);
  });
});
