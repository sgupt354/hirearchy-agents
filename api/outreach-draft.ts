import { DraftLimiter, MAX_WORDS, UNFILLED, templateDraft, wordCount, type Draft, type DraftInput, type DraftKind } from '../src/features/apply/outreach/draft.js';
import { jsonBody, text, type ApiRequest, type ApiResponse } from '../src/features/apply/server/http.js';

/**
 * POST /api/outreach-draft → { draft, source: 'llm' | 'template' }
 * Always returns a DRAFT for the student to review and send themselves; this server never sends email. With
 * ANTHROPIC_API_KEY set, Claude rewords the template (3 s timeout); the result is rejected (template used instead) if it
 * goes over 120 words, leaves a placeholder, drops the company, or contains a number that wasn't in the facts.
 */
export interface OutreachDeps {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  limiterFor?: (ip: string) => DraftLimiter;
}

const KINDS: DraftKind[] = ['recruiter', 'alum', 'referrer'];
const numbers = (s: string) => new Set(s.match(/\d[\d,.%]*/g) ?? []);

/** Accept the model's wording only if it adds no facts and keeps every rule. */
export function acceptable(llm: string, base: Draft, input: DraftInput): boolean {
  if (!llm || wordCount(llm) > MAX_WORDS || UNFILLED.test(llm)) return false;
  if (!llm.includes(input.company)) return false;
  const allowed = numbers(`${base.body} ${input.role} ${input.company}`);
  for (const n of numbers(llm)) if (!allowed.has(n)) return false;
  return true;
}

async function reword(base: Draft, deps: OutreachDeps): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 3000);
  try {
    const r = await (deps.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': deps.apiKey!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: deps.model ?? 'claude-sonnet-5-5',
        max_tokens: 400,
        system:
          'You polish short emails a student will review and send themselves. Rewrite the draft to sound warm and specific. ' +
          `Use ONLY facts in the draft; add no new claims, numbers, names or skills. Keep it under ${MAX_WORDS} words. ` +
          'Keep the greeting and sign-off. Return only the email body, no subject, no commentary.',
        messages: [{ role: 'user', content: base.body }],
      }),
    });
    if (!r.ok) return '';
    const body = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

export function createOutreachHandler(deps: OutreachDeps) {
  const limiters = new Map<string, DraftLimiter>();
  const limiterFor = deps.limiterFor ?? ((ip: string) => limiters.get(ip) ?? limiters.set(ip, new DraftLimiter(20, 10 * 60_000)).get(ip)!);
  return async function handle(req: ApiRequest, res: ApiResponse) {
    res.setHeader?.('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd ?? 'local').split(',')[0].trim();
    if (!limiterFor(ip).tryTake()) return res.status(429).json({ error: 'too_many_drafts' });

    const b = await jsonBody(req);
    const kind = KINDS.includes(b.kind as DraftKind) ? (b.kind as DraftKind) : null;
    const c = (b.contact ?? {}) as Record<string, unknown>;
    const s = (b.student ?? {}) as Record<string, unknown>;
    const input: DraftInput = {
      kind: kind ?? 'recruiter',
      company: text(b.company, 80),
      role: text(b.role, 120),
      contact: { name: text(c.name, 80), title: text(c.title, 80), email: text(c.email, 120) },
      student: { name: text(s.name, 80), school: text(s.school, 120), highlight: text(s.highlight, 300) },
    };
    if (!kind || !input.company || !input.role) return res.status(400).json({ error: 'bad_request' });

    const base = templateDraft(input);
    if (!deps.apiKey) return res.status(200).json({ draft: base, source: 'template' });
    const llm = await reword(base, deps);
    if (!acceptable(llm, base, input)) return res.status(200).json({ draft: base, source: 'template' });
    return res.status(200).json({ draft: { ...base, body: llm }, source: 'llm' });
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return createOutreachHandler({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.OUTREACH_MODEL })(req, res);
}
