// Server-only: open a DM with one user and post a message with components. Discord API v10.
const API = 'https://discord.com/api/v10';

export async function sendDm(
  opts: { token: string; userId: string; content: string; components: unknown[] },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const headers = { Authorization: `Bot ${opts.token}`, 'Content-Type': 'application/json' };
  const channel = await fetchImpl(`${API}/users/@me/channels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipient_id: opts.userId }),
    signal: AbortSignal.timeout(4000),
  });
  if (!channel.ok) return false;
  const { id } = (await channel.json()) as { id?: string };
  if (!id) return false;
  const sent = await fetchImpl(`${API}/channels/${id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: opts.content.slice(0, 1900), components: opts.components, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(4000),
  });
  return sent.ok;
}
