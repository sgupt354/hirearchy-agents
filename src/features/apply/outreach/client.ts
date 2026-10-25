import { DraftLimiter, templateDraft, type Draft, type DraftInput } from './draft';

// Ask the server for a draft (LLM wording only if the deployment has a key); on any failure use the same template
// locally. Either way the result is a draft the student edits and sends from their own mail app.

export const sessionLimiter = new DraftLimiter(10, 10 * 60_000);

export interface DraftOutcome {
  draft: Draft;
  source: 'llm' | 'template';
}

export async function requestDraft(input: DraftInput, timeoutMs = 3500, fetchImpl: typeof fetch = fetch): Promise<DraftOutcome | 'rate_limited'> {
  if (!sessionLimiter.tryTake()) return 'rate_limited';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl('/api/outreach-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: ctrl.signal });
    if (r.status === 429) return 'rate_limited';
    if (r.ok) {
      const body = (await r.json()) as Partial<DraftOutcome>;
      if (body.draft?.body && body.draft.subject !== undefined) return { draft: body.draft, source: body.source === 'llm' ? 'llm' : 'template' };
    }
  } catch {
    // offline or no api in dev: fall through to the local template
  } finally {
    clearTimeout(t);
  }
  return { draft: templateDraft(input), source: 'template' };
}
