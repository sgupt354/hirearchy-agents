// Structural request/response types for the apply-suite Vercel functions (same shape as src/live/http.ts, kept
// separate so live mode stays untouched).
export interface ApiRequest extends AsyncIterable<Buffer | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): unknown;
  setHeader?(name: string, value: string): unknown;
}

/** JSON body: Vercel has usually parsed it already; otherwise read the stream (capped at 64 KB). */
export async function jsonBody(req: ApiRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') return parse(req.body);
  let raw = '';
  for await (const c of req) {
    raw += typeof c === 'string' ? c : c.toString('utf8');
    if (raw.length > 65_536) break;
  }
  return parse(raw);
}

const parse = (s: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(s || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

export const text = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
export const list = (v: unknown, max = 10): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, max);

/** Tiny in-memory TTL cache (per warm function instance). */
export class TtlCache<T> {
  #m = new Map<string, { at: number; v: T }>();
  constructor(private ttlMs: number, private max = 50) {}
  get(k: string, now = Date.now()): T | undefined {
    const e = this.#m.get(k);
    if (!e) return undefined;
    if (now - e.at > this.ttlMs) {
      this.#m.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: T, now = Date.now()): void {
    if (this.#m.size >= this.max) this.#m.delete(this.#m.keys().next().value as string);
    this.#m.set(k, { at: now, v });
  }
}
