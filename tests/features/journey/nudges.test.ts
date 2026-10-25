import { describe, expect, it } from 'vitest';
import { addLink, newApplication, type Application } from '../../../src/features/apply/applications';
import { applyStore } from '../../../src/features/apply/store';
import { EMPTY_NUDGES, eveningPeer, planNudges, type NudgeState } from '../../../src/features/journey/nudges';
import { nudgeButtons, nudgeCopy, parseNotifyBody } from '../../../src/live/protocol';

const ms = (over: Partial<Application> = {}): Application => ({
  ...newApplication({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern', stage: 'Interview', at: '2026-10-25', interviewDate: '2026-11-04' }),
  ...over,
});
const withCircle = (a: Application) => addLink(a, { kind: 'prep', ref: 'prep-1', at: '2026-10-25', summary: '', topics: ['DSA', 'Behavioral'] });
const TWO_DAYS_BEFORE = '2026-11-02T19:00';
const state = (over: Partial<NudgeState> = {}): NudgeState => ({ ...structuredClone(EMPTY_NUDGES), ...over });

describe('proactive nudges', () => {
  it('nothing ten days out; the right nudge, from real data, when it matters', () => {
    expect(planNudges([ms()], '2026-10-25T18:00', state())).toEqual([]);
    const [n] = planNudges([withCircle(ms())], TWO_DAYS_BEFORE, state());
    expect(n).toMatchObject({ id: 'p1:microsoft:swe intern|mock', kind: 'mock', action: { tab: 'mock' }, at: TWO_DAYS_BEFORE });
    // The peer is Jordan from the mock network: strong in System Design (Aditya's missing topic), free 7:00–9:30 PM.
    // Maya is strong in it too, but she and Aditya already practiced twice, the mock network's limit.
    expect(eveningPeer('Microsoft', 'System Design', 'p1')!.agent_id).toBe('m4');
    expect(n.text).toBe("Under 48 hours to your Microsoft interview. A student in your pipeline who's strong in System Design is free tonight, 7:00–9:30 PM. Want a mock?");
    expect(n.text).not.toMatch(/Jordan|Ellis/); // names only after both agree
    // Without a circle, a week out: the circle nudge.
    expect(planNudges([ms()], '2026-10-29T18:00', state())[0].kind).toBe('circle');
  });

  it('rate limits: one per job per day, two per student per day, each kind once', () => {
    let s = state();
    const send = (now: string, apps: Application[]) => {
      const out = planNudges(apps, now, s);
      s = { ...s, sent: [...s.sent, ...out] };
      return out.map((n) => n.kind);
    };
    const app = ms();
    expect(send('2026-11-02T19:00', [app])).toEqual(['mock']);
    expect(send('2026-11-02T21:00', [app])).toEqual([]); // same day, same job
    expect(send('2026-11-03T08:00', [app])).toEqual(['circle']);
    expect(send('2026-11-03T20:00', [app])).toEqual([]);
    expect(send('2026-11-04T00:00', [app])).toEqual(['intel']); // a new day; the reports are still unread
    expect(send('2026-11-04T08:00', [app])).toEqual([]); // every kind has gone out once
    const a = ms(), b = ms({ id: 'p1:google:swe', company: 'Google' }), c = ms({ id: 'p1:stripe:swe', company: 'Stripe' });
    expect(planNudges([a, b, c], '2026-10-29T18:00', state()).length).toBe(2); // two per student per day
  });

  it('muted means nothing is sent: per job or all', () => {
    const app = withCircle(ms());
    expect(planNudges([app], TWO_DAYS_BEFORE, state({ muted: [app.id] }))).toEqual([]);
    expect(planNudges([app], TWO_DAYS_BEFORE, state({ mutedAll: true }))).toEqual([]);
    expect(planNudges([app], TWO_DAYS_BEFORE, state({ muted: ['p1:other:job'] }))).toHaveLength(1);
  });

  it('no nudges for closed records, records without a real interview date, or after the interview', () => {
    expect(planNudges([ms({ stage: 'Offer' })], TWO_DAYS_BEFORE, state())).toEqual([]);
    expect(planNudges([ms({ interviewDate: null })], TWO_DAYS_BEFORE, state())).toEqual([]);
    expect(planNudges([ms()], '2026-11-06T09:00', state())).toEqual([]);
  });

  it('the store never records a nudge for a muted job, and Reset clears it all', () => {
    applyStore.resetFor(7101);
    const app = withCircle(ms());
    applyStore.mute(app.id);
    expect(applyStore.recordNudges(planNudges([app], TWO_DAYS_BEFORE, EMPTY_NUDGES))).toEqual([]);
    applyStore.mute(app.id, false);
    expect(applyStore.recordNudges(planNudges([app], TWO_DAYS_BEFORE, applyStore.nudges()))).toHaveLength(1);
    applyStore.answerNudge('p1:microsoft:swe intern|mock', 'yes');
    expect(applyStore.nudgeAnswer('p1:microsoft:swe intern|mock')).toBe('yes');
    applyStore.resetFor(7102);
    expect(applyStore.nudges()).toEqual(EMPTY_NUDGES);
  });

  it('the Discord copy is built from structured fields only, with yes / not now buttons', () => {
    const [n] = planNudges([withCircle(ms())], TWO_DAYS_BEFORE, state());
    const body = parseNotifyBody({ session: '0f8fad5b-d9cb-469f-a165-70867728950e', prompt: 1, kind: 'nudge', details: { ...n.details, name: 'Jordan Ellis' } })!;
    expect(body.details).toEqual(n.details);
    expect(nudgeCopy(body.details)).toContain('strong in System Design is free tonight, 7:00–9:30 PM');
    expect(nudgeButtons(body.session, 1)[0].components.map((c) => c.label)).toEqual(['Yes', 'Not now']);
    expect(parseNotifyBody({ session: body.session, prompt: 1, kind: 'nudge', details: { company: 'Microsoft', text: 'x', status: 'spam' } })).toBeNull();
  });
});
