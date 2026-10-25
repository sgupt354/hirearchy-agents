import type { LiveReply } from './protocol.js';
import type { LiveStudent } from './students.js';

export interface PromptRecord {
  session: string;
  prompt: number;
  student: LiveStudent;
  discordUser: string;
  channelId?: string;
  window?: string;
  lastMessageId?: string;
}

/** Where Discord replies wait for the browser to pick them up. First reply per (session, prompt, student) wins. */
export interface ReplyStore {
  put(reply: LiveReply): Promise<boolean>;
  get(session: string, prompt: number, student?: LiveStudent): Promise<LiveReply | null>;
  recordPrompt?(p: PromptRecord): Promise<void>;
  getPrompt?(session: string, prompt: number, student?: LiveStudent): Promise<PromptRecord | null>;
  latestFor?(student: LiveStudent): Promise<PromptRecord | null>;
  countPrompts?(session: string): Promise<number>;
}

const keyOf = (session: string, prompt: number, student: string) => `${session}|${prompt}|${student}`;

function withStudent(r: LiveReply): LiveReply {
  return { ...r, student: r.student ?? 'a1' };
}

/** For tests and local runs. */
export class MemoryReplyStore implements ReplyStore {
  #rows = new Map<string, LiveReply>();
  #prompts = new Map<string, PromptRecord>();
  #latest = new Map<string, PromptRecord>();

  async put(r: LiveReply) {
    const full = withStudent(r);
    const key = keyOf(full.session, full.prompt, full.student!);
    const legacy = `${full.session}|${full.prompt}`;
    if (this.#rows.has(key) || (full.student === 'a1' && this.#rows.has(legacy))) return false;
    this.#rows.set(key, full);
    if (full.student === 'a1') this.#rows.set(legacy, full);
    return true;
  }

  async get(session: string, prompt: number, student: LiveStudent = 'a1') {
    return this.#rows.get(keyOf(session, prompt, student)) ?? (student === 'a1' ? this.#rows.get(`${session}|${prompt}`) ?? null : null);
  }

  async recordPrompt(p: PromptRecord) {
    const cur = this.#prompts.get(keyOf(p.session, p.prompt, p.student));
    const next = { ...cur, ...p };
    this.#prompts.set(keyOf(p.session, p.prompt, p.student), next);
    this.#latest.set(p.student, next);
  }

  async latestFor(student: LiveStudent) {
    return this.#latest.get(student) ?? null;
  }

  async getPrompt(session: string, prompt: number, student: LiveStudent = 'a1') {
    return this.#prompts.get(keyOf(session, prompt, student)) ?? null;
  }

  async countPrompts(session: string) {
    let n = 0;
    for (const p of this.#prompts.values()) if (p.session === session) n += 1;
    return n;
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
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`store_${res.status}`);
    return res.json();
  }

  async put(r: LiveReply) {
    const full = withStudent(r);
    const stored = await this.#rpc('t2_live_put_student_reply', {
      p_session: full.session,
      p_prompt: full.prompt,
      p_student: full.student,
      p_action: full.action,
      p_text: full.text ?? null,
    });
    if (stored === true) return true;
    // Fallback if the additive SQL hasn't been run yet (single-user table).
    if (full.student === 'a1') {
      return (await this.#rpc('t2_live_put_reply', { p_session: full.session, p_prompt: full.prompt, p_action: full.action, p_text: full.text ?? null })) === true;
    }
    return false;
  }

  async get(session: string, prompt: number, student: LiveStudent = 'a1'): Promise<LiveReply | null> {
    const pack = (who: LiveStudent, action: LiveReply['action'], text: string | null, at: string): LiveReply => ({
      session,
      prompt,
      student: who,
      action,
      text: text ?? undefined,
      at,
    });
    try {
      const rows = (await this.#rpc('t2_live_get_student_reply', { p_session: session, p_prompt: prompt, p_student: student })) as
        | { action: LiveReply['action']; text: string | null; created_at: string }[]
        | null;
      const row = rows?.[0];
      if (row) return pack(student, row.action, row.text, row.created_at);
    } catch {
      if (student !== 'a1') return null;
    }
    if (student !== 'a1') return null;
    const rows = (await this.#rpc('t2_live_get_reply', { p_session: session, p_prompt: prompt })) as
      | { action: LiveReply['action']; text: string | null; created_at: string }[]
      | null;
    const row = rows?.[0];
    return row ? pack('a1', row.action, row.text, row.created_at) : null;
  }

  async recordPrompt(p: PromptRecord) {
    await this.#rpc('t2_live_record_prompt', {
      p_session: p.session,
      p_prompt: p.prompt,
      p_student: p.student,
      p_discord_user: p.discordUser,
      p_channel: p.channelId ?? null,
      p_window: p.window ?? null,
      p_last_message: p.lastMessageId ?? null,
    }).catch(() => undefined);
  }

  async getPrompt(session: string, prompt: number, student: LiveStudent = 'a1') {
    try {
      const rows = (await this.#rpc('t2_live_get_prompt', { p_session: session, p_prompt: prompt, p_student: student })) as
        | { discord_user: string; channel_id: string | null; window: string | null; last_message_id: string | null }[]
        | null;
      const row = rows?.[0];
      return row
        ? {
            session,
            prompt,
            student,
            discordUser: row.discord_user,
            channelId: row.channel_id ?? undefined,
            window: row.window ?? undefined,
            lastMessageId: row.last_message_id ?? undefined,
          }
        : null;
    } catch {
      return null;
    }
  }

  async countPrompts(session: string) {
    try {
      const n = await this.#rpc('t2_live_count_prompts', { p_session: session });
      return typeof n === 'number' ? n : 0;
    } catch {
      return 0;
    }
  }
}

/** SUPABASE_URL (or the existing VITE_SUPABASE_URL, which isn't secret) + SUPABASE_SERVICE_ROLE_KEY (secret). */
export function storeFromEnv(env: Record<string, string | undefined> = process.env): ReplyStore | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? new SupabaseReplyStore(url, key) : null;
}

export const MAX_DMS_PER_SESSION = 40;
