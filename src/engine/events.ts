import type { AgentEvent, Disclosure, Draft } from './types';

export const BROKER = 'broker';
export const SYSTEM = 'system';

const BASE_TIME = Date.parse('2026-10-25T18:00:00.000Z');

/** Append-only audit feed. Ids and timestamps are deterministic so reruns are identical. */
export class EventLog {
  #events: AgentEvent[] = [];

  constructor(private readonly coordinationId: string) {}

  append(from: string, draft: Draft): AgentEvent {
    const n = this.#events.length + 1;
    const disclosure: Disclosure = { shared: [], abstracted: [], withheld: [], ...draft.disclosure };
    const event: AgentEvent = {
      id: `evt-${String(n).padStart(3, '0')}`,
      coordination_id: this.coordinationId,
      from,
      to: [...draft.to],
      type: draft.type,
      payload: draft.payload,
      disclosure,
      human_readable: draft.human_readable,
      created_at: new Date(BASE_TIME + n * 1000).toISOString(),
    };
    this.#events.push(event);
    return event;
  }

  all(): AgentEvent[] {
    return structuredClone(this.#events);
  }

  /** Events an agent is party to (sender or recipient). */
  visibleTo(agentId: string): AgentEvent[] {
    return this.all().filter((e) => e.from === agentId || e.to.includes(agentId));
  }
}
