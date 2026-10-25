import { allConsented, newConsent, recordConsent, type ConsentMap } from '../../engine/consent';
import { BROKER, EventLog } from '../../engine/events';
import { IdentityVault } from '../../engine/identity';
import { schedule } from '../../engine/scheduler';
import { fromMinutes, toMinutes } from '../../engine/time';
import type { AgentEvent, AgentProfile, Draft, Identity, TimeWindow } from '../../engine/types';
import { range12 } from '../../ui/copy';
import { machine } from '../shared/machine';
import type { Rating } from '../trust/ledger';
import { trust as sharedTrust, type TrustNetwork } from '../trust/network';
import { personOf } from '../trust/people';
import { starterPackFor, unlockedPacks, type QuestionPack } from './packs';
import { PointsLedger, levelOf, perksFor, type PointEntry, type Standing } from './points';
import { ProjectBoard } from './projects';
import { DEMO_WEEK, JUNIOR_PROFILES, MENTOR_RULES, SENIOR_RULES, SESSION_MINUTES, STANDING_SEED, TODAY, createCommunitySeed, type MentorRules, type NeedInput } from './seed';

export type NeedState = 'OPEN' | 'MATCHED' | 'BOOKED' | 'DONE' | 'EXPIRED' | 'CANCELLED';

const step = machine<NeedState>({
  OPEN: ['MATCHED', 'EXPIRED', 'CANCELLED'],
  MATCHED: ['OPEN', 'BOOKED', 'EXPIRED', 'CANCELLED'],
  BOOKED: ['DONE'],
  DONE: [],
  EXPIRED: [],
  CANCELLED: [],
});

export interface Need {
  id: string;
  owner: string;
  input: NeedInput;
  /** Posting order, for ties in matching. */
  posted: number;
  state: NeedState;
  mentor: string | null;
  window: TimeWindow | null;
  /** Mentors whose agents already checked this need (and passed, or their human said no). */
  checked: string[];
}

/** What the broker and every mentor agent see: no name, no exact deadline, no school year. */
export interface Listing {
  need: string;
  handle: string;
  company: string;
  round: string;
  topic: string;
  deadline: string;
  newcomer: boolean;
}

export interface RuleCheck {
  id: 'topic' | 'capacity' | 'evenings';
  label: string;
  pass: boolean;
  observed: string;
}

export type CommunityMsgKind = 'text' | 'ask-help' | 'ask-match' | 'booked' | 'ask-confirm' | 'rate' | 'points' | 'evidence' | 'capacity' | 'packs' | 'shortlist' | 'ask-hours' | 'ask-leave';

export interface CommunityMessage {
  id: number;
  /** Shown once this many events have been replayed. */
  at: number;
  kind: CommunityMsgKind;
  text: string;
  needsHuman: boolean;
  data?: Record<string, unknown>;
}

export interface NeedChange {
  need: string;
  from: NeedState | 'NONE';
  to: NeedState;
  afterEvents: number;
}

export class PointsCannotBuyReferralError extends Error {}

export const REFERRAL_RULE =
  "Points can't buy a referral. A referral only ever comes from a referrer's own decision after a chat; your mentoring shows up in your proof of work instead.";

/** "this week" / "next week" / "later": the only form of a deadline that leaves the newcomer's agent. */
export function deadlineText(deadline: string, today: string): string {
  const days = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= 7 ? 'this week' : days <= 14 ? 'next week' : 'later';
}

const EVENING = { start: '17:00', end: '23:59' };
const first = (name: string) => name.split(' ')[0];

/**
 * Pay it forward: standing help requests. A newcomer's agent publishes an anonymous need and keeps it open;
 * mentor agents decide on their own from their human's PRIVATE capacity rules; both humans say yes before names
 * unlock; points come only after both confirm the session happened.
 */
