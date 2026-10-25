import type { Edge } from '../engine/cycles';
import type { AgentEvent, CoordinationState } from '../engine/types';
import type { StateChange } from '../engine/engine';

export type NodeStatus = 'you' | 'member' | 'backup' | 'filtered' | 'idle';

export interface GraphView {
  status: Record<string, NodeStatus>;
  reasons: Record<string, string>;
  edges: Edge[];
  revealed: boolean;
}

/** Graph from one viewer's perspective, using only the events that viewer can see. */
export function deriveGraph(events: AgentEvent[], ids: string[], viewer: string): GraphView {
  const visible = events.filter((e) => e.from === viewer || e.to.includes(viewer));
  const reasons: Record<string, string> = {};
  let members: string[] = [];
  let backups: string[] = [];
  let edges: Edge[] = [];
  let revealed = false;

  for (const e of visible) {
    if (e.type === 'FILTERED') reasons[e.payload.handle as string] = e.payload.reason as string;
    if (e.type === 'DISCOVER' && e.payload.match) {
      const match = e.payload.match as { members: string[]; edges: Edge[] };
      members = match.members;
      edges = match.edges;
      backups = (e.payload.backups as string[][]).flat().filter((m) => !members.includes(m));
    }
    if (e.type === 'DISSOLVED') {
      members = [];
      edges = [];
    }
    if (e.type === 'REVEAL' && e.to.includes(viewer)) revealed = true;
  }

  const status: Record<string, NodeStatus> = {};
  for (const id of ids) {
    status[id] =
      id === viewer ? 'you'
      : members.includes(id) ? 'member'
      : reasons[id] ? 'filtered'
      : backups.includes(id) ? 'backup'
      : 'idle';
  }
  return { status, reasons, edges, revealed };
}

/** Coordination state as of the first `cursor` events (for the live replay). */
export function stateAt(history: StateChange[], cursor: number): CoordinationState {
  let state: CoordinationState = 'IDLE';
  for (const h of history) if (h.afterEvents <= cursor) state = h.to;
  return state;
}

/** Judge legend lenses, one per judging criterion. */
export type Lens = 'conflict' | 'shared' | 'humans';

export const LENSES: { id: Lens; label: string }[] = [
  { id: 'conflict', label: '⚠ Conflicting constraints' },
  { id: 'shared', label: "↗ What's shared" },
  { id: 'humans', label: '⏸️ When humans are asked' },
];

export function matchesLens(e: AgentEvent, lens: Lens): boolean {
  switch (lens) {
    case 'conflict':
      return ['CONFLICT', 'COUNTER', 'REJECT'].includes(e.type);
    case 'shared': {
      const d = e.disclosure;
      return d.shared.length + d.abstracted.length + d.withheld.length > 0;
    }
    case 'humans':
      return ['ESCALATE', 'CONSENT'].includes(e.type);
  }
}

export interface InviteOutcome {
  start: boolean;
  tone: 'ok' | 'info' | 'bad';
  message: string;
}

/** What the "Paste an interview invite" box does with parseInvite()'s result. */
export function inviteOutcome(
  parsed: { company: string; role: string; stage: string } | null,
  network: { company: string; role: string },
): InviteOutcome {
  if (!parsed) return { start: false, tone: 'bad', message: 'Not an interview invite' };
  if (parsed.company === network.company && parsed.role === network.role) {
    return { start: true, tone: 'ok', message: `Interview invite: ${parsed.company} / ${parsed.role}` };
  }
  return {
    start: false,
    tone: 'info',
    message:
      `Interview invite detected: ${parsed.company} / ${parsed.role}. No agents in this pipeline yet; ` +
      `the demo network is ${network.company} ${network.role}.`,
  };
}
