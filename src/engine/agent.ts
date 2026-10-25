import type { Edge } from './cycles';
import { buildListing } from './discovery';
import { evaluateAvailabilityCheck, evaluateJoin, evaluateOwnCounter, evaluateSchedule, type Decision } from './negotiation';
import { BROKER } from './events';
import { formatWindow, formatWindow12h } from './time';
import type { AgentEvent, AgentProfile, Draft, HumanReply, Identity, PhoneMessage, Skill, TimeWindow } from './types';
import { parseCounter, proposalMessage } from './voice';

interface Circle {
  members: string[];
  edges: Edge[];
}

/**
 * One student's personal agent. Holds its own private profile, policy, inbox and phone.
 * It only talks through structured events and decides accept / reject / escalate itself.
 */
export class Agent {
  readonly id: string;
  readonly label: string;
  #profile: AgentProfile;
  #inbox: AgentEvent[] = [];
  #phone: PhoneMessage[] = [];
  #pending: { round: number; window: TimeWindow } | null = null;

  constructor(profile: AgentProfile) {
    this.#profile = structuredClone(profile);
    this.id = profile.agent_id;
    this.label = profile.label;
  }

  /** The interview invite lands: the human's stage changes and the agent wakes up. */
  receiveInvite(invite: { stage: string; interview_date: string }): Draft {
    this.#profile.stage_public = 'interview';
    this.#profile.private.stage = invite.stage;
    this.#profile.private.interview_date = invite.interview_date;
    const { company, role } = this.#profile.pipeline;
    this.#notify(`Congrats on the ${company} ${role} interview! I'm looking for students in your pipeline to prep with.`);
    return {
      type: 'TRIGGER',
      to: [BROKER],
      payload: { pipeline: { company, role } },
      human_readable: `${this.label} landed an interview (${company} / ${role}); agent wakes up and asks the broker for prep matches`,
      disclosure: { shared: ['pipeline'], withheld: ['exact stage', 'interview date'] },
    };
  }

