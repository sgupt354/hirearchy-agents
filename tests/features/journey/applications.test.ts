import { describe, expect, it } from 'vitest';
import { addLink, applicationId, canAdvance, mergeApplication, newApplication, nextSteps } from '../../../src/features/apply/applications';
import { DEMO_NOW, STUDENT, applyStore } from '../../../src/features/apply/store';
import type { ScoredPosting } from '../../../src/features/apply/jobs/match';

const posting = (over: Partial<ScoredPosting> = {}): ScoredPosting => ({
  id: 'gh-ms-1', company: 'Microsoft', provider: 'greenhouse', title: 'SWE Intern', location: 'Redmond, WA', url: '', posted: null,
  description: '', score: 1, isIntern: true, visaFlag: false, years: null, reasons: [], ...over,
});
let key = 5000;
const fresh = () => applyStore.resetFor(++key);

describe('application record: rules', () => {
  it('one id per student per job, regardless of spacing or case', () => {
    expect(applicationId('p1', ' Microsoft ', 'SWE  Intern')).toBe(applicationId('p1', 'microsoft', 'swe intern'));
    expect(applicationId('p1', 'Microsoft', 'SWE Intern')).not.toBe(applicationId('p4', 'Microsoft', 'SWE Intern'));
  });

  it('agent moves only go forward, to Rejected, and never reopen a closed record', () => {
    expect(canAdvance('Saved', 'Interview')).toBe(true);
    expect(canAdvance('Interview', 'Applied')).toBe(false);
    expect(canAdvance('OA', 'Rejected')).toBe(true);
    expect(canAdvance('Offer', 'Rejected')).toBe(false);
    expect(canAdvance('Rejected', 'Interview')).toBe(false);
  });

  it('merging keeps the furthest stage and the first real interview date; links dedupe by source', () => {
    let a = newApplication({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern', stage: 'Interview', at: '2026-10-25', interviewDate: '2026-11-04' });
    a = mergeApplication(a, { stage: 'Applied', at: '2026-10-26', interviewDate: '2026-11-09' });
    expect(a).toMatchObject({ stage: 'Interview', interviewDate: '2026-11-04', dates: { Interview: '2026-10-25' } });
    const link = { kind: 'prep' as const, ref: 'prep-1', at: '2026-10-25', summary: 'circle', topics: ['DSA'] };
    expect(addLink(addLink(a, link), link).links).toHaveLength(1);
  });

  it('next steps follow the stage and what is still missing', () => {
    const a = newApplication({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern', stage: 'Interview', at: '2026-10-25' });
    expect(nextSteps(a).map((s) => s.tab)).toEqual(['prep', 'mock', 'intel']);
    const withPrep = addLink(a, { kind: 'prep', ref: 'x', at: '2026-10-25', summary: '' });
    expect(nextSteps(withPrep).map((s) => s.tab)).toEqual(['mock', 'intel']);
    expect(nextSteps({ ...a, stage: 'Saved' }).map((s) => s.tab)).toEqual(['apply']);
    expect(nextSteps({ ...a, stage: 'Applied' }).map((s) => s.tab)).toEqual(['referral']);
    expect(nextSteps({ ...a, stage: 'Offer' })).toEqual([]);
  });
});

describe('application record: the shared store', () => {
  it('tracking a posting in Find creates the record; Prep, Mock and Community link into the same one', () => {
    fresh();
    applyStore.track(posting(), 'live', '6:00 PM');
    const [app] = applyStore.applications(STUDENT);
    expect(app).toMatchObject({ company: 'Microsoft', role: 'SWE Intern', stage: 'Saved', postingId: 'gh-ms-1', dates: { Saved: '2026-10-25' } });
    // The prep circle's invite moves it to Interview with the invite's date; a second source doesn't duplicate it.
    applyStore.recordApplication({ owner: STUDENT, company: 'Microsoft', role: 'SWE Intern', stage: 'Interview', interviewDate: '2026-11-04' });
    applyStore.linkApplication({ owner: STUDENT, company: 'microsoft', role: 'swe intern' }, { kind: 'prep', ref: 'prep-1', summary: 'circle', topics: ['DSA', 'Behavioral'] });
    applyStore.linkApplication({ owner: STUDENT, company: 'Microsoft', role: 'SWE Intern' }, { kind: 'mock', ref: 'mock-1', summary: 'mock', topics: ['System Design'] });
    applyStore.linkApplication({ owner: STUDENT, company: 'Microsoft', role: 'SWE Intern' }, { kind: 'mock', ref: 'mock-1', summary: 'mock again' });
    const apps = applyStore.applications(STUDENT);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ stage: 'Interview', interviewDate: '2026-11-04' });
    expect(apps[0].links.map((l) => l.kind)).toEqual(['prep', 'mock']);
  });

  it('each student keeps their own records', () => {
    fresh();
    applyStore.linkApplication({ owner: 'p4', company: 'Stripe', role: 'SWE Intern', stage: 'Applied' }, { kind: 'referral', ref: 'r-1', summary: 'Referred by an alum' });
    applyStore.linkApplication({ owner: 'p9', company: 'Microsoft', role: 'SWE Intern', stage: 'Interview' }, { kind: 'community', ref: 'need-1', summary: 'Got help', topics: ['DSA'] });
    expect(applyStore.applications(STUDENT)).toEqual([]);
    expect(applyStore.applications('p4')[0]).toMatchObject({ company: 'Stripe', stage: 'Applied' });
    expect(applyStore.applications('p9')[0].interviewDate).toBeNull(); // never guessed
  });

  it('the record and the Apply tracker stay in step both ways', () => {
    fresh();
    applyStore.track(posting(), 'live', '6:00 PM');
    const id = applyStore.applications(STUDENT)[0].id;
    applyStore.setStatus('gh-ms-1', 'OA');
    expect(applyStore.application(id)!.stage).toBe('OA');
    applyStore.setStage(id, 'Interview');
    expect(applyStore.tracked()[0].status).toBe('Interview');
  });

  it('the demo clock drives dates; global Reset clears records and the clock', () => {
    fresh();
    applyStore.setNow('2026-11-02T19:00');
    applyStore.recordApplication({ owner: STUDENT, company: 'Microsoft', role: 'SWE Intern', stage: 'Applied' });
    expect(applyStore.applications(STUDENT)[0].dates.Applied).toBe('2026-11-02');
    expect(() => applyStore.setNow('tomorrow')).toThrow();
    fresh();
    expect(applyStore.applications()).toEqual([]);
    expect(applyStore.now()).toBe(DEMO_NOW);
  });
});
