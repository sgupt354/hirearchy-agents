import { Agent } from './agent';
import { Broker } from './broker';
import { EventLog } from './events';
import { IdentityVault } from './identity';
import { COORDINATION_ID, TRIGGER_AGENT_ID, TRIGGER_INVITE, createSeed } from './seed';
import { transition } from './stateMachine';
import type { AgentEvent, AgentProfile, CoordinationState, HumanReply, Identity, PhoneMessage } from './types';

export interface StateChange {
  from: CoordinationState;
  to: CoordinationState;
  /** Number of events logged when the change happened (for interleaving in feeds). */
  afterEvents: number;
}

/** In-memory runtime: one Agent per student, one Broker, an identity vault and the audit log. */
export class Engine {
  state: CoordinationState = 'IDLE';
  #agents = new Map<string, Agent>();
  #vault!: IdentityVault;
  #log!: EventLog;
  #broker!: Broker;
  #history: StateChange[] = [];

  constructor(seed: AgentProfile[] = createSeed()) {
    this.#load(seed);
  }

  /** Restore the exact seed and clear every agent, event and state. */
  resetDemo(seed: AgentProfile[] = createSeed()): void {
    this.#load(seed);
  }

  simulateInterviewInvite(agentId = TRIGGER_AGENT_ID): void {
    const draft = this.#agent(agentId).receiveInvite(TRIGGER_INVITE);
    this.#broker.fromAgent(agentId, draft);
  }

  /** A human's reply on their phone, routed through their own agent. */
  reply(agentId: string, reply: HumanReply): void {
    for (const draft of this.#agent(agentId).fromHuman(reply)) this.#broker.fromAgent(agentId, draft);
  }

  /** The ONLY way to read a name/contact. Throws IdentityLockedError until every member consents. */
  getIdentity(requester: string, target: string): Identity {
    return this.#vault.read(this.#broker.consents, requester, target);
  }

  events(): AgentEvent[] {
    return this.#log.all();
  }

  eventsVisibleTo(agentId: string): AgentEvent[] {
    return this.#log.visibleTo(agentId);
  }

  phone(agentId: string): PhoneMessage[] {
    return this.#agent(agentId).phone();
  }

  history(): StateChange[] {
    return [...this.#history];
  }

  get circle() {
    return this.#broker.circle;
  }

  get window() {
    return this.#broker.window;
  }

  get consents() {
    return this.#broker.consents;
  }

  labels(): Record<string, string> {
    return Object.fromEntries([...this.#agents.values()].map((a) => [a.id, a.label]));
  }

  #load(seed: AgentProfile[]) {
    this.state = 'IDLE';
    this.#history = [];
    this.#agents = new Map(seed.map((p) => [p.agent_id, new Agent(p)]));
    this.#vault = new IdentityVault(seed);
    this.#log = new EventLog(COORDINATION_ID);
    this.#broker = new Broker({
      log: this.#log,
      ports: [...this.#agents.values()],
      getState: () => this.state,
      setState: (to) => {
        const from = this.state;
        this.state = transition(from, to);
        this.#history.push({ from, to, afterEvents: this.#log.all().length });
      },
      readIdentity: (consents, requester, target) => this.#vault.read(consents, requester, target),
    });
  }

  #agent(id: string): Agent {
    const agent = this.#agents.get(id);
    if (!agent) throw new Error(`Unknown agent ${id}`);
    return agent;
  }
}
