// Job Sniper core, ported from hiring-pulse scripts/jobs_core.py. Pure: parse public job-board JSON, filter by
// role / level / US location / visa risk, score against the student's resume text, dedupe. No network here.

export type Provider = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';

export interface Board {
  provider: Provider;
  board: string;
  name: string;
}

export interface Posting {
  id: string;
  company: string;
  provider: Provider;
  title: string;
  location: string;
  url: string;
  /** ISO timestamp, or null when the board doesn't say. */
  posted: string | null;
  description: string;
}

export type Level = 'intern' | 'newgrad' | 'both' | 'any';

export interface SearchProfile {
  roles: string[];
  level: Level;
  usOnly: boolean;
  /** True when the student needs visa sponsorship: hides citizenship / clearance / no-sponsorship roles. */
  sponsorship: boolean;
  days?: number;
  maxYears?: number;
}

export interface ScoredPosting extends Posting {
  score: number;
  isIntern: boolean;
  visaFlag: boolean;
  years: number | null;
  reasons: string[];
}

export const DEFAULT_PROFILE: SearchProfile = { roles: ['software engineer'], level: 'both', usOnly: true, sponsorship: false, maxYears: 2 };

// ---------------------------------------------------------------- helpers

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const unescapeOnce = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => {
    if (ENTITIES[e.toLowerCase()] !== undefined) return ENTITIES[e.toLowerCase()];
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });

export function cleanHtml(s: string | null | undefined): string {
  if (!s) return '';
  let t = unescapeOnce(unescapeOnce(s));
  t = t.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, '\n');
  t = t.replace(/<li[^>]*>/gi, '\n- ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/[ \t ]+/g, ' ');
  return t.replace(/\n\s*\n+/g, '\n\n').trim();
}

export function parseDate(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function prettyCompany(name: string): string {
  const n = name.replace(/[-_]/g, ' ');
  return /[A-Z]/.test(n) ? n : n.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ageText(posted: string | null, now: number): string {
  const d = parseDate(posted);
  if (d === null) return 'date unknown';
  const h = (now - d) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.floor(h * 60))} min ago`;
  if (h < 48) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const job = (b: Board, id: unknown, title: unknown, location: unknown, url: unknown, posted: number | null, description: string): Posting => ({
  id: `${b.provider}:${String(id ?? '')}`,
  company: prettyCompany(b.name),
  provider: b.provider,
  title: String(title ?? '').trim(),
  location: String(location ?? '').trim(),
  url: String(url ?? ''),
  posted: iso(posted),
  description,
});

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

// ---------------------------------------------------------------- parsers (one per ATS JSON shape)

/** GET boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true */
export function parseGreenhouse(data: unknown, b: Board): Posting[] {
  return arr(obj(data).jobs).map((raw) => {
    const j = obj(raw);
    const posted = parseDate(j.first_published) ?? parseDate(j.updated_at);
    return job(b, j.id, j.title, obj(j.location).name, j.absolute_url, posted, cleanHtml(str(j.content)));
  });
}

/** GET api.lever.co/v0/postings/{site}?mode=json */
export function parseLever(data: unknown, b: Board): Posting[] {
  return arr(data).map((raw) => {
    const j = obj(raw);
    const cats = obj(j.categories);
    let loc = str(cats.location);
    const country = str(j.country).trim();
    if (country && !loc.toLowerCase().includes(country.toLowerCase())) loc = loc ? `${loc}, ${country}` : country;
    if (str(j.workplaceType).toLowerCase() === 'remote') loc = `${loc} (Remote)`.trim();
    const parts = [str(j.descriptionPlain)];
    for (const l of arr(j.lists)) parts.push(`${str(obj(l).text)}\n${cleanHtml(str(obj(l).content))}`);
    parts.push(str(j.additionalPlain));
    return job(b, j.id, j.text, loc, j.hostedUrl, parseDate(j.createdAt), parts.join('\n').trim());
  });
}

/** GET api.ashbyhq.com/posting-api/job-board/{name} */
export function parseAshby(data: unknown, b: Board): Posting[] {
  return arr(obj(data).jobs)
    .map(obj)
    .filter((j) => j.isListed !== false)
    .map((j) => {
      let loc = str(j.location);
      const sec = arr(j.secondaryLocations).map((x) => str(obj(x).location)).filter(Boolean);
      if (sec.length) loc = [loc, ...sec].join('; ');
      if (j.isRemote) loc = `${loc} (Remote)`.trim();
      return job(b, j.id ?? j.jobUrl, j.title, loc, j.jobUrl ?? j.applyUrl, parseDate(j.publishedAt), str(j.descriptionPlain) || cleanHtml(str(j.descriptionHtml)));
    });
}

/** GET api.smartrecruiters.com/v1/companies/{id}/postings */
export function parseSmartRecruiters(data: unknown, b: Board): Posting[] {
  return arr(obj(data).content).map((raw) => {
    const j = obj(raw);
    const l = obj(j.location);
    let locs = [str(l.city), str(l.region), str(l.country).toUpperCase()].filter(Boolean).join(', ');
    if (l.remote) locs += ' (Remote)';
    return job(b, j.id, j.name, locs, `https://jobs.smartrecruiters.com/${b.board}/${str(j.id)}`, parseDate(j.releasedDate), '');
  });
}

