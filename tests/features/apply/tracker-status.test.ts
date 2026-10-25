import { describe, expect, it } from 'vitest';
import { TRACKER_STATUSES, applyStore, type TrackedPosting } from '../../../src/features/apply/store';
import { summarize, toCsv, toJson, trackerRows } from '../../../src/features/apply/tracker/export';

const p = (id: string, over: Partial<TrackedPosting> = {}): TrackedPosting => ({
  id, company: id, provider: 'greenhouse', title: 'SWE Intern', location: 'Seattle, WA', url: '', posted: null,
  description: '', score: 0, isIntern: true, visaFlag: false, years: null, reasons: [], source: 'live', trackedAt: '8:00 AM', ...over,
});

describe('tracker: application status pipeline', () => {
  it('the pipeline, in order', () => {
    expect(TRACKER_STATUSES).toEqual(['Saved', 'Applied', 'OA', 'Interview', 'Offer', 'Rejected']);
  });

  it('new jobs start as Saved; the store updates one job and keeps the rest', () => {
    applyStore.resetFor(9001);
    applyStore.track(p('Stripe'), 'live', '8:00 AM');
    applyStore.track(p('Ramp'), 'live', '8:01 AM');
    applyStore.setStatus('Stripe', 'Interview');
    expect(applyStore.tracked().map((t) => t.status ?? 'Saved')).toEqual(['Interview', 'Saved']);
    applyStore.resetFor(9002);
    expect(applyStore.tracked()).toEqual([]);
  });

  it('exports carry each status', () => {
    const rows = trackerRows([p('Stripe', { status: 'Offer' }), p('Ramp')], '2026-10-25');
    expect(toCsv(rows).split('\r\n')[1]).toBe('Stripe,SWE Intern,Offer,"Seattle, WA",,2026-10-25,Live job board');
    expect(JSON.parse(toJson(rows, 'now')).jobs.map((j: { status: string }) => j.status)).toEqual(['Offer', 'Saved']);
  });

  it('summary: applied counts everything past Saved; interview rate = (Interview + Offer) / applied', () => {
    const s = summarize([{ status: 'Saved' }, { status: 'Applied' }, { status: 'OA' }, { status: 'Interview' }, { status: 'Offer' }, { status: 'Rejected' }]);
    expect(s).toEqual({ tracked: 6, applied: 5, oa: 1, interviews: 1, offers: 1, rejected: 1, interviewRate: 0.4 });
    expect(summarize([]).interviewRate).toBe(0);
  });
});
