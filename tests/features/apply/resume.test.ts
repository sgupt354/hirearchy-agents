import { describe, expect, it } from 'vitest';
import { escapeLatex, overleafFields, renderLatex, resumeFileName } from '../../../src/features/apply/resume/latex';
import { DEMO_PROFILE, parseResumeText, profileTexts, type Profile } from '../../../src/features/apply/resume/profile';
import { PAGE, estimateLines, fitsOnePage, resumeTexts, tailor, termsIn, unmetRequirements } from '../../../src/features/apply/resume/tailor';

const STRIPE = {
  company: 'Stripe',
  title: 'Software Engineer, Intern',
  description: 'You will build APIs in TypeScript and Go. Experience with PostgreSQL, Docker and Kubernetes. Familiarity with Kafka is a plus. Write tests.',
};

describe('resume: LaTeX escaping', () => {
  it('escapes every special character: & % $ # _ { } ~ ^ \\', () => {
    expect(escapeLatex('R&D 100% $5 #1 snake_case {x} ~home ^up C:\\path')).toBe(
      'R\\&D 100\\% \\$5 \\#1 snake\\_case \\{x\\} \\textasciitilde{}home \\textasciicircum{}up C:\\textbackslash{}path',
    );
  });

  it('a backslash replacement is never escaped again', () => {
    expect(escapeLatex('\\{')).toBe('\\textbackslash{}\\{');
  });

  it('student text in the .tex is always escaped; the template compiles structurally', () => {
    const p: Profile = { ...DEMO_PROFILE, name: 'Ana_Maria & Co', experience: [{ ...DEMO_PROFILE.experience[0], bullets: ['Cut cost 40% for C# & $ users #1'] }] };
    const tex = renderLatex(tailor(p, STRIPE));
    expect(tex).toContain('Ana\\_Maria \\& Co');
    expect(tex).toContain('Cut cost 40\\% for C\\# \\& \\$ users \\#1');
    expect(tex).not.toMatch(/[^\\]40%/);
    expect(tex.match(/\\begin\{itemize\}/g)?.length).toBe(tex.match(/\\end\{itemize\}/g)?.length);
    expect(tex.trim().endsWith('\\end{document}')).toBe(true);
    // Braces balance once escaped braces are ignored.
    const bare = tex.replace(/\\[{}]/g, '');
    expect(bare.split('{').length).toBe(bare.split('}').length);
  });
});

describe('resume: tailoring never invents content', () => {
  it('every string in the tailored resume appears verbatim in the profile', () => {
    const r = tailor(DEMO_PROFILE, STRIPE);
    const mine = profileTexts(DEMO_PROFILE);
    for (const t of resumeTexts(r)) expect(mine.has(t), t).toBe(true);
  });

  it('holds for a pasted resume too, and for an empty posting', () => {
    const p = parseResumeText(PASTED);
    for (const post of [STRIPE, { company: 'X', title: '', description: '' }]) {
      const mine = profileTexts(p);
      for (const t of resumeTexts(tailor(p, post))) expect(mine.has(t), t).toBe(true);
    }
  });

  it('reorders bullets by relevance but keeps experience in the student order', () => {
    const r = tailor(DEMO_PROFILE, STRIPE);
    expect(r.experience.map((e) => e.org)).toEqual(DEMO_PROFILE.experience.map((e) => e.org));
    expect(r.experience[0].bullets[0]).toMatch(/TypeScript|PostgreSQL|Docker/);
    expect(r.skills.slice(0, 3)).toEqual(expect.arrayContaining(['TypeScript']));
  });
});