  receive(event: AgentEvent): Draft[] {
    this.#inbox.push(event);
    const p = event.payload;
    switch (event.type) {
      case 'DISCOVER':
        return p.request === 'listing' ? [this.#listing()] : [];
      case 'PROPOSE':
        if (p.kind === 'availability_check') {
          return [this.#reply(event, evaluateAvailabilityCheck(this.#profile, p.windows as TimeWindow[]))];
        }
        if (p.kind === 'schedule') return [this.#reply(event, evaluateSchedule(this.#profile, p.window as TimeWindow))];
        if (p.kind === 'join') return [this.#join(event)];
        return [];
      case 'CONFLICT':
        if (p.counter_rejected) this.#notify(`Your counter didn't fit everyone. ${p.reason}`, ['accept', 'counter', 'decline']);
        return [];
      case 'DISSOLVED':
        this.#pending = null;
        this.#notify(`${p.reason}. Nothing about you was shared. Your agent is looking for another match.`);
        return [];
      case 'REVEAL':
        this.#notify(`Everyone said yes! Your circle: ${(p.identities as Identity[]).map((i) => `${i.name} (${i.email}, ${i.discord_id})`).join('; ')}.`);
        return [];
      case 'COMPLETE':
        this.#notify(`Prep Circle Created ✓ · ${formatWindow12h(p.window as TimeWindow)} · ${(p.skills as Skill[]).join(', ')}`);
        return [];
      default:
        return [];
    }
  }

  /** The human tapped Accept / Counter / Decline on their phone. */
  fromHuman(reply: HumanReply): Draft[] {
    if (!this.#pending) throw new Error(`${this.label} has no pending request`);
    const { round, window } = this.#pending;

    if (reply.kind === 'accept') {
      this.#pending = null;
      this.#notify('You accepted. Waiting for the others.');
      return [
        {
          type: 'CONSENT',
          to: [BROKER],
          payload: { round, actions: ['join_session', 'reveal_identity', 'share_contact'] },
          human_readable: `${this.label}'s human accepted (join + share name and contact once everyone agrees)`,
          disclosure: { shared: ['consent'] },
        },
      ];
    }

    if (reply.kind === 'decline') {
      this.#pending = null;
      this.#notify("You declined. Nothing about you was shared, and the others won't be told who left.");
      return [
        {
          type: 'DECLINE',
          to: [BROKER],
          payload: { round },
          human_readable: `${this.label}'s human declined`,
          disclosure: { withheld: ['reason'] },
        },
      ];
    }

    const counter = parseCounter(reply.text, window);
    if (!counter) {
      this.#notify(`I couldn't find a time in "${reply.text}". Try "8pm" or "20:00-21:00".`, ['accept', 'counter', 'decline']);
      return [];
    }
    const own = evaluateOwnCounter(this.#profile, counter);
    if (!own.ok) {
      this.#notify(`${formatWindow12h(counter)} doesn't work with your own availability.`, ['accept', 'counter', 'decline']);
      return [];
    }
    this.#pending = null;
    this.#notify(`Proposing ${formatWindow12h(counter)} to the others…`);
    return [
      {
        type: 'COUNTER',
        to: [BROKER],
        payload: { round, window: counter, text: reply.text },
        human_readable: `${this.label}'s human countered "${reply.text}" -> ${formatWindow(counter)} (fits its own availability)`,
        disclosure: { shared: ['proposed time'], withheld: ['own availability'] },
      },
    ];
  }

  phone(): PhoneMessage[] {
    return structuredClone(this.#phone);
  }

  inbox(): AgentEvent[] {
    return structuredClone(this.#inbox);
  }

  #listing(): Draft {
    const { listing, disclosure } = buildListing(this.#profile);
    return {
      type: 'DISCOVER',
      to: [BROKER],
      payload: { listing },
      human_readable: listing
        ? `${this.label} published an anonymized listing (offers ${listing.offers.join(', ')}, needs ${listing.needs.join(', ')})`
        : `${this.label} keeps its skills private (share_skills=false), so it publishes no listing`,
      disclosure,
    };
  }

  #reply(event: AgentEvent, d: Decision): Draft {
    const window = (event.payload.window as TimeWindow | undefined) ?? (event.payload.windows as TimeWindow[])[0];
    const base = { to: [BROKER], disclosure: { withheld: ['availability'] } };
    if (d.type === 'ACCEPT') {
      return { ...base, type: 'ACCEPT', payload: { in_reply_to: event.id }, human_readable: `${this.label}'s agent accepts ${formatWindow(window)} on its own` };
    }
    if (d.type === 'REJECT') {
      return { ...base, type: 'REJECT', payload: { in_reply_to: event.id, reason: d.reason }, human_readable: `${this.label}'s agent rejects ${formatWindow(window)}: ${d.reason}` };
    }
    return { ...base, type: 'ESCALATE', payload: { in_reply_to: event.id, actions: d.actions }, human_readable: `${this.label}'s agent needs its human to approve ${formatWindow(window)}` };
  }

  #join(event: AgentEvent): Draft {
    const p = event.payload;
    const round = p.round as number;
    const window = p.window as TimeWindow;
    const circle = p.circle as Circle;
    const decision = evaluateJoin(this.#profile);
    if (decision.type !== 'ESCALATE') {
      return { type: 'CONSENT', to: [BROKER], payload: { round }, human_readable: `${this.label}'s agent joins on its own` };
    }
    this.#pending = { round, window };
    this.#notify(
      proposalMessage({
        pipeline: this.#profile.pipeline,
        circleSize: circle.members.length,
        gives: circle.edges.filter((e) => e.from === this.id).flatMap((e) => e.skills),
        gets: circle.edges.filter((e) => e.to === this.id).flatMap((e) => e.skills),
        window,
        updated: Boolean(p.updated),
      }),
      ['accept', 'counter', 'decline'],
    );
    return {
      type: 'ESCALATE',
      to: [BROKER],
      payload: { in_reply_to: event.id, round, actions: decision.actions },
      human_readable: `${this.label}'s agent: ${decision.reason} -> asked its human (Accept / Counter / Decline)`,
      disclosure: { withheld: ['identity'] },
    };
  }

  #notify(text: string, actions: PhoneMessage['actions'] = []) {
    this.#phone.push({ id: this.#phone.length + 1, text, actions });
  }
}
