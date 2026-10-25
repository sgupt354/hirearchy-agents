import { describe, expect, it } from 'vitest';
import { createJobsHandler } from '../../../api/jobs-search';
import { BOARDS } from '../../../src/features/apply/jobs/boards';
import {
  DEFAULT_PROFILE, ageText, cleanHtml, dedupe, locationStatus, parseAshby, parseGreenhouse, parseLever, parseSmartRecruiters, rank,
  requiredYears, roleMatch, scorePosting, titleFilter, type Board, type Posting, type SearchProfile,
} from '../../../src/features/apply/jobs/match';
import { fetchBoards, pickBoards, type FetchJson } from '../../../src/features/apply/jobs/search';
import { TtlCache } from '../../../src/features/apply/server/http';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const gh: Board = { provider: 'greenhouse', board: 'stripe', name: 'stripe' };
const lv: Board = { provider: 'lever', board: 'palantir', name: 'palantir' };
const ab: Board = { provider: 'ashby', board: 'ramp', name: 'ramp' };
const sr: Board = { provider: 'smartrecruiters', board: 'Visa', name: 'Visa' };

// Recorded shapes of each public endpoint (trimmed), no network.
const GREENHOUSE = {
  jobs: [
    { id: 101, title: 'Software Engineer, Intern', location: { name: 'Seattle, WA' }, absolute_url: 'https://stripe.com/jobs/101', first_published: '2026-10-24T12:00:00Z',
      content: '&lt;p&gt;Build APIs in &lt;b&gt;TypeScript&lt;/b&gt; and Go.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Kafka&lt;/li&gt;&lt;/ul&gt;' },
    { id: 102, title: 'Staff Software Engineer', location: { name: 'San Francisco, CA' }, absolute_url: 'https://stripe.com/jobs/102', updated_at: '2026-10-20T00:00:00Z', content: '' },
  ],
};
const LEVER = [
  { id: 'abc', text: 'Software Engineer, New Grad', categories: { location: 'New York, NY' }, country: 'US', workplaceType: 'onsite', hostedUrl: 'https://jobs.lever.co/palantir/abc',
    createdAt: Date.parse('2026-10-23T12:00:00Z'), descriptionPlain: 'New grads welcome. Java, React.', lists: [{ text: 'Requirements', content: '<li>US citizen required for clearance</li>' }], additionalPlain: '' },
];
const ASHBY = {
  jobs: [
    { id: 'r1', title: 'Software Engineer Intern', location: 'New York', secondaryLocations: [{ location: 'San Francisco' }], isRemote: false, isListed: true,
      jobUrl: 'https://jobs.ashbyhq.com/ramp/r1', publishedAt: '2026-10-25T06:00:00Z', descriptionPlain: 'Python, SQL, React. Internship.' },
    { id: 'r2', title: 'Hidden role', location: 'NY', isListed: false, jobUrl: 'x', publishedAt: '2026-10-25T06:00:00Z', descriptionPlain: '' },
    { id: 'r3', title: 'Software Engineer Intern', location: 'London, United Kingdom', isListed: true, jobUrl: 'https://jobs.ashbyhq.com/ramp/r3', publishedAt: '2026-10-25T06:00:00Z', descriptionPlain: 'x' },
  ],
};
const SMARTRECRUITERS = {
  totalFound: 1,
  content: [{ id: 'sr9', name: 'Software Engineer Intern', location: { city: 'Austin', region: 'TX', country: 'us', remote: false }, releasedDate: '2026-10-22T00:00:00Z' }],
};

describe('jobs: one parser per public board shape', () => {
  it('greenhouse: html content decoded, first_published preferred', () => {
    const [a, b] = parseGreenhouse(GREENHOUSE, gh);
    expect(a).toMatchObject({ id: 'greenhouse:101', company: 'Stripe', title: 'Software Engineer, Intern', location: 'Seattle, WA', url: 'https://stripe.com/jobs/101', posted: '2026-10-24T12:00:00.000Z' });
    expect(a.description).toContain('Build APIs in TypeScript and Go.');
    expect(a.description).toContain('- Kafka');
    expect(a.description).not.toMatch(/<|&lt;/);
    expect(b.posted).toBe('2026-10-20T00:00:00.000Z');
  });

  it('lever: country appended, lists flattened, ms timestamps', () => {
    const [p] = parseLever(LEVER, lv);
    expect(p).toMatchObject({ id: 'lever:abc', company: 'Palantir', location: 'New York, NY, US', posted: '2026-10-23T12:00:00.000Z' });
    expect(p.description).toContain('US citizen required');
  });

  it('ashby: unlisted jobs dropped, secondary locations joined', () => {
    const jobs = parseAshby(ASHBY, ab);
    expect(jobs.map((j) => j.id)).toEqual(['ashby:r1', 'ashby:r3']);
    expect(jobs[0].location).toBe('New York; San Francisco');
  });

  it('smartrecruiters: city, region, country; public posting URL', () => {
    const [p] = parseSmartRecruiters(SMARTRECRUITERS, sr);
    expect(p).toMatchObject({ location: 'Austin, TX, US', url: 'https://jobs.smartrecruiters.com/Visa/sr9' });
  });

  it('garbage input yields no postings rather than throwing', () => {
    expect(parseGreenhouse(null, gh)).toEqual([]);
    expect(parseLever({ nope: 1 }, lv)).toEqual([]);
    expect(parseAshby('x', ab)).toEqual([]);
    expect(cleanHtml(undefined)).toBe('');
  });
});

