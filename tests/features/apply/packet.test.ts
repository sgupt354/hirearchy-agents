import { describe, expect, it } from 'vitest';
import { createOutreachHandler } from '../../../api/outreach-draft';
import { ApplicationPacket, JORDAN_PROFILE, PacketLockedError } from '../../../src/features/apply/packet';
import { DEMO_POSTINGS } from '../../../src/features/apply/postings';
import { profileTexts } from '../../../src/features/apply/resume/profile';
import { resumeTexts } from '../../../src/features/apply/resume/tailor';

const SEEKER = 'p4';
const REFERRER = 'r1';
const make = (unlocked = true) => {
  const state = { unlocked };
  const p = new ApplicationPacket(SEEKER, REFERRER, () => state.unlocked);
  p.prepare(JORDAN_PROFILE, DEMO_POSTINGS[0], 'Nadia');
  return { p, state };
};

describe('referral tie-in: the application packet', () => {
  it('is prepared by the seeker agent and stays with the seeker', () => {
    const { p } = make();
    expect(p.state).toBe('PREPARED');
    expect(p.view(SEEKER).resume.profile.name).toBe('Jordan Ellis');
    expect(() => p.view(REFERRER)).toThrow(PacketLockedError);
    const [prepared] = p.events();
    expect(prepared.to).toEqual([SEEKER]);
    expect(prepared.disclosure.withheld).toEqual(expect.arrayContaining(['resume text', 'intro draft']));
    expect(JSON.stringify(prepared)).not.toMatch(/Cactus Pay|webhooks/);
  });

  it('can only be requested by the referrer, and only after names are unlocked', () => {
    const { p, state } = make(false);
    expect(() => p.request(REFERRER)).toThrow(PacketLockedError);
    state.unlocked = true;
    expect(() => p.request(SEEKER)).toThrow(PacketLockedError);
    p.request(REFERRER);
    expect(p.state).toBe('REQUESTED');
    expect(p.events().map((e) => e.type)).toEqual(['DISCOVER', 'PROPOSE', 'ESCALATE']);
  });

  it('is shared only when the referrer asked AND the seeker said yes', () => {
    const { p } = make();
    expect(() => p.consent(SEEKER, true)).toThrow(); // nothing requested yet
    p.request(REFERRER);
    expect(() => p.view(REFERRER)).toThrow(PacketLockedError);
    expect(() => p.consent(REFERRER, true)).toThrow(PacketLockedError);
    p.consent(SEEKER, true);
    expect(p.state).toBe('SHARED');
    expect(p.view(REFERRER).intro.body).toContain('Hi Nadia,');
    const shared = p.events().at(-1)!;
    expect(shared).toMatchObject({ type: 'REVEAL', to: [REFERRER] });
  });

  it('a no keeps it private for good', () => {
    const { p } = make();
    p.request(REFERRER);
    p.consent(SEEKER, false);
    expect(p.state).toBe('DECLINED');
    expect(() => p.view(REFERRER)).toThrow(PacketLockedError);
  });

  it("the packet's resume is only the seeker's own text, and the intro is only a draft", () => {
    const { p } = make();
    const mine = profileTexts(JORDAN_PROFILE);
    for (const t of resumeTexts(p.view(SEEKER).resume)) expect(mine.has(t), t).toBe(true);
    expect(Object.getOwnPropertyNames(ApplicationPacket.prototype)).not.toEqual(expect.arrayContaining(['send']));
  });
});

describe('outreach never sends: the only outbound call is the optional Claude rewording', () => {
  it('across every path, no request goes anywhere but api.anthropic.com', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hi Priya, about Stripe.' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = { status() { return res; }, json() { return res; }, setHeader() { return res; } };
    const body = { kind: 'recruiter', company: 'Stripe', role: 'SWE Intern', contact: { name: 'Priya', email: 'p@x.co' }, student: { name: 'Aditya' } };
    const req = { method: 'POST', headers: {}, body, async *[Symbol.asyncIterator]() {} };
    await createOutreachHandler({ fetchImpl })(req, res);
    expect(urls).toEqual([]);
    await createOutreachHandler({ apiKey: 'k', fetchImpl })(req, res);
    expect(urls.every((u) => u.startsWith('https://api.anthropic.com/'))).toBe(true);
  });
});
