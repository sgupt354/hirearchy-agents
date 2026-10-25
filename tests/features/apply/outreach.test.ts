import { describe, expect, it } from 'vitest';
import { acceptable, createOutreachHandler } from '../../../api/outreach-draft';
import { DraftLimiter, MAX_WORDS, UNFILLED, asClause, gmailComposeUrl, mailtoUrl, templateDraft, wordCount, type DraftInput } from '../../../src/features/apply/outreach/draft';

const base: DraftInput = {
  kind: 'recruiter',
  company: 'Stripe',
  role: 'Software Engineer, Intern',
  contact: { name: 'Priya Shah', title: 'University Recruiter', email: 'priya@stripe.example' },
  student: { name: 'Aditya Rao', school: 'Arizona State University', highlight: 'Built a REST API in TypeScript and Node.js for appointment scheduling, serving 12,000 requests a day' },
};

describe('outreach: templates', () => {
  it.each(['recruiter', 'alum', 'referrer'] as const)('%s draft fills every field and stays under the cap', (kind) => {
    const d = templateDraft({ ...base, kind });
    expect(d.body).toContain('Hi Priya,');
    expect(d.body).toContain('Stripe');
    expect(d.body).toContain('Software Engineer, Intern');
    expect(d.body).toContain('Aditya Rao');
    expect(d.body).toContain('I built a REST API in TypeScript');
    expect(d.subject.length).toBeGreaterThan(5);
    expect(UNFILLED.test(d.subject + d.body)).toBe(false);
    expect(wordCount(d.body)).toBeLessThanOrEqual(MAX_WORDS);
    expect(d.to).toBe('priya@stripe.example');
  });

  it('no placeholder is left even when optional fields are empty', () => {
    const d = templateDraft({ ...base, kind: 'alum', contact: { name: '' }, student: { name: '' } });
    expect(UNFILLED.test(d.subject + d.body)).toBe(false);
    expect(d.body).toContain('Hi there,');
    expect(d.to).toBe('');
  });

  it('cold contacts get a courtesy line; the referrer (who agreed to talk) does not', () => {
    expect(templateDraft(base).body).toMatch(/won't follow up again/);
    expect(templateDraft({ ...base, kind: 'referrer' }).body).not.toMatch(/won't follow up again/);
  });

  it('length cap: an over-long highlight is dropped whole, never cut mid-sentence', () => {
    const long = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');
    const d = templateDraft({ ...base, student: { ...base.student, highlight: long } });
    expect(wordCount(d.body)).toBeLessThanOrEqual(MAX_WORDS);
    expect(d.body).not.toContain('word0');
    expect(asClause('Led a team.')).toBe('I led a team');
  });
});

describe('outreach: compose links are encoded, never sent', () => {
  const d = { to: 'a@b.co', subject: 'Q&A: 100% #1?', body: 'Line one\n\nLine two & more' };
  it('gmail compose URL', () => {
    const url = gmailComposeUrl(d);
    expect(url.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.co&su=')).toBe(true);
    expect(url).toContain('su=Q%26A%3A%20100%25%20%231%3F');
    expect(url).toContain('body=Line%20one%0A%0ALine%20two%20%26%20more');
    expect(new URL(url).searchParams.get('body')).toBe(d.body);
  });
  it('mailto URL', () => {
    expect(mailtoUrl(d)).toBe('mailto:a@b.co?subject=Q%26A%3A%20100%25%20%231%3F&body=Line%20one%0A%0ALine%20two%20%26%20more');
    expect(mailtoUrl({ ...d, to: 'not an email' }).startsWith('mailto:?subject=')).toBe(true);
  });
});

describe('outreach: rate limit', () => {
  it('limits drafts per window', () => {
    const l = new DraftLimiter(2, 1000);
    expect([l.tryTake(0), l.tryTake(10), l.tryTake(20)]).toEqual([true, true, false]);
    expect(l.tryTake(1500)).toBe(true);
  });
});

describe('outreach: /api/outreach-draft', () => {
  const res = () => {
    const out = { status: 0, body: undefined as unknown };
    const r = { status(c: number) { out.status = c; return r; }, json(b: unknown) { out.body = b; return r; }, setHeader() { return r; } };
    return { r, out };
  };
  const req = (body: unknown) => ({ method: 'POST', headers: {}, body, async *[Symbol.asyncIterator]() {} });
  const claude = (text: string): typeof fetch => (async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 })) as typeof fetch;

  it('no key: template draft, no network', async () => {
    const o = res();
    let called = false;
    await createOutreachHandler({ fetchImpl: (async () => { called = true; return new Response('{}'); }) as typeof fetch })(req(base), o.r);
    expect(o.out.status).toBe(200);
    expect(o.out.body).toMatchObject({ source: 'template' });
    expect(called).toBe(false);
  });

  it('with a key: Claude wording accepted only if it adds no facts', async () => {
    const good = 'Hi Priya,\n\nI am Aditya, an ASU student who just applied to the Software Engineer, Intern role at Stripe. I built a REST API serving 12,000 requests a day. Could you share what the team looks for?\n\nThank you,\nAditya Rao';
    const o = res();
    await createOutreachHandler({ apiKey: 'k', fetchImpl: claude(good) })(req(base), o.r);
    expect(o.out.body).toMatchObject({ source: 'llm', draft: { body: good } });

    const invented = good.replace('12,000', '50,000');
    const o2 = res();
    await createOutreachHandler({ apiKey: 'k', fetchImpl: claude(invented) })(req(base), o2.r);
    expect(o2.out.body).toMatchObject({ source: 'template' });
  });

  it('guard: over-long, placeholder or missing company falls back', () => {
    const d = templateDraft(base);
    expect(acceptable(Array(130).fill('Stripe').join(' '), d, base)).toBe(false);
    expect(acceptable('Hi {name}, about Stripe', d, base)).toBe(false);
    expect(acceptable('Hi Priya, quick question.', d, base)).toBe(false);
  });

  it('timeout: a slow model falls back to the template', async () => {
    const slow = ((_: unknown, init?: RequestInit) => new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    const o = res();
    await createOutreachHandler({ apiKey: 'k', fetchImpl: slow, timeoutMs: 30 })(req(base), o.r);
    expect(o.out.body).toMatchObject({ source: 'template' });
  });

  it('bad requests and per-IP rate limit', async () => {
    const bad = res();
    await createOutreachHandler({})(req({ kind: 'spam', company: 'x', role: 'y' }), bad.r);
    expect(bad.out.status).toBe(400);
    const h = createOutreachHandler({ limiterFor: (() => { const l = new DraftLimiter(1, 60_000); return () => l; })() });
    const a = res();
    await h(req(base), a.r);
    const b = res();
    await h(req(base), b.r);
    expect([a.out.status, b.out.status]).toEqual([200, 429]);
  });
});
