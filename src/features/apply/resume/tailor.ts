import type { Entry, Profile } from './profile';

// Tailoring = choosing and ordering the student's OWN bullets and skills by how well they match a posting. No text
// is written or rephrased here; the output is a subset of the profile. Requirements the profile doesn't show are
// listed so the student sees them, never papered over.

export interface PostingText {
  company: string;
  title: string;
  description: string;
}

export interface TailoredResume {
  profile: Pick<Profile, 'name' | 'email' | 'phone' | 'links'>;
  education: Entry[];
  experience: Entry[];
  projects: Entry[];
  skills: string[];
  /** Posting terms the resume covers. */
  matched: string[];
  /** Requirements in the posting the profile doesn't show anywhere. */
  unmet: string[];
  /** How many of the student's bullets were kept, of how many. */
  kept: number;
  total: number;
}

/** Skills and requirement terms we recognise in postings (lowercase; matched on word boundaries). */
const TERMS = [
  'python', 'java', 'javascript', 'typescript', 'go', 'golang', 'rust', 'c++', 'c#', 'c', 'ruby', 'scala', 'kotlin', 'swift', 'php', 'sql', 'r',
  'react', 'node.js', 'next.js', 'vue', 'angular', 'graphql', 'rest api', 'grpc', 'html', 'css', 'tailwind',
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'kafka', 'spark', 'hadoop', 'airflow', 'snowflake', 'dbt', 'elasticsearch',
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'linux', 'git', 'ci/cd', 'github actions',
  'machine learning', 'deep learning', 'pytorch', 'tensorflow', 'pandas', 'numpy', 'scikit-learn', 'llm', 'nlp', 'computer vision',
  'distributed systems', 'microservices', 'databases', 'data structures', 'algorithms', 'operating systems', 'networking', 'security',
  'testing', 'unit tests', 'jest', 'agile', 'api', 'apis', 'mobile', 'ios', 'android', 'frontend', 'backend', 'full stack', 'cloud',
];
const ALIASES: Record<string, string> = { golang: 'go', postgres: 'postgresql', apis: 'api', 'unit tests': 'testing' };
const canon = (t: string) => ALIASES[t] ?? t;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TERM_RE = TERMS.map((t) => [t, new RegExp(`(^|[^a-z0-9+#.])${esc(t)}(?=$|[^a-z0-9+#])`, 'i')] as const);

/** Recognised terms in a text, canonical and de-duplicated. "Go" only counts with an explicit language context. */
export function termsIn(text: string): string[] {
  const found = new Set<string>();
  for (const [t, re] of TERM_RE) {
    if (!re.test(text)) continue;
    if ((t === 'go' || t === 'c' || t === 'r') && !new RegExp(`\\b${t === 'go' ? 'Go' : t.toUpperCase()}\\b`).test(text)) continue;
    found.add(canon(t));
  }
  return [...found];
}

