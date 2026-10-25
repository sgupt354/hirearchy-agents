import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { deriveGraph, stateAt } from '../src/ui/view';

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
