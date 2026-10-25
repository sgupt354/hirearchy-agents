// The student's profile: structured, entered by the student (form or pasted resume text). Tailoring only ever
// selects and reorders text from here; it never writes new text.

export interface Entry {
  /** Role or degree, e.g. "Software Engineering Intern" / "B.S. Computer Science". */
  title: string;
  /** Employer, school or project name. */
  org: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface Profile {
  name: string;
  email: string;
  phone: string;
  links: string[];
  education: Entry[];
  experience: Entry[];
  projects: Entry[];
  skills: string[];
}

export const EMPTY_PROFILE: Profile = { name: '', email: '', phone: '', links: [], education: [], experience: [], projects: [], skills: [] };

/** Aditya's profile for the demo (labelled "Demo profile" in the UI). */
export const DEMO_PROFILE: Profile = {
  name: 'Aditya Rao',
  email: 'aditya.rao@example.edu',
  phone: '(480) 555-0142',
  links: ['github.com/aditya-r', 'linkedin.com/in/aditya-rao'],
  education: [
    { title: 'B.S. Computer Science', org: 'Arizona State University', dates: 'Aug 2023 - May 2027', location: 'Tempe, AZ',
      bullets: ['GPA 3.7/4.0. Coursework: Data Structures, Algorithms, Operating Systems, Databases, Distributed Systems'] },
  ],
  experience: [
    { title: 'Software Engineering Intern', org: 'Desert Health Labs', dates: 'May 2025 - Aug 2025', location: 'Phoenix, AZ',
      bullets: [
        'Built a REST API in TypeScript and Node.js for appointment scheduling, serving 12,000 requests a day',
        'Cut p95 query latency by 38% by adding PostgreSQL indexes and rewriting two N+1 queries',
        'Wrote unit and integration tests with Jest, raising coverage from 54% to 81%',
        'Containerized three services with Docker and set up GitHub Actions CI for pull requests',
        'Presented the scheduling API design to 15 engineers and documented it in the team wiki',
      ] },
    { title: 'Undergraduate Research Assistant', org: 'ASU Distributed Systems Lab', dates: 'Jan 2025 - Present', location: 'Tempe, AZ',
      bullets: [
        'Implemented a Raft consensus prototype in Go and measured leader election under network partitions',
        'Automated 200+ benchmark runs with Python scripts and plotted results with pandas and matplotlib',
        'Co-authored a workshop poster on tail latency in replicated key-value stores',
      ] },
    { title: 'Teaching Assistant, Intro to Programming', org: 'Arizona State University', dates: 'Aug 2024 - Dec 2024', location: 'Tempe, AZ',
      bullets: [
        'Led weekly Java lab sections for 40 students and held office hours',
        'Graded assignments and wrote autograder tests in Java',
      ] },
  ],
  projects: [
    { title: 'Route Planner', org: 'TypeScript, React, Mapbox', dates: '2025', location: '',
      bullets: ['Built a campus route planner in React and TypeScript with shortest-path search over 1,800 map nodes', 'Deployed on Vercel with a serverless API and 95 Lighthouse score'] },
    { title: 'Campus Events Bot', org: 'Python, Flask, SQLite', dates: '2024', location: '',
      bullets: ['Built a Discord bot in Python that posts campus events from an RSS feed to 600 members', 'Stored subscriptions in SQLite and added rate limiting to stay within API limits'] },
    { title: 'Photo Tagger', org: 'Python, PyTorch', dates: '2024', location: '',
      bullets: ['Fine-tuned a ResNet image classifier in PyTorch to tag club photos with 91% accuracy'] },
  ],
  skills: ['Python', 'Java', 'TypeScript', 'JavaScript', 'Go', 'SQL', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'Git', 'Linux', 'AWS', 'Jest', 'PyTorch'],
};

// ---------------------------------------------------------------- pasted text → profile (deterministic)

type Section = 'education' | 'experience' | 'projects' | 'skills' | 'other';

const HEADINGS: [RegExp, Section][] = [
  [/^(education|academic background)$/i, 'education'],
  [/^(experience|work experience|professional experience|employment|research experience|leadership( experience)?)$/i, 'experience'],
  [/^(projects|personal projects|selected projects|academic projects)$/i, 'projects'],
  [/^(skills|technical skills|technologies|skills (and|&) interests)$/i, 'skills'],
  [/^(summary|objective|awards|honors|certifications|activities|interests|publications)$/i, 'other'],
];

const BULLET = /^\s*(?:[-•*●▪◦‣–]|\d+[.)])\s+/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const LINK = /\b((?:https?:\/\/)?(?:www\.)?(?:github\.com|linkedin\.com|gitlab\.com|[\w-]+\.(?:dev|io|me|com))\/?[\w\-./]*)/gi;
const DATES = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b(?:19|20)\d{2})\s*(?:[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b(?:19|20)\d{2}|present|current|now))?/i;

