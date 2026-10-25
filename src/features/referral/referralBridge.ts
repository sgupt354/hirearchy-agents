import { allConsented, newConsent, recordConsent, type ConsentMap } from '../../engine/consent';
import { BROKER, EventLog } from '../../engine/events';
import { IdentityVault } from '../../engine/identity';
import { evaluateJoin, evaluateSchedule } from '../../engine/negotiation';
import { schedule } from '../../engine/scheduler';
import { fromMinutes, toMinutes } from '../../engine/time';
import type { AgentEvent, AgentProfile, Draft, Identity, TimeWindow } from '../../engine/types';
import { range12 } from '../../ui/copy';
import { machine } from '../shared/machine';
import type { EvidenceStage1, EvidenceStage2 } from '../trust/evidence';
import { trust as sharedTrust, type TrustNetwork } from '../trust/network';
import { fitCheck, type FitResult } from './rules';
import { CHAT_MINUTES, OPENING, REFERRER, REFERRER_RULES, createReferralSeed, type ReferralOpening, type ReferrerRules } from './seed';

export type ReferralState =
  | 'IDLE'
  | 'OFFERED'
  | 'WITHDRAWN'
  | 'FIT_CHECK'
  | 'NOT_A_FIT'
  | 'NEGOTIATING'
  | 'AWAITING_HUMANS'
  | 'AWAITING_CONSENT'
  | 'DECLINED'
  | 'CONFIRMED'
  | 'CHAT_DONE'
  | 'REFERRED'
  | 'NOT_YET'
  | 'NO_REFERRAL';

const step = machine<ReferralState>({
  IDLE: ['OFFERED'],
  OFFERED: ['FIT_CHECK', 'WITHDRAWN'],
  WITHDRAWN: [],
  FIT_CHECK: ['NOT_A_FIT', 'NEGOTIATING'],
  NOT_A_FIT: [],
  NEGOTIATING: ['AWAITING_HUMANS', 'NOT_A_FIT'],
  AWAITING_HUMANS: ['AWAITING_CONSENT', 'DECLINED'],
  AWAITING_CONSENT: ['CONFIRMED', 'DECLINED'],
  DECLINED: [],
  CONFIRMED: ['CHAT_DONE'],
  CHAT_DONE: ['REFERRED', 'NOT_YET', 'NO_REFERRAL'],
  REFERRED: [],
  NOT_YET: [],
  NO_REFERRAL: [],
});

export type ReferralMsgKind = 'text' | 'ask-share' | 'ask-chat' | 'summary' | 'fit' | 'chat' | 'ask-done' | 'ask-decide';

export interface ReferralMessage {
  id: number;
  at: number;
  kind: ReferralMsgKind;
  text: string;
  needsHuman: boolean;
  data?: Record<string, unknown>;
}

export interface StateChange {
  from: ReferralState;
  to: ReferralState;
  afterEvents: number;
}

export type Decision = 'refer' | 'not_yet' | 'no';

export class HumanDecisionRequiredError extends Error {}

const first = (name: string) => name.split(' ')[0];

/**
 * Referral Bridge: connection first, proof of work, human decides.
 * Seeker agent → anonymous stats (stage 1) → referrer agent's private fit check → project links + rubric (stage 2)
 * → 15-minute chat negotiated by both agents → both say yes → names (stage 3) → the referrer's HUMAN decides.
 * There is no code path where an agent refers on its own.
 */
export class ReferralBridge {
  state: ReferralState = 'IDLE';
  #log!: EventLog;
  #vault!: IdentityVault;
  #profiles = new Map<string, AgentProfile>();
  #phones = new Map<string, ReferralMessage[]>();
  #history: StateChange[] = [];
  #seeker = '';
  #window: TimeWindow | null = null;
  #consents: ConsentMap = {};
  #fit: FitResult | null = null;
  #rules!: ReferrerRules;
  #credits = 0;
  #names = new Map<string, string>();

  constructor(
    private readonly trust: TrustNetwork = sharedTrust,
    private readonly opening: ReferralOpening = OPENING,
    private readonly seed: () => AgentProfile[] = createReferralSeed,
  ) {
    this.#load();
  }

  /** Back to the seed, including the referrer's monthly count. */
  reset(): void {
    this.#load();
  }

