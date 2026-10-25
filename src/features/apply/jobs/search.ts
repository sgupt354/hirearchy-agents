import { BOARDS } from './boards.js';
import { PARSERS, boardUrl, rank, type Board, type Posting, type RankResult, type SearchProfile } from './match.js';

// Fetch a capped set of public job boards in parallel, inside a hard time budget (Vercel functions must answer
// fast). Network access is injected so tests run offline.

export type FetchJson = (url: string, signal: AbortSignal) => Promise<unknown>;

export interface FetchReport {
  boards: number;
  ok: number;
  failed: number;
  timedOut: number;
  ms: number;
}

export interface SearchOptions {
  fetchJson: FetchJson;
  concurrency?: number;
  perRequestMs?: number;
  budgetMs?: number;
  now?: () => number;
}

/** Well-known companies first, so a default search covers boards students ask about. */
const PRIORITY = ['stripe', 'airbnb', 'figma', 'ramp', 'notion', 'openai', 'anthropic', 'databricks', 'robinhood', 'discord', 'coinbase', 'plaid',
  'duolingo', 'dropbox', 'asana', 'reddit', 'pinterest', 'lyft', 'instacart', 'cloudflare', 'datadog', 'brex', 'linear', 'vercel', 'scaleai',
  'palantir', 'spotify', 'affirm', 'chime', 'gusto', 'airtable', 'samsara', 'twilio', 'okta', 'mongodb', 'elastic', 'roblox'];

const squash = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, '');

/** Which boards to read: the named companies if any, else the priority list then the rest, capped. */
export function pickBoards(companies: string[] = [], cap = 60, boards: readonly Board[] = BOARDS): Board[] {
  const want = companies.map(squash).filter(Boolean);
  if (want.length) return boards.filter((b) => want.some((w) => squash(b.name).includes(w) || squash(b.board).includes(w))).slice(0, cap);
  const rankOf = (b: Board) => {
    const i = PRIORITY.indexOf(b.board.toLowerCase());
    return i === -1 ? PRIORITY.length : i;
  };
  return [...boards].sort((a, b) => rankOf(a) - rankOf(b) || a.board.localeCompare(b.board)).slice(0, cap);
}

/** Read every board, at most `concurrency` at a time; whatever isn't back by the deadline counts as timed out. */
export async function fetchBoards(boards: Board[], opts: SearchOptions): Promise<{ postings: Posting[]; report: FetchReport }> {
  const { fetchJson, concurrency = 16, perRequestMs = 3500, budgetMs = 7000, now = Date.now } = opts;
  const start = now();
  const report: FetchReport = { boards: boards.length, ok: 0, failed: 0, timedOut: 0, ms: 0 };
  const postings: Posting[] = [];
  const all = new AbortController();
  const deadline = setTimeout(() => all.abort(), budgetMs);
  let next = 0;

  async function one(b: Board) {
    const ctrl = new AbortController();
    const onAll = () => ctrl.abort();
    all.signal.addEventListener('abort', onAll);
    const t = setTimeout(() => ctrl.abort(), perRequestMs);
    try {
      const data = await fetchJson(boardUrl(b), ctrl.signal);
      postings.push(...PARSERS[b.provider](data, b));
      report.ok += 1;
    } catch {
      if (ctrl.signal.aborted) report.timedOut += 1;
      else report.failed += 1;
    } finally {
      clearTimeout(t);
      all.signal.removeEventListener('abort', onAll);
    }
  }

  async function worker() {
    while (next < boards.length && !all.signal.aborted) await one(boards[next++]);
  }

  await Promise.race([
    Promise.all(Array.from({ length: Math.min(concurrency, boards.length) }, worker)),
    new Promise<void>((resolve) => all.signal.addEventListener('abort', () => resolve())),
  ]);
  clearTimeout(deadline);
  all.abort(); // stop any request still in flight
  // Snapshot: requests that settle after the deadline must not change what we return.
  const done = { ...report };
  done.timedOut = boards.length - done.ok - done.failed;
  done.ms = now() - start;
  return { postings: [...postings], report: done };
}

export interface SearchResult extends RankResult {
  report: FetchReport;
}

export async function searchJobs(profile: SearchProfile, resumeText: string, companies: string[], opts: SearchOptions & { cap?: number; limit?: number }): Promise<SearchResult> {
  const boards = pickBoards(companies, opts.cap ?? 60);
  const { postings, report } = await fetchBoards(boards, opts);
  return { ...rank(postings, profile, resumeText, (opts.now ?? Date.now)(), opts.limit ?? 20), report };
}