export const PARSERS: Record<Provider, (data: unknown, b: Board) => Posting[]> = {
  greenhouse: parseGreenhouse,
  lever: parseLever,
  ashby: parseAshby,
  smartrecruiters: parseSmartRecruiters,
};

/** The official public JSON endpoint for a board. */
export function boardUrl(b: Board): string {
  const t = encodeURIComponent(b.board);
  switch (b.provider) {
    case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`;
    case 'lever': return `https://api.lever.co/v0/postings/${t}?mode=json`;
    case 'ashby': return `https://api.ashbyhq.com/posting-api/job-board/${t}`;
    case 'smartrecruiters': return `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`;
  }
}

// ---------------------------------------------------------------- location

const US_STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const US_WORDS = ['united states', 'usa', 'u.s.', 'us-remote', 'remote - us', 'remote, us', '(us)', 'alabama', 'alaska', 'arizona', 'arkansas',
  'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
  'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming', 'san francisco', 'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'denver', 'atlanta', 'phoenix', 'tempe',
  'scottsdale', 'san jose', 'palo alto', 'mountain view', 'sunnyvale', 'san diego', 'miami', 'dallas', 'houston', 'pittsburgh', 'portland',
  'detroit', 'nyc'];
const NON_US = ['canada', 'toronto', 'vancouver', 'montreal', 'london', 'united kingdom', 'uk', 'ireland', 'dublin', 'germany', 'berlin', 'munich',
  'france', 'paris', 'india', 'bangalore', 'bengaluru', 'hyderabad', 'singapore', 'japan', 'tokyo', 'australia', 'sydney', 'brazil', 'mexico',
  'poland', 'warsaw', 'netherlands', 'amsterdam', 'spain', 'israel', 'tel aviv', 'china', 'vietnam', 'korea', 'seoul', 'philippines', 'romania',
  'serbia', 'portugal', 'lisbon', 'sweden', 'uae', 'pune', 'chennai', 'gurgaon', 'gurugram', 'noida', 'mumbai', 'delhi', 'emea', 'apac', 'latam',
  'europe', 'asia', 'zurich', 'switzerland', 'italy', 'milan', 'madrid', 'barcelona', 'stockholm', 'copenhagen', 'denmark', 'finland', 'norway',
  'austria', 'belgium', 'prague', 'czech', 'hungary', 'turkey', 'egypt', 'nigeria', 'kenya', 'south africa', 'argentina', 'chile', 'colombia',
  'costa rica', 'taiwan', 'hong kong', 'shanghai', 'beijing', 'malaysia', 'indonesia', 'thailand', 'new zealand', 'melbourne', 'ontario', 'quebec',
  'british columbia', 'calgary', 'ottawa', 'waterloo', 'edinburgh', 'manchester', 'dubai', 'ukraine', 'estonia', 'lithuania', 'latvia', 'greece',
  'luxembourg'];
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NON_US_RE = NON_US.map((w) => new RegExp(`\\b${esc(w)}\\b`));
const US_ABBR = /\b(sf|nyc|bay area|silicon valley|washington dc|d\.c\.)\b/i;
const US_STATE_RE = new RegExp(`,\\s*(${US_STATES.join('|')})\\b`);

function foreignCode(part: string): boolean {
  const bits = part.replace(/\(.*?\)/g, '').split(',').map((b) => b.trim()).filter(Boolean);
  return bits.length >= 3 && /^[A-Za-z]{2}$/.test(bits.at(-1)!) && bits.at(-1)!.toUpperCase() !== 'US';
}

