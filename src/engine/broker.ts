import { allConsented, newConsent, recordConsent, type ConsentMap } from './consent';
import { findCycles, rankCycles, type Cycle } from './cycles';
import { filterListings } from './discovery';
import { BROKER, type EventLog } from './events';
import { schedule } from './scheduler';
import { formatWindow, formatWindow12h } from './time';
import type { AgentEvent, CoordinationState, Draft, Identity, Listing, Skill, TimeWindow } from './types';

/** What the broker can do with an agent: deliver an event and get structured replies back. Nothing else. */
export interface AgentPort {
  readonly id: string;
  readonly label: string;
  receive(event: AgentEvent): Draft[];
}

interface BrokerDeps {
  log: EventLog;
  ports: AgentPort[];
  getState: () => CoordinationState;
  setState: (to: CoordinationState) => void;
  readIdentity: (consents: ConsentMap, requester: string, target: string) => Identity;
}

/**
 * Neutral broker. Sees only anonymized listings, finds cycles, relays events.
 * Never reads private profiles and never decides on an agent's behalf.
 */
export class Broker {
  #deps: BrokerDeps;
  #trigger = '';
  #pipeline = { company: '', role: '' };
  #candidates: Listing[] = [];
  #excluded = new Set<string>();
  #circle: Cycle | null = null;
  #window: TimeWindow | null = null;
  #round = 0;
  #consents: ConsentMap = {};

  constructor(deps: BrokerDeps) {
    this.#deps = deps;
  }

  get circle(): Cycle | null {
    return this.#circle ? structuredClone(this.#circle) : null;
  }

  get window(): TimeWindow | null {
    return this.#window ? { ...this.#window } : null;
  }

