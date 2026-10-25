import { header, readRawBody, type LiveRequest, type LiveResponse } from '../src/live/http';
import { interactionToReply, timeSelect } from '../src/live/protocol';
import { storeFromEnv, type ReplyStore } from '../src/live/store';
import { verifyDiscordSignature } from '../src/live/verify';

/**
 * Discord Interactions Endpoint (set in the Developer Portal). Verifies Discord's Ed25519 signature,
 * answers PING, and turns Aditya's button / time-pick into a stored reply for the web app to apply.
 */
export interface InteractionDeps {
  publicKey: string;
  adityaId: string;
  store: ReplyStore;
  now?: () => Date;
}

const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64 } });

const DONE: Record<'accept' | 'decline' | 'counter', (text?: string) => string> = {
  accept: () => "✅ You're in. I'll let you know once everyone says yes.",
  decline: () => 'Not this time. Nothing about you was shared.',
  counter: (t) => `🕗 You suggested ${t}. I'm checking it with the other agents.`,
};

export function createInteractionsHandler(deps: InteractionDeps) {
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
      data?: { custom_id?: string; values?: string[] };
      message?: { content?: string };
    };
    try {
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'bad_json' });
    }

    if (body.type === 1) return res.status(200).json({ type: 1 }); // PING (portal verification)
    if (body.type !== 3) return res.status(200).json(ephemeral("I can only handle the buttons on my messages."));

    const userId = body.user?.id ?? body.member?.user?.id;
    if (userId !== deps.adityaId) return res.status(200).json(ephemeral('These buttons belong to the student this agent works for.'));

    const outcome = interactionToReply(body.data?.custom_id, body.data?.values);
    if (!outcome) return res.status(200).json(ephemeral('That button has expired.'));
    if (outcome.kind === 'pick-time') {
      return res.status(200).json({ type: 7, data: { components: timeSelect(outcome.session, outcome.prompt) } });
    }

    let stored: boolean;
    try {
      stored = await deps.store.put({
        session: outcome.session,
        prompt: outcome.prompt,
        action: outcome.action,
        text: outcome.text,
        at: (deps.now?.() ?? new Date()).toISOString(),
      });
    } catch {
      return res.status(200).json(ephemeral("I couldn't save that just now. Please answer in the app."));
    }
    const note = stored ? DONE[outcome.action](outcome.text) : 'You already answered this one.';
    return res.status(200).json({ type: 7, data: { content: `${body.message?.content ?? ''}\n\n${note}`.trim(), components: [] } });
  };
}

export default async function handler(req: LiveRequest, res: LiveResponse) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const adityaId = process.env.DISCORD_ADITYA_USER_ID;
  const store = storeFromEnv();
  if (!publicKey || !adityaId || !store) return res.status(503).json({ error: 'live_unavailable' });
  return createInteractionsHandler({ publicKey, adityaId, store })(req, res);
}
