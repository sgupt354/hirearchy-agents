import { SEED_JOBS } from '../find/logic';
import type { Level, ScoredPosting } from './jobs/match';

// Browser side of live search: one POST to /api/jobs-search with a hard timeout. Any failure returns the seeded demo
// postings instead, labelled as demo data.

export interface LiveQuery {
  roles: string;
  level: Level;
  sponsorship: boolean;
  companies: string;
  resume?: string;
}

export interface LiveOutcome {
  source: 'live' | 'demo';
  results: ScoredPosting[];
  read: number;
  boards: number;
  okBoards: number;
  ms: number;
  cached: boolean;
}

/** The seeded Find postings in live-result shape (no apply links: they're demo data). */
export function demoPostings(): ScoredPosting[] {
  return SEED_JOBS.map((j, i) => ({
    id: `demo:${j.id}`,
    company: j.company,
    provider: 'greenhouse',
    title: j.role,
    location: j.location,
    url: '',
    posted: null,
    description: '',
    score: 100 - i,
    isIntern: /intern/i.test(j.role),
    visaFlag: false,
    years: null,
    reasons: [...j.reasons],
  }));
}

const demo = (): LiveOutcome => ({ source: 'demo', results: demoPostings(), read: 0, boards: 0, okBoards: 0, ms: 0, cached: false });

export async function searchLive(q: LiveQuery, timeoutMs = 9000, fetchImpl: typeof fetch = fetch): Promise<LiveOutcome> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl('/api/jobs-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: q.roles, level: q.level, sponsorship: q.sponsorship, companies: q.companies, resume: q.resume ?? '', limit: 20 }),
      signal: ctrl.signal,
    });
    if (!r.ok) return demo();
    const body = (await r.json()) as { results?: ScoredPosting[]; read?: number; cached?: boolean; report?: { boards: number; ok: number; ms: number } | null };
    if (!Array.isArray(body.results)) return demo();
    return {
      source: 'live',
      results: body.results,
      read: body.read ?? 0,
      boards: body.report?.boards ?? 0,
      okBoards: body.report?.ok ?? 0,
      ms: body.report?.ms ?? 0,
      cached: Boolean(body.cached),
    };
  } catch {
    return demo();
  } finally {
    clearTimeout(t);
  }
}
