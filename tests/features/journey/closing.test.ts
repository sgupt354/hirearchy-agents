import { describe, expect, it } from 'vitest';
import { addLink, newApplication, type Application } from '../../../src/features/apply/applications';
import { applyStore } from '../../../src/features/apply/store';
import { EMPTY_FOLLOWUPS, makeThankYou, planFollowUps, type FollowUpState } from '../../../src/features/journey/closing';
import { discloseEvidence } from '../../../src/features/trust/evidence';
import { TrustNetwork } from '../../../src/features/trust/network';
import { calendarLink, parseNotifyBody, revealCopy, revealDm } from '../../../src/live/protocol';

const ms = (over: Partial<Application> = {}): Application => ({
  ...newApplication({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern', stage: 'Interview', at: '2026-10-25', interviewDate: '2026-11-04' }),
  ...over,
});
const state = (over: Partial<FollowUpState> = {}): FollowUpState => ({ ...structuredClone(EMPTY_FOLLOWUPS), ...over });
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('closing the loop: post-interview follow-up', () => {
  it('asks once after the interview date, never before, and never invents an outcome', () => {
    expect(planFollowUps([ms()], '2026-11-03T20:00', state())).toEqual([]);
    const [f] = planFollowUps([ms()], '2026-11-04T20:00', state());
    expect(f).toMatchObject({ id: 'p1:microsoft:swe intern|followup', company: 'Microsoft', interviewDate: '2026-11-04' });
    expect(f.text).toContain('Nov 4');
    expect(f.text).toMatch(/intel report/i);
    expect(planFollowUps([ms()], '2026-11-04T20:00', state({ sent: [f] }))).toEqual([]);
    expect(planFollowUps([ms()], '2026-11-04T20:00', state({ done: [ms().id] }))).toEqual([]);
    expect(planFollowUps([ms({ stage: 'Offer' })], '2026-11-04T20:00', state())).toEqual([]);
    expect(planFollowUps([ms({ interviewDate: null })], '2026-11-04T20:00', state())).toEqual([]);
  });

  it('skips when intel was already shared; shareIntel links, awards points once, and marks done', () => {
    const shared = addLink(ms(), { kind: 'intel-shared', ref: 'x', at: '2026-11-04', summary: 'Shared' });
    expect(planFollowUps([shared], '2026-11-05T09:00', state())).toEqual([]);

    applyStore.resetFor(8401);
    applyStore.setNow('2026-11-04T20:00');
    applyStore.recordApplication({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern', stage: 'Interview', interviewDate: '2026-11-04' });
    const entry = applyStore.shareIntel({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern' }, 'Shared an anonymous Microsoft interview report');
    expect(entry).toMatchObject({ points: 10, reason: 'shared Microsoft interview intel' });
    expect(applyStore.application('p1:microsoft:swe intern')!.links.some((l) => l.kind === 'intel-shared')).toBe(true);
    expect(applyStore.followUps().done).toContain('p1:microsoft:swe intern');
    expect(applyStore.shareIntel({ owner: 'p1', company: 'Microsoft', role: 'SWE Intern' }, 'again')).toBeNull();
    expect(applyStore.intelPointEntries()).toHaveLength(1);
    applyStore.resetFor(8402);
  });
});

describe('closing the loop: thank-you notes stay private', () => {
  it('scrubs phones and @handles from the note', () => {
    const note = makeThankYou('Thanks! text me at 555-123-4567 or @priya_n', {
      mentor: 'p1',
      sessionId: 'need-1',
      at: '2026-10-25',
    });
    expect(note!.text).not.toMatch(/555|@priya/);
    expect(note!.text).toContain('[hidden]');
    expect(makeThankYou('   ', { mentor: 'p1', sessionId: 'need-1', at: '2026-10-25' })).toBeNull();
  });

  it("lands on the mentor's proof of work and never in what referrers see", () => {
    const t = new TrustNetwork();
    const note = makeThankYou('Thanks for the System Design walkthrough', {
      mentor: 'p1',
      sessionId: 'need-1',
      at: '2026-10-25',
      fromLabel: 'a newcomer you helped',
    })!;
    t.addThankYou(note);
    const file = t.evidence('p1', 'p1');
    expect(file.thankYouNotes).toEqual([{ fromLabel: 'a newcomer you helped', text: note.text, at: '2026-10-25' }]);
    const stage1 = discloseEvidence(file, 1);
    const stage2 = discloseEvidence(file, 2);
    expect(stage1).not.toHaveProperty('thankYouNotes');
    expect(stage2).not.toHaveProperty('thankYouNotes');
    expect(JSON.stringify([stage1, stage2])).not.toContain('System Design walkthrough');
    expect(JSON.stringify(t.disclose('p1', 1))).not.toContain('System Design walkthrough');
    t.addThankYou(note); // same session: no-op
    expect(t.evidence('p1', 'p1').thankYouNotes).toHaveLength(1);
  });
});

describe('closing the loop: Everyone said yes + calendar', () => {
  it('builds the Discord copy from structured fields and a real calendar link', () => {
    const cal = calendarLink({ title: 'Microsoft SWE Intern prep circle', date: '2026-10-25', window: '7:30 PM-9:00 PM' });
    expect(cal).toContain('calendar.google.com');
    expect(cal).toContain('20261025T193000');
    expect(cal).toContain('20261025T210000');
    expect(calendarLink({ title: 'x', date: '2026-10-25', window: 'sometime' })).toBeNull();

    const copy = revealCopy({ company: 'Microsoft', role: 'SWE Intern', window: '7:30 PM-9:00 PM', calendar: cal! });
    expect(copy).toMatch(/^Everyone said yes/);
    expect(copy).toContain(cal!);

    const body = parseNotifyBody({
      session: SESSION,
      prompt: 9,
      kind: 'reveal',
      details: { company: 'Microsoft', role: 'SWE Intern', window: '7:30 PM-9:00 PM', date: '2026-10-25', members: 'Maya and Sumit' },
    })!;
    expect(body.details).toEqual({ company: 'Microsoft', role: 'SWE Intern', window: '7:30 PM-9:00 PM', date: '2026-10-25' });
    expect(revealDm(body.details)).toContain('Everyone said yes');
    expect(revealDm(body.details)).toContain('calendar.google.com');
    expect(parseNotifyBody({ session: SESSION, prompt: 9, kind: 'reveal', details: { company: 'Microsoft' } })).toBeNull();
  });
});