describe('resume: requirements you don\'t meet', () => {
  it('lists posting terms the profile never shows', () => {
    expect(unmetRequirements(DEMO_PROFILE, STRIPE)).toEqual(expect.arrayContaining(['Kubernetes', 'Kafka']));
    expect(unmetRequirements(DEMO_PROFILE, STRIPE)).not.toContain('TypeScript');
  });

  it('flags degree level, years and clearance language', () => {
    const post = { company: 'Acme', title: 'SWE', description: "Master's degree required. 3+ years of professional experience. Active security clearance." };
    const unmet = unmetRequirements(DEMO_PROFILE, post);
    expect(unmet.join(' | ')).toMatch(/Master's degree/);
    expect(unmet).toContain('3+ years of experience');
    expect(unmet.join(' | ')).toMatch(/clearance/i);
  });

  it('term matching respects word boundaries and "Go" needs a capital', () => {
    expect(termsIn('Experience with Go and React')).toEqual(expect.arrayContaining(['go', 'react']));
    expect(termsIn('go to market')).not.toContain('go');
    expect(termsIn('the rest of the team')).not.toContain('rest api');
  });
});

describe('resume: one page', () => {
  it('a long profile is trimmed to the one-page budget, least relevant bullets first', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `Did a long and detailed thing number ${i} that took a whole line of text to describe properly in words`);
    const big: Profile = {
      ...DEMO_PROFILE,
      experience: Array.from({ length: 6 }, (_, i) => ({ title: `Role ${i}`, org: `Org ${i}`, dates: '2025', location: 'AZ', bullets: [...many(6), 'Built APIs in TypeScript with PostgreSQL'] })),
    };
    expect(estimateLines({ education: big.education, experience: big.experience, projects: big.projects, skills: big.skills })).toBeGreaterThan(PAGE.maxLines);
    const r = tailor(big, STRIPE);
    expect(fitsOnePage(r)).toBe(true);
    expect(r.experience.every((e) => e.bullets.includes('Built APIs in TypeScript with PostgreSQL'))).toBe(true);
    expect(r.kept).toBeLessThan(r.total);
  });

  it('the demo profile fits on one page', () => {
    expect(fitsOnePage(tailor(DEMO_PROFILE, STRIPE))).toBe(true);
  });
});

const PASTED = `Jordan Ellis
jordan.ellis@example.edu | (602) 555-0199 | github.com/jellis

EDUCATION
B.S. Computer Science | Arizona State University | Aug 2023 - May 2027

EXPERIENCE
Backend Intern | Cactus Pay | May 2025 - Aug 2025
- Built payment webhooks in Python and FastAPI
- Added Redis caching that cut response time by 30%

PROJECTS
Sharded KV Store
- Wrote a sharded key-value store in Go with Raft replication

SKILLS
Languages: Python, Go, SQL
Tools: Docker, Redis`;

describe('resume: pasted text parser', () => {
  it('reads header, sections, entries, bullets and skills from the student\'s own text', () => {
    const p = parseResumeText(PASTED);
    expect(p).toMatchObject({ name: 'Jordan Ellis', email: 'jordan.ellis@example.edu', phone: '(602) 555-0199' });
    expect(p.links).toContain('github.com/jellis');
    expect(p.education[0]).toMatchObject({ title: 'B.S. Computer Science', org: 'Arizona State University', dates: 'Aug 2023 - May 2027' });
    expect(p.experience[0]).toMatchObject({ title: 'Backend Intern', org: 'Cactus Pay' });
    expect(p.experience[0].bullets).toEqual(['Built payment webhooks in Python and FastAPI', 'Added Redis caching that cut response time by 30%']);
    expect(p.projects[0].title).toBe('Sharded KV Store');
    expect(p.skills).toEqual(['Python', 'Go', 'SQL', 'Docker', 'Redis']);
  });
});

describe('resume: exports', () => {
  it('file name: "Resume - <Company> - <Role>", safe for file systems', () => {
    expect(resumeFileName('Stripe', 'Software Engineer, Intern')).toBe('Resume - Stripe - Software Engineer, Intern');
    expect(resumeFileName('A/B: Labs', 'SWE?')).toBe('Resume - A B Labs - SWE');
  });

  it('Overleaf form fields carry the URL-encoded source and the file name', () => {
    const f = overleafFields('a & b\n100%', 'Resume - Stripe - SWE');
    expect(f).toEqual({ encoded_snip: 'a%20%26%20b%0A100%25', snip_name: 'Resume - Stripe - SWE.tex' });
  });
});
