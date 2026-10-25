import type { HumanReply, PhoneMessage, TimeWindow } from '../engine/types.js';
import { parseCounter } from './parseCounter.js';
import { isLiveStudent, type LiveStudent } from './students.js';

// Shared between the browser and the Vercel functions: how a prep-circle prompt travels to Discord
// and how a student's button press comes back as the same reply the simulated phone would send.

export type LiveAction = 'accept' | 'decline' | 'counter';

/** One answer from Discord, stored per (session, prompt, student). First answer wins. */
export interface LiveReply {
  session: string;
  prompt: number;
  /** Defaults to Aditya (a1) so single-user live mode keeps working. */
  student?: LiveStudent;
  action: LiveAction;
  text?: string;
  at: string;
}

export const TIME_CHOICES = ['7:30 PM', '8:00 PM', '8:30 PM'] as const;

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSessionId = (s: unknown): s is string => typeof s === 'string' && SESSION_RE.test(s);
export const isPromptId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 10_000;

export type Op = 'in' | 'time' | 'not' | 'pick' | 'other' | 'modal';
const OPS: Op[] = ['in', 'time', 'not', 'pick', 'other', 'modal'];

/**
 * Discord custom_id (max 100 chars).
 * Single-user fallback (Aditya): "hl|<session>|<prompt>|<op>"
 * Multi-student: "hl|<session>|<prompt>|<student>|<op>"
 */
export const encodeId = (session: string, prompt: number, op: Op, student: LiveStudent = 'a1') =>
  student === 'a1' ? `hl|${session}|${prompt}|${op}` : `hl|${session}|${prompt}|${student}|${op}`;

export function decodeId(id: unknown): { session: string; prompt: number; student: LiveStudent; op: Op } | null {
  if (typeof id !== 'string') return null;
  const parts = id.split('|');
  if (parts[0] !== 'hl') return null;
  if (parts.length === 4) {
    const [, session, prompt, op] = parts;
    const n = Number(prompt);
    if (!isSessionId(session) || !isPromptId(n) || !OPS.includes(op as Op)) return null;
    return { session, prompt: n, student: 'a1', op: op as Op };
  }
  if (parts.length === 5) {
    const [, session, prompt, student, op] = parts;
    const n = Number(prompt);
    if (!isSessionId(session) || !isPromptId(n) || !isLiveStudent(student) || !OPS.includes(op as Op)) return null;
    return { session, prompt: n, student, op: op as Op };
  }
  return null;
}

export type InteractionOutcome =
  | { kind: 'reply'; session: string; prompt: number; student: LiveStudent; action: LiveAction; text?: string }
  | { kind: 'pick-time'; session: string; prompt: number; student: LiveStudent }
  | { kind: 'open-modal'; session: string; prompt: number; student: LiveStudent };

/** Map a button press or time pick to the student's reply. Null for anything that isn't ours or isn't valid. */
export function interactionToReply(customId: unknown, values?: unknown): InteractionOutcome | null {
  const d = decodeId(customId);
  if (!d) return null;
  const { session, prompt, student } = d;
  if (d.op === 'in') return { kind: 'reply', session, prompt, student, action: 'accept' };
  if (d.op === 'not') return { kind: 'reply', session, prompt, student, action: 'decline' };
  if (d.op === 'time') return { kind: 'pick-time', session, prompt, student };
  if (d.op === 'other' || d.op === 'modal') return { kind: 'open-modal', session, prompt, student };
  const picked = Array.isArray(values) ? values[0] : undefined;
  if (picked === 'Other') return { kind: 'open-modal', session, prompt, student };
  if (!TIME_CHOICES.includes(picked as (typeof TIME_CHOICES)[number])) return null;
  return { kind: 'reply', session, prompt, student, action: 'counter', text: picked as string };
}

/** The same reply (and chat bubble) the simulated phone sends for that tap. */
export function toHumanReply(r: Pick<LiveReply, 'action' | 'text'>): { reply: HumanReply; bubble: string } {
  if (r.action === 'accept') return { reply: { kind: 'accept' }, bubble: "✅ I'm in · via Discord" };
  if (r.action === 'decline') return { reply: { kind: 'decline' }, bubble: 'Not this time · via Discord' };
  return { reply: { kind: 'counter', text: r.text ?? '' }, bubble: `🕗 How about ${r.text}? · via Discord` };
}

// ---- Discord message components ----------------------------------------------------------------

export const promptButtons = (session: string, prompt: number, student: LiveStudent = 'a1') => [
  {
    type: 1,
    components: [
      { type: 2, style: 3, label: "✅ I'm in", custom_id: encodeId(session, prompt, 'in', student) },
      { type: 2, style: 1, label: 'Suggest a time', custom_id: encodeId(session, prompt, 'time', student) },
      { type: 2, style: 2, label: 'Not this time', custom_id: encodeId(session, prompt, 'not', student) },
    ],
  },
];