  /** A new seeker on the same referrer (keeps the referrer's monthly count and credits). */
  nextSeeker(): void {
    this.state = 'IDLE';
    this.#history = [];
    this.#phones = new Map();
    this.#log = new EventLog('referral-1');
    this.#seeker = '';
    this.#window = null;
    this.#consents = {};
    this.#fit = null;
    this.#names = new Map();
  }

  // ---- read access ---------------------------------------------------------------------------------

  events(): AgentEvent[] {
    return this.#log.all();
  }

  history(): StateChange[] {
    return [...this.#history];
  }

  phone(id: string): ReferralMessage[] {
    return structuredClone(this.#phones.get(id) ?? []);
  }

  get seeker() {
    return this.#seeker;
  }

  get window() {
    return this.#window ? { ...this.#window } : null;
  }

  /** Referrals left this month and give-back credit: the referrer's own view. */
  referrerStatus() {
    return { left: this.#rules.monthlyLimit - this.#rules.usedThisMonth, used: this.#rules.usedThisMonth, limit: this.#rules.monthlyLimit, credits: this.#credits };
  }

  /** The fit check, per rule. Only the referrer's own agent can read it; for anyone else it is null. */
  fitResult(requester: string): FitResult | null {
    return requester === REFERRER && this.#fit ? structuredClone(this.#fit) : null;
  }

  /** Names only after both have said yes to the chat. */
  getIdentity(requester: string, target: string): Identity {
    return this.#vault.read(this.#consents, requester, target);
  }

  // ---- flow ----------------------------------------------------------------------------------------

  /** The seeker's agent spots a referrer for the job they applied to and asks its human first. */
  offer(seeker: string): void {
    if (!this.#profiles.has(seeker) || seeker === REFERRER) throw new Error('Unknown seeker');
    this.#seeker = seeker;
    this.#set('OFFERED');
    const { company, role } = this.opening;
    this.#emit(seeker, {
      type: 'TRIGGER',
      to: [BROKER],
      payload: { opening: this.opening },
      human_readable: `${this.#label(seeker)} applied to ${company} ${role}; the agent looks for a referrer in the network`,
      disclosure: { shared: ['opening'], withheld: ['identity'] },
    });
    this.#emit(seeker, { type: 'ESCALATE', to: [seeker], payload: { kind: 'share' }, human_readable: `${this.#label(seeker)}'s agent asks its human before sharing anything` });
    this.#notify(
      seeker,
      'ask-share',
      `You applied to ${company} ${role} 🎯 A student who interned at ${company} refers people from our network. Want me to check if you're a fit? I'll share your anonymous stats first, more only if it's a fit, and your name only after you both say yes.`,
      true,
    );
  }

  /** The seeker's human answers: share anonymous stats (yes) or not now. */
  seekerShares(seeker: string, yes: boolean): void {
    if (this.state !== 'OFFERED' || seeker !== this.#seeker) throw new Error('Nothing to answer');
    if (!yes) {
      this.#notify(seeker, 'text', "No problem. Nothing was shared. I'll keep an eye out for other referrers.");
      this.#set('WITHDRAWN');
      return;
    }
    this.#emit(seeker, { type: 'CONSENT', to: [BROKER], payload: { kind: 'share' }, human_readable: `${this.#label(seeker)}'s human OK'd staged sharing`, disclosure: { shared: ['consent'] } });
    this.#set('FIT_CHECK');

    // Stage 1: stats only, from the seeker's own agent.
    const stage1 = this.trust.disclose(seeker, 1);
    this.#emit(seeker, {
      type: 'DISCOVER',
      to: [BROKER, REFERRER],
      payload: { kind: 'summary', stage: 1, summary: stage1, opening: this.opening },
      human_readable: `${this.#label(seeker)} shared an anonymous summary (stage 1)`,
      disclosure: { shared: ['sessions attended', 'average rating', 'mock average', 'skills taught', 'intel reports', 'target roles'], withheld: ['project links', 'rubric breakdown', 'identity'] },
    });
    this.#notify(seeker, 'text', `Shared your anonymous stats: ${statLine(stage1)}.`);
    this.#notify(REFERRER, 'summary', `An anonymous student applied to ${this.opening.company} ${this.opening.role} and wants a referral. Their stats:`, false, { stage: 1, summary: stage1 });

    // The referrer's agent checks its human's PRIVATE rules. The result stays with the referrer.
    const fit = fitCheck(this.#rules, stage1, `${this.opening.company} ${this.opening.role}`);
    this.#fit = fit;
    this.#emit(REFERRER, {
      type: fit.pass ? 'ACCEPT' : 'REJECT',
      to: [REFERRER],
      payload: { kind: 'fit', results: fit.results },
      human_readable: fit.pass ? "Stripe alum's agent: fit check passed" : "Stripe alum's agent: fit check failed",
      disclosure: { withheld: ['private rules'] },
    });
    this.#notify(REFERRER, 'fit', fit.pass ? 'Your agent checked them against your rules: a fit.' : 'Your agent checked them against your rules and passed on this one:', false, { results: fit.results });

