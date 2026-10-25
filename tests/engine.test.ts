import { describe, expect, it } from 'vitest';
import { Engine, IdentityLockedError, InvalidTransitionError, createSeed, type AgentProfile } from '../src/engine';
import { buildGraph, edgeSkills, findCycles, rankCycles } from '../src/engine/cycles';
import { buildListing, filterListings } from '../src/engine/discovery';
import { evaluateSchedule } from '../src/engine/negotiation';
import { schedule, validateCounter } from '../src/engine/scheduler';
import { transition } from '../src/engine/stateMachine';
import type { Listing } from '../src/engine/types';
import { parseCounter } from '../src/engine/voice';

const seed = () => createSeed();
const byId = (id: string) => seed().find((p) => p.agent_id === id)!;
const listing = (p: AgentProfile) => buildListing(p).listing!;
const node = (p: AgentProfile) => ({ handle: p.agent_id, offers: p.offers, needs: p.needs });
const priv = (id: string) => ({ availability: byId(id).availability, min_session_minutes: 45 });

/** Every private identity string in the seed. */
const privateStrings = seed().flatMap((p) => [p.private.name, p.private.email, p.private.discord_id]);

function goldenUntilHumans() {
  const engine = new Engine();
  engine.simulateInterviewInvite();
  return engine;
}

describe('1. complementary skills', () => {
  it('matches A.offers ∩ B.needs and rejects non-complementary pairs', () => {
    const [aditya, sumit, maya, , decoy5] = seed().map(node);
    expect(edgeSkills(aditya, maya)).toEqual(['DSA']);
    expect(edgeSkills(maya, sumit)).toEqual(['System Design']);
    expect(edgeSkills(sumit, aditya)).toEqual(['Behavioral']);
    expect(edgeSkills(aditya, sumit)).toEqual([]);
    expect(edgeSkills(maya, aditya)).toEqual([]);
    // #5 offers and needs only DSA: no self-loop and filtered as non-complementary
    expect(buildGraph([decoy5]).length).toBe(0);
  });
});

describe('2. cycles', () => {
  it('finds Aditya -> Maya -> Sumit -> Aditya first, with Jordan as backup', () => {
    const nodes = ['a1', 'a2', 'a3', 'a4'].map((id) => listing(byId(id)));
    const ranked = rankCycles(findCycles(nodes), 'a1', nodes.map((n) => n.handle));
    expect(ranked[0].members).toEqual(['a1', 'a3', 'a2']);
    expect(ranked[0].edges.map((e) => e.skills[0])).toEqual(['DSA', 'System Design', 'Behavioral']);
    expect(ranked[1].members).toEqual(['a1', 'a4', 'a2']);
  });

  it('finds no false cycle among the decoys', () => {
    const decoys = ['a5', 'a6', 'a7'].map((id) => node(byId(id)));
    expect(findCycles(decoys)).toEqual([]);
  });

  it('the engine never puts a decoy in a circle', () => {
    const engine = goldenUntilHumans();
    expect(engine.circle!.members).toEqual(['a1', 'a3', 'a2']);
    const matches = engine.events().filter((e) => e.type === 'DISCOVER' && e.payload.match);
    for (const m of matches) {
      const members = (m.payload.match as { members: string[] }).members;
      expect(members.some((id) => ['a5', 'a6', 'a7', 'a8'].includes(id))).toBe(false);
    }
  });
});

describe('3. discovery filters', () => {
  it('filters a different pipeline and hides a share_skills=false agent', () => {
    const profiles = seed();
    profiles[0].stage_public = 'interview';
    const responses = profiles.map((p) => ({ handle: p.agent_id, listing: buildListing(p).listing }));
    expect(responses.find((r) => r.handle === 'a7')!.listing).toBeNull();
    const { candidates, filtered } = filterListings(responses[0].listing!, responses);
    const reasons = Object.fromEntries(filtered.map((f) => [f.handle, f.reason]));
    expect(reasons.a8).toMatch(/different pipeline/);
    expect(reasons.a7).toMatch(/invisible/);
    expect(reasons.a5).toMatch(/no complementary skills/);
    expect(candidates.map((c) => c.handle)).toEqual(['a1', 'a2', 'a3', 'a4', 'a6']);
  });

  it('agent #7 never appears in any listing in a full run', () => {
    const engine = goldenUntilHumans();
    const published = engine
      .events()
      .map((e) => e.payload.listing as Listing | null | undefined)
      .filter((l): l is Listing => Boolean(l));
    expect(published.map((l) => l.handle)).not.toContain('a7');
    expect(published.length).toBe(7);
  });

  it('abstracts Maya interview date and withholds Aditya exact stage', () => {
    const maya = buildListing(byId('a3'));
    expect(maya.listing!.urgency).toBe('time-sensitive prep need');
    expect(JSON.stringify(maya.listing)).not.toContain('2026-11-03');
    expect(maya.disclosure.abstracted[0]).toMatch(/interview date/);
    const aditya = buildListing(byId('a1'));
    expect(aditya.listing!.stage_detail).toBeUndefined();
    expect(aditya.disclosure.withheld).toContain('exact stage');
  });
});