describe('jobs: filters', () => {
  const post = (title: string, location = 'Seattle, WA', description = 'Entry level role.'): Posting =>
    ({ id: title, company: 'Acme', provider: 'greenhouse', title, location, url: 'u', posted: '2026-10-24T00:00:00Z', description });
  const p: SearchProfile = { ...DEFAULT_PROFILE, roles: ['software engineer'], level: 'both' };

  it('role match uses words and synonyms', () => {
    expect(roleMatch('software engineer', 'Software Engineer II')).toBe(true);
    expect(roleMatch('software engineer', 'Backend Developer')).toBe(true);
    expect(roleMatch('software engineer', 'Account Executive')).toBe(false);
  });

  it('level: senior titles out, intern-only and new-grad-only modes', () => {
    expect(titleFilter(post('Senior Software Engineer'), p, NOW)).toBe('too senior');
    expect(titleFilter(post('Software Engineer II'), p, NOW)).toBe('too senior');
    expect(titleFilter(post('Software Engineer'), { ...p, level: 'intern' }, NOW)).toBe('not an internship');
    expect(titleFilter(post('Software Engineer Intern'), { ...p, level: 'newgrad' }, NOW)).toBe('internship');
    expect(titleFilter(post('Software Engineer Intern'), p, NOW)).toBeNull();
  });

  it('US location: any US location keeps it, all-abroad drops it', () => {
    expect(locationStatus('London, United Kingdom')).toBe('non_us');
    expect(locationStatus('Toronto, ON; Seattle, WA')).toBe('us');
    expect(locationStatus('Remote')).toBe('unclear');
    expect(titleFilter(post('Software Engineer Intern', 'Berlin, Germany'), p, NOW)).toBe('outside US');
  });

  it('visa risk: hidden for students who need sponsorship, flagged otherwise', () => {
    const risky = post('Software Engineer Intern', 'Austin, TX', 'Must be a US citizen.');
    expect(scorePosting(risky, { ...p, sponsorship: true }, '', NOW)).toEqual({ reason: 'no sponsorship / citizenship required' });
    const kept = scorePosting(risky, p, '', NOW);
    expect('job' in kept && kept.job.visaFlag).toBe(true);
  });

  it('new grad needs an entry-level signal and few required years', () => {
    expect(scorePosting(post('Software Engineer', 'NY, NY', '5+ years of experience.'), p, '', NOW)).toEqual({ reason: 'needs more experience' });
    expect(scorePosting(post('Software Engineer', 'NY, NY', 'Great team.'), p, '', NOW)).toEqual({ reason: 'not marked entry-level' });
    expect('job' in scorePosting(post('Software Engineer', 'NY, NY', 'Open to new grads.'), p, '', NOW)).toBe(true);
    expect(requiredYears('3-5 years of experience. 1 year of Rust preferred.')).toBe(3);
    expect(requiredYears('2 years of Go is a plus')).toBeNull();
  });
});