    if (!fit.pass) return this.#notAFit();

    // Stage 2: project links + rubric breakdown, only now that the fit check passed.
    const stage2 = this.trust.disclose(seeker, 2);
    this.#emit(seeker, {
      type: 'DISCOVER',
      to: [BROKER, REFERRER],
      payload: { kind: 'summary', stage: 2, summary: stage2 },
      human_readable: `${this.#label(seeker)} shared project links and the mock breakdown (stage 2)`,
      disclosure: { shared: ['project links', 'rubric breakdown'], withheld: ['identity'] },
    });
    this.#notify(seeker, 'text', "Good news: you're a fit 🙌 I shared your project links and mock breakdown. Still anonymous.");
    this.#notify(REFERRER, 'summary', 'They shared more (still anonymous):', false, { stage: 2, summary: stage2 });
    this.#negotiate();
  }

  /** Both humans answer the coffee-chat invite. */
  reply(id: string, choice: 'accept' | 'decline'): void {
    if (!(id in this.#consents) || !['AWAITING_HUMANS', 'AWAITING_CONSENT'].includes(this.state) || this.#consents[id] !== 'pending') {
      throw new Error('No pending chat invite for this person');
    }
    if (choice === 'decline') {
      this.#emit(id, { type: 'DECLINE', to: [BROKER], payload: { kind: 'chat' }, human_readable: `${this.#label(id)}'s human said no to the chat` });
      const other = id === REFERRER ? this.#seeker : REFERRER;
      this.#notify(id, 'text', 'No problem. Nothing more was shared, and your name stayed private.');
      this.#emit(BROKER, { type: 'DISSOLVED', to: [other], payload: { reason: "The chat didn't happen" }, human_readable: "The chat didn't happen; no names were shared", disclosure: { withheld: ['identity'] } });
      this.#notify(other, 'text', "The chat isn't happening this time. No names were shared.");
      this.#set('DECLINED');
      return;
    }
    this.#consents = recordConsent(this.#consents, id, 'accepted');
    this.#emit(id, { type: 'CONSENT', to: [BROKER], payload: { kind: 'chat' }, human_readable: `${this.#label(id)}'s human said yes to the chat (and to sharing names)`, disclosure: { shared: ['consent'] } });
    this.#notify(id, 'text', "You're in ✅ Waiting on the other side.");
    if (allConsented(this.#consents)) return this.#confirm();
    if (this.state === 'AWAITING_HUMANS') this.#set('AWAITING_CONSENT');
  }

  /** The referrer's human marks the chat as done; then they decide. */
  chatDone(id: string): void {
    if (this.state !== 'CONFIRMED' || id !== REFERRER) throw new Error('No chat to finish');
    this.#emit(REFERRER, { type: 'COMPLETE', to: [BROKER], payload: { kind: 'chat-done' }, human_readable: 'The 15-minute chat happened' });
    this.#set('CHAT_DONE');
    this.#emit(REFERRER, { type: 'ESCALATE', to: [REFERRER], payload: { kind: 'decide' }, human_readable: "Referral decision: only the referrer's human can make it" });
    this.#notify(
      REFERRER,
      'ask-decide',
      `Your call: refer ${first(this.#names.get(this.#seeker) ?? 'them')} to ${this.opening.company} ${this.opening.role}? Your agent never refers on its own.`,
      true,
    );
  }

  /**
   * The referrer's HUMAN decides. This is the only way a referral happens; `by` must be the referrer, and only
   * after the chat. Not yet comes with a coaching note for the seeker.
   */
  decide(by: string, decision: Decision, note = ''): void {
    if (by !== REFERRER) throw new HumanDecisionRequiredError("Only the referrer's human can decide on a referral");
    if (this.state !== 'CHAT_DONE') throw new HumanDecisionRequiredError('A referral is decided by the referrer after the chat');
    const seeker = this.#seeker;
    const them = first(this.#names.get(REFERRER) ?? 'Your referrer');
    if (decision === 'refer') {
      if (this.#rules.usedThisMonth >= this.#rules.monthlyLimit) throw new Error('No referrals left this month');
      this.#rules.usedThisMonth += 1;
      this.#credits += 1;
      this.#emit(REFERRER, { type: 'COMPLETE', to: [seeker], payload: { kind: 'referred', opening: this.opening }, human_readable: `Referred to ${this.opening.company} ${this.opening.role}, by the referrer's own decision` });
      this.#emit(BROKER, { type: 'COMPLETE', to: [REFERRER], payload: { kind: 'credit', credits: this.#credits }, human_readable: 'Give-back credit +1 for the referrer' });
      this.#notify(seeker, 'text', `🎉 ${them} referred you to ${this.opening.company} ${this.opening.role}! Your proof of work did this.`);
      const left = this.#rules.monthlyLimit - this.#rules.usedThisMonth;
      this.#notify(REFERRER, 'text', `Referral sent ✓ +1 give-back credit (${this.#credits} total). Referrals left this month: ${left} of ${this.#rules.monthlyLimit}.`);
      this.#set('REFERRED');
      return;
    }
    if (decision === 'not_yet') {
      const coaching = note.trim().slice(0, 200) || 'Do one more system design mock first.';
      this.#emit(REFERRER, { type: 'COMPLETE', to: [seeker], payload: { kind: 'not-yet' }, human_readable: 'Not yet, with a coaching note for the seeker', disclosure: { shared: ['coaching note'] } });
      this.#notify(seeker, 'text', `${them} isn't ready to refer you yet. Their note: “${coaching}” Want me to set that up? I'll check back with them after.`);
      this.#notify(REFERRER, 'text', 'Sent your note. No referral used.');
      this.#set('NOT_YET');
      return;
    }
    this.#emit(REFERRER, { type: 'DECLINE', to: [seeker], payload: { kind: 'referral' }, human_readable: 'The referrer decided not to refer this time' });
    this.#notify(seeker, 'text', `${them} decided not to refer this time. Thanks for making the time; I'll keep looking.`);
    this.#notify(REFERRER, 'text', 'Got it. No referral used.');
    this.#set('NO_REFERRAL');
  }

  // ---- internals -----------------------------------------------------------------------------------

  #notAFit() {
    const seeker = this.#seeker;
    // The seeker learns only "not now": no rule, no threshold, no identity.
    this.#emit(BROKER, { type: 'DISSOLVED', to: [seeker], payload: { reason: 'Not a fit right now' }, human_readable: 'Not a fit right now', disclosure: { withheld: ['reason', 'identity'] } });
    this.#notify(seeker, 'text', "This referrer isn't taking you on right now. They only saw your anonymous stats and never learned who you are. Keep building your proof of work; I'll keep looking.");
    this.#notify(REFERRER, 'text', 'Nothing for you to do. They never learned your rules or your name.');
    this.#set('NOT_A_FIT');
  }

  #negotiate() {
    const seeker = this.#seeker;
    const [a, b] = [this.#profiles.get(seeker)!, this.#profiles.get(REFERRER)!];
    const r = schedule([
      { availability: a.availability, min_session_minutes: CHAT_MINUTES },
      { availability: b.availability, min_session_minutes: CHAT_MINUTES },
    ]);
    this.#set('NEGOTIATING');
    if (!r.ok) {
      this.#emit(BROKER, { type: 'CONFLICT', to: [seeker, REFERRER], payload: { reason: 'no shared 15 minutes' }, human_readable: 'No 15 minutes work for both' });
      return this.#notAFit();
    }
    const window = { start: r.window.start, end: fromMinutes(toMinutes(r.window.start) + CHAT_MINUTES) };
    const proposal = this.#emit(BROKER, {
      type: 'PROPOSE',
      to: [seeker, REFERRER],
      payload: { kind: 'schedule', window },
      human_readable: `Proposed a 15-minute chat at ${range12(window.start, window.end)}, the first time both are free`,
      disclosure: { shared: ['proposed time'], withheld: ['identity'] },
    });
    for (const id of [seeker, REFERRER]) {
      const d = evaluateSchedule(this.#profiles.get(id)!, window);
      this.#emit(id, {
        type: d.type === 'REJECT' ? 'REJECT' : 'ACCEPT',
        to: [BROKER],
        payload: { in_reply_to: proposal.id, kind: 'schedule' },
        human_readable: d.type === 'REJECT' ? `${this.#label(id)}'s agent: that time doesn't work` : `${this.#label(id)}'s agent: ${range12(window.start, window.end)} works`,
        disclosure: { withheld: ['availability'] },
      });
      if (d.type === 'REJECT') return this.#notAFit();
    }
    this.#window = window;
    this.#consents = newConsent([seeker, REFERRER]);
    const when = range12(window.start, window.end);
    for (const id of [seeker, REFERRER]) {
      const d = evaluateJoin(this.#profiles.get(id)!);
      this.#emit(id, { type: 'ESCALATE', to: [BROKER], payload: { kind: 'chat', actions: d.type === 'ESCALATE' ? d.actions : [] }, human_readable: `${this.#label(id)}'s agent: meeting needs its human` });
    }
    this.#notify(seeker, 'ask-chat', `They'd like a 15-minute coffee chat before deciding: tonight, ${when}. Names unlock only if you both say yes. In?`, true);
    this.#notify(REFERRER, 'ask-chat', `Meet them first, as you asked: 15-minute coffee chat tonight, ${when}. Names unlock only if you both say yes. In?`, true);
    this.#set('AWAITING_HUMANS');
  }

  #confirm() {
    const seeker = this.#seeker;
    for (const [me, other] of [[seeker, REFERRER], [REFERRER, seeker]] as const) {
      const identity = this.#vault.read(this.#consents, me, other);
      this.#names.set(other, identity.name);
      this.#emit(BROKER, { type: 'REVEAL', to: [me], payload: { identities: [identity] }, human_readable: `Name unlocked for ${this.#label(me)}: ${identity.name}`, disclosure: { shared: ['name', 'email', 'discord'] } });
    }
    this.#set('CONFIRMED');
    const when = range12(this.#window!.start, this.#window!.end);
    this.#notify(seeker, 'chat', `🔓 You're meeting ${this.#names.get(REFERRER)}, who interned at ${this.opening.company}.`, false, { with: REFERRER, when });
    this.#notify(REFERRER, 'chat', `🔓 You're meeting ${this.#names.get(seeker)}.`, false, { with: seeker, when });
    this.#notify(REFERRER, 'ask-done', 'Tap when you two have had the chat.', true);
  }

  #notify(id: string, kind: ReferralMsgKind, text: string, needsHuman = false, data?: Record<string, unknown>) {
    const list = this.#phones.get(id) ?? [];
    list.push({ id: list.length + 1, at: this.#log.all().length, kind, text, needsHuman, data });
    this.#phones.set(id, list);
  }

  #emit(from: string, draft: Draft): AgentEvent {
    return this.#log.append(from, draft);
  }

  #set(to: ReferralState) {
    const from = this.state;
    this.state = step(from, to);
    this.#history.push({ from, to, afterEvents: this.#log.all().length });
  }

  #label(id: string) {
    return this.#profiles.get(id)?.label ?? id;
  }

  #load() {
    const seed = this.seed();
    this.#profiles = new Map(seed.map((p) => [p.agent_id, p]));
    this.#vault = new IdentityVault(seed);
    this.#rules = structuredClone(REFERRER_RULES);
    this.#credits = 0;
    this.nextSeeker();
  }
}

export const statLine = (s: EvidenceStage1 | EvidenceStage2) =>
  [
    `${s.sessionsAttended} sessions`,
    s.averageRating !== null ? `★ ${s.averageRating.toFixed(1)}` : 'rating pending',
    s.mockAverage !== null ? `mock ${s.mockAverage.toFixed(1)}` : 'no mocks yet',
    s.skillsTaught.length ? `taught ${s.skillsTaught.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