describe('4-5. scheduler', () => {
  it('intersects to 19:30-21:00', () => {
    expect(schedule([priv('a1'), priv('a2'), priv('a3')])).toEqual({ ok: true, window: { start: '19:30', end: '21:00' } });
  });

  it('returns CONFLICT for a window shorter than 45 min, never a fake solution', () => {
    const r = schedule([
      { availability: [{ start: '18:00', end: '19:00' }], min_session_minutes: 45 },
      { availability: [{ start: '18:30', end: '20:00' }], min_session_minutes: 45 },
    ]);
    expect(r.ok).toBe(false);
    expect(schedule([priv('a1'), priv('a6')]).ok).toBe(false);
  });

  it('engine emits CONFLICT and resolves with the backup when the overlap is too short', () => {
    const profiles = seed();
    profiles[2].availability = [{ start: '20:30', end: '21:00' }]; // Maya: only 30 min overlap
    const engine = new Engine(profiles);
    engine.simulateInterviewInvite();
    const types = engine.events().map((e) => e.type);
    expect(types).toContain('CONFLICT');
    expect(engine.history().map((h) => h.to)).toContain('CONFLICT_RESOLVED');
    expect(engine.circle!.members).toEqual(['a1', 'a4', 'a2']);
    expect(engine.window).toEqual({ start: '19:00', end: '21:00' });
    const proposals = engine.events().filter((e) => e.type === 'PROPOSE' && e.payload.kind === 'schedule');
    expect(proposals.every((p) => !(p.to.includes('a3')))).toBe(true);
  });
});

describe('6. counter validation', () => {
  const members = [priv('a1'), priv('a2'), priv('a3')];

  it('parses "8pm?" into 20:00 keeping the current end', () => {
    expect(parseCounter('8pm?', { start: '19:30', end: '21:00' })).toEqual({ start: '20:00', end: '21:00' });
    expect(parseCounter('how about 20:00-21:00', { start: '19:30', end: '21:00' })).toEqual({ start: '20:00', end: '21:00' });
    expect(parseCounter('sounds good', { start: '19:30', end: '21:00' })).toBeNull();
  });

  it('validates 20:00-21:00 against every private range and rejects invalid counters', () => {
    expect(validateCounter({ start: '20:00', end: '21:00' }, members).ok).toBe(true);
    expect(validateCounter({ start: '19:00', end: '20:30' }, members).ok).toBe(false); // before Maya's 19:30
    expect(validateCounter({ start: '20:30', end: '21:00' }, members).ok).toBe(false); // 30 min < 45
  });

  it('engine: Maya counters 8pm -> 20:00-21:00 re-sent to humans', () => {
    const engine = goldenUntilHumans();
    engine.reply('a3', { kind: 'counter', text: '8pm?' });
    expect(engine.window).toEqual({ start: '20:00', end: '21:00' });
    expect(engine.state).toBe('AWAITING_HUMANS');
    for (const id of ['a1', 'a2', 'a3']) expect(engine.phone(id).at(-1)!.text).toMatch(/Updated time.*8:00 PM-9:00 PM/);
  });

  it('engine: a counter outside another member private range is rejected and the old time stands', () => {
    const engine = goldenUntilHumans();
    engine.reply('a3', { kind: 'counter', text: '9pm-10pm' }); // fits Maya, not Aditya / Sumit
    expect(engine.window).toEqual({ start: '19:30', end: '21:00' });
    expect(engine.state).toBe('AWAITING_HUMANS');
    expect(engine.events().some((e) => e.type === 'CONFLICT' && e.payload.counter_rejected)).toBe(true);
  });
});

describe('7. agent #6', () => {
  it('auto-rejects an evening proposal on its own', () => {
    expect(evaluateSchedule(byId('a6'), { start: '19:30', end: '21:00' })).toEqual({ type: 'REJECT', reason: 'outside my availability' });
    const engine = goldenUntilHumans();
    const reject = engine.events().find((e) => e.type === 'REJECT');
    expect(reject!.from).toBe('a6');
  });
});