export class CommunityHub {
  #log!: EventLog;
  #vault!: IdentityVault;
  #profiles = new Map<string, AgentProfile>();
  #rules = new Map<string, MentorRules>();
  #needs: Need[] = [];
  #consents = new Map<string, ConsentMap>();
  #phones = new Map<string, CommunityMessage[]>();
  #history: NeedChange[] = [];
  #online: string[] = [];
  #listings = new Map<string, Listing>();
  #ledger!: PointsLedger;
  #today = TODAY;
  /** Each newcomer's one free starter pack. */
  #starters = new Map<string, string>();
  #projects!: ProjectBoard;

  constructor(
    private readonly trust: TrustNetwork = sharedTrust,
    private readonly seed: () => AgentProfile[] = createCommunitySeed,
    private readonly rules: Record<string, MentorRules> = MENTOR_RULES,
    private readonly standing: Record<string, Standing> = STANDING_SEED,
    private readonly startOnline: string[] = [],
  ) {
    this.reset();
  }

  reset(): void {
    const seed = this.seed();
    this.#profiles = new Map(seed.map((p) => [p.agent_id, p]));
    this.#vault = new IdentityVault(seed);
    this.#rules = new Map(Object.entries(structuredClone(this.rules)));
    this.#ledger = new PointsLedger(this.standing);
    this.#log = new EventLog('community-1');
    this.#needs = [];
    this.#consents = new Map();
    this.#phones = new Map();
    this.#history = [];
    this.#listings = new Map();
    this.#online = [...this.startOnline];
    this.#today = TODAY;
    this.#starters = new Map();
    // Same points ledger and identity gate as help requests: one points system, one consent rule.
    this.#projects = new ProjectBoard(this.#ledger, this.#vault, (id) => this.#label(id), JUNIOR_PROFILES, SENIOR_RULES);
  }

  /** Project collaboration board (Phase C). */
  get projects(): ProjectBoard {
    return this.#projects;
  }

