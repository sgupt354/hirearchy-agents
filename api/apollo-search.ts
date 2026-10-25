import { demoContacts, type ApolloContact } from '../src/features/apply/outreach/contacts.js';
import { TtlCache, jsonBody, text, type ApiRequest, type ApiResponse } from '../src/features/apply/server/http.js';

export { demoContacts };

/**
 * POST /api/apollo-search { company, domain?, role? } → { source: 'apollo' | 'demo', contacts, note? }
 * Uses only Apollo's official People API Search (POST /api/v1/mixed_people/api_search, 0 credits, no emails or phones
 * returned) with APOLLO_API_KEY, server-side. Without a key, or if Apollo errors / rate-limits, three contacts clearly
 * labelled as demo data come back instead. Results are cached in memory for 10 minutes; nothing is persisted.
 */
export interface ApolloDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cache?: TtlCache<ApolloContact[]>;
  now?: () => number;
}

export const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search';

const RECRUITING = ['university recruiter', 'campus recruiter', 'technical recruiter', 'recruiter', 'talent acquisition'];

/** The request body Apollo documents: titles, the company's domain (or keywords if no domain), one small page. */
export function apolloBody(company: string, domain: string, role: string) {
  const titles = [...RECRUITING, ...(role ? [role] : [])];
  return {
    person_titles: titles,
    ...(domain ? { q_organization_domains_list: [domain] } : { q_keywords: company }),
    page: 1,
    per_page: 10,
  };
}

type Person = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : '');

export function toContact(p: Person, company: string): ApolloContact | null {
  const name = s(p.name) || [s(p.first_name), s(p.last_name) || s(p.last_name_obfuscated)].filter(Boolean).join(' ');
  if (!name) return null;
  const org = (p.organization && typeof p.organization === 'object' ? (p.organization as Person) : {}) as Person;
  const email = s(p.email);
  return {
    name,
    title: s(p.title),
    company: s(org.name) || company,
    linkedin: s(p.linkedin_url),
    // The search endpoint doesn't return emails; keep one only if a plan ever does, and never a placeholder.
    ...(email && !/not_unlocked|email_not_unlocked|domain\.com/.test(email) ? { email } : {}),
  };
}

export function createApolloHandler(deps: ApolloDeps) {
  const cache = deps.cache ?? new TtlCache<ApolloContact[]>(10 * 60_000, 100);
  const now = deps.now ?? Date.now;
  return async function handle(req: ApiRequest, res: ApiResponse) {
    res.setHeader?.('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const b = await jsonBody(req);
    const company = text(b.company, 80).trim();
    const domain = text(b.domain, 80).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const role = text(b.role, 80).trim();
    if (!company) return res.status(400).json({ error: 'bad_request' });
    if (!deps.apiKey) return res.status(200).json({ source: 'demo', contacts: demoContacts(company), note: 'no_api_key' });

    const key = `${company.toLowerCase()}|${domain}|${role.toLowerCase()}`;
    const hit = cache.get(key, now());
    if (hit) return res.status(200).json({ source: 'apollo', contacts: hit, cached: true });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 5000);
    try {
      const r = await (deps.fetchImpl ?? fetch)(APOLLO_SEARCH_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', accept: 'application/json', 'x-api-key': deps.apiKey },
        body: JSON.stringify(apolloBody(company, domain, role)),
      });
      if (r.status === 429) return res.status(200).json({ source: 'demo', contacts: demoContacts(company), note: 'rate_limited', retryAfter: r.headers.get('retry-after') ?? undefined });
      if (r.status === 401 || r.status === 403) return res.status(200).json({ source: 'demo', contacts: demoContacts(company), note: 'key_not_allowed' });
      if (!r.ok) return res.status(200).json({ source: 'demo', contacts: demoContacts(company), note: 'apollo_error' });
      const body = (await r.json()) as { people?: Person[]; contacts?: Person[] };
      const contacts = [...(body.people ?? []), ...(body.contacts ?? [])].map((p) => toContact(p, company)).filter((c): c is ApolloContact => c !== null).slice(0, 10);
      cache.set(key, contacts, now());
      return res.status(200).json({ source: 'apollo', contacts });
    } catch {
      return res.status(200).json({ source: 'demo', contacts: demoContacts(company), note: 'apollo_unreachable' });
    } finally {
      clearTimeout(t);
    }
  };
}

const shared = new TtlCache<ApolloContact[]>(10 * 60_000, 100);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return createApolloHandler({ apiKey: process.env.APOLLO_API_KEY, cache: shared })(req, res);
}