function partStatus(part: string): 'us' | 'non_us' | 'unclear' {
  const l = part.toLowerCase();
  if (foreignCode(part)) return 'non_us';
  if (US_ABBR.test(part)) return 'us';
  if (NON_US_RE.some((r) => r.test(l))) return 'non_us';
  if (US_STATE_RE.test(part) || US_WORDS.some((w) => l.includes(w)) || /\bus\b/.test(l)) return 'us';
  return 'unclear';
}

/** us if ANY listed location is in the US; non_us only if all are clearly abroad. */
export function locationStatus(loc: string): 'us' | 'non_us' | 'unclear' {
  const parts = (loc || '').split(/[;|/]| or /).filter((p) => p.trim());
  const st = (parts.length ? parts : ['']).map(partStatus);
  if (st.includes('us')) return 'us';
  if (st.every((s) => s === 'non_us')) return 'non_us';
  return 'unclear';
}

// ---------------------------------------------------------------- role / level / visa

const SENIOR = /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp|vice president|chief|distinguished|architect|iii|iv)\b/i;
const LEVEL_2PLUS = /\b(engineer|developer|analyst|scientist|programmer)\s*(ii|iii|iv|2|3|4)\b(?!\s*\/)/i;
const INTERN = /\b(intern|internship|co-?op)\b/i;
const EARLY = /\b(new grad|new graduate|university grad|graduate|entry[- ]level|early career|junior|associate|engineer i|apprentice|campus|university)\b|\b(i|1)$/i;
const EARLY_DESC = /\b(new grads?|new graduates?|recent (college )?grad(uate)?s?|university grad(uate)?s?|entry[- ]level|early[- ]career|class of 20\d\d|graduating in 20\d\d|0\s*[-–]\s*[12]\s*years?|no (prior )?experience required)\b/i;
const YEARS = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)\b(?![^.\n]{0,40}\b(?:preferred|nice to have|a plus|bonus)\b)/gi;
export const VISA_RISK = /(u\.?s\.? citizen|citizenship (is )?required|security clearance|active clearance|clearance eligib|itar|export control|export-controlled|without (the need for )?(visa )?sponsorship|will not (provide )?sponsor|unable to sponsor|not able to sponsor|no (visa )?sponsorship|permanent resident)/i;
const CLEARANCE_TITLE = /\b(clearance|cleared|ts\/sci|top secret|polygraph)\b/i;

const ROLE_SYNONYMS: Record<string, string[]> = {
  'software engineer': ['software developer', 'software development', 'sde', 'swe', 'software dev', 'backend', 'frontend', 'full stack', 'fullstack', 'mobile engineer'],
  'data analyst': ['data analytics', 'data analysis', 'business analyst', 'analytics'],
  'data engineer': ['data engineering', 'data platform', 'analytics engineer'],
  'data scientist': ['data science', 'machine learning', 'applied scientist'],
  'machine learning': ['ml engineer', 'ai engineer', 'machine learning', 'deep learning', 'ai/ml'],
  'ai engineer': ['ml engineer', 'machine learning', 'ai/ml', 'applied ai'],
  'product manager': ['product management', 'apm', 'associate product manager'],
  backend: ['back end'],
  'full stack': ['fullstack'],
  designer: ['product design', 'ux', 'ui/ux'],
};

const normTitle = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9&+#/]+/g, ' ')} `;

export function roleMatch(role: string, title: string): boolean {
  const t = normTitle(title);
  const r = normTitle(role).trim().split(/\s+/).join(' ');
  const ws = r.split(' ').filter((w) => w && !['and', 'of', 'the', '&', 'intern', 'internship'].includes(w));
  if (ws.length && ws.every((w) => t.includes(w))) return true;
  return (ROLE_SYNONYMS[r] ?? []).some((s) => new RegExp(`\\b${esc(s)}\\b`).test(t));
}

export function requiredYears(desc: string): number | null {
  const nums = [...(desc || '').matchAll(YEARS)].map((m) => Number(m[1])).filter((n) => n <= 25);
  return nums.length ? Math.min(...nums) : null;
}

