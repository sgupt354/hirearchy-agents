// Minimal structural types for Vercel's Node signature, so the functions stay dependency-free.
export interface LiveRequest extends AsyncIterable<Buffer | string> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  /** Test hook: the exact request bytes (Vercel streams them instead). */
  rawBody?: string;
}

export interface LiveResponse {
  status(code: number): LiveResponse;
  json(body: unknown): unknown;
  setHeader?(name: string, value: string): unknown;
}

export const header = (req: LiveRequest, name: string): string => {
  const v = req.headers[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/** Raw body for signature checks. Never touch req.body first: Vercel would parse (and re-serialize) it. */
export async function readRawBody(req: LiveRequest): Promise<string> {
  if (typeof req.rawBody === 'string') return req.rawBody;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

export function queryParam(req: LiveRequest, name: string): string | undefined {
  const fromQuery = req.query?.[name];
  if (fromQuery !== undefined) return Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
  return new URL(req.url ?? '/', 'http://local').searchParams.get(name) ?? undefined;
}
