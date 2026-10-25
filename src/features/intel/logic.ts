/**
 * Give-to-get interview intel. Pure and deterministic: no React, no browser APIs,
 * no network, no LLM, no randomness. Privacy decisions are made here, never by a model.
 */

/** What a student submits. Deliberately has no identity fields. */
export interface RawInterviewReport {
  company: string;
  round: string;
  topics: string[];
  difficulty: number;
  tip: string;
  interviewDate: string;
}

/** The only shape that may be shared with other students. */
export interface SharedInterviewReport {
  company: string;
  round: string;
  topics: string[];
  difficulty: number;
  tip: string;
  when: string;
}

/** Exact dates never survive sharing; this prototype generalizes every date the same way. */
export const GENERALIZED_DATE = 'this week';

export const REDACTION = '[hidden]';

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;

// Order matters: emails are consumed before handles so an address is not split by the @ rule.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const HANDLE = /(^|[^\w@/])@\w{2,}/g;
const ISO_DATE = /\b\d{4}-\d{1,2}-\d{1,2}\b/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;

/** Remove emails, phone numbers, @handles and exact dates from user-controlled free text. */
export function scrubIdentityText(text: string): string {
  if (typeof text !== 'string' || !text) return '';

  return text
    .replace(EMAIL, REDACTION)
    .replace(HANDLE, `$1${REDACTION}`)
    .replace(ISO_DATE, REDACTION)
    .replace(PHONE, REDACTION)
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when scrubbing would change the text, used only to label a privacy event. */
function containsIdentityText(text: string): boolean {
  return scrubIdentityText(text) !== (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '');
}

/** Clamp into 1-5; anything non-numeric becomes the lowest difficulty rather than throwing. */
export function normalizeDifficulty(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DIFFICULTY_MIN;
  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.round(value)));
}

/**
 * Produce the shareable form of a report: free text scrubbed, difficulty normalized and the
 * exact interview date replaced. Always returns a new object and never mutates the input.
 */
export function anonymizeReport(raw: RawInterviewReport): SharedInterviewReport {
  return {
    company: scrubIdentityText(raw.company ?? ''),
    round: scrubIdentityText(raw.round ?? ''),
    topics: (raw.topics ?? []).map((topic) => scrubIdentityText(topic)).filter((topic) => topic.length > 0),
    difficulty: normalizeDifficulty(raw.difficulty),
    tip: scrubIdentityText(raw.tip ?? ''),
    when: GENERALIZED_DATE,
  };
}

// ---- give-to-get access gate ---------------------------------------------

export const GRACE_PERIOD_HOURS = 48;

const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000;

export type AccessReason = 'contributed' | 'grace-period' | 'contribution-required';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
}

export interface AccessInput {
  hasContributed: boolean;
  gracePeriodStart: string | number | Date;
  now: string | number | Date;
}

function toMillis(value: string | number | Date): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NaN : ms;
}

/**
 * Contributors always have access. Everyone else has until exactly GRACE_PERIOD_HOURS after
 * their grace period began — at the 48 hour mark the window is already closed.
 */
export function checkIntelAccess(input: AccessInput): AccessDecision {
  if (input.hasContributed) return { allowed: true, reason: 'contributed' };

  const start = toMillis(input.gracePeriodStart);
  const now = toMillis(input.now);
  // An unparseable timestamp fails closed.
  if (Number.isNaN(start) || Number.isNaN(now)) return { allowed: false, reason: 'contribution-required' };

  const elapsed = now - start;
  if (elapsed >= 0 && elapsed < GRACE_PERIOD_MS) return { allowed: true, reason: 'grace-period' };

  return { allowed: false, reason: 'contribution-required' };
}

// ---- give-back credits ----------------------------------------------------

export interface CreditState {
  credits: number;
  contributionIds: readonly string[];
}

export const EMPTY_CREDITS: CreditState = { credits: 0, contributionIds: [] };

/** Stable identifier derived from the report's content, so resubmitting the same report is a no-op. */
export function deriveContributionId(raw: RawInterviewReport): string {
  const parts = [
    (raw.company ?? '').trim().toLowerCase(),
    (raw.round ?? '').trim().toLowerCase(),
    (raw.interviewDate ?? '').trim(),
    [...(raw.topics ?? [])].join('|').toLowerCase(),
  ];
  return parts.join('::');
}

