import { requiresHuman, type Action } from './policy';
import { fits, intersectAll, validateCounter } from './scheduler';
import { durationMinutes } from './time';
import type { AgentProfile, TimeWindow } from './types';

export type Decision =
  | { type: 'ACCEPT' }
  | { type: 'REJECT'; reason: string }
  | { type: 'ESCALATE'; actions: Action[]; reason: string };

// Each function runs inside one agent, against that agent's own private profile.

/** "Do you have at least a minimum session free somewhere in these windows?" */
export function evaluateAvailabilityCheck(agent: AgentProfile, band: TimeWindow[]): Decision {
  const overlap = intersectAll([agent.availability, band]);
  const enough = overlap.some((w) => durationMinutes(w) >= agent.policy.min_session_minutes);
  return enough ? { type: 'ACCEPT' } : { type: 'REJECT', reason: 'outside my availability' };
}

/** A concrete session time. */
export function evaluateSchedule(agent: AgentProfile, window: TimeWindow): Decision {
  if (durationMinutes(window) < agent.policy.min_session_minutes) {
    return { type: 'REJECT', reason: `shorter than my ${agent.policy.min_session_minutes} min minimum` };
  }
  if (!fits(window, agent.availability)) return { type: 'REJECT', reason: 'outside my availability' };
  if (requiresHuman(agent, 'negotiate_schedule')) {
    return { type: 'ESCALATE', actions: ['negotiate_schedule'], reason: 'my human approves schedules' };
  }
  return { type: 'ACCEPT' };
}

/** Joining a circle; with the current policy shape this always needs the human. */
export function evaluateJoin(agent: AgentProfile): Decision {
  const actions = (['join_session', 'reveal_identity', 'share_contact'] as Action[]).filter((a) =>
    requiresHuman(agent, a),
  );
  if (actions.length) return { type: 'ESCALATE', actions, reason: 'joining a session requires my human' };
  return { type: 'ACCEPT' };
}

/** The counter my own human typed: does it fit MY private availability? */
export function evaluateOwnCounter(agent: AgentProfile, window: TimeWindow) {
  return validateCounter(window, [{ availability: agent.availability, min_session_minutes: agent.policy.min_session_minutes }]);
}