const headingOf = (line: string): Section | null => {
  const t = line.trim().replace(/[:\s]+$/, '');
  for (const [re, s] of HEADINGS) if (re.test(t)) return s;
  return null;
};

/** Split "Title | Org | Dates" / "Org, Location  Dates" style header lines without inventing anything. */
function entryFromHeader(line: string): Entry {
  const dm = line.match(DATES);
  const dates = dm ? dm[0].trim() : '';
  const rest = (dm ? line.replace(dm[0], ' ') : line).split(/\s*[|·•]\s*|\s{2,}|\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
  return { title: rest[0] ?? '', org: rest[1] ?? '', location: rest.slice(2).join(', '), dates, bullets: [] };
}

/**
 * Pasted resume text → profile. Headings start sections, bullet lines attach to the latest entry, other lines in a
 * section start a new entry (or continue the previous entry's header). Every string comes from the input.
 */
export function parseResumeText(text: string): Profile {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  const p: Profile = structuredClone(EMPTY_PROFILE);
  let section: Section | null = null;
  let current: Entry | null = null;
  let headerLines = 0;

  for (const raw of lines) {
    const line = raw.trim();
    const h = headingOf(line);
    if (h) {
      section = h;
      current = null;
      continue;
    }
    if (section === null) {
      // Header block: name first, then contact details.
      const email = line.match(EMAIL)?.[0];
      const phone = line.match(PHONE)?.[0];
      const links = [...line.matchAll(LINK)].map((m) => m[1]).filter((l) => !EMAIL.test(l) && !(email && email.includes(l)));
      if (email && !p.email) p.email = email;
      if (phone && !p.phone) p.phone = phone.trim();
      p.links.push(...links.filter((l) => !p.links.includes(l)));
      if (!email && !phone && !links.length && headerLines === 0) p.name = line;
      headerLines += 1;
      continue;
    }
    if (section === 'skills') {
      const items = line.replace(/^[^:]{0,40}:\s*/, '').split(/\s*[,;|•]\s*/).map((s) => s.replace(BULLET, '').trim()).filter(Boolean);
      for (const s of items) if (!p.skills.includes(s)) p.skills.push(s);
      continue;
    }
    if (section === 'other') continue;
    const list = p[section];
    if (BULLET.test(raw)) {
      if (!current) {
        current = { title: '', org: '', dates: '', location: '', bullets: [] };
        list.push(current);
      }
      current.bullets.push(line.replace(BULLET, '').trim());
      continue;
    }
    // A non-bullet line: a new entry, unless the current entry has no bullets yet (then it's its second header line).
    if (current && current.bullets.length === 0) {
      const extra = entryFromHeader(line);
      current.org ||= extra.title;
      current.dates ||= extra.dates;
      current.location ||= [extra.org, extra.location].filter(Boolean).join(', ');
      continue;
    }
    current = entryFromHeader(line);
    list.push(current);
  }
  return p;
}

/** Every piece of text in the profile, for the "never invent" check. */
export function profileTexts(p: Profile): Set<string> {
  const out = new Set<string>([p.name, p.email, p.phone, ...p.links, ...p.skills]);
  for (const e of [...p.education, ...p.experience, ...p.projects]) [e.title, e.org, e.dates, e.location, ...e.bullets].forEach((t) => out.add(t));
  out.delete('');
  return out;
}
