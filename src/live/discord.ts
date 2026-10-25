// Server-only: open a DM, show typing, post / list / ack messages. Discord API v10.
const API = 'https://discord.com/api/v10';

export interface SentDm {
  ok: boolean;
  channelId?: string;
  messageId?: string;
}

const headers = (token: string) => ({ Authorization: `Bot ${token}`, 'Content-Type': 'application/json' });

async function openDm(token: string, userId: string, fetchImpl: typeof fetch): Promise<string | null> {
  const channel = await fetchImpl(`${API}/users/@me/channels`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ recipient_id: userId }),
    signal: AbortSignal.timeout(4000),
  });
  if (!channel.ok) return null;
  const { id } = (await channel.json()) as { id?: string };
  return id ?? null;
}

export async function showTyping(token: string, channelId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`${API}/channels/${channelId}/typing`, {
    method: 'POST',
    headers: headers(token),
    signal: AbortSignal.timeout(2000),
  }).catch(() => undefined);
}

export async function sendDmResult(
  opts: {
    token: string;
    userId: string;
    content: string;
    components?: unknown[];
    embeds?: unknown[];
    typing?: boolean;
    waitMs?: number;
  },
  fetchImpl: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SentDm> {
  const id = await openDm(opts.token, opts.userId, fetchImpl);
  if (!id) return { ok: false };
  if (opts.typing) {
    await showTyping(opts.token, id, fetchImpl);
    await wait(opts.waitMs ?? 400);
  }
  const sent = await fetchImpl(`${API}/channels/${id}/messages`, {
    method: 'POST',
    headers: headers(opts.token),
    body: JSON.stringify({
      content: opts.content.slice(0, 1900),
      components: opts.components ?? [],
      embeds: opts.embeds,
      allowed_mentions: { parse: [] },
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!sent.ok) return { ok: false, channelId: id };
  const body = (await sent.json()) as { id?: string };
  return { ok: true, channelId: id, messageId: body.id };
}

/** Same contract as before: true if the DM posted. */
export async function sendDm(
  opts: { token: string; userId: string; content: string; components: unknown[] },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return (await sendDmResult(opts, fetchImpl)).ok;
}

export interface DiscordMessage {
  id: string;
  authorId: string;
  bot: boolean;
  content: string;
}

export async function listMessages(
  token: string,
  channelId: string,
  after: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscordMessage[]> {
  const q = after ? `?after=${encodeURIComponent(after)}&limit=10` : '?limit=10';
  const res = await fetchImpl(`${API}/channels/${channelId}/messages${q}`, {
    headers: headers(token),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as { id?: string; content?: string; author?: { id?: string; bot?: boolean } }[];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((m) => ({ id: m.id ?? '', authorId: m.author?.id ?? '', bot: Boolean(m.author?.bot), content: m.content ?? '' }))
    .filter((m) => m.id)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export async function postAck(
  token: string,
  channelId: string,
  content: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const sent = await fetchImpl(`${API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(4000),
  });
  return sent.ok;
}