/** A report is only worth a credit when it carries usable intel. */
export function isValidContribution(raw: RawInterviewReport): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const hasCompany = typeof raw.company === 'string' && raw.company.trim().length > 0;
  const hasTopics = Array.isArray(raw.topics) && raw.topics.some((t) => typeof t === 'string' && t.trim().length > 0);
  return hasCompany && hasTopics;
}

/**
 * Award exactly one credit per distinct valid contribution. Returns a new state; processing the
 * same contribution again leaves the credit count unchanged.
 */
export function recordContribution(state: CreditState, raw: RawInterviewReport): CreditState {
  if (!isValidContribution(raw)) return { credits: state.credits, contributionIds: [...state.contributionIds] };

  const id = deriveContributionId(raw);
  if (state.contributionIds.includes(id)) {
    return { credits: state.credits, contributionIds: [...state.contributionIds] };
  }

  return { credits: state.credits + 1, contributionIds: [...state.contributionIds, id] };
}

// ---- sharing target -------------------------------------------------------

/** Intel is only for students waiting on the same company. No identities are involved. */
export function isIntelRelevant(report: Pick<SharedInterviewReport, 'company'>, waitingOn: string): boolean {
  const a = (report?.company ?? '').trim().toLowerCase();
  const b = (waitingOn ?? '').trim().toLowerCase();
  return a.length > 0 && a === b;
}

export function selectRelevantIntel(
  reports: readonly SharedInterviewReport[],
  waitingOn: string,
): SharedInterviewReport[] {
  return reports.filter((r) => isIntelRelevant(r, waitingOn));
}

// ---- privacy events -------------------------------------------------------

export type PrivacyEventKind = 'shared' | 'summarized' | 'hidden' | 'gate';

export interface PrivacyEvent {
  kind: PrivacyEventKind;
  detail: string;
}

/**
 * Describe what anonymization did. Details are fixed strings: a removed value is never
 * echoed back into the event.
 */
export function describeAnonymization(raw: RawInterviewReport): PrivacyEvent[] {
  const freeText = [raw.round ?? '', raw.tip ?? '', ...(raw.topics ?? [])];
  const events: PrivacyEvent[] = [
    { kind: 'shared', detail: 'Topics and difficulty shared' },
    { kind: 'summarized', detail: `Interview date → ${GENERALIZED_DATE}` },
  ];

  if (freeText.some((text) => containsIdentityText(text))) {
    events.push({ kind: 'hidden', detail: 'Identity/contact details removed' });
  }
  return events;
}

export function describeAccess(decision: AccessDecision): PrivacyEvent {
  const detail =
    decision.reason === 'contributed'
      ? 'Intel unlocked: report contributed'
      : decision.reason === 'grace-period'
        ? 'Intel unlocked: grace period'
        : 'Intel locked: contribution required';
  return { kind: 'gate', detail };
}

// ---- seeded demo intel ----------------------------------------------------

/** Deterministic demo data for the Microsoft SWE Intern loop. Not real interview experiences. */
export const MICROSOFT_SEED_INTEL: readonly SharedInterviewReport[] = [
  {
    company: 'Microsoft',
    round: 'Technical screen',
    topics: ['arrays', 'hash maps'],
    difficulty: 2,
    tip: 'Talk through the brute force first, then optimize out loud.',
    when: GENERALIZED_DATE,
  },
  {
    company: 'Microsoft',
    round: 'Technical round 2',
    topics: ['graphs', 'BFS'],
    difficulty: 4,
    tip: 'Draw the grid before coding; they care about the traversal order.',
    when: GENERALIZED_DATE,
  },
  {
    company: 'Microsoft',
    round: 'Behavioral',
    topics: ['behavioral', 'STAR'],
    difficulty: 3,
    tip: 'Have two conflict stories ready and keep each answer under two minutes.',
    when: GENERALIZED_DATE,
  },
  {
    company: 'Microsoft',
    round: 'Final round',
    topics: ['debugging', 'communication'],
    difficulty: 5,
    tip: 'Narrate your debugging; silence reads worse than a wrong first guess.',
    when: GENERALIZED_DATE,
  },
];