/** Pay it forward: a mentor is asked to help an anonymous newcomer. Yes or no only. */
export const helpButtons = (session: string, prompt: number, student: LiveStudent = 'a1') => [
  {
    type: 1,
    components: [
      { type: 2, style: 3, label: 'I can help', custom_id: encodeId(session, prompt, 'in', student) },
      { type: 2, style: 2, label: 'Not this time', custom_id: encodeId(session, prompt, 'not', student) },
    ],
  },
];

/** Proactive nudge: yes (do it) or not now. */
export const nudgeButtons = (session: string, prompt: number, student: LiveStudent = 'a1') => [
  {
    type: 1,
    components: [
      { type: 2, style: 3, label: 'Yes', custom_id: encodeId(session, prompt, 'in', student) },
      { type: 2, style: 2, label: 'Not now', custom_id: encodeId(session, prompt, 'not', student) },
    ],
  },
];

/** The nudge's DM, built only from structured fields (never from free text): no names. */
export function nudgeCopy(d: Record<string, string>): string {
  if (d.status === 'mock') return `Under 48 hours to your ${d.company} interview. A student in your pipeline who's strong in ${d.text} is free tonight, ${d.window}. Want a mock? Tap a button, or reply yes or no.`;
  if (d.status === 'circle') return `Your ${d.company} interview is in ${d.text} days and you don't have a prep circle yet. Want me to find one? Tap a button, or reply yes or no.`;
  return `${d.text} anonymous ${d.company} interview reports are waiting. Read them before your interview? Tap a button, or reply yes or no.`;
}

/** The mentor's DM, built only from the anonymous listing (no name, deadline already abstracted). */
export const helpCopy = (d: Record<string, string>) =>
  `A newcomer needs help with ${d.text} for a ${d.company}${d.role ? ` ${d.role.toLowerCase()}` : ''} round this week. It fits your rules: 45 minutes tonight, ${d.window}. Names unlock only if you both say yes. Help them? Tap a button, or reply yes or no.`;

export const timeSelect = (session: string, prompt: number, student: LiveStudent = 'a1') => [
  {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: encodeId(session, prompt, 'pick', student),
        placeholder: 'Pick a time',
        options: [...TIME_CHOICES.map((t) => ({ label: t, value: t })), { label: 'Other', value: 'Other' }],
      },
    ],
  },
];

export const timeModal = (session: string, prompt: number, student: LiveStudent = 'a1') => ({
  custom_id: encodeId(session, prompt, 'modal', student),
  title: 'Suggest a time',
  components: [
    {
      type: 1,
      components: [
        {
          type: 4,
          custom_id: 'time',
          style: 1,
          label: 'Time',
          placeholder: 'e.g. 8pm',
          min_length: 1,
          max_length: 20,
          required: true,
        },
      ],
    },
  ],
});

// ---- what the browser sends to /api/live-notify ---------------------------------------------------

const DETAIL_KEYS = ['company', 'role', 'circleSize', 'gives', 'gets', 'window', 'updated', 'status', 'reason', 'text'];
const SAFE = /^[A-Za-z0-9 :,–\-+&'.?!()/_]*$/;

/** Keep only known, short, plain-text detail fields, so the DM can't carry arbitrary content. */
export function sanitizeDetails(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!details || typeof details !== 'object') return out;
  for (const k of DETAIL_KEYS) {
    const v = (details as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.length <= 120 && SAFE.test(v)) out[k] = v;
  }
  return out;
}

export type NotifyKind = 'proposal' | 'counter' | 'help' | 'nudge';

export interface NotifyBody {
  session: string;
  prompt: number;
  student?: LiveStudent;
  kind: NotifyKind;
  details: Record<string, string>;
}

export function parseNotifyBody(body: unknown): NotifyBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const student = b.student === undefined ? 'a1' : b.student;
  if (!isSessionId(b.session) || !isPromptId(b.prompt) || !isLiveStudent(student)) return null;
  if (b.kind !== 'proposal' && b.kind !== 'counter' && b.kind !== 'help' && b.kind !== 'nudge') return null;
  const details = sanitizeDetails(b.details);
  // Each kind needs its fields to build a sensible message.
  if (b.kind === 'proposal' && !(details.window && details.gives && details.gets)) return null;
  if (b.kind === 'counter' && !['proposing', 'rejected', 'own_conflict', 'unreadable'].includes(details.status)) return null;
  if (b.kind === 'help' && !(details.company && details.text && details.window)) return null;
  if (b.kind === 'nudge' && !(details.company && details.text && ['mock', 'circle', 'intel'].includes(details.status) && (details.status !== 'mock' || details.window))) return null;
  return { session: b.session, prompt: b.prompt, student, kind: b.kind, details };
}

