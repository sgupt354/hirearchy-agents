import { PIPELINE } from '../src/engine/seed.js';
import { sendDm } from '../src/live/discord.js';
import type { LiveRequest, LiveResponse } from '../src/live/http.js';
import { asPhoneMessage, parseNotifyBody, promptButtons } from '../src/live/protocol.js';
import { studentCopy } from '../src/ui/copy.js';

/**
 * The web app calls this when the prep-circle run needs Aditya. The DM text is built here from validated
 * fields (the same student copy as the simulated phone), so callers can't send arbitrary text.
 */
export interface NotifyDeps {
  token: string;
  adityaId: string;
  send?: typeof sendDm;
}

export function createNotifyHandler(deps: NotifyDeps) {
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
    const n = parseNotifyBody(body);
    if (!n) return res.status(400).json({ error: 'bad_request' });
    try {
      const content = `🤖 **Hirearchy Agent**\n${studentCopy(asPhoneMessage(n), n.details.company || PIPELINE.company)}`;
      const ok = await (deps.send ?? sendDm)({ token: deps.token, userId: deps.adityaId, content, components: promptButtons(n.session, n.prompt) });
      return ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: 'discord_unavailable' });
    } catch {
      return res.status(502).json({ error: 'discord_unavailable' });
    }
  };
}

export default async function handler(req: LiveRequest, res: LiveResponse) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const adityaId = process.env.DISCORD_ADITYA_USER_ID;
  if (!token || !adityaId) return res.status(503).json({ error: 'live_unavailable' });
  return createNotifyHandler({ token, adityaId })(req, res);
}
