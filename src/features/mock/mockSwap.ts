import { allConsented, newConsent, recordConsent, type ConsentMap } from '../../engine/consent';
import { buildListing } from '../../engine/discovery';
import { BROKER, EventLog } from '../../engine/events';
import { IdentityVault } from '../../engine/identity';
import { evaluateJoin, evaluateSchedule, type Decision } from '../../engine/negotiation';
import type { AgentEvent, Disclosure, Draft, Identity, TimeWindow } from '../../engine/types';
import { range12 } from '../../ui/copy';
import { machine } from '../shared/machine';
import { filterMockListings, mockSlot, rankPeers, type MockListing } from './matching';
import { questionPack, type PackQuestion } from './questions';
import { ScoreVault, type Rubric, type ScoreEntry } from './scores';
import { MOCK_SEEKER, createMockSeed, type MockProfile } from './seed';

export type MockState =
  | 'IDLE'
  | 'MATCHING'
  | 'MATCH_FOUND'
  | 'NEGOTIATING'
  | 'AWAITING_HUMANS'
  | 'AWAITING_CONSENT'
  | 'DECLINED'
  | 'CONFIRMED'
  | 'ROUND_1'
  | 'ROUND_2'
  | 'SCORING'
  | 'COMPLETED'
  | 'NO_PEER'
  | 'SOLO';

const step = machine<MockState>({
  IDLE: ['MATCHING'],
  MATCHING: ['MATCH_FOUND', 'NO_PEER'],
  MATCH_FOUND: ['NEGOTIATING'],
  NEGOTIATING: ['AWAITING_HUMANS', 'MATCH_FOUND', 'NO_PEER'],
  AWAITING_HUMANS: ['AWAITING_CONSENT', 'DECLINED'],
  AWAITING_CONSENT: ['CONFIRMED', 'DECLINED'],
  DECLINED: ['MATCH_FOUND', 'NO_PEER'],
  CONFIRMED: ['ROUND_1'],
  ROUND_1: ['ROUND_2'],
  ROUND_2: ['SCORING'],
  SCORING: ['COMPLETED'],
  COMPLETED: [],
  NO_PEER: ['SOLO'],
  SOLO: ['COMPLETED'],
});

export type MockMsgKind = 'text' | 'ask' | 'pack' | 'round' | 'rubric' | 'scores' | 'solo-offer' | 'solo-question' | 'solo-rubric';

/** A message an agent puts on its own human's phone. `at` = events logged when it was written (for replay). */
export interface MockMessage {
  id: number;
  at: number;
  kind: MockMsgKind;
  text: string;
  needsHuman: boolean;
  data?: Record<string, unknown>;
}

export class NoPeerError extends Error {}

const first = (name: string) => name.split(' ')[0];

/** One student's mock-interview agent: private profile and practice history, decides for itself. */
class MockAgent {
  readonly id: string;
  readonly label: string;
  #p: MockProfile;
  #phone: MockMessage[] = [];

  constructor(p: MockProfile) {
    this.#p = structuredClone(p);
    this.id = p.agent_id;
    this.label = p.label;
  }

