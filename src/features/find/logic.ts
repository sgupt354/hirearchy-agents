/**
 * Job Sniper matches (Track 1) feeding the Track 2 journey. Pure and deterministic:
 * no React, no browser APIs, no network, no randomness, no current-time dependency.
 */

export interface JobPosting {
  id: string;
  company: string;
  role: string;
  level: string;
  location: string;
  posted: string;
  reasons: readonly string[];
}

export interface JobFilters {
  role?: string;
  level?: string;
}

export type ApplicationStatus = 'applied';

export interface TrackedApplication {
  jobId: string;
  company: string;
  status: ApplicationStatus;
}

export interface FindState {
  tracked: readonly TrackedApplication[];
  dismissed: readonly string[];
}

export const EMPTY_FIND_STATE: FindState = { tracked: [], dismissed: [] };

/** The student profile this demo matches against. */
export const STUDENT_FILTERS: JobFilters = { role: 'SWE Intern', level: 'Intern' };

/** Deterministic demo postings. `posted` is a fixed string, never derived from the clock. */
export const SEED_JOBS: readonly JobPosting[] = [
  {
    id: 'job-microsoft-swe-intern',
    company: 'Microsoft',
    role: 'SWE Intern',
    level: 'Intern',
    location: 'Redmond, WA',
    posted: '2h ago',
    reasons: ['SWE internship', 'US role', 'Matches your level'],
  },
  {
    id: 'job-stripe-swe-intern',
    company: 'Stripe',
    role: 'SWE Intern',
    level: 'Intern',
    location: 'Seattle, WA',
    posted: '2h ago',
    reasons: ['SWE internship', 'US role', 'Matches your level'],
  },
  {
    id: 'job-datadog-swe-intern',
    company: 'Datadog',
    role: 'SWE Intern',
    level: 'Intern',
    location: 'New York, NY',
    posted: '2h ago',
    reasons: ['SWE internship', 'US role', 'Matches your level'],
  },
];

/** Case-insensitive, whitespace-tolerant comparison key. */
function norm(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

/** A blank or missing filter is treated as "no constraint" rather than an error. */
export function matchesFilters(job: JobPosting, filters: JobFilters = {}): boolean {
  const role = norm(filters.role);
  const level = norm(filters.level);
  if (role && norm(job.role) !== role) return false;
  if (level && norm(job.level) !== level) return false;
  return true;
}

export function filterJobs(jobs: readonly JobPosting[] = SEED_JOBS, filters: JobFilters = {}): JobPosting[] {
  return jobs.filter((job) => matchesFilters(job, filters));
}

/** Matches still awaiting a decision: filtered, minus anything dismissed or already tracked. */
export function surfacedMatches(
  state: FindState = EMPTY_FIND_STATE,
  filters: JobFilters = STUDENT_FILTERS,
  jobs: readonly JobPosting[] = SEED_JOBS,
): JobPosting[] {
  return filterJobs(jobs, filters).filter(
    (job) => !state.dismissed.includes(job.id) && !state.tracked.some((t) => t.jobId === job.id),
  );
}

export function isTracked(state: FindState, jobId: string): boolean {
  return state.tracked.some((t) => t.jobId === jobId);
}

export function getApplicationStatus(state: FindState, jobId: string): ApplicationStatus | 'not-tracked' {
  return isTracked(state, jobId) ? 'applied' : 'not-tracked';
}

/**
 * "Track it" — marks the student applied in that company's pipeline. Returns a new state;
 * tracking the same job twice adds nothing and an unknown job is ignored.
 */
export function trackJob(state: FindState, jobId: string, jobs: readonly JobPosting[] = SEED_JOBS): FindState {
  const job = jobs.find((j) => j.id === jobId);
  if (!job || isTracked(state, jobId)) {
    return { tracked: [...state.tracked], dismissed: [...state.dismissed] };
  }
  return {
    tracked: [...state.tracked, { jobId, company: job.company, status: 'applied' }],
    dismissed: [...state.dismissed],
  };
}

/** "Not for me" — hides the job without ever marking it applied. */
export function dismissJob(state: FindState, jobId: string): FindState {
  if (!jobId || state.dismissed.includes(jobId)) {
    return { tracked: [...state.tracked], dismissed: [...state.dismissed] };
  }
  return { tracked: [...state.tracked], dismissed: [...state.dismissed, jobId] };
}

// ---- explainable match events --------------------------------------------

export type FindEventKind = 'matched' | 'tracked' | 'dismissed';

export interface FindEvent {
  kind: FindEventKind;
  detail: string;
}

/** Why this job surfaced. Fixed strings built from the posting, never from student data. */
export function describeMatch(job: JobPosting, filters: JobFilters = STUDENT_FILTERS): FindEvent[] {
  const events: FindEvent[] = [];
  if (norm(filters.role)) events.push({ kind: 'matched', detail: `Role: ${job.role}` });
  if (norm(filters.level)) events.push({ kind: 'matched', detail: `Level: ${job.level}` });
  return events;
}

export function describeTrack(job: JobPosting): FindEvent {
  return { kind: 'tracked', detail: `${job.company} pipeline status → applied` };
}

export function describeDismiss(job: JobPosting): FindEvent {
  return { kind: 'dismissed', detail: `${job.company} ${job.role} · not for me` };
}
