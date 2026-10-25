import { TRACKER_STATUSES, type TrackerStatus } from './tracker/stages';

// One application record per job, per student. Pure and deterministic: the store holds the records, these helpers
// decide what a change means. Every field comes from something that happened in the app; nothing is inferred.

export type Stage = TrackerStatus;
export const STAGES = TRACKER_STATUSES;

export type LinkKind = 'prep' | 'mock' | 'intel' | 'referral' | 'community' | 'intel-shared';

/** One step of the journey that another tab contributed. */
export interface JourneyLink {
  kind: LinkKind;
  /** The source's own id (prep run, mock run, need id, ...): linking twice is a no-op. */
  ref: string;
  /** YYYY-MM-DD on the demo clock. */
  at: string;
  summary: string;
  /** Interview topics this step covered (taught or practiced). */
  topics?: string[];
  /** Intel reports read. */
  count?: number;
}

export interface Application {
  id: string;
  /** The student's person id (trust network): p1 Aditya, p4 Jordan, ... */
  owner: string;
  company: string;
  role: string;
  stage: Stage;
  /** The day each stage was reached. */
  dates: Partial<Record<Stage, string>>;
  /** Only set from a real source (an interview invite). Never guessed. */
  interviewDate: string | null;
  links: JourneyLink[];
  /** The tracked posting this came from, when it came from Find. */
  postingId: string | null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** One record per student per job (company + role). */
export const applicationId = (owner: string, company: string, role: string) => `${owner}:${norm(company)}:${norm(role)}`;

export const stageRank = (s: Stage) => STAGES.indexOf(s);
export const isClosed = (s: Stage) => s === 'Offer' || s === 'Rejected';

/** Agent-driven moves only go forward (or to Rejected) and never reopen a closed application. */
export function canAdvance(from: Stage, to: Stage): boolean {
  if (isClosed(from)) return false;
  if (to === 'Rejected') return true;
  return stageRank(to) > stageRank(from);
}

export function newApplication(input: { owner: string; company: string; role: string; stage?: Stage; at: string; interviewDate?: string | null; postingId?: string | null }): Application {
  const stage = input.stage ?? 'Saved';
  return {
    id: applicationId(input.owner, input.company, input.role),
    owner: input.owner,
    company: input.company.trim(),
    role: input.role.trim(),
    stage,
    dates: { [stage]: input.at },
    interviewDate: input.interviewDate ?? null,
    links: [],
    postingId: input.postingId ?? null,
  };
}

/** Merge what a tab just learned into an existing record: stage only forward, interview date only if unknown. */
export function mergeApplication(app: Application, input: { stage?: Stage; at: string; interviewDate?: string | null; postingId?: string | null }): Application {
  const next = structuredClone(app);
  if (input.stage && canAdvance(next.stage, input.stage)) {
    next.stage = input.stage;
    next.dates[input.stage] = input.at;
  }
  if (!next.interviewDate && input.interviewDate) next.interviewDate = input.interviewDate;
  if (!next.postingId && input.postingId) next.postingId = input.postingId;
  return next;
}

export function addLink(app: Application, link: JourneyLink): Application {
  if (app.links.some((l) => l.kind === link.kind && l.ref === link.ref)) return app;
  return { ...app, links: [...app.links, structuredClone(link)] };
}

export interface NextStep {
  label: string;
  /** The tab that does it. */
  tab: 'find' | 'apply' | 'prep' | 'mock' | 'intel' | 'referral' | 'community';
}

/** What to do next for this job, from its stage and what's linked so far. */
export function nextSteps(app: Application): NextStep[] {
  const has = (k: LinkKind) => app.links.some((l) => l.kind === k);
  if (isClosed(app.stage)) return [];
  if (app.stage === 'Saved') return [{ label: `Tailor your resume for ${app.company}`, tab: 'apply' }];
  const steps: NextStep[] = [];
  if (!has('referral') && (app.stage === 'Applied' || app.stage === 'OA')) steps.push({ label: 'Ask an alum for a referral', tab: 'referral' });
  if (app.stage === 'Interview' || app.stage === 'OA') {
    if (!has('prep')) steps.push({ label: 'Find a prep circle', tab: 'prep' });
    if (!has('mock')) steps.push({ label: 'Swap a mock interview', tab: 'mock' });
    if (!has('intel')) steps.push({ label: `Read the ${app.company} intel`, tab: 'intel' });
  }
  return steps;
}
