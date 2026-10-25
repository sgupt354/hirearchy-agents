import type { HumanReply, PhoneMessage } from '../engine/types';

// Shared between the browser and the Vercel functions: how a prep-circle prompt travels to Discord
// and how Aditya's button press comes back as the same reply the simulated phone would send.

export type LiveAction = 'accept' | 'decline' | 'counter';

/** One answer from Discord, stored per demo session and prompt (first answer wins). */
export interface LiveReply {
  session: string;
  prompt: number;
  action: LiveAction;
  text?: string;
  at: string;
}

export const TIME_CHOICES = ['7:30 PM', '8:00 PM', '8:30 PM'] as const;

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSessionId = (s: unknown): s is string => typeof s === 'string' && SESSION_RE.test(s);
export const isPromptId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 10_000;

type Op = 'in' | 'time' | 'not' | 'pick';
const OPS: Op[] = ['in', 'time', 'not', 'pick'];

/** Discord custom_id (max 100 chars): "hl|<session>|<prompt>|<op>". */
export const encodeId = (session: string, prompt: number, op: Op) => `hl|${session}|${prompt}|${op}`;

export function decodeId(id: unknown): { session: string; prompt: number; op: Op } | null {
  if (typeof id !== 'string') return null;
  const [tag, session, prompt, op] = id.split('|');
  const n = Number(prompt);
  if (tag !== 'hl' || !isSessionId(session) || !isPromptId(n) || !OPS.includes(op as Op)) return null;
  return { session, prompt: n, op: op as Op };
}

export type InteractionOutcome =
  | { kind: 'reply'; session: string; prompt: number; action: LiveAction; text?: string }
  | { kind: 'pick-time'; session: string; prompt: number };

/** Map a button press or time pick to the student's reply. Null for anything that isn't ours or isn't valid. */
export function interactionToReply(customId: unknown, values?: unknown): InteractionOutcome | null {
  const d = decodeId(customId);
  if (!d) return null;
  const { session, prompt } = d;
  if (d.op === 'in') return { kind: 'reply', session, prompt, action: 'accept' };
  if (d.op === 'not') return { kind: 'reply', session, prompt, action: 'decline' };
  if (d.op === 'time') return { kind: 'pick-time', session, prompt };
  const picked = Array.isArray(values) ? values[0] : undefined;
  if (!TIME_CHOICES.includes(picked as (typeof TIME_CHOICES)[number])) return null;
  return { kind: 'reply', session, prompt, action: 'counter', text: picked as string };
}

/** The same reply (and chat bubble) the simulated phone sends for that tap. */
export function toHumanReply(r: Pick<LiveReply, 'action' | 'text'>): { reply: HumanReply; bubble: string } {
  if (r.action === 'accept') return { reply: { kind: 'accept' }, bubble: "✅ I'm in · via Discord" };
  if (r.action === 'decline') return { reply: { kind: 'decline' }, bubble: 'Not this time · via Discord' };
  return { reply: { kind: 'counter', text: r.text ?? '' }, bubble: `🕗 How about ${r.text}? · via Discord` };
}

// ---- Discord message components ----------------------------------------------------------------

export const promptButtons = (session: string, prompt: number) => [
  {
    type: 1,
    components: [
      { type: 2, style: 3, label: "✅ I'm in", custom_id: encodeId(session, prompt, 'in') },
      { type: 2, style: 1, label: '🕗 Suggest a time', custom_id: encodeId(session, prompt, 'time') },
      { type: 2, style: 2, label: 'Not this time', custom_id: encodeId(session, prompt, 'not') },
    ],
  },
];

export const timeSelect = (session: string, prompt: number) => [
  {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: encodeId(session, prompt, 'pick'),
        placeholder: 'Pick a time',
        options: TIME_CHOICES.map((t) => ({ label: t, value: t })),
      },
    ],
  },
];

// ---- what the browser sends to /api/live-notify ---------------------------------------------------

const DETAIL_KEYS = ['company', 'role', 'circleSize', 'gives', 'gets', 'window', 'updated', 'status', 'reason', 'text'];
const SAFE = /^[A-Za-z0-9 :,–\-+&'.?!()/]*$/;

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

export interface NotifyBody {
  session: string;
  prompt: number;
  kind: 'proposal' | 'counter';
  details: Record<string, string>;
}

export function parseNotifyBody(body: unknown): NotifyBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!isSessionId(b.session) || !isPromptId(b.prompt) || (b.kind !== 'proposal' && b.kind !== 'counter')) return null;
  const details = sanitizeDetails(b.details);
  // Each kind needs its fields to build a sensible message.
  if (b.kind === 'proposal' && !(details.window && details.gives && details.gets)) return null;
  if (b.kind === 'counter' && !['proposing', 'rejected', 'own_conflict', 'unreadable'].includes(details.status)) return null;
  return { session: b.session, prompt: b.prompt, kind: b.kind, details };
}

/** A prep-circle message as the copy layer expects it (for building the DM text on the server). */
export const asPhoneMessage = (n: NotifyBody): PhoneMessage => ({ id: n.prompt, text: '', actions: ['accept', 'counter', 'decline'], kind: n.kind, details: n.details });