describe('jobs: scoring and dedupe', () => {
  const all = [...parseGreenhouse(GREENHOUSE, gh), ...parseLever(LEVER, lv), ...parseAshby(ASHBY, ab), ...parseSmartRecruiters(SMARTRECRUITERS, sr)];

  it('resume overlap raises the score and is explained', () => {
    const p = all.find((x) => x.id === 'ashby:r1')!;
    const without = scorePosting(p, DEFAULT_PROFILE, '', NOW);
    const withResume = scorePosting(p, DEFAULT_PROFILE, 'Built a Python and SQL pipeline; React dashboard.', NOW);
    if (!('job' in without) || !('job' in withResume)) throw new Error('expected kept');
    expect(withResume.job.score).toBeGreaterThan(without.job.score);
    expect(withResume.job.reasons.join(' ')).toMatch(/resume keywords/);
  });

  it('dedupe keeps one posting per company + title + location (the freshest)', () => {
    const a: Posting = { ...all[0], id: 'greenhouse:1', posted: '2026-10-01T00:00:00Z' };
    const b: Posting = { ...all[0], id: 'greenhouse:2', posted: '2026-10-20T00:00:00Z', title: 'software engineer,  intern' };
    expect(dedupe([a, b]).map((x) => x.id)).toEqual(['greenhouse:2']);
  });

  it('rank: filters, counts reasons, sorts by score', () => {
    const r = rank(all, DEFAULT_PROFILE, '', NOW);
    expect(r.read).toBe(all.length);
    expect(r.results.map((x) => x.id)).toEqual(expect.arrayContaining(['greenhouse:101', 'ashby:r1', 'lever:abc', 'smartrecruiters:sr9']));
    expect(r.filteredOut).toMatchObject({ 'too senior': 1, 'outside US': 1 });
    const scores = r.results.map((x) => x.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('age text', () => {
    expect(ageText('2026-10-25T09:00:00Z', NOW)).toBe('3h ago');
    expect(ageText(null, NOW)).toBe('date unknown');
  });
});

describe('jobs: boards and fetching', () => {
  it('all 443 boards from hiring-pulse are ported', () => {
    expect(BOARDS).toHaveLength(443);
    expect(new Set(BOARDS.map((b) => b.provider))).toEqual(new Set(['ashby', 'greenhouse', 'lever', 'smartrecruiters']));
  });

  it('pickBoards: named companies, else the priority list first, capped', () => {
    expect(pickBoards(['Stripe']).map((b) => b.board)).toContain('stripe');
    const def = pickBoards([], 5);
    expect(def.map((b) => b.board)).toEqual(['stripe', 'airbnb', 'figma', 'ramp', 'notion']);
  });

  it('a slow board times out without sinking the search; failures are counted', async () => {
    const fetchJson: FetchJson = (url, signal) => {
      if (url.includes('greenhouse')) return Promise.resolve(GREENHOUSE);
      if (url.includes('lever')) return Promise.reject(new Error('HTTP 500'));
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    };
    const { postings, report } = await fetchBoards([gh, lv, ab], { fetchJson, perRequestMs: 50, budgetMs: 500 });
    expect(report).toMatchObject({ boards: 3, ok: 1, failed: 1, timedOut: 1 });
    expect(postings).toHaveLength(2);
  });

  it('the overall budget stops waiting even if requests never settle', async () => {
    const fetchJson: FetchJson = () => new Promise(() => {});
    const t = Date.now();
    const { report } = await fetchBoards([gh, lv, ab], { fetchJson, perRequestMs: 10_000, budgetMs: 80 });
    expect(Date.now() - t).toBeLessThan(1000);
    expect(report.timedOut).toBe(3);
  });
});

describe('jobs: /api/jobs-search', () => {
  const res = () => {
    const out = { status: 0, body: undefined as unknown };
    const r = { status(c: number) { out.status = c; return r; }, json(b: unknown) { out.body = b; return r; }, setHeader() { return r; } };
    return { r, out };
  };
  const req = (body: unknown, method = 'POST') => ({ method, headers: {}, body, async *[Symbol.asyncIterator]() {} });
  const fixtures: FetchJson = async (url) => (url.includes('greenhouse') ? GREENHOUSE : url.includes('lever') ? LEVER : url.includes('ashby') ? ASHBY : SMARTRECRUITERS);

  it('returns ranked live postings and serves the second call from cache', async () => {
    let calls = 0;
    const counting: FetchJson = async (u, s) => (calls++, fixtures(u, s));
    const handle = createJobsHandler({ enabled: true, fetchJson: counting, cache: new TtlCache(600_000), now: () => NOW });
    const a = res();
    await handle(req({ companies: ['stripe', 'ramp'], roles: 'software engineer', level: 'both' }), a.r);
    expect(a.out.status).toBe(200);
    const body = a.out.body as { results: { id: string }[]; cached: boolean };
    expect(body.results.map((x) => x.id)).toContain('greenhouse:101');
    expect(body.cached).toBe(false);
    const n = calls;
    const b = res();
    await handle(req({ companies: ['stripe', 'ramp'], resume: 'Python SQL' }), b.r);
    expect((b.out.body as { cached: boolean }).cached).toBe(true);
    expect(calls).toBe(n);
  });

  it('off switch, wrong method and unreachable boards', async () => {
    const off = res();
    await createJobsHandler({ enabled: false, fetchJson: fixtures, cache: new TtlCache(1) })(req({}), off.r);
    expect(off.out.status).toBe(503);
    const get = res();
    await createJobsHandler({ enabled: true, fetchJson: fixtures, cache: new TtlCache(1) })(req({}, 'GET'), get.r);
    expect(get.out.status).toBe(405);
    const down = res();
    await createJobsHandler({ enabled: true, fetchJson: async () => { throw new Error('ECONNRESET'); }, cache: new TtlCache(1) })(req({ companies: ['stripe'] }), down.r);
    expect(down.out.status).toBe(502);
  });
});