  /** Question packs this person has unlocked: by level, with a newcomer's free starter first. */
  packsFor(person: string): QuestionPack[] {
    return unlockedPacks(this.#ledger.levelOf(person), this.#starters.get(person));
  }

  starterOf(person: string): string | null {
    return this.#starters.get(person) ?? null;
  }

  // ---- read access ---------------------------------------------------------------------------------

  events(): AgentEvent[] {
    return this.#log.all();
  }

  history(): NeedChange[] {
    return [...this.#history];
  }

  phone(id: string): CommunityMessage[] {
    return structuredClone(this.#phones.get(id) ?? []);
  }

  needs(): Need[] {
    return structuredClone(this.#needs);
  }

  need(id: string): Need | null {
    const n = this.#needs.find((x) => x.id === id);
    return n ? structuredClone(n) : null;
  }

  /** The anonymous listing exactly as the broker and mentor agents received it. */
  listing(needId: string): Listing | null {
    const l = this.#listings.get(needId);
    return l ? { ...l } : null;
  }

  get points(): Pick<PointsLedger, 'pointsOf' | 'levelOf' | 'standing' | 'entries' | 'isNewcomer' | 'confirmedBy'> {
    return this.#ledger;
  }

  online(): string[] {
    return [...this.#online];
  }

  /** A mentor's private rules, readable only by that mentor's own agent. */
  rulesFor(requester: string, mentor: string): MentorRules | null {
    return requester === mentor && this.#rules.has(mentor) ? { ...this.#rules.get(mentor)! } : null;
  }

  /** Names unlock only after both sides of a match said yes. */
  getIdentity(requester: string, target: string): Identity {
    const need = this.#needs.find((n) => n.mentor && [n.owner, n.mentor].includes(requester) && [n.owner, n.mentor].includes(target));
    return this.#vault.read(need ? this.#consents.get(need.id) ?? {} : {}, requester, target);
  }

  /** True while this person still owes an answer on a match. */
  awaiting(needId: string, person: string): boolean {
    const n = this.#needs.find((x) => x.id === needId);
    return Boolean(n && n.state === 'MATCHED' && this.#consents.get(needId)?.[person] === 'pending');
  }

  sessionId(needId: string) {
    return `help-${needId}`;
  }

  // ---- flow ----------------------------------------------------------------------------------------

  /** A newcomer posts a need. No circle forms (nothing to trade yet), so the agent publishes a standing request. */
  postNeed(owner: string, input: NeedInput): string {
    const p = this.#profiles.get(owner);
    if (!p) throw new Error('Unknown student');
    const id = `need-${this.#needs.length + 1}`;
    const need: Need = { id, owner, input: { ...input }, posted: this.#needs.length, state: 'OPEN', mentor: null, window: null, checked: [] };
    this.#needs.push(need);
    const when = deadlineText(input.deadline, this.#today);
    this.#emit(owner, {
      type: 'TRIGGER',
      to: [BROKER],
      payload: { kind: 'need', company: input.company, round: input.round, topic: input.topic },
      human_readable: `${p.label} needs help with ${input.topic} for a ${input.company} ${input.round.toLowerCase()} round`,
      disclosure: { shared: ['company', 'round', 'topic'], withheld: ['identity'] },
    });
    if (!p.offers.length) {
      this.#emit(BROKER, {
        type: 'CONFLICT',
        to: [owner],
        payload: { kind: 'no-circle', reason: 'nothing to trade yet' },
        human_readable: `No prep circle: ${p.label} has nothing to trade yet`,
      });
    }
    const listing: Listing = {
      need: id,
      handle: p.label,
      company: input.company,
      round: input.round,
      topic: input.topic,
      deadline: when,
      newcomer: this.#ledger.isNewcomer(owner),
    };
    this.#listings.set(id, listing);
    this.#emit(owner, {
      type: 'DISCOVER',
      to: [BROKER],
      payload: { kind: 'listing', listing },
      human_readable: `${p.label}'s agent published an anonymous help request (deadline: ${when})`,
      disclosure: { shared: ['company', 'round', 'topic'], abstracted: ['deadline'], withheld: ['identity', 'exact deadline', 'school year'] },
    });
    this.#change(need, 'OPEN', 'NONE');
    this.#notify(
      owner,
      'text',
      `A prep circle needs something to trade, and you're just starting, so I posted a help request instead: ${input.topic} for your ${input.company} ${input.round.toLowerCase()} round, ${when}. It's anonymous, and it stays open until your deadline.`,
    );
    if (this.#ledger.isNewcomer(owner) && !this.#starters.has(owner)) {
      const starter = starterPackFor({ company: input.company, topic: input.topic });
      this.#starters.set(owner, starter);
      this.#notify(owner, 'packs', 'While you wait: every newcomer gets one question pack free. Here is yours, matched to your round.', false, { packs: [starter], starter: true });
    }
    this.#rematch();
    if (this.need(id)!.state === 'OPEN') {
      this.#notify(owner, 'text', "No mentor has room right now. I'll keep it open and check again whenever one comes online. You can cancel anytime.");
    }
    return id;
  }

  /** A mentor's agent comes online: open needs get re-matched. */
  mentorOnline(mentor: string): void {
    if (!this.#rules.has(mentor)) throw new Error('Not a mentor in this network');
    if (this.#online.includes(mentor)) return;
    this.#online.push(mentor);
    this.#emit(mentor, {
      type: 'TRIGGER',
      to: [BROKER],
      payload: { kind: 'online' },
      human_readable: `${this.#label(mentor)}'s agent came online and can take help requests`,
      disclosure: { withheld: ['private rules'] },
    });
    this.#rematch();
  }

  /** Both humans answer the match. A no costs nothing and keeps the need open for someone else. */
  reply(needId: string, person: string, choice: 'accept' | 'decline'): void {
    const need = this.#get(needId);
    const consents = this.#consents.get(needId);
    if (need.state !== 'MATCHED' || !consents || consents[person] !== 'pending') throw new Error('No pending match for this person');
    const mentor = need.mentor!;
    if (choice === 'decline') {
      this.#emit(person, {
        type: 'DECLINE',
        to: [BROKER],
        payload: { kind: 'help', need: needId, points: 'unchanged' },
        human_readable: `${this.#label(person)}'s human said no. No points lost, nothing shared`,
        disclosure: { withheld: ['identity', 'reason'] },
      });
      this.#release(need);
      this.#consents.delete(needId);
      need.mentor = null;
      need.window = null;
      this.#change(need, 'OPEN');
      this.#notify(person, 'text', person === mentor ? 'No problem. Saying no never costs points, and they never learned who you are.' : "OK. Nothing about you was shared. Your request stays open for another mentor.");
      if (person === mentor) this.#notify(need.owner, 'text', "That mentor can't take it this time. Your request is still open, and nothing about you was shared.");
      else this.#notify(mentor, 'text', "They're going a different way this time. No names were shared, and it costs you nothing.");
      this.#rematch();
      return;
    }
    this.#consents.set(needId, recordConsent(consents, person, 'accepted'));
    this.#emit(person, {
      type: 'CONSENT',
      to: [BROKER],
      payload: { kind: 'help', need: needId },
      human_readable: `${this.#label(person)}'s human said yes (and to sharing names)`,
      disclosure: { shared: ['consent'] },
    });
    if (!allConsented(this.#consents.get(needId)!)) {
      this.#notify(person, 'text', "You're in. Waiting on the other side; names unlock once you both say yes.");
      return;
    }
    this.#book(need);
  }

  /** After the session: each side confirms it happened. Points are settled only once both have. */
  confirm(needId: string, person: string): PointEntry | null {
    const need = this.#get(needId);
    if (need.state !== 'BOOKED' || ![need.owner, need.mentor].includes(person)) throw new Error('No booked session to confirm');
    const sessionId = this.sessionId(needId);
    if (this.#ledger.confirmedBy(sessionId).includes(person)) return null;
    const wasNewcomer = this.#ledger.isNewcomer(need.owner);
    const entry = this.#ledger.confirm(sessionId, person);
    this.#emit(person, {
      type: 'COMPLETE',
      to: [BROKER],
      payload: { kind: 'confirm', need: needId },
      human_readable: `${this.#label(person)} confirmed the session happened`,
    });
    if (!entry) {
      this.#notify(person, 'text', 'Thanks. Points only count once you both confirm.');
      return null;
    }
    const mentor = need.mentor!;
    this.trust.recordSession({
      id: sessionId,
      kind: 'mentor',
      members: [personOf(need.owner), personOf(mentor)],
      taught: { [personOf(mentor)]: [need.input.topic] },
      newcomers: wasNewcomer ? [personOf(need.owner)] : [],
    });
    this.#emit(BROKER, {
      type: 'COMPLETE',
      to: [mentor],
      payload: { kind: 'points', entry },
      human_readable: entry.capped
        ? `${this.#label(mentor)}: session counted, no points (${entry.reason})`
        : `${this.#label(mentor)} +${entry.points} points (${entry.base} x ${entry.multiplier}: ${entry.reason})`,
      disclosure: { shared: ['points'] },
    });
    if (entry.levelAfter !== entry.levelBefore) {
      this.#emit(BROKER, {
        type: 'COMPLETE',
        to: [mentor],
        payload: { kind: 'level-up', from: entry.levelBefore, to: entry.levelAfter },
        human_readable: `${this.#label(mentor)} reached ${entry.levelAfter}`,
      });
    }
    this.#change(need, 'DONE');
    this.#notify(mentor, 'points', entry.capped ? 'Session counted. No points this time: you two already earned points twice this week.' : `You both confirmed. +${entry.points} points.`, false, { entry });
    if (entry.levelAfter !== entry.levelBefore) {
      const packs = unlockedPacks(entry.levelAfter, this.#starters.get(mentor));
      this.#notify(mentor, 'packs', `${entry.levelAfter} unlocks ${packs.length} question packs, built from anonymized interview reports.`, false, { packs: packs.map((p) => p.id) });
    }
    for (const id of [need.owner, mentor]) {
      this.#notify(id, 'rate', 'How did it go? Rate them privately. Nobody ever sees a single rating.', true, { need: needId, other: id === mentor ? need.owner : mentor });
    }
    return entry;
  }

  /** Private rating after a confirmed session, into the shared trust ledger. */
  rate(needId: string, rater: string, rating: Rating): void {
    const need = this.#get(needId);
    if (need.state !== 'DONE' || ![need.owner, need.mentor].includes(rater)) throw new Error('Only the two people in a confirmed session can rate it');
    const other = rater === need.mentor ? need.owner : need.mentor!;
    this.trust.rate(personOf(rater), personOf(other), this.sessionId(needId), rating);
    this.#emit(rater, { type: 'COMPLETE', to: [BROKER], payload: { kind: 'rated', need: needId }, human_readable: `${this.#label(rater)} rated privately`, disclosure: { withheld: ['rating'] } });
    if (rater === need.mentor) this.#notify(rater, 'evidence', 'Your proof of work, updated. Referrers see your mentoring here, never your points.', false);
    else this.#notify(rater, 'text', 'Thanks. Pay it forward when you can: helping the next newcomer earns you points too.');
  }

  hasRated(needId: string, rater: string): boolean {
    const need = this.#get(needId);
    const other = rater === need.mentor ? need.owner : need.mentor;
    return Boolean(other) && this.trust.hasRated(personOf(rater), personOf(other!), this.sessionId(needId));
  }

  /** The owner can cancel anytime before the session is booked. Nothing is shared, nobody loses points. */
  cancel(needId: string, by: string): void {
    const need = this.#get(needId);
    if (by !== need.owner) throw new Error('Only the person who asked can cancel');
    if (need.state !== 'OPEN' && need.state !== 'MATCHED') throw new Error('Nothing to cancel');
    const mentor = need.mentor;
    this.#release(need);
    this.#consents.delete(needId);
    this.#emit(need.owner, { type: 'DISSOLVED', to: mentor ? [BROKER, mentor] : [BROKER], payload: { kind: 'cancelled', need: needId }, human_readable: 'The newcomer withdrew the request', disclosure: { withheld: ['identity', 'reason'] } });
    this.#change(need, 'CANCELLED');
    this.#notify(need.owner, 'text', 'Cancelled. Nothing about you was shared.');
    if (mentor) this.#notify(mentor, 'text', 'They withdrew the request. No names were shared, and it costs you nothing.');
  }

  /** Needs past their deadline close on their own. */
  expire(today: string): string[] {
    this.#today = today;
    const out: string[] = [];
    for (const need of this.#needs) {
      if ((need.state !== 'OPEN' && need.state !== 'MATCHED') || need.input.deadline >= today) continue;
      this.#release(need);
      this.#consents.delete(need.id);
      this.#emit(BROKER, { type: 'DISSOLVED', to: [need.owner], payload: { kind: 'expired', need: need.id }, human_readable: 'A help request passed its deadline and closed', disclosure: { withheld: ['identity'] } });
      this.#change(need, 'EXPIRED');
      this.#notify(need.owner, 'text', 'Your deadline passed, so I closed the request. Post a new one anytime.');
      out.push(need.id);
    }
    return out;
  }

  /** Points are never spent. In particular, there is no way to turn them into a referral. */
  redeemForReferral(person: string): never {
    void person;
    throw new PointsCannotBuyReferralError(REFERRAL_RULE);
  }

  // ---- internals -----------------------------------------------------------------------------------

  /**
   * Open needs, highest-priority asker first (a level perk), then oldest; each tries online mentors in order.
   * A mentor gets one ask at a time: someone waiting on their answer isn't offered another.
   */
  #rematch() {
    const busy = new Set(this.#needs.filter((n) => n.state === 'MATCHED').map((n) => n.mentor));
    const open = this.#needs
      .filter((n) => n.state === 'OPEN')
      .sort((a, b) => perksFor(levelOf(this.#ledger.pointsOf(b.owner))).matchingPriority - perksFor(levelOf(this.#ledger.pointsOf(a.owner))).matchingPriority || a.posted - b.posted);
    for (const need of open) {
      for (const mentor of this.#online) {
        if (mentor === need.owner || busy.has(mentor) || need.checked.includes(mentor)) continue;
        need.checked.push(mentor);
        const check = this.#capacityCheck(mentor, need);
        this.#emit(mentor, {
          type: check.pass ? 'ACCEPT' : 'REJECT',
          to: [mentor],
          payload: { kind: 'capacity', need: need.id, results: check.results },
          human_readable: check.pass ? `${this.#label(mentor)}'s agent: fits its human's rules` : `${this.#label(mentor)}'s agent: doesn't fit its human's rules`,
          disclosure: { withheld: ['private rules'] },
        });
        if (check.pass) {
          this.#match(need, mentor, check.window!, check.results);
          busy.add(mentor);
          break;
        }
      }
    }
  }

  #capacityCheck(mentor: string, need: Need): { pass: boolean; results: RuleCheck[]; window: TimeWindow | null } {
    const rules = this.#rules.get(mentor)!;
    const owner = this.#profiles.get(need.owner)!;
    const mine = this.#profiles.get(mentor)!;
    const newcomer = this.#ledger.isNewcomer(need.owner);
    const availability = rules.eveningsOnly ? clip(mine.availability, EVENING) : mine.availability;
    const slot = schedule([
      { availability, min_session_minutes: SESSION_MINUTES },
      { availability: owner.availability, min_session_minutes: SESSION_MINUTES },
    ]);
    const window = slot.ok ? { start: slot.window.start, end: fromMinutes(toMinutes(slot.window.start) + SESSION_MINUTES) } : null;
    const results: RuleCheck[] = [
      { id: 'topic', label: `Teaches ${need.input.topic}`, pass: rules.topics.includes(need.input.topic), observed: `you teach ${rules.topics.join(', ')}` },
      newcomer
        ? { id: 'capacity', label: `Up to ${rules.maxNewcomersPerWeek} newcomers a week`, pass: rules.newcomersThisWeek < rules.maxNewcomersPerWeek, observed: `${rules.newcomersThisWeek} of ${rules.maxNewcomersPerWeek} this week` }
        : { id: 'capacity', label: 'Room this week', pass: true, observed: 'not a newcomer, no limit' },
      { id: 'evenings', label: rules.eveningsOnly ? 'Evenings only' : 'Any time you are free', pass: Boolean(window), observed: window ? range12(window.start, window.end) : 'no shared time' },
    ];
    return { pass: results.every((r) => r.pass), results, window };
  }

  #match(need: Need, mentor: string, window: TimeWindow, results: RuleCheck[]) {
    const rules = this.#rules.get(mentor)!;
    if (this.#ledger.isNewcomer(need.owner)) rules.newcomersThisWeek += 1;
    need.mentor = mentor;
    need.window = window;
    this.#consents.set(need.id, newConsent([need.owner, mentor]));
    const when = range12(window.start, window.end);
    const listing = this.#listings.get(need.id)!;
    this.#emit(BROKER, {
      type: 'PROPOSE',
      to: [need.owner, mentor],
      payload: { kind: 'match', need: need.id, window, topic: need.input.topic },
      human_readable: `Matched: ${this.#label(mentor)} can help with ${need.input.topic}, ${when}`,
      disclosure: { shared: ['topic', 'proposed time'], withheld: ['identity', 'private rules'] },
    });
    for (const id of [need.owner, mentor]) {
      this.#emit(id, { type: 'ESCALATE', to: [BROKER], payload: { kind: 'help', need: need.id }, human_readable: `${this.#label(id)}'s agent asks its human` });
    }
    this.#change(need, 'MATCHED');
    this.#notify(mentor, 'capacity', 'Your agent checked a new help request against your private rules: a fit.', false, { results });
    this.#notify(
      mentor,
      'ask-help',
      `A newcomer needs help with ${listing.topic} for a ${listing.company} ${listing.round.toLowerCase()} round, ${listing.deadline}. ${SESSION_MINUTES} minutes tonight, ${when}. Names unlock only if you both say yes. Help them?`,
      true,
      { need: need.id, window, topic: listing.topic, company: listing.company, round: listing.round },
    );
    this.#notify(need.owner, 'ask-match', `A mentor can help with ${need.input.topic}: ${SESSION_MINUTES} minutes tonight, ${when}. Names unlock only if you both say yes. In?`, true, { need: need.id });
  }

  #book(need: Need) {
    const mentor = need.mentor!;
    const consents = this.#consents.get(need.id)!;
    for (const [me, other] of [[need.owner, mentor], [mentor, need.owner]] as const) {
      const identity = this.#vault.read(consents, me, other);
      this.#emit(BROKER, { type: 'REVEAL', to: [me], payload: { identities: [identity] }, human_readable: `Name unlocked for ${this.#label(me)}: ${identity.name}`, disclosure: { shared: ['name', 'email', 'discord'] } });
    }
    this.#ledger.register({ id: this.sessionId(need.id), helper: mentor, helped: need.owner, week: DEMO_WEEK, topic: need.input.topic });
    this.#change(need, 'BOOKED');
    const when = range12(need.window!.start, need.window!.end);
    for (const [me, other] of [[need.owner, mentor], [mentor, need.owner]] as const) {
      const name = this.#vault.read(consents, me, other).name;
      this.#notify(me, 'booked', `You're meeting ${first(name)} tonight, ${when}.`, false, { need: need.id, with: other, when, topic: need.input.topic });
      this.#notify(me, 'ask-confirm', 'Tap after your session. Points only count once you both confirm it happened.', true, { need: need.id });
    }
    this.#rematch(); // the mentor answered, so they can be offered the next open need
  }

  #release(need: Need) {
    if (need.state === 'MATCHED' && need.mentor && this.#ledger.isNewcomer(need.owner)) {
      const rules = this.#rules.get(need.mentor)!;
      rules.newcomersThisWeek = Math.max(0, rules.newcomersThisWeek - 1);
    }
  }

  #get(needId: string): Need {
    const n = this.#needs.find((x) => x.id === needId);
    if (!n) throw new Error('No such request');
    return n;
  }

  #change(need: Need, to: NeedState, from: NeedState | 'NONE' = need.state) {
    if (from !== 'NONE') need.state = step(from, to);
    else need.state = to;
    this.#history.push({ need: need.id, from, to, afterEvents: this.#log.all().length });
  }

  #notify(id: string, kind: CommunityMsgKind, text: string, needsHuman = false, data?: Record<string, unknown>) {
    const list = this.#phones.get(id) ?? [];
    list.push({ id: list.length + 1, at: this.#log.all().length, kind, text, needsHuman, data });
    this.#phones.set(id, list);
  }

  #emit(from: string, draft: Draft): AgentEvent {
    return this.#log.append(from, draft);
  }

  #label(id: string) {
    return this.#profiles.get(id)?.label ?? id;
  }
}

/** Availability clipped to a window (e.g. evenings only). */
function clip(list: TimeWindow[], to: TimeWindow): TimeWindow[] {
  return list
    .map((w) => ({ start: fromMinutes(Math.max(toMinutes(w.start), toMinutes(to.start))), end: fromMinutes(Math.min(toMinutes(w.end), toMinutes(to.end))) }))
    .filter((w) => toMinutes(w.end) > toMinutes(w.start));
}
