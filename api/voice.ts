import { MESSAGE_KINDS, sanitizeDetails, type MessageKind } from '../src/integrations';

/** Minimal structural types so this stays dependency-free while matching Vercel's Node signature. */
interface VoiceRequest {
  method?: string;
  body?: unknown;
}

interface VoiceResponse {
  status(code: number): VoiceResponse;
  json(body: unknown): unknown;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-5';
const PROVIDER_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = [
  "Write ONE short, warm message from a student's personal agent to that student.",
  'Prefer roughly 1-3 short sentences.',
  'Do not invent facts. Do not invent names. Do not expose hidden identities.',
  'For kinds other than "reveal", NEVER include student names or contact information.',
  'For "reveal", only use identities explicitly present in the supplied details.',
  'No markdown. No headings. Return only the message text.',
].join(' ');

interface VoicePayload {
  recipientLabel: string;
  kind: MessageKind;
  details: Record<string, string>;
}

/** Validate and normalize the request body; returns null when the body is unusable. */
export function parseVoiceBody(raw: unknown): VoicePayload | null {
  const body = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!body || typeof body !== 'object') return null;

  const { recipientLabel, kind, details } = body as Record<string, unknown>;
  if (typeof recipientLabel !== 'string' || !recipientLabel.trim()) return null;
  if (typeof kind !== 'string' || !MESSAGE_KINDS.includes(kind as MessageKind)) return null;

  const entries =
    details && typeof details === 'object' && !Array.isArray(details)
      ? Object.entries(details as Record<string, unknown>).filter(([, v]) => typeof v === 'string')
      : [];

  return {
    recipientLabel: recipientLabel.trim(),
    kind: kind as MessageKind,
    // Defense in depth: the client sanitizes too, but we never trust what arrived.
    details: sanitizeDetails(kind as MessageKind, Object.fromEntries(entries) as Record<string, string>),
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function buildUserPrompt(payload: VoicePayload): string {
  const details = Object.entries(payload.details)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  return [
    `Recipient label: ${payload.recipientLabel}`,
    `Update kind: ${payload.kind}`,
    details ? `Known details:\n${details}` : 'Known details: none',
  ].join('\n');
}

/** Provider-specific call, isolated so another provider can replace just this function. */
async function callAnthropic(apiKey: string, payload: VoicePayload): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(payload) }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = body?.content?.find((part) => part?.type === 'text')?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VoiceRequest, res: VoiceResponse): Promise<unknown> {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const payload = parseVoiceBody(req.body);
  if (!payload) return res.status(400).json({ error: 'invalid_body' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'generation_unavailable' });

  const message = await callAnthropic(apiKey, payload);
  // Provider errors are never surfaced verbatim; the client falls back to its templates.
  if (!message) return res.status(502).json({ error: 'generation_failed' });

  return res.status(200).json({ message });
}
