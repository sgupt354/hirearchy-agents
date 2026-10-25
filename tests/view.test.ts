import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { deriveGraph, inviteOutcome, matchesLens, stateAt } from '../src/ui/view';

const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

describe('UI view model (Aditya view)', () => {
  it('greys out every decoy with a reason and draws the found cycle', () => {
    const engine = new Engine();
    engine.simulateInterviewInvite();
    const g = deriveGraph(engine.events(), ids, 'a1');
    expect(g.status).toEqual({ a1: 'you', a2: 'member', a3: 'member', a4: 'backup', a5: 'filtered', a6: 'filtered', a7: 'filtered', a8: 'filtered' });
    expect(g.reasons.a6).toMatch(/rejected/);
    expect(g.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['a1->a3', 'a3->a2', 'a2->a1']);
    expect(g.revealed).toBe(false);
    expect(stateAt(engine.history(), 0)).toBe('IDLE');
    expect(stateAt(engine.history(), engine.events().length)).toBe('AWAITING_HUMANS');
  });

  it('after a decline, the graph switches to Jordan without marking who left', () => {
    const engine = new Engine();
    engine.simulateInterviewInvite();
    engine.reply('a3', { kind: 'decline' });
    const g = deriveGraph(engine.events(), ids, 'a1');
    expect(g.status.a3).toBe('idle');
    expect(g.status.a4).toBe('member');
  });
});

describe('paste-invite outcome', () => {
  const net = { company: 'Microsoft', role: 'SWE Intern' };
  it('starts only for the demo pipeline', () => {
    expect(inviteOutcome({ company: 'Microsoft', role: 'SWE Intern', stage: 'interview' }, net).start).toBe(true);
  });
  it('recognises a real invite for another pipeline without starting', () => {
    const o = inviteOutcome({ company: 'Google', role: 'SWE', stage: 'interview' }, net);
    expect(o.start).toBe(false);
    expect(o.message).toBe(
      'Interview invite detected: Google / SWE. No agents in this pipeline yet; the demo network is Microsoft SWE Intern.',
    );
  });
  it('says "Not an interview invite" only for null', () => {
    expect(inviteOutcome(null, net)).toEqual({ start: false, tone: 'bad', message: 'Not an interview invite' });
  });
});

describe('judge legend lenses', () => {
  it('maps each criterion onto the right events of the golden path', () => {
    const engine = new Engine();
    engine.simulateInterviewInvite();
    engine.reply('a3', { kind: 'counter', text: '8pm?' });
    const events = engine.events();
    const types = (lens: Parameters<typeof matchesLens>[1]) => new Set(events.filter((e) => matchesLens(e, lens)).map((e) => e.type));
    expect(types('conflict')).toEqual(new Set(['CONFLICT', 'COUNTER', 'REJECT']));
    expect(types('humans')).toEqual(new Set(['ESCALATE']));
    const shared = events.filter((e) => matchesLens(e, 'shared'));
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((e) => e.disclosure.shared.length + e.disclosure.abstracted.length + e.disclosure.withheld.length > 0)).toBe(true);
    expect(shared.some((e) => e.disclosure.abstracted.length > 0)).toBe(true);
  });
});
