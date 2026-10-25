import { describe, expect, it } from 'vitest';
import { addLink, newApplication, type Application, type JourneyLink } from '../../../src/features/apply/applications';
import { intelAvailable, packTopics, readiness } from '../../../src/features/journey/readiness';

const TODAY = '2026-10-25';
const base = (over: Partial<Application> = {}) => ({ ...newApplication({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern', stage: 'Interview', at: TODAY, interviewDate: '2026-11-04' }), ...over });
const link = (kind: JourneyLink['kind'], ref: string, extra: Partial<JourneyLink> = {}): JourneyLink => ({ kind, ref, at: TODAY, summary: '', ...extra });
const ready = (a: Application, today = TODAY) => {
  const r = readiness(a, today);
  if (!r.ready) throw new Error(r.reason);
  return r;
};

describe('readiness: only from data that exists', () => {
  it('the inputs come from real sources: Microsoft has a pack (3 topics) and 4 intel reports; Stripe has neither', () => {
    expect(packTopics('Microsoft')).toEqual(['DSA', 'System Design', 'Behavioral']);
    expect(intelAvailable('Microsoft')).toBe(4);
    expect(packTopics('Stripe')).toEqual([]);
    expect(intelAvailable('Stripe')).toBe(0);
  });

  it('a record with nothing linked scores 0 on every part; nothing is assumed', () => {
    const r = ready(base());
    expect(r.score).toBe(0);
    expect(r.parts.map((p) => [p.id, p.points, p.detail])).toEqual([
      ['mocks', 0, '0 of 2 done'],
      ['topics', 0, '0 of 3 covered; missing DSA, System Design, Behavioral'],
      ['intel', 0, '0 of 4 read'],
      ['circle', 0, 'Not yet'],
    ]);
    expect(r.daysLeft).toBe(10);
    expect(r.next).toEqual({ text: 'one DSA mock', tab: 'mock' });
  });

  it("Aditya's path: circle, then intel, then a System Design mock; every point is explained", () => {
    let a = addLink(base(), link('prep', 'prep-1', { topics: ['DSA', 'Behavioral'] }));
    let r = ready(a);
    expect(r.score).toBe(48); // circle 25 + topics 2/3 of 35 (23) = 48 of 100
    expect(r.next).toEqual({ text: 'one System Design mock', tab: 'mock' });
    a = addLink(a, link('intel', 'intel-Microsoft', { count: 4 }));
    expect(ready(a).score).toBe(63);
    a = addLink(a, link('mock', 'mock-1', { topics: ['System Design'] }));
    r = ready(a);
    expect(r.parts.find((p) => p.id === 'topics')!.detail).toBe('3 of 3 covered (DSA, System Design, Behavioral)');
    expect(r.score).toBe(88); // 13 + 35 + 15 + 25
    expect(r.next).toEqual({ text: 'one more mock', tab: 'mock' });
    expect(ready(addLink(a, link('mock', 'mock-2')), '2026-11-03')).toMatchObject({ score: 100, next: null, daysLeft: 1 });
  });

  it('parts with no data behind them are left out, not counted as 0 or full', () => {
    const stripe = base({ company: 'Stripe' });
    const r = ready(addLink(stripe, link('prep', 'p', { topics: ['DSA'] })));
    expect(r.parts.map((p) => p.id)).toEqual(['mocks', 'circle']);
    expect(r.score).toBe(50); // circle 25 of (25 + 25)
  });

  it('no score without a real interview date, or after it', () => {
    expect(readiness(base({ interviewDate: null }), TODAY)).toEqual({ ready: false, reason: 'No interview date yet. It comes from your interview invite.' });
    expect(readiness(base(), '2026-11-05').ready).toBe(false);
    expect(ready(base(), '2026-11-04').daysLeft).toBe(0);
  });

  it('two days out, the next step says tonight; intel reads never exceed what exists', () => {
    expect(ready(base(), '2026-11-02').next!.text).toBe('one DSA mock tonight');
    const r = ready(addLink(base(), link('intel', 'i', { count: 99 })));
    expect(r.parts.find((p) => p.id === 'intel')!.detail).toBe('4 of 4 read');
  });
});