  get consents(): ConsentMap {
    return { ...this.#consents };
  }

  /** An agent sends the broker an event (trigger, consent, counter, decline). */
  fromAgent(from: string, draft: Draft): void {
    const event = this.#deps.log.append(from, draft);
    switch (event.type) {
      case 'TRIGGER':
        return this.#discover(from, event.payload.pipeline as { company: string; role: string });
      case 'CONSENT':
        return this.#onConsent(from, event.payload.round as number);
      case 'COUNTER':
        return this.#onCounter(from, event.payload.round as number, event.payload.window as TimeWindow);
      case 'DECLINE':
        return this.#onDecline(from, event.payload.round as number);
    }
  }

  // ---- discovery ----------------------------------------------------------

  #discover(trigger: string, pipeline: { company: string; role: string }) {
    this.#trigger = trigger;
    this.#pipeline = pipeline;
    this.#deps.setState('TRIGGERED');
    this.#deps.setState('DISCOVERING');

    const all = this.#deps.ports.map((p) => p.id);
    const replies = this.#send({
      type: 'DISCOVER',
      to: all,
      payload: { request: 'listing' },
      human_readable: `Broker asks all ${all.length} registered agents for anonymized listings`,
    });
    const responses = replies.map((r) => ({ handle: r.from, listing: (r.payload.listing as Listing | null) ?? null }));
    const published = responses.filter((r) => r.listing).length;
    this.#send({
      type: 'DISCOVER',
      to: [trigger],
      payload: { discovered: all.length, listings: published },
      human_readable: `${all.length} agents discovered; ${published} published anonymized listings; identities withheld for everyone`,
      disclosure: { withheld: ['identity (all agents)'] },
    });

    const triggerListing = responses.find((r) => r.handle === trigger)?.listing;
    if (!triggerListing) return this.#dissolve([trigger], 'Your agent has nothing to match on (no listing)');
    const { candidates, filtered } = filterListings(triggerListing, responses);
    for (const f of filtered) {
      this.#send({
        type: 'FILTERED',
        to: [trigger],
        payload: { handle: f.handle, reason: f.reason },
        human_readable: `${this.#label(f.handle)} filtered: ${f.reason}`,
      });
    }

    // Agents that keep availability private are asked directly; their agent decides.
    const band = triggerListing.availability;
    this.#candidates = candidates.filter((c) => {
      if (c.availability || !band) return true;
      const [reply] = this.#send({
        type: 'PROPOSE',
        to: [c.handle],
        payload: { kind: 'availability_check', windows: band },
        human_readable: `Broker asks ${this.#label(c.handle)} whether ${band.map(formatWindow).join(', ')} works (its availability is private)`,
      });
      return reply.type === 'ACCEPT';
    });

    this.#matchAndNegotiate();
  }

  #matchAndNegotiate() {
    const pool = this.#candidates.filter((c) => !this.#excluded.has(c.handle));
    const cycles = rankCycles(findCycles(pool), this.#trigger, pool.map((c) => c.handle));
    if (!cycles.length) return this.#dissolve([this.#trigger], 'No complementary prep circle found');
    this.#deps.setState('MATCH_FOUND');

    let conflicted = false;
    const conflict = (members: string[], reason: string) => {
      this.#send({ type: 'CONFLICT', to: members, payload: { reason }, human_readable: `Conflict: ${reason}` });
      if (!conflicted) this.#deps.setState('CONFLICT_FOUND');
      conflicted = true;
    };

    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      const backups = cycles.slice(i + 1).map((b) => b.members);
      const backupLabels = [...new Set(backups.flat().filter((m) => !cycle.members.includes(m)))].map((m) => this.#label(m));
      this.#send({
        type: 'DISCOVER',
        to: cycle.members,
        payload: { match: { members: cycle.members, edges: cycle.edges }, backups },
        human_readable:
          `Match: ${cycle.edges.map((e) => `${this.#label(e.from)} -> ${this.#label(e.to)} (${e.skills.join(', ')})`).join(', ')}` +
          (backupLabels.length ? `. Backup held: ${backupLabels.join(', ')}` : ''),
      });
      if (i === 0) this.#deps.setState('NEGOTIATING');

      const shared = cycle.members.map((m) => this.#listing(m)).filter((l) => l.availability);
      const result = schedule(shared.map((l) => ({ availability: l.availability!, min_session_minutes: l.min_session_minutes })));
      if (!result.ok) {
        conflict(cycle.members, result.reason);
        continue;
      }

      const replies = this.#send({
        type: 'PROPOSE',
        to: cycle.members,
        payload: { kind: 'schedule', window: result.window },
        human_readable: `Broker proposes ${formatWindow(result.window)} (intersection of shared availability)`,
        disclosure: { shared: ['proposed time', 'skills plan'], withheld: ['identity'] },
      });
      if (replies.some((r) => r.type === 'REJECT')) {
        conflict(cycle.members, `an agent rejected ${formatWindow(result.window)}`);
        continue;
      }

      if (conflicted) this.#deps.setState('CONFLICT_RESOLVED');
      this.#circle = cycle;
      this.#window = result.window;
      return this.#askHumans(false);
    }
    this.#dissolve([this.#trigger], 'No circle with a workable time');
  }

  // ---- humans -------------------------------------------------------------

  #askHumans(updated: boolean) {
    const circle = this.#circle!;
    this.#round += 1;
    this.#consents = newConsent(circle.members);
    this.#send({
      type: 'PROPOSE',
      to: circle.members,
      payload: { kind: 'join', round: this.#round, window: this.#window, circle: { members: circle.members, edges: circle.edges }, updated },
      human_readable: `Broker invites the circle to join at ${formatWindow(this.#window!)}${updated ? ' (updated time)' : ''}`,
      disclosure: { shared: ['time', 'skills plan'], withheld: ['identity'] },
    });
    this.#deps.setState('AWAITING_HUMANS');
  }

  #onConsent(from: string, round: number) {
    if (round !== this.#round || !(from in this.#consents)) return;
    this.#consents = recordConsent(this.#consents, from, 'accepted');
    if (allConsented(this.#consents)) return this.#reveal();
    if (this.#deps.getState() !== 'AWAITING_CONSENT') this.#deps.setState('AWAITING_CONSENT');
  }

  #onCounter(from: string, round: number, window: TimeWindow) {
    if (round !== this.#round || !(from in this.#consents)) return;
    const back = this.#deps.getState();
    this.#deps.setState('COUNTERED');
    const others = this.#circle!.members.filter((m) => m !== from);
    const replies = this.#send({
      type: 'PROPOSE',
      to: others,
      payload: { kind: 'schedule', window, counter: true },
      human_readable: `Broker relays counter ${formatWindow(window)}; each agent checks it against its own private availability`,
      disclosure: { shared: ['proposed time'], withheld: ['identity'] },
    });
    if (replies.some((r) => r.type === 'REJECT')) {
      this.#send({
        type: 'CONFLICT',
        to: [from],
        payload: { reason: `${formatWindow12h(window)} is outside another member's availability; ${formatWindow12h(this.#window!)} still stands.`, counter_rejected: true },
        human_readable: `Counter ${formatWindow(window)} rejected: outside another member's availability`,
      });
      this.#deps.setState(back === 'AWAITING_CONSENT' ? 'AWAITING_CONSENT' : 'AWAITING_HUMANS');
      return;
    }
    this.#window = window;
    this.#askHumans(true);
  }

  #onDecline(from: string, round: number) {
    if (round !== this.#round || !(from in this.#consents)) return;
    this.#deps.setState('DECLINED');
    const others = this.#circle!.members.filter((m) => m !== from);
    this.#circle = null;
    this.#window = null;
    this.#consents = {};
    // The decliner is never named to the others.
    this.#send({
      type: 'DISSOLVED',
      to: others,
      payload: { reason: "One member couldn't join", revealed: [] },
      human_readable: "One member couldn't join; circle dissolved before anything was revealed",
      disclosure: { withheld: ['who declined', 'identity'] },
    });
    this.#deps.setState('DISSOLVED');
    if (from === this.#trigger) return;

    this.#excluded.add(from);
    this.#deps.setState('REDISCOVERING');
    this.#send({
      type: 'DISCOVER',
      to: [this.#trigger],
      payload: { rediscover: true },
      human_readable: 'Broker reruns matching on the cached listings, excluding the member who could not join',
    });
    this.#matchAndNegotiate();
  }

  #reveal() {
    const circle = this.#circle!;
    this.#deps.setState('CONSENT_COMPLETE');
    for (const m of circle.members) {
      // Goes through the consent-gated identity function; throws if consent is incomplete.
      const identities = circle.members.filter((o) => o !== m).map((o) => this.#deps.readIdentity(this.#consents, m, o));
      this.#send({
        type: 'REVEAL',
        to: [m],
        payload: { identities },
        human_readable: `Identities revealed to ${this.#label(m)}: ${identities.map((i) => i.name).join(', ')}`,
        disclosure: { shared: ['name', 'email', 'discord'] },
      });
    }
    this.#deps.setState('IDENTITIES_REVEALED');
    const skills = this.#circleSkills(circle);
    this.#send({
      type: 'COMPLETE',
      to: circle.members,
      payload: { window: this.#window, pipeline: this.#pipeline, skills, members: circle.members },
      human_readable: `Prep Circle Created ✓ · ${this.#pipeline.company} ${this.#pipeline.role} · ${formatWindow12h(this.#window!)} · ${skills.join(', ')}`,
    });
    this.#deps.setState('COMPLETED');
  }

  // ---- helpers ------------------------------------------------------------

  /** Trigger's give, trigger's get, then the rest. */
  #circleSkills(circle: Cycle): Skill[] {
    const gives = circle.edges.filter((e) => e.from === this.#trigger).flatMap((e) => e.skills);
    const gets = circle.edges.filter((e) => e.to === this.#trigger).flatMap((e) => e.skills);
    return [...new Set([...gives, ...gets, ...circle.edges.flatMap((e) => e.skills)])];
  }

  #dissolve(to: string[], reason: string) {
    this.#send({ type: 'DISSOLVED', to, payload: { reason, revealed: [] }, human_readable: reason });
    this.#deps.setState('DISSOLVED');
  }

  /** Log a broker event, deliver it, and log each agent's structured reply. */
  #send(draft: Draft): AgentEvent[] {
    const event = this.#deps.log.append(BROKER, draft);
    const replies: AgentEvent[] = [];
    for (const port of this.#deps.ports.filter((p) => event.to.includes(p.id))) {
      for (const reply of port.receive(event)) replies.push(this.#deps.log.append(port.id, reply));
    }
    return replies;
  }

  #listing(handle: string): Listing {
    return this.#candidates.find((c) => c.handle === handle)!;
  }

  #label(handle: string): string {
    return this.#deps.ports.find((p) => p.id === handle)?.label ?? handle;
  }
}
