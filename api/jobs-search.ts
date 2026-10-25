import { DEFAULT_PROFILE, rank, type Level, type Posting, type SearchProfile } from '../src/features/apply/jobs/match.js';
import { fetchBoards, pickBoards, type FetchJson, type FetchReport } from '../src/features/apply/jobs/search.js';
import { TtlCache, jsonBody, list, text, type ApiRequest, type ApiResponse } from '../src/features/apply/server/http.js';

/**
 * POST /api/jobs-search  { roles, level, sponsorship, companies, resume, limit }
 * Reads up to 60 public company job boards (Greenhouse, Lever, Ashby, SmartRecruiters official JSON endpoints) inside a
 * 7 s budget and returns ranked postings. Raw board results are cached for 10 minutes. JOBS_SEARCH=off disables it.
 */
export interface JobsDeps {
  enabled: boolean;
  fetchJson: FetchJson;
  cache: TtlCache<{ postings: Posting[]; report: FetchReport }>;
  now?: () => number;
}

const LEVELS: Level[] = ['intern', 'newgrad', 'both', 'any'];
const UA = 'hirearchy-job-sniper/1.0 (student project; public job-board API)';

export const fetchJsonWith = (fetchImpl: typeof fetch): FetchJson => async (url, signal) => {
  const r = await fetchImpl(url, { signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function createJobsHandler(deps: JobsDeps) {
  const now = deps.now ?? Date.now;
  return async function handle(req: ApiRequest, res: ApiResponse) {
    res.setHeader?.('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!deps.enabled) return res.status(503).json({ error: 'live_search_off' });
    const b = await jsonBody(req);
    const level = LEVELS.includes(b.level as Level) ? (b.level as Level) : DEFAULT_PROFILE.level;
    const roles = list(b.roles, 5);
    const profile: SearchProfile = { ...DEFAULT_PROFILE, roles: roles.length ? roles : DEFAULT_PROFILE.roles, level, sponsorship: b.sponsorship === true };
    const companies = list(b.companies, 10);
    const boards = pickBoards(companies, 60);
    if (!boards.length) return res.status(200).json({ ok: true, results: [], read: 0, filteredOut: {}, report: null, cached: false, note: 'no_matching_boards' });

    const key = boards.map((x) => `${x.provider}:${x.board}`).join(',');
    let fetched = deps.cache.get(key, now());
    const cached = Boolean(fetched);
    if (!fetched) {
      fetched = await fetchBoards(boards, { fetchJson: deps.fetchJson, concurrency: 16, perRequestMs: 3500, budgetMs: 7000, now });
      if (fetched.report.ok > 0) deps.cache.set(key, fetched, now());
    }
    if (fetched.report.ok === 0) return res.status(502).json({ error: 'boards_unreachable', report: fetched.report });
    const limit = Math.min(Math.max(Number(b.limit) || 20, 1), 40);
    const ranked = rank(fetched.postings, profile, text(b.resume, 20_000), now(), limit);
    const results = ranked.results.map((p) => ({ ...p, description: p.description.slice(0, 6000) }));
    return res.status(200).json({ ok: true, ...ranked, results, report: fetched.report, cached });
  };
}

const shared = new TtlCache<{ postings: Posting[]; report: FetchReport }>(10 * 60_000, 20);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return createJobsHandler({ enabled: process.env.JOBS_SEARCH !== 'off', fetchJson: fetchJsonWith(fetch), cache: shared })(req, res);
}
