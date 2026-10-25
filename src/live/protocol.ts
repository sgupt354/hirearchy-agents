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

export type NotifyKind = 'proposal' | 'counter';

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
  if (b.kind !== 'proposal' && b.kind !== 'counter') return null;
  const details = sanitizeDetails(b.details);
  // Each kind needs its fields to build a sensible message.
  if (b.kind === 'proposal' && !(details.window && details.gives && details.gets)) return null;
  if (b.kind === 'counter' && !['proposing', 'rejected', 'own_conflict', 'unreadable'].includes(details.status)) return null;
  return { session: b.session, prompt: b.prompt, student, kind: b.kind, details };
}

/** A prep-circle message as the copy layer expects it (for building the DM text on the server). */
export const asPhoneMessage = (n: NotifyBody): PhoneMessage => ({ id: n.prompt, text: '', actions: ['accept', 'counter', 'decline'], kind: n.kind, details: n.details });

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
