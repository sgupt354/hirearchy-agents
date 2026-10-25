import { header, readRawBody, type LiveRequest, type LiveResponse } from '../src/live/http.js';
import { ACK, interactionToReply, parseTypedReply, timeModal, timeSelect } from '../src/live/protocol.js';
import { discordUsersFromEnv, studentForDiscordUser } from '../src/live/students.js';
import { storeFromEnv, type ReplyStore } from '../src/live/store.js';
import { verifyDiscordSignature } from '../src/live/verify.js';
import { parseCounter } from '../src/live/parseCounter.js';
import type { TimeWindow } from '../src/engine/types.js';

/**
 * Discord Interactions Endpoint. Verifies Ed25519, answers PING, maps buttons / select / modal / slash
 * /reply onto the same LiveReply the simulated phone would send.
 */
export interface InteractionDeps {
  publicKey: string;
  adityaId?: string;
  users?: Record<string, string>;
  store: ReplyStore;
  now?: () => Date;
}

const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64 } });
const update = (content: string) => ({ type: 7, data: { content, components: [] } });

export function createInteractionsHandler(deps: InteractionDeps) {
  const users = { ...(deps.users ?? {}) };
  if (!users.a1 && deps.adityaId) users.a1 = deps.adityaId;

  return async function handle(req: LiveRequest, res: LiveResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const raw = await readRawBody(req);
    if (!verifyDiscordSignature(deps.publicKey, header(req, 'x-signature-ed25519'), header(req, 'x-signature-timestamp'), raw)) {
      return res.status(401).json({ error: 'invalid_signature' });
    }

    let body: {
      type?: number;
      user?: { id?: string };
      member?: { user?: { id?: string } };
      data?: {
        custom_id?: string;
        values?: string[];
        name?: string;
        options?: { name?: string; value?: unknown }[];
        components?: { components?: { custom_id?: string; value?: string }[] }[];
      };
      message?: { content?: string };
    };
    try {
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'bad_json' });
    }

    if (body.type === 1) return res.status(200).json({ type: 1 });

    const userId = body.user?.id ?? body.member?.user?.id;
    const now = () => (deps.now?.() ?? new Date()).toISOString();

    const save = async (session: string, prompt: number, student: string, action: 'accept' | 'decline' | 'counter', text?: string) => {
      try {
        return await deps.store.put({ session, prompt, student: student as 'a1' | 'a2' | 'a3', action, text, at: now() });
      } catch {
        return 'error' as const;
      }
    };

    // Slash /reply <text>
    if (body.type === 2 && body.data?.name === 'reply') {
      const text = String(body.data.options?.find((o) => o.name === 'text')?.value ?? '');
      const student = userId ? studentForDiscordUser(users, userId) : null;
      if (!student) return res.status(200).json(ephemeral('This command is only for students in the live demo.'));
      const latest = await latestPromptFor(deps.store, student);
      if (!latest) return res.status(200).json(ephemeral('No open prompt to reply to.'));
      if (users[latest.student] !== userId) return res.status(200).json(ephemeral('These prompts belong to a different student.'));
      const parsed = parseTypedReply(text, windowOf(latest.window));
      if (parsed === 'unreadable') return res.status(200).json(ephemeral(ACK.help));
      const stored = await save(latest.session, latest.prompt, latest.student, parsed.action, parsed.text);
      if (stored === 'error') return res.status(200).json(ephemeral("I couldn't save that just now. Please answer in the app."));
      const note = stored ? (parsed.action === 'counter' ? ACK.counter(parsed.text ?? '') : ACK[parsed.action]) : 'You already answered this one.';
      return res.status(200).json(ephemeral(note));
    }

    if (body.type === 5) {
      const outcome = interactionToReply(body.data?.custom_id);
      if (!outcome || outcome.kind !== 'open-modal') return res.status(200).json(ephemeral('That form has expired.'));
      if (userId !== users[outcome.student]) return res.status(200).json(ephemeral('These buttons belong to the student this agent works for.'));
      const typed = body.data?.components?.flatMap((r) => r.components ?? []).find((c) => c.custom_id === 'time')?.value ?? '';
      const rec = await deps.store.getPrompt?.(outcome.session, outcome.prompt, outcome.student);
      const parsed = parseTypedReply(typed, windowOf(rec?.window));
      if (parsed === 'unreadable') return res.status(200).json(ephemeral(ACK.help));
      const stored = await save(outcome.session, outcome.prompt, outcome.student, parsed.action, parsed.text);
      if (stored === 'error') return res.status(200).json(ephemeral("I couldn't save that just now. Please answer in the app."));
      const note = stored ? (parsed.action === 'counter' ? ACK.counter(parsed.text ?? '') : ACK[parsed.action]) : 'You already answered this one.';
      return res.status(200).json(update(`${body.message?.content ?? ''}\n\n${note}`.trim()));
    }

    if (body.type !== 3) return res.status(200).json(ephemeral("I can only handle the buttons on my messages, typed yes/no/8pm, or /reply."));

    const outcome = interactionToReply(body.data?.custom_id, body.data?.values);
    if (!outcome) return res.status(200).json(ephemeral('That button has expired.'));
    if (userId !== users[outcome.student]) return res.status(200).json(ephemeral('These buttons belong to the student this agent works for.'));
    if (outcome.kind === 'pick-time') {
      return res.status(200).json({ type: 7, data: { components: timeSelect(outcome.session, outcome.prompt, outcome.student) } });
    }
    if (outcome.kind === 'open-modal') {
      return res.status(200).json({ type: 9, data: timeModal(outcome.session, outcome.prompt, outcome.student) });
    }

    const stored = await save(outcome.session, outcome.prompt, outcome.student, outcome.action, outcome.text);
    if (stored === 'error') return res.status(200).json(ephemeral("I couldn't save that just now. Please answer in the app."));
    const note = stored ? (outcome.action === 'counter' ? ACK.counter(outcome.text ?? '') : ACK[outcome.action]) : 'You already answered this one.';
    return res.status(200).json(update(`${body.message?.content ?? ''}\n\n${note}`.trim()));
  };
}

function windowOf(raw?: string): TimeWindow {
  const fallback: TimeWindow = { start: '19:30', end: '21:00' };
  if (!raw) return fallback;
  return parseCounter(raw.replace('–', '-'), fallback) ?? fallback;
}

async function latestPromptFor(store: ReplyStore, student: 'a1' | 'a2' | 'a3') {
  return (await store.latestFor?.(student)) ?? null;
}

export default async function handler(req: LiveRequest, res: LiveResponse) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const users = discordUsersFromEnv();
  const store = storeFromEnv();
  if (!publicKey || !users.a1 || !store) return res.status(503).json({ error: 'live_unavailable' });
  return createInteractionsHandler({ publicKey, users, adityaId: users.a1, store })(req, res);
}