describe('8-9. identity gate', () => {
  it('identity is unreadable before full consent and never leaks into events', () => {
    const engine = goldenUntilHumans();
    expect(() => engine.getIdentity('a1', 'a3')).toThrow(IdentityLockedError);
    expect(() => engine.getIdentity('a1', 'a1')).toThrow(IdentityLockedError);
    const feed = JSON.stringify(engine.events());
    for (const s of privateStrings) expect(feed).not.toContain(s);
  });

  it('2 of 3 consents -> no reveal', () => {
    const engine = goldenUntilHumans();
    engine.reply('a1', { kind: 'accept' });
    engine.reply('a2', { kind: 'accept' });
    expect(engine.state).toBe('AWAITING_CONSENT');
    expect(() => engine.getIdentity('a1', 'a2')).toThrow(IdentityLockedError);
    expect(engine.events().some((e) => e.type === 'REVEAL')).toBe(false);
  });

  it('3 of 3 consents -> reveal, complete, and identity readable only by members', () => {
    const engine = goldenUntilHumans();
    for (const id of ['a1', 'a2', 'a3']) engine.reply(id, { kind: 'accept' });
    expect(engine.state).toBe('COMPLETED');
    expect(engine.getIdentity('a1', 'a3').name).toBe('Maya Okonkwo');
    expect(() => engine.getIdentity('a4', 'a1')).toThrow(IdentityLockedError);
    expect(() => engine.getIdentity('a1', 'a4')).toThrow(IdentityLockedError);
  });
});

describe('10. decline branch', () => {
  it('decline -> DISSOLVED -> Jordan found; the decliner is never named to the others', () => {
    const engine = goldenUntilHumans();
    const before = engine.events().length;
    engine.reply('a3', { kind: 'decline' });

    const states = engine.history().map((h) => h.to);
    expect(states).toEqual(expect.arrayContaining(['DECLINED', 'DISSOLVED', 'REDISCOVERING']));
    expect(engine.circle!.members).toEqual(['a1', 'a4', 'a2']);
    expect(engine.window).toEqual({ start: '19:00', end: '21:00' });
    expect(engine.state).toBe('AWAITING_HUMANS');
    expect(() => engine.getIdentity('a1', 'a3')).toThrow(IdentityLockedError);

    const maya = byId('a3');
    for (const viewer of ['a1', 'a2', 'a4']) {
      const after = engine.eventsVisibleTo(viewer).filter((e) => Number(e.id.slice(4)) > before);
      const text = JSON.stringify(after);
      for (const s of ['a3', 'Applicant #3', maya.private.name, maya.private.email]) expect(text).not.toContain(s);
      expect(after.some((e) => e.type === 'DECLINE')).toBe(false);
      expect(JSON.stringify(engine.phone(viewer))).not.toContain(maya.private.name);
    }
  });

  it('the backup circle can complete', () => {
    const engine = goldenUntilHumans();
    engine.reply('a3', { kind: 'decline' });
    for (const id of ['a1', 'a2', 'a4']) engine.reply(id, { kind: 'accept' });
    expect(engine.state).toBe('COMPLETED');
    expect(engine.getIdentity('a1', 'a4').name).toBe('Jordan Ellis');
  });
});

describe('11. resetDemo', () => {
  it('produces an identical run twice', () => {
    const run = (engine: Engine) => {
      engine.simulateInterviewInvite();
      engine.reply('a3', { kind: 'counter', text: '8pm?' });
      for (const id of ['a1', 'a2', 'a3']) engine.reply(id, { kind: 'accept' });
      return JSON.stringify({ events: engine.events(), history: engine.history(), phones: ['a1', 'a2', 'a3'].map((id) => engine.phone(id)) });
    };
    const engine = new Engine();
    const first = run(engine);
    engine.resetDemo();
    expect(engine.state).toBe('IDLE');
    expect(engine.events()).toEqual([]);
    expect(run(engine)).toBe(first);
  });

  it('the seed itself is never mutated by a run', () => {
    const before = JSON.stringify(createSeed());
    goldenUntilHumans();
    expect(JSON.stringify(createSeed())).toBe(before);
  });
});

describe('state machine', () => {
  it('rejects invalid transitions', () => {
    expect(transition('IDLE', 'TRIGGERED')).toBe('TRIGGERED');
    expect(() => transition('IDLE', 'IDENTITIES_REVEALED')).toThrow(InvalidTransitionError);
    expect(() => transition('AWAITING_CONSENT', 'IDENTITIES_REVEALED')).toThrow(InvalidTransitionError);
  });

  it('humans cannot reply without a pending request', () => {
    const engine = new Engine();
    expect(() => engine.reply('a1', { kind: 'accept' })).toThrow();
  });
});