export function words(s: string): Set<string> {
  return new Set((s || '').toLowerCase().match(/[a-z][a-z+#.]{1,}/g) ?? []);
}
const STOP = words('the and for with you our are will this that from have your team work who what about able must more into their they other also can all any not but how per such using');

/** Cheap filter on title + location. Returns the reason it's dropped, or null to keep. */
export function titleFilter(p: Posting, profile: SearchProfile, now: number): string | null {
  const t = p.title;
  if (profile.roles.length && !profile.roles.some((r) => roleMatch(r, t))) return 'not your role';
  const isIntern = INTERN.test(t);
  if (profile.level === 'intern' && !isIntern) return 'not an internship';
  if (profile.level === 'newgrad' && isIntern) return 'internship';
  if (profile.level !== 'any' && (SENIOR.test(t) || LEVEL_2PLUS.test(t))) return 'too senior';
  if (profile.usOnly && locationStatus(p.location) === 'non_us') return 'outside US';
  if (profile.sponsorship && CLEARANCE_TITLE.test(t)) return 'needs clearance';
  const d = parseDate(p.posted);
  if (profile.days && d !== null && d < now - profile.days * 86_400_000) return 'too old';
  return null;
}

/** Second pass with the description. Returns the drop reason, or the scored posting. */
export function scorePosting(p: Posting, profile: SearchProfile, resumeText: string, now: number): { reason: string } | { job: ScoredPosting } {
  const isIntern = INTERN.test(p.title);
  const years = requiredYears(p.description);
  const desc = p.description || '';
  if (!isIntern && (profile.level === 'newgrad' || profile.level === 'both')) {
    if (years !== null && years > (profile.maxYears ?? 2)) return { reason: 'needs more experience' };
    // A plain "Software Engineer" title is usually mid-level unless the title or description says entry level.
    if (desc && !(EARLY.test(p.title) || EARLY_DESC.test(desc) || (years !== null && years <= 1))) return { reason: 'not marked entry-level' };
    if (!desc && !EARLY.test(p.title)) return { reason: 'not marked entry-level' };
  }
  const risk = VISA_RISK.test(desc);
  if (profile.sponsorship && risk) return { reason: 'no sponsorship / citizenship required' };
  const reasons: string[] = [];
  let score = 0;
  for (const r of profile.roles) if (roleMatch(r, p.title)) {
    score += 50;
    reasons.push(`Matches "${r}"`);
  }
  if (resumeText) {
    const overlap = [...words(resumeText)].filter((w) => !STOP.has(w) && words(desc).has(w) && w.length > 2);
    score += Math.min(overlap.length, 60);
    if (overlap.length) reasons.push(`${overlap.length} resume keywords in the description`);
  }
  if (isIntern) reasons.push('Internship');
  else if (EARLY.test(p.title) || EARLY_DESC.test(desc)) reasons.push('Entry level');
  if (EARLY.test(p.title) || isIntern) score += 20;
  const loc = locationStatus(p.location);
  if (loc === 'us') reasons.push('US role');
  if (loc === 'unclear') score -= 25;
  const d = parseDate(p.posted);
  if (d !== null) score += Math.max(0, 30 - (now - d) / 86_400_000);
  return { job: { ...p, score: Math.round(score * 10) / 10, isIntern, visaFlag: profile.sponsorship ? false : risk, years, reasons } };
}

const dedupeKey = (p: Posting) => `${p.company.toLowerCase()}|${normTitle(p.title).trim()}|${p.location.toLowerCase().replace(/\s+/g, ' ').trim()}`;

/** One posting per company + title + location (boards often list the same role twice); keeps the freshest. */
export function dedupe<T extends Posting>(postings: T[]): T[] {
  const best = new Map<string, T>();
  for (const p of postings) {
    const k = dedupeKey(p);
    const cur = best.get(k);
    if (!cur || (parseDate(p.posted) ?? 0) > (parseDate(cur.posted) ?? 0)) best.set(k, p);
  }
  const ids = new Set<string>();
  return [...best.values()].filter((p) => (ids.has(p.id) ? false : (ids.add(p.id), true)));
}

export interface RankResult {
  results: ScoredPosting[];
  read: number;
  filteredOut: Record<string, number>;
}

/** Filter, score, dedupe and sort every posting read; highest score first. */
export function rank(postings: Posting[], profile: SearchProfile, resumeText: string, now: number, limit = 20): RankResult {
  const filteredOut: Record<string, number> = {};
  const drop = (r: string) => (filteredOut[r] = (filteredOut[r] ?? 0) + 1);
  const kept: ScoredPosting[] = [];
  for (const p of dedupe(postings)) {
    const r = titleFilter(p, profile, now);
    if (r) {
      drop(r);
      continue;
    }
    const s = scorePosting(p, profile, resumeText, now);
    if ('reason' in s) drop(s.reason);
    else kept.push(s.job);
  }
  kept.sort((a, b) => b.score - a.score || a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  return { results: kept.slice(0, limit), read: postings.length, filteredOut };
}
