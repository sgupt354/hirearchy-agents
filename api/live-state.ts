import { parseCounter } from '../src/live/parseCounter.js';
import { listMessages, postAck } from '../src/live/discord.js';
import { ingestTexts } from '../src/live/inbox.js';
import { queryParam, type LiveRequest, type LiveResponse } from '../src/live/http.js';
import { isLiveStudent } from '../src/live/students.js';
import { discordUsersFromEnv } from '../src/live/students.js';
import { isPromptId, isSessionId } from '../src/live/protocol.js';
import { storeFromEnv, type ReplyStore } from '../src/live/store.js';
import type { TimeWindow } from '../src/engine/types.js';

/**
 * Polled by the web app every 1.5 s in live mode.
 *   GET ?health=1                            → { ok, students }
 *   GET ?session=<id>&prompt=<n>&student=a1  → { reply } (also ingests typed DMs)
 *   GET ?session=<id>&ratings=1&student=a1   → { ratings } (private post-session ratings)
 */
export interface StateDeps {
  store: ReplyStore | null;
  configured: boolean;
  students?: Record<string, boolean>;
  token?: string;
  fetchImpl?: typeof fetch;
}

function windowOf(raw?: string): TimeWindow {
  const fallback: TimeWindow = { start: '19:30', end: '21:00' };
  if (!raw) return fallback;
  return parseCounter(raw.replace('–', '-'), fallback) ?? fallback;
}

export function createStateHandler(deps: StateDeps) {
  return async function handle(req: LiveRequest, res: LiveResponse) {
    res.setHeader?.('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (queryParam(req, 'health')) {
      if (!deps.configured) return res.status(503).json({ ok: false });
      return res.status(200).json({ ok: true, students: deps.students ?? { a1: true } });
    }
    if (!deps.configured || !deps.store) return res.status(503).json({ error: 'live_unavailable' });

    const session = queryParam(req, 'session');
    // GET ?session=<id>&ratings=1&student=a1 → { ratings } (the student's own private ratings from Discord)
    if (queryParam(req, 'ratings')) {
      const rater = queryParam(req, 'student') || 'a1';
      if (!isSessionId(session) || !isLiveStudent(rater)) return res.status(400).json({ error: 'bad_request' });
      try {
        return res.status(200).json({ ratings: (await deps.store.getRatings?.(session, rater)) ?? {} });
      } catch {
        return res.status(502).json({ error: 'store_unavailable' });
      }
    }
    const prompt = Number(queryParam(req, 'prompt'));
    const studentRaw = queryParam(req, 'student');
    const student = studentRaw ? (isLiveStudent(studentRaw) ? studentRaw : null) : 'a1';
    if (!isSessionId(session) || !isPromptId(prompt) || !student) return res.status(400).json({ error: 'bad_request' });
    try {
      let reply = await deps.store.get(session, prompt, student);
      if (!reply && deps.token && deps.store.getPrompt) {
        const rec = await deps.store.getPrompt(session, prompt, student);
        if (rec?.channelId && rec.discordUser) {
          const messages = await listMessages(deps.token, rec.channelId, rec.lastMessageId, deps.fetchImpl);
          const ingested = ingestTexts({
            messages,
            expectedUserId: rec.discordUser,
            session,
            prompt,
            student,
            window: windowOf(rec.window),
            afterId: rec.lastMessageId,
          });
          await deps.store.recordPrompt?.({ ...rec, lastMessageId: ingested.lastId ?? rec.lastMessageId });
          if (ingested.reply) {
            const stored = await deps.store.put({ ...ingested.reply, at: new Date().toISOString() });
            if (stored) reply = ingested.reply;
          }
          if (ingested.ack) await postAck(deps.token, rec.channelId, ingested.ack, deps.fetchImpl).catch(() => false);
        }
      }
      return res.status(200).json({ reply });
    } catch {
      return res.status(502).json({ error: 'store_unavailable' });
    }
  };
}

export default async function handler(req: LiveRequest, res: LiveResponse) {
  const store = storeFromEnv();
  const users = discordUsersFromEnv();
  const configured = Boolean(store && process.env.DISCORD_BOT_TOKEN && users.a1 && process.env.DISCORD_PUBLIC_KEY);
  const students = { a1: Boolean(users.a1), a2: Boolean(users.a2), a3: Boolean(users.a3) };
  return createStateHandler({ store, configured, students, token: process.env.DISCORD_BOT_TOKEN })(req, res);
}
