import type { Listing, Skill } from './types';

export interface Edge {
  from: string;
  to: string;
  skills: Skill[];
}

/** A cycle [a, b, c] means a helps b, b helps c, c helps a. */
export interface Cycle {
  members: string[];
  edges: Edge[];
}

type Node = Pick<Listing, 'handle' | 'offers' | 'needs'>;

/** Skills A can teach B (A.offers ∩ B.needs). */
export function edgeSkills(a: Node, b: Node): Skill[] {
  return a.offers.filter((s) => b.needs.includes(s));
}

/** Directed graph: edge A->B iff A.offers ∩ B.needs ≠ ∅. Self-loops are ignored. */
export function buildGraph(nodes: Node[]): Edge[] {
  const edges: Edge[] = [];
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.handle === b.handle) continue;
      const skills = edgeSkills(a, b);
      if (skills.length) edges.push({ from: a.handle, to: b.handle, skills });
    }
  }
  return edges;
}

/** All distinct 2-person reciprocal matches and 3-person cycles, in node order. */
export function findCycles(nodes: Node[]): Cycle[] {
  const edges = buildGraph(nodes);
  const edge = (a: string, b: string) => edges.find((e) => e.from === a && e.to === b);
  const ids = nodes.map((n) => n.handle);
  const cycles: Cycle[] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const ab = edge(ids[i], ids[j]);
      const ba = edge(ids[j], ids[i]);
      if (ab && ba) cycles.push({ members: [ids[i], ids[j]], edges: [ab, ba] });
    }
  }

  // Each 3-cycle is emitted once, starting from its lowest-index member.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      for (let k = i + 1; k < ids.length; k++) {
        if (k === j) continue;
        const e1 = edge(ids[i], ids[j]);
        const e2 = edge(ids[j], ids[k]);
        const e3 = edge(ids[k], ids[i]);
        if (e1 && e2 && e3) cycles.push({ members: [ids[i], ids[j], ids[k]], edges: [e1, e2, e3] });
      }
    }
  }
  return cycles;
}

/**
 * Only cycles that include the trigger, rotated so the trigger is first.
 * Order: 3-cycles before 2-cycles, then by listing order of the other members.
 */
export function rankCycles(cycles: Cycle[], triggerId: string, order: string[]): Cycle[] {
  const pos = (id: string) => order.indexOf(id);
  const key = (c: Cycle) => c.members.slice(1).map(pos);
  return cycles
    .filter((c) => c.members.includes(triggerId))
    .map((c) => rotateTo(c, triggerId))
    .sort((a, b) => {
      if (a.members.length !== b.members.length) return b.members.length - a.members.length;
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });
}

function rotateTo(c: Cycle, id: string): Cycle {
  const i = c.members.indexOf(id);
  return {
    members: [...c.members.slice(i), ...c.members.slice(0, i)],
    edges: [...c.edges.slice(i), ...c.edges.slice(0, i)],
  };
}
