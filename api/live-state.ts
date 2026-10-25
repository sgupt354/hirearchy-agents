import { queryParam, type LiveRequest, type LiveResponse } from '../src/live/http';
import { isPromptId, isSessionId } from '../src/live/protocol';
import { storeFromEnv, type ReplyStore } from '../src/live/store';

/**
 * Polled by the web app every 1.5 s in live mode.
 *   GET ?health=1               → { ok } (is live mode configured on the server?)
 *   GET ?session=<id>&prompt=<n> → { reply } (Aditya's Discord answer, or null)
 */
export interface StateDeps {
  store: ReplyStore | null;
  configured: boolean;
}

export function createStateHandler(deps: StateDeps) {
  return async function handle(req: LiveRequest, res: LiveResponse) {
    res.setHeader?.('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    if (queryParam(req, 'health')) return res.status(deps.configured ? 200 : 503).json({ ok: deps.configured });
    if (!deps.configured || !deps.store) return res.status(503).json({ error: 'live_unavailable' });

    const session = queryParam(req, 'session');
    const prompt = Number(queryParam(req, 'prompt'));
    if (!isSessionId(session) || !isPromptId(prompt)) return res.status(400).json({ error: 'bad_request' });
    try {
      const reply = await deps.store.get(session, prompt);
      return res.status(200).json({ reply });
    } catch {
      return res.status(502).json({ error: 'store_unavailable' });
    }
  };
}

export default async function handler(req: LiveRequest, res: LiveResponse) {
  const store = storeFromEnv();
  const configured = Boolean(store && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADITYA_USER_ID && process.env.DISCORD_PUBLIC_KEY);
  return createStateHandler({ store, configured })(req, res);
}
