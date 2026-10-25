import { describe, expect, it } from 'vitest';
import { APOLLO_SEARCH_URL, apolloBody, createApolloHandler, demoContacts, toContact } from '../../../api/apollo-search';
import { TtlCache } from '../../../src/features/apply/server/http';

const res = () => {
  const out = { status: 0, body: undefined as unknown };
  const r = { status(c: number) { out.status = c; return r; }, json(b: unknown) { out.body = b; return r; }, setHeader() { return r; } };
  return { r, out };
};
const req = (body: unknown, method = 'POST') => ({ method, headers: {}, body, async *[Symbol.asyncIterator]() {} });

describe('apollo: official People API Search only', () => {
  it('request shape: URL, method, x-api-key header, documented body fields', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ people: [{ first_name: 'Ana', last_name_obfuscated: 'Lo***', title: 'University Recruiter', linkedin_url: 'https://linkedin.com/in/ana', organization: { name: 'Stripe' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const o = res();
    await createApolloHandler({ apiKey: 'secret', fetchImpl })(req({ company: 'Stripe', domain: 'https://stripe.com/jobs', role: 'Software Engineer' }), o.r);
    expect(seen!.url).toBe(APOLLO_SEARCH_URL);
    expect(seen!.init.method).toBe('POST');
    expect((seen!.init.headers as Record<string, string>)['x-api-key']).toBe('secret');
    const body = JSON.parse(String(seen!.init.body));
    expect(body).toMatchObject({ q_organization_domains_list: ['stripe.com'], page: 1, per_page: 10 });
    expect(body.person_titles).toEqual(expect.arrayContaining(['university recruiter', 'Software Engineer']));
    expect(o.out.body).toEqual({ source: 'apollo', contacts: [{ name: 'Ana Lo***', title: 'University Recruiter', company: 'Stripe', linkedin: 'https://linkedin.com/in/ana' }] });
  });

  it('without a domain it searches by company keyword', () => {
    expect(apolloBody('Ramp', '', '')).toMatchObject({ q_keywords: 'Ramp' });
    expect(apolloBody('Ramp', '', '')).not.toHaveProperty('q_organization_domains_list');
  });

  it('missing key: three labelled demo contacts, no network', async () => {
    let called = false;
    const o = res();
    await createApolloHandler({ fetchImpl: (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch })(req({ company: 'Stripe' }), o.r);
    expect(called).toBe(false);
    expect(o.out.body).toEqual({ source: 'demo', contacts: demoContacts('Stripe'), note: 'no_api_key' });
    expect(demoContacts('Stripe')).toHaveLength(3);
  });

  it('rate limit (429), bad key (403), server error and network failure fall back to demo with a note', async () => {
    const cases: [number | 'throw', string][] = [[429, 'rate_limited'], [403, 'key_not_allowed'], [500, 'apollo_error'], ['throw', 'apollo_unreachable']];
    for (const [status, note] of cases) {
      const fetchImpl = (async () => {
        if (status === 'throw') throw new Error('ECONNRESET');
        return new Response('{}', { status, headers: { 'retry-after': '30' } });
      }) as unknown as typeof fetch;
      const o = res();
      await createApolloHandler({ apiKey: 'k', fetchImpl })(req({ company: 'Stripe' }), o.r);
      expect(o.out.status).toBe(200);
      expect(o.out.body).toMatchObject({ source: 'demo', note });
    }
  });

  it('caches results so repeated lookups do not spend Apollo rate limit', async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, new Response(JSON.stringify({ people: [{ name: 'Ana Lopez', title: 'Recruiter' }] }), { status: 200 }))) as unknown as typeof fetch;
    const h = createApolloHandler({ apiKey: 'k', fetchImpl, cache: new TtlCache(60_000) });
    await h(req({ company: 'Stripe' }), res().r);
    const o = res();
    await h(req({ company: 'stripe' }), o.r);
    expect(calls).toBe(1);
    expect(o.out.body).toMatchObject({ source: 'apollo', cached: true });
  });

  it('never invents an email: placeholders from locked plans are dropped', () => {
    expect(toContact({ name: 'Ana', email: 'email_not_unlocked@domain.com' }, 'X')).not.toHaveProperty('email');
    expect(toContact({ name: 'Ana', email: 'ana@x.com' }, 'X')).toHaveProperty('email', 'ana@x.com');
    expect(toContact({}, 'X')).toBeNull();
  });

  it('bad requests', async () => {
    const a = res();
    await createApolloHandler({})(req({}), a.r);
    expect(a.out.status).toBe(400);
    const b = res();
    await createApolloHandler({})(req({}, 'GET'), b.r);
    expect(b.out.status).toBe(405);
  });
});