  listing(): { listing: MockListing | null; disclosure: Disclosure } {
    const { listing, disclosure } = buildListing(this.#p);
    if (!listing) return { listing: null, disclosure };
    return {
      listing: { ...listing, round: this.#p.round, difficulty: this.#p.difficulty },
      disclosure: { ...disclosure, shared: [...disclosure.shared, 'round', 'difficulty'], withheld: [...disclosure.withheld, 'practice history'] },
    };
  }

  /** Private rule: never pair my human with someone they've practiced with `max_repeats` times. */
  repeatLimitReached(handle: string): boolean {
    return (this.#p.practiced[handle] ?? 0) >= this.#p.max_repeats;
  }

  evaluate(window: TimeWindow): Decision {
    return evaluateSchedule(this.#p, window);
  }

  join(): Decision {
    return evaluateJoin(this.#p);
  }

  recordPractice(partner: string) {
    this.#p.practiced[partner] = (this.#p.practiced[partner] ?? 0) + 1;
  }

  notify(at: number, kind: MockMsgKind, text: string, needsHuman = false, data?: Record<string, unknown>) {
    this.#phone.push({ id: this.#phone.length + 1, at, kind, text, needsHuman, data });
  }

  phone(): MockMessage[] {
    return structuredClone(this.#phone);
  }
}

export interface StateChange {
  from: MockState;
  to: MockState;
  afterEvents: number;
}

/**
 * Reciprocal mock interviews: same pipeline AND round, at least an hour together, matching difficulty,
 * complementary weak areas preferred, never a third time with the same person. A interviews B, then B
 * interviews A. Matching, scheduling, consent and the reveal reuse the engine; scores stay private.
 */
export class MockSwap {
  state: MockState = 'IDLE';
  #agents = new Map<string, MockAgent>();
  #log!: EventLog;
  #vault!: IdentityVault;
  #scores!: ScoreVault;
  #history: StateChange[] = [];
  #listings = new Map<string, MockListing>();
  #seeker = '';
  #queue: string[] = [];
  #pair: [string, string] | null = null;
  #window: TimeWindow | null = null;
  #consents: ConsentMap = {};
  #submitted = new Set<string>();
  #solo: { index: number; questions: PackQuestion[] } | null = null;
  #names = new Map<string, string>();
  #reliability: (id: string) => number | null;

  constructor(seed: MockProfile[] = createMockSeed(), reliability: (id: string) => number | null = () => null) {
    this.#reliability = reliability;
    this.#load(seed);
  }

  reset(seed: MockProfile[] = createMockSeed()): void {
    this.#load(seed);
  }

  // ---- read access ---------------------------------------------------------------------------------

  events(): AgentEvent[] {
    return this.#log.all();
  }

  history(): StateChange[] {
    return [...this.#history];
  }

  phone(id: string): MockMessage[] {
    return this.#agent(id).phone();
  }

  labels(): Record<string, string> {
    return Object.fromEntries([...this.#agents.values()].map((a) => [a.id, a.label]));
  }

  get seeker() {
    return this.#seeker;
  }

  get pair(): [string, string] | null {
    return this.#pair ? [...this.#pair] : null;
  }

  get window(): TimeWindow | null {
    return this.#window ? { ...this.#window } : null;
  }

  /** Who interviews whom in the current round. */
  get seats(): { interviewer: string; candidate: string } | null {
    if (!this.#pair) return null;
    const [a, b] = this.#pair;
    return this.state === 'ROUND_2' ? { interviewer: b, candidate: a } : { interviewer: a, candidate: b };
  }

  /** Name/contact only after both sides consented (same gate as the prep circle). */
  getIdentity(requester: string, target: string): Identity {
    return this.#vault.read(this.#consents, requester, target);
  }

  /** Scores are readable by the person scored, or by someone they explicitly granted. */
  getScores(requester: string, subject: string): ScoreEntry[] {
    return this.#scores.read(requester, subject);
  }

  scoreAverages(requester: string, subject: string): Rubric | null {
    return this.#scores.averages(requester, subject);
  }

  /** The subject chooses to share their scores with someone (their consent, their call). */
  grantScores(subject: string, viewer: string): void {
    this.#scores.grant(subject, viewer);
  }

  // ---- flow ----------------------------------------------------------------------------------------

  start(seeker = MOCK_SEEKER): void {
    if (this.state !== 'IDLE') throw new Error('A mock search is already running');
    const me = this.#agent(seeker);
    this.#seeker = seeker;
    this.#set('MATCHING');

    const all = [...this.#agents.keys()];
    const out = me.listing();
    if (!out.listing) throw new Error('This student shares no skills, so there is nothing to match on');
    const { pipeline, round } = out.listing;
    this.#emit(seeker, {
      type: 'TRIGGER',
      to: [BROKER],
      payload: { pipeline, round, purpose: 'mock' },
      human_readable: `${me.label} has a ${pipeline.company} ${round.toLowerCase()} round coming up; the agent looks for a mock partner`,
      disclosure: { shared: ['pipeline', 'round'], withheld: ['interview date'] },
    });
    me.notify(this.#at(), 'text', `Your ${pipeline.company} ${round.toLowerCase()} round is coming up 💪 I'm looking for someone in the same round to swap mock interviews with.`);

    this.#emit(BROKER, { type: 'DISCOVER', to: all, payload: { request: 'listing', purpose: 'mock' }, human_readable: `The broker asked all ${all.length} agents for anonymous mock listings` });
    for (const a of this.#agents.values()) {
      const r = a.listing();
      if (r.listing) this.#listings.set(a.id, r.listing);
      this.#emit(a.id, { type: 'DISCOVER', to: [BROKER], payload: { listing: r.listing }, human_readable: `${a.label} published an anonymous mock listing`, disclosure: r.disclosure });
    }

    const mine = this.#listings.get(seeker)!;
    const others = [...this.#listings.values()].filter((l) => l.handle !== seeker);
    const { kept, filtered } = filterMockListings(mine, others);
    for (const f of filtered) {
      this.#emit(BROKER, { type: 'FILTERED', to: [seeker], payload: { handle: f.handle, reason: f.reason }, human_readable: `${this.#label(f.handle)} filtered: ${f.reason}` });
    }

    // The seeker's own agent applies its private repeat limit; the broker only learns "skip".
    const peers = kept.filter((l) => {
      if (!me.repeatLimitReached(l.handle)) return true;
      this.#emit(seeker, {
        type: 'REJECT',
        to: [BROKER],
        payload: { handle: l.handle, reason: 'private preference' },
        human_readable: `${me.label}'s agent skips ${l.label} on its private repeat limit`,
        disclosure: { withheld: ['practice history'] },
      });
      return false;
    });

    this.#queue = rankPeers(mine, peers, this.#reliability).map((l) => l.handle);
    this.#tryNext();
  }

  /** A student answers the join request: 'accept' or 'decline'. */
  reply(id: string, choice: 'accept' | 'decline'): void {
    if (!this.#pair?.includes(id) || !['AWAITING_HUMANS', 'AWAITING_CONSENT'].includes(this.state) || this.#consents[id] !== 'pending') {
      throw new Error('No pending mock request for this student');
    }
    const a = this.#agent(id);
    if (choice === 'accept') {
      this.#consents = recordConsent(this.#consents, id, 'accepted');
      this.#emit(id, { type: 'CONSENT', to: [BROKER], payload: {}, human_readable: `${a.label}'s human said yes (join, and share name once both agree)`, disclosure: { shared: ['consent'] } });
      a.notify(this.#at(), 'text', "You're in ✅ Waiting on your partner.");
      if (allConsented(this.#consents)) return this.#confirm();
      if (this.state === 'AWAITING_HUMANS') this.#set('AWAITING_CONSENT');
      return;
    }

    const other = this.#pair.find((m) => m !== id)!;
    this.#emit(id, { type: 'DECLINE', to: [BROKER], payload: {}, human_readable: `${a.label}'s human said no`, disclosure: { withheld: ['reason'] } });
    a.notify(this.#at(), 'text', 'No worries. Nothing about you was shared.');
    this.#emit(BROKER, {
      type: 'DISSOLVED',
      to: [other],
      payload: { reason: "One person couldn't make it", revealed: [] },
      human_readable: "One person couldn't make it; nothing was revealed",
      disclosure: { withheld: ['who declined', 'identity'] },
    });
    this.#agent(other).notify(this.#at(), 'text', "Your mock partner couldn't make it. Nothing about you was shared.");
    this.#set('DECLINED');
    this.#pair = null;
    this.#window = null;
    this.#consents = {};
    if (id === this.#seeker) return; // the seeker opted out; nothing more to do
    this.#tryNext();
  }

  /** Either partner ends the current round (timer ran out or they're done). */
  endRound(id: string): void {
    if (!this.#pair?.includes(id) || (this.state !== 'ROUND_1' && this.state !== 'ROUND_2')) throw new Error('No round in progress');
    const n = this.state === 'ROUND_1' ? 1 : 2;
    const { interviewer, candidate } = this.seats!;
    this.#emit(BROKER, {
      type: 'COMPLETE',
      to: [...this.#pair],
      payload: { kind: 'round', n },
      human_readable: `Round ${n} done: ${this.#label(interviewer)} interviewed ${this.#label(candidate)}`,
    });
    if (n === 1) {
      this.#set('ROUND_2');
      this.#roundCards(2);
      return;
    }
    this.#set('SCORING');
    for (const m of this.#pair) {
      const other = this.#pair.find((x) => x !== m)!;
      this.#agent(m).notify(this.#at(), 'rubric', `How did ${first(this.#names.get(other)!)} do? Your scores go only to them, privately.`, true, { subject: other });
    }
  }

  /** Rubric scores + one note about the partner. Private to the partner; never in events. */
  submitScores(rater: string, rubric: Rubric, note: string): void {
    if (this.state !== 'SCORING' || !this.#pair?.includes(rater) || this.#submitted.has(rater)) throw new Error('No scores expected from this student');
    const subject = this.#pair.find((m) => m !== rater)!;
    this.#scores.submit(rater, subject, rubric, note);
    this.#submitted.add(rater);
    this.#emit(rater, {
      type: 'COMPLETE',
      to: [BROKER],
      payload: { kind: 'feedback', subject },
      human_readable: `${this.#label(rater)} sent private feedback to ${this.#label(subject)}`,
      disclosure: { withheld: ['scores', 'note'] },
    });
    this.#agent(rater).notify(this.#at(), 'text', `Sent privately ✅ Only ${first(this.#names.get(subject)!)} will see your scores.`);
    if (this.#submitted.size < 2) return;

    // Both in: each person now sees their own scores (and only their own).
    for (const m of this.#pair) {
      const other = this.#pair.find((x) => x !== m)!;
      this.#agent(m).recordPractice(other);
      this.#agent(m).notify(this.#at(), 'scores', "Your scores from tonight's mock. Only you can see these.", false, { subject: m });
    }
    this.#emit(BROKER, { type: 'COMPLETE', to: [...this.#pair], payload: { kind: 'done' }, human_readable: 'Mock swap complete; each person got their scores privately' });
    this.#set('COMPLETED');
  }

  // ---- "Practice with your agent" (only when no peer matches) ---------------------------------------

  practiceWithAgent(id: string): void {
    if (this.state !== 'NO_PEER' || id !== this.#seeker) {
      throw new NoPeerError('Practice with your agent is only offered when no peer matches');
    }
    const l = this.#listings.get(id)!;
    this.#solo = { index: 0, questions: questionPack(l.pipeline.company, l.round, l.needs, l.difficulty) };
    this.#set('SOLO');
    this.#emit(id, { type: 'CONSENT', to: [id], payload: { kind: 'solo' }, human_readable: `${this.#label(id)} chose to practice with their own agent` });
    this.#agent(id).notify(this.#at(), 'text', `Let's go 🎤 ${this.#solo.questions.length} questions from real ${l.pipeline.company} ${l.round.toLowerCase()} rounds, shared anonymously. Answer out loud, then tap Done.`);
    this.#soloAsk();
  }

  declineSolo(id: string): void {
    if (this.state !== 'NO_PEER' || id !== this.#seeker) throw new Error('Nothing to decline');
    this.#agent(id).notify(this.#at(), 'text', "No problem. I'll ping you if someone in your round opens up.");
  }

  /** The student finished answering the current practice question. */
  soloDone(id: string): void {
    if (this.state !== 'SOLO' || id !== this.#seeker || !this.#solo) throw new Error('No practice question open');
    const s = this.#solo;
    const q = s.questions[s.index];
    if (!q) throw new Error('No practice question open');
    this.#agent(id).notify(this.#at(), 'text', `What interviewers look for: ${q.lookFor}`);
    s.index += 1;
    if (s.index < s.questions.length) return this.#soloAsk();
    this.#agent(id).notify(this.#at(), 'solo-rubric', 'How did that feel? Rate yourself. This stays on your phone.', true, { subject: id });
  }

  submitSelfScores(id: string, rubric: Rubric): void {
    if (this.state !== 'SOLO' || id !== this.#seeker || !this.#solo || this.#solo.index < this.#solo.questions.length) {
      throw new Error('No self-assessment expected');
    }
    this.#scores.submit('agent', id, rubric, 'Self-assessment from practice with your agent', true);
    this.#emit(id, { type: 'COMPLETE', to: [id], payload: { kind: 'solo-done' }, human_readable: `${this.#label(id)} finished a practice mock with their agent`, disclosure: { withheld: ['scores'] } });
    this.#agent(id).notify(this.#at(), 'scores', 'Saved privately. Here is how you rated yourself:', false, { subject: id });
    this.#set('COMPLETED');
  }

  // ---- internals -----------------------------------------------------------------------------------

  #tryNext(): void {
    const next = this.#queue.shift();
    if (!next) return this.#noPeer();
    const seeker = this.#seeker;
    const [me, them] = [this.#listings.get(seeker)!, this.#listings.get(next)!];
    const iTeach = me.offers.filter((s) => them.needs.includes(s));
    const theyTeach = them.offers.filter((s) => me.needs.includes(s));

    this.#set('MATCH_FOUND');
    this.#emit(BROKER, {
      type: 'DISCOVER',
      to: [seeker, next],
      payload: { match: { members: [seeker, next], teaches: { [seeker]: iTeach, [next]: theyTeach } }, backups: [...this.#queue] },
      human_readable:
        `Mock pair: ${this.#label(seeker)} ↔ ${this.#label(next)}` +
        (iTeach.length || theyTeach.length ? ` (covers ${[...iTeach, ...theyTeach].join(' + ')})` : ' (same round, no overlap in weak spots)') +
        (this.#queue.length ? `. Backup: ${this.#queue.map((h) => this.#label(h)).join(', ')}` : ''),
    });

    const window = mockSlot(me.availability!, them.availability!)!;
    this.#set('NEGOTIATING');
    const proposal = this.#emit(BROKER, {
      type: 'PROPOSE',
      to: [seeker, next],
      payload: { kind: 'schedule', window },
      human_readable: `Proposed ${range12(window.start, window.end)}: the first hour both are free`,
      disclosure: { shared: ['proposed time'], withheld: ['identity'] },
    });
    let rejected = false;
    for (const id of [seeker, next]) {
      const d = this.#agent(id).evaluate(window);
      if (d.type === 'REJECT') rejected = true;
      this.#emit(id, {
        type: d.type === 'REJECT' ? 'REJECT' : 'ACCEPT',
        to: [BROKER],
        payload: { in_reply_to: proposal.id, ...(d.type === 'REJECT' ? { reason: d.reason } : {}) },
        human_readable: d.type === 'REJECT' ? `${this.#label(id)}'s agent: that time doesn't work (${d.reason})` : `${this.#label(id)}'s agent: ${range12(window.start, window.end)} works`,
        disclosure: { withheld: ['availability'] },
      });
    }
    if (rejected) {
      this.#emit(BROKER, { type: 'CONFLICT', to: [seeker, next], payload: { reason: 'no workable hour' }, human_readable: 'No hour works for both; trying the next partner' });
      return this.#tryNext();
    }

    this.#pair = [seeker, next];
    this.#window = window;
    this.#consents = newConsent(this.#pair);
    this.#emit(BROKER, {
      type: 'PROPOSE',
      to: [seeker, next],
      payload: { kind: 'join', window },
      human_readable: `Both agents invited to a mock swap at ${range12(window.start, window.end)}`,
      disclosure: { shared: ['time', 'round'], withheld: ['identity'] },
    });
    const when = range12(window.start, window.end);
    const { company } = me.pipeline;
    const round = me.round.toLowerCase();
    for (const [id, gives, gets] of [[seeker, iTeach, theyTeach], [next, theyTeach, iTeach]] as const) {
      const d = this.#agent(id).join();
      this.#emit(id, {
        type: 'ESCALATE',
        to: [BROKER],
        payload: { actions: d.type === 'ESCALATE' ? d.actions : [] },
        human_readable: `${this.#label(id)}'s agent: joining a mock needs its human`,
        disclosure: { withheld: ['identity'] },
      });
      const fit = gets.length ? ` They're strong in ${gets.join(', ')}; you're strong in ${gives.join(', ') || 'other areas'}.` : '';
      const lead = id === seeker ? `Found you a mock partner in your ${company} ${round} round 🎤` : `Someone in your ${company} ${round} round wants to swap mock interviews 🎤`;
      this.#agent(id).notify(this.#at(), 'ask', `${lead}${fit} Tonight ${when}: one of you interviews for 30 min, then you swap. Names stay hidden until you both say yes. In?`, true);
    }
    this.#set('AWAITING_HUMANS');
  }

  #confirm(): void {
    const [a, b] = this.#pair!;
    for (const m of [a, b]) {
      const other = m === a ? b : a;
      const identity = this.#vault.read(this.#consents, m, other);
      this.#names.set(other, identity.name);
      this.#emit(BROKER, { type: 'REVEAL', to: [m], payload: { identities: [identity] }, human_readable: `Name unlocked for ${this.#label(m)}: ${identity.name}`, disclosure: { shared: ['name', 'email', 'discord'] } });
    }
    this.#set('CONFIRMED');
    const when = range12(this.#window!.start, this.#window!.end);
    for (const [interviewer, candidate] of [[a, b], [b, a]] as const) {
      const l = this.#listings.get(candidate)!;
      const questions = questionPack(l.pipeline.company, l.round, l.needs, l.difficulty);
      this.#emit(BROKER, {
        type: 'PROPOSE',
        to: [interviewer],
        payload: { kind: 'pack', candidate, count: questions.length, areas: [...new Set(questions.map((q) => q.area))] },
        human_readable: `Question pack ready for ${this.#label(interviewer)}: ${questions.length} questions from anonymized ${l.pipeline.company} ${l.round.toLowerCase()} reports`,
        disclosure: { shared: ['question pack', 'rubric'], withheld: ['report authors'] },
      });
      const them = first(this.#names.get(candidate)!);
      this.#agent(interviewer).notify(this.#at(), 'text', `🔓 It's on! You're swapping mocks with ${them} tonight, ${when}.`);
      this.#agent(interviewer).notify(this.#at(), 'pack', `Your question pack for interviewing ${them}, from real ${l.pipeline.company} ${l.round.toLowerCase()} rounds (anonymized):`, false, { questions, candidate });
    }
    this.#set('ROUND_1');
    this.#roundCards(1);
  }

  #roundCards(n: 1 | 2) {
    const { interviewer, candidate } = this.seats!;
    const [iName, cName] = [first(this.#names.get(interviewer)!), first(this.#names.get(candidate)!)];
    this.#agent(interviewer).notify(this.#at(), 'round', `Round ${n} of 2 · You're interviewing ${cName}. Use your question pack and score as you go.`, false, { n, role: 'interviewer' });
    this.#agent(candidate).notify(this.#at(), 'round', `Round ${n} of 2 · ${iName} is interviewing you. Think out loud!`, false, { n, role: 'candidate' });
  }

  #noPeer() {
    const id = this.#seeker;
    const l = this.#listings.get(id)!;
    this.#set('NO_PEER');
    this.#emit(BROKER, { type: 'DISSOLVED', to: [id], payload: { reason: 'No peer in this round fits right now', revealed: [] }, human_readable: `No one else in ${l.pipeline.company} ${l.round.toLowerCase()} fits right now` });
    this.#agent(id).notify(
      this.#at(),
      'solo-offer',
      `No one else in your ${l.pipeline.company} ${l.round.toLowerCase()} round is free for a swap right now. Want to practice with me instead? I'll use real questions from past ${l.pipeline.company} interviews.`,
      true,
    );
  }

  #soloAsk() {
    const s = this.#solo!;
    const q = s.questions[s.index];
    this.#agent(this.#seeker).notify(this.#at(), 'solo-question', `Question ${s.index + 1} of ${s.questions.length} · ${q.area}: ${q.prompt}`, true, { area: q.area });
  }

  #load(seed: MockProfile[]) {
    this.state = 'IDLE';
    this.#history = [];
    this.#agents = new Map(seed.map((p) => [p.agent_id, new MockAgent(p)]));
    this.#log = new EventLog('mock-1');
    this.#vault = new IdentityVault(seed);
    this.#scores = new ScoreVault();
    this.#listings = new Map();
    this.#seeker = '';
    this.#queue = [];
    this.#pair = null;
    this.#window = null;
    this.#consents = {};
    this.#submitted = new Set();
    this.#solo = null;
    this.#names = new Map();
  }

  #set(to: MockState) {
    const from = this.state;
    this.state = step(from, to);
    this.#history.push({ from, to, afterEvents: this.#at() });
  }

  #emit(from: string, draft: Draft): AgentEvent {
    return this.#log.append(from, draft);
  }

  #at() {
    return this.#log.all().length;
  }

  #label(id: string) {
    return this.#agents.get(id)?.label ?? id;
  }

  #agent(id: string): MockAgent {
    const a = this.#agents.get(id);
    if (!a) throw new Error(`Unknown student ${id}`);
    return a;
  }
}
