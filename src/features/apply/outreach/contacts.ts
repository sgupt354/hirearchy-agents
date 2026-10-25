// Contacts for outreach. Real ones come from Apollo's People API Search via /api/apollo-search (server-side key);
// without a key the three below are returned, always labelled "Demo data". Contacts live only in the session.

export interface ApolloContact {
  name: string;
  title: string;
  company: string;
  linkedin: string;
  email?: string;
}

export function demoContacts(company: string): ApolloContact[] {
  const c = company || 'the company';
  return [
    { name: 'Jamie Lee', title: 'University Recruiter', company: c, linkedin: '' },
    { name: 'Sam Ortiz', title: 'Software Engineer', company: c, linkedin: '' },
    { name: 'Riley Chen', title: 'Engineering Manager', company: c, linkedin: '' },
  ];
}

export interface ContactsOutcome {
  source: 'apollo' | 'demo';
  contacts: ApolloContact[];
  note?: string;
}

export async function findContacts(company: string, role: string, timeoutMs = 7000, fetchImpl: typeof fetch = fetch): Promise<ContactsOutcome> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl('/api/apollo-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, role }), signal: ctrl.signal });
    if (r.ok) {
      const body = (await r.json()) as Partial<ContactsOutcome>;
      if (Array.isArray(body.contacts)) return { source: body.source === 'apollo' ? 'apollo' : 'demo', contacts: body.contacts, note: body.note };
    }
  } catch {
    // no api in dev, or offline
  } finally {
    clearTimeout(t);
  }
  return { source: 'demo', contacts: demoContacts(company), note: 'offline' };
}