const DEGREE = /\b(ph\.?d|doctorate|master'?s|m\.s\.|ms degree|mba)\b/i;
const YEARS = /(\d{1,2})\+?\s*(?:years?|yrs?)\s+of\s+(?:professional|industry|relevant|full[- ]time)?\s*experience/i;
const CLEARANCE = /\b(security clearance|active clearance|u\.?s\.? citizen(ship)?)\b/i;

/** What the posting asks for that the profile doesn't show (terms, degree level, years, clearance). */
export function unmetRequirements(profile: Profile, posting: PostingText): string[] {
  const mine = new Set(termsIn(profileText(profile)));
  const theirs = termsIn(`${posting.title}\n${posting.description}`);
  const out = theirs.filter((t) => !mine.has(t)).map(label);
  const deg = posting.description.match(DEGREE);
  if (deg && !DEGREE.test(profile.education.map((e) => `${e.title} ${e.org}`).join(' '))) out.push(`${deg[0]} degree`);
  const yrs = posting.description.match(YEARS);
  if (yrs && Number(yrs[1]) >= 1) out.push(`${yrs[1]}+ years of experience`);
  const cl = posting.description.match(CLEARANCE);
  if (cl) out.push(`${cl[0]} (check before applying)`);
  return [...new Set(out)];
}

const LABELS: Record<string, string> = { 'c++': 'C++', 'c#': 'C#', sql: 'SQL', aws: 'AWS', gcp: 'GCP', api: 'APIs', 'ci/cd': 'CI/CD', llm: 'LLMs', nlp: 'NLP',
  'node.js': 'Node.js', 'next.js': 'Next.js', graphql: 'GraphQL', grpc: 'gRPC', postgresql: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB',
  typescript: 'TypeScript', javascript: 'JavaScript', pytorch: 'PyTorch', tensorflow: 'TensorFlow', 'scikit-learn': 'scikit-learn', html: 'HTML', css: 'CSS', ios: 'iOS' };
export const label = (t: string) => LABELS[t] ?? t.replace(/\b\w/g, (c) => c.toUpperCase());

export function profileText(p: Profile): string {
  return [...p.skills, ...[...p.education, ...p.experience, ...p.projects].flatMap((e) => [e.title, e.org, ...e.bullets])].join('\n');
}

/** Budget that keeps a standard one-page layout: lines of ~105 characters, 52 lines of body. */
export const PAGE = { charsPerLine: 105, maxLines: 52 };

const linesFor = (s: string) => Math.max(1, Math.ceil(s.length / PAGE.charsPerLine));

/** Estimated rendered lines (headers, entries, wrapped bullets, skills). */
export function estimateLines(r: Pick<TailoredResume, 'education' | 'experience' | 'projects' | 'skills'>): number {
  let n = 3; // name + contact line + spacing
  for (const [items, head] of [[r.education, 1], [r.experience, 1], [r.projects, 1]] as const) {
    if (!items.length) continue;
    n += 1 + head; // section heading + rule
    for (const e of items) n += 1 + (e.org || e.location ? 1 : 0) + e.bullets.reduce((a, b) => a + linesFor(b), 0);
  }
  if (r.skills.length) n += 2 + linesFor(r.skills.join(', '));
  return n;
}

export function fitsOnePage(r: Pick<TailoredResume, 'education' | 'experience' | 'projects' | 'skills'>): boolean {
  return estimateLines(r) <= PAGE.maxLines;
}

const score = (text: string, want: Set<string>, words: Set<string>) => {
  const terms = termsIn(text).filter((t) => want.has(t)).length;
  const overlap = (text.toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? []).filter((w) => words.has(w)).length;
  return terms * 10 + Math.min(overlap, 5);
};

/**
 * Pick the student's bullets and skills that best match the posting. Experience stays in the student's order
 * (chronology), bullets inside each entry are reordered by relevance, projects are ordered by relevance, and the
 * lowest-scoring bullets drop until the one-page budget fits.
 */
export function tailor(profile: Profile, posting: PostingText, limits = { perJob: 4, perProject: 2, projects: 3 }): TailoredResume {
  const want = new Set(termsIn(`${posting.title}\n${posting.description}`));
  const words = new Set((`${posting.title} ${posting.description}`.toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? []));
  const rankBullets = (e: Entry, max: number): Entry => ({
    ...e,
    bullets: e.bullets
      .map((b, i) => ({ b, i, s: score(b, want, words) }))
      .filter((x) => x.b.trim())
      .sort((x, y) => y.s - x.s || x.i - y.i)
      .slice(0, max)
      .map((x) => x.b),
  });
  const experience = profile.experience.map((e) => rankBullets(e, limits.perJob));
  const projects = profile.projects
    .map((e, i) => ({ e, i, s: score([e.title, e.org, ...e.bullets].join(' '), want, words) }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .slice(0, limits.projects)
    .map((x) => rankBullets(x.e, limits.perProject));
  const skills = profile.skills
    .map((s, i) => ({ s, i, hit: termsIn(s).some((t) => want.has(t)) || want.has(s.toLowerCase()) }))
    .sort((x, y) => Number(y.hit) - Number(x.hit) || x.i - y.i)
    .map((x) => x.s);

  const out = { education: profile.education.map((e) => ({ ...e, bullets: [...e.bullets] })), experience, projects, skills };
  // One-page guard: drop the last (least relevant) bullet of the longest section until it fits.
  while (!fitsOnePage(out)) {
    const pool = [...out.experience, ...out.projects].filter((e) => e.bullets.length > 1);
    if (!pool.length) {
      if (out.projects.length) out.projects.pop();
      else break;
      continue;
    }
    pool.sort((a, b) => b.bullets.length - a.bullets.length)[0].bullets.pop();
  }

  const all = [...profile.experience, ...profile.projects].reduce((a, e) => a + e.bullets.length, 0);
  const kept = [...out.experience, ...out.projects].reduce((a, e) => a + e.bullets.length, 0);
  const mine = new Set(termsIn(profileText(profile)));
  return {
    profile: { name: profile.name, email: profile.email, phone: profile.phone, links: [...profile.links] },
    ...out,
    matched: [...want].filter((t) => mine.has(t)).map(label),
    unmet: unmetRequirements(profile, posting),
    kept,
    total: all,
  };
}

/** Every string in the tailored resume, for the subset check. */
export function resumeTexts(r: TailoredResume): string[] {
  return [r.profile.name, r.profile.email, r.profile.phone, ...r.profile.links, ...r.skills,
    ...[...r.education, ...r.experience, ...r.projects].flatMap((e) => [e.title, e.org, e.dates, e.location, ...e.bullets])].filter(Boolean);
}
