import { PIPELINE } from '../src/engine/seed.js';
import { sendDm, sendDmResult } from '../src/live/discord.js';
import type { LiveRequest, LiveResponse } from '../src/live/http.js';
import { ACK, RATING_COPY, RATING_PROMPT, asPhoneMessage, helpButtons, helpCopy, nudgeButtons, nudgeCopy, parseNotifyBody, parseRatingNotify, promptButtons, ratingSelects, revealDm } from '../src/live/protocol.js';
import { discordUsersFromEnv } from '../src/live/students.js';
import { MAX_DMS_PER_SESSION, storeFromEnv, type ReplyStore } from '../src/live/store.js';
import { studentCopy } from '../src/ui/copy.js';
import { clean } from '../src/ui/text.js';

/**
 * The web app calls this when a prep-circle phone message should also go to Discord.
 * Text is built here from validated fields (same student copy as the simulated phone).
 */
export interface NotifyDeps {
  token: string;
  users?: Record<string, string>;
  /** @deprecated single-user fallback; prefer users.a1 */
  adityaId?: string;
  send?: typeof sendDm;
  store?: ReplyStore | null;
}

export function createNotifyHandler(deps: NotifyDeps) {
  const users = { ...deps.users };
  if (!users.a1 && deps.adityaId) users.a1 = deps.adityaId;

  /** After the circle meets: one DM per session asking the student to rate each member privately. */
  async function rating(body: unknown, res: LiveResponse) {
    const r = parseRatingNotify(body);
    if (!r) return res.status(400).json({ error: 'bad_request' });
    const userId = users[r.student];
    if (!userId) return res.status(200).json({ ok: true, skipped: true });
    try {
      if (await deps.store?.getPrompt?.(r.session, RATING_PROMPT, r.student)) return res.status(200).json({ ok: true, duplicate: true });
      if (deps.store?.countPrompts && (await deps.store.countPrompts(r.session)) >= MAX_DMS_PER_SESSION) {
        return res.status(429).json({ error: 'rate_limited' });
      }
      const content = `Hirearchy Agent\n${RATING_COPY.ask}`;
      const components = ratingSelects(r.session, r.student, r.people);
      if (deps.send) {
        const ok = await deps.send({ token: deps.token, userId, content, components });
        if (ok) await deps.store?.recordPrompt?.({ session: r.session, prompt: RATING_PROMPT, student: r.student, discordUser: userId });
        return ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: 'discord_unavailable' });
      }
      const sent = await sendDmResult({ token: deps.token, userId, content, components, typing: true });
      if (!sent.ok) return res.status(502).json({ error: 'discord_unavailable' });
      await deps.store?.recordPrompt?.({ session: r.session, prompt: RATING_PROMPT, student: r.student, discordUser: userId, channelId: sent.channelId, lastMessageId: sent.messageId });
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(502).json({ error: 'discord_unavailable' });
    }
  }

  return async function handle(req: LiveRequest, res: LiveResponse) {
    res.setHeader?.('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    if ((body as { kind?: unknown } | null)?.kind === 'rating') return rating(body, res);
    const n = parseNotifyBody(body);
    if (!n) return res.status(400).json({ error: 'bad_request' });
    const student = n.student ?? 'a1';
    const userId = users[student];
    if (!userId) return res.status(200).json({ ok: true, skipped: true });
    if (deps.store?.countPrompts && (await deps.store.countPrompts(n.session)) >= MAX_DMS_PER_SESSION) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    try {
      const content = n.kind === 'help'
        ? `Hirearchy Agent\n${helpCopy(n.details)}`
        : n.kind === 'nudge'
        ? `Hirearchy Agent\n${nudgeCopy(n.details)}`
        : n.kind === 'reveal'
        ? `Hirearchy Agent\n${revealDm(n.details)}`
        : `Hirearchy Agent\n${clean(studentCopy(asPhoneMessage(n), n.details.company || PIPELINE.company))}\n${ACK.help}`;
      const components = n.kind === 'help'
        ? helpButtons(n.session, n.prompt, student)
        : n.kind === 'nudge'
        ? nudgeButtons(n.session, n.prompt, student)
        : n.kind === 'reveal'
        ? []
        : n.kind === 'proposal' || (n.kind === 'counter' && n.details.status !== 'proposing')
          ? promptButtons(n.session, n.prompt, student)
          : [];
      if (deps.send) {
        const ok = await deps.send({ token: deps.token, userId, content, components });
        return ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: 'discord_unavailable' });
      }
      const sent = await sendDmResult({ token: deps.token, userId, content, components, typing: true });
      if (!sent.ok) return res.status(502).json({ error: 'discord_unavailable' });
      await deps.store?.recordPrompt?.({
        session: n.session,
        prompt: n.prompt,
        student,
        discordUser: userId,
        channelId: sent.channelId,
        window: n.details.window,
        lastMessageId: sent.messageId,
      });
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(502).json({ error: 'discord_unavailable' });
    }
  };

}

export default async function handler(req: LiveRequest, res: LiveResponse) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const users = discordUsersFromEnv();
  if (!token || !users.a1) return res.status(503).json({ error: 'live_unavailable' });
  return createNotifyHandler({ token, users, store: storeFromEnv() })(req, res);
}
