/** Minimal structural types so this stays dependency-free while matching Vercel's Node signature. */
interface NotifyRequest {
  method?: string;
  body?: unknown;
}

interface NotifyResponse {
  status(code: number): NotifyResponse;
  json(body: unknown): unknown;
}

/** Discord caps message content at 2000 characters; stay comfortably inside it. */
export const MAX_CONTENT_LENGTH = 1900;
const DISCORD_TIMEOUT_MS = 5000;

/** Validate and normalize the request body; returns null when the body is unusable. */
export function parseNotifyBody(raw: unknown): string | null {
  const body = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!body || typeof body !== 'object') return null;

  const { text } = body as Record<string, unknown>;
  if (typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, MAX_CONTENT_LENGTH);
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Provider-specific call, isolated so the webhook URL never escapes this module. */
async function postToDiscord(webhookUrl: string, content: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: NotifyRequest, res: NotifyResponse): Promise<unknown> {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const content = parseNotifyBody(req.body);
  if (!content) return res.status(400).json({ error: 'invalid_body' });

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: 'notify_unavailable' });

  // Discord/network errors are never surfaced verbatim; the client ignores failures anyway.
  const delivered = await postToDiscord(webhookUrl, content);
  if (!delivered) return res.status(502).json({ error: 'notify_failed' });

  return res.status(200).json({ ok: true });
}