/** A prep-circle message as the copy layer expects it (for building the DM text on the server). */
// Prep-circle prompts only: a 'help' prompt has its own copy (helpCopy) and never goes through the phone copy.
export const asPhoneMessage = (n: NotifyBody): PhoneMessage => ({ id: n.prompt, text: '', actions: ['accept', 'counter', 'decline'], kind: n.kind as 'proposal' | 'counter', details: n.details });

const YES = /^(yes+|y|yeah|yep|ok|okay|sure|in|accept|i['’]?m in|im in)$/i;
const NO = /^(no+|n|nope|nah|decline|pass|not this time)$/i;

export const ACK = {
  accept: "You're in. I'll let you know once everyone says yes.",
  decline: 'Not this time. Nothing about you was shared.',
  counter: (t: string) => `You suggested ${t}. I'm checking it with the other agents.`,
  help: 'I can take yes, no, or a time like 8pm. You can also tap a button, or use /reply.',
} as const;

/**
 * Typed Discord DMs and /reply text → the same accept / decline / counter the phone uses.
 * Unreadable text must not be stored as an answer.
 */
export function parseTypedReply(
  text: string,
  window: TimeWindow = { start: '19:30', end: '21:00' },
): { action: LiveAction; text?: string } | 'unreadable' {
  const t = text.trim();
  if (!t || t.length > 80) return 'unreadable';
  if (YES.test(t)) return { action: 'accept' };
  if (NO.test(t)) return { action: 'decline' };
  if (!parseCounter(t, window)) return 'unreadable';
  return { action: 'counter', text: t.slice(0, 40) };
}

// ---- private post-session ratings ---------------------------------------------------------------

/** The rating DM is recorded as this prompt id, so each session sends it at most once. */
export const RATING_PROMPT = 9999;
/** One action row per member, and Discord allows five rows. */
export const MAX_RATED = 4;

const SUBJECT_RE = /^a[1-8]$/;
const NAME_RE = /^[A-Za-z .'-]{1,40}$/;

export interface RatingPerson {
  id: string;
  name: string;
}

/** What the browser sends to /api/live-notify when a session is over and the student should rate it. */
export interface RatingNotifyBody {
  session: string;
  student: LiveStudent;
  kind: 'rating';
  people: RatingPerson[];
}

export function parseRatingNotify(body: unknown): RatingNotifyBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const student = b.student === undefined ? 'a1' : b.student;
  if (b.kind !== 'rating' || !isSessionId(b.session) || !isLiveStudent(student) || !Array.isArray(b.people)) return null;
  if (!b.people.length || b.people.length > MAX_RATED) return null;
  const people: RatingPerson[] = [];
  for (const p of b.people as unknown[]) {
    const { id, name } = (p ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !SUBJECT_RE.test(id) || id === student || people.some((x) => x.id === id)) return null;
    if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
    people.push({ id, name });
  }
  return { session: b.session, student, kind: 'rating', people };
}

/** helpful is null for a no-show (the web card counts a no-show as 1). */
export interface LiveRating {
  showedUp: boolean;
  helpful: number | null;
}

/** Discord custom_id for one member's rating select: "hr|<session>|<rater>|<subject>". */
export const encodeRatingId = (session: string, rater: LiveStudent, subject: string) => `hr|${session}|${rater}|${subject}`;

export function decodeRatingId(id: unknown): { session: string; rater: LiveStudent; subject: string } | null {
  if (typeof id !== 'string') return null;
  const [tag, session, rater, subject, ...rest] = id.split('|');
  if (tag !== 'hr' || rest.length || !isSessionId(session) || !isLiveStudent(rater) || !SUBJECT_RE.test(subject ?? '') || subject === rater) return null;
  return { session, rater, subject };
}

/** A picked option: "1"…"5", or "noshow". */
export function ratingFromValue(v: unknown): LiveRating | null {
  if (v === 'noshow') return { showedUp: false, helpful: null };
  const n = Number(v);
  return typeof v === 'string' && Number.isInteger(n) && n >= 1 && n <= 5 ? { showedUp: true, helpful: n } : null;
}

const RATING_OPTIONS = [
  { label: '5 · Very helpful', value: '5' },
  { label: '4 · Helpful', value: '4' },
  { label: '3 · OK', value: '3' },
  { label: '2 · Not very helpful', value: '2' },
  { label: '1 · Not helpful', value: '1' },
  { label: "Didn't show up", value: 'noshow' },
];

/** One select per member. Each one disappears from the message once it's answered. */
export const ratingSelects = (session: string, rater: LiveStudent, people: RatingPerson[]) =>
  people.slice(0, MAX_RATED).map((p) => ({
    type: 1,
    components: [{ type: 3, custom_id: encodeRatingId(session, rater, p.id), placeholder: `Rate ${p.name}`, options: RATING_OPTIONS }],
  }));

export const RATING_COPY = {
  ask: "Tonight's session is done. How did it go? Rate each member privately. Nobody ever sees a single rating.",
  done: 'Thanks! Rated privately. A rating only counts once someone has two or more.',
} as const;
