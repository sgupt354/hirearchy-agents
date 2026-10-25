import type { LiveReply } from './protocol.js';

/** Where Discord replies wait for the browser to pick them up. First reply per (session, prompt) wins. */
export interface ReplyStore {
  put(reply: LiveReply): Promise<boolean>;
  get(session: string, prompt: number): Promise<LiveReply | null>;
}

/** For tests and local runs. */
export class MemoryReplyStore implements ReplyStore {
  #rows = new Map<string, LiveReply>();
  async put(r: LiveReply) {
    const key = `${r.session}|${r.prompt}`;
    if (this.#rows.has(key)) return false;
    this.#rows.set(key, { ...r });
    return true;
  }
  async get(session: string, prompt: number) {
    return this.#rows.get(`${session}|${prompt}`) ?? null;
  }
}

/**
 * Supabase via PostgREST RPC (plain fetch). Uses the service-role key, server-side only: the t2_live_*
 * functions are granted to service_role alone, so the public anon key can't read or forge replies.
 */
export class SupabaseReplyStore implements ReplyStore {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async #rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: this.serviceKey, Authorization: `Bearer ${this.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      // Discord wants an interaction answered within 3 s.
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`store_${res.status}`);
    return res.json();
  }

  async put(r: LiveReply) {
    const stored = await this.#rpc('t2_live_put_reply', { p_session: r.session, p_prompt: r.prompt, p_action: r.action, p_text: r.text ?? null });
    return stored === true;
  }

  async get(session: string, prompt: number) {
    const rows = (await this.#rpc('t2_live_get_reply', { p_session: session, p_prompt: prompt })) as
      | { action: LiveReply['action']; text: string | null; created_at: string }[]
      | null;
    const row = rows?.[0];
    return row ? { session, prompt, action: row.action, text: row.text ?? undefined, at: row.created_at } : null;
  }
}

/** SUPABASE_URL (or the existing VITE_SUPABASE_URL, which isn't secret) + SUPABASE_SERVICE_ROLE_KEY (secret). */
export function storeFromEnv(env: Record<string, string | undefined> = process.env): ReplyStore | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? new SupabaseReplyStore(url, key) : null;
}
