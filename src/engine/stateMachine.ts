import type { CoordinationState } from './types';

const TRANSITIONS: Record<CoordinationState, CoordinationState[]> = {
  IDLE: ['TRIGGERED'],
  TRIGGERED: ['DISCOVERING'],
  DISCOVERING: ['MATCH_FOUND', 'DISSOLVED'],
  MATCH_FOUND: ['NEGOTIATING'],
  NEGOTIATING: ['AWAITING_HUMANS', 'CONFLICT_FOUND'],
  CONFLICT_FOUND: ['CONFLICT_RESOLVED', 'DISSOLVED'],
  CONFLICT_RESOLVED: ['AWAITING_HUMANS'],
  AWAITING_HUMANS: ['COUNTERED', 'AWAITING_CONSENT', 'DECLINED'],
  COUNTERED: ['AWAITING_HUMANS', 'AWAITING_CONSENT'],
  AWAITING_CONSENT: ['COUNTERED', 'CONSENT_COMPLETE', 'DECLINED'],
  CONSENT_COMPLETE: ['IDENTITIES_REVEALED'],
  IDENTITIES_REVEALED: ['COMPLETED'],
  COMPLETED: [],
  DECLINED: ['DISSOLVED'],
  DISSOLVED: ['REDISCOVERING'],
  REDISCOVERING: ['MATCH_FOUND', 'DISSOLVED'],
};

export class InvalidTransitionError extends Error {}

export const canTransition = (from: CoordinationState, to: CoordinationState): boolean =>
  TRANSITIONS[from].includes(to);

export function transition(from: CoordinationState, to: CoordinationState): CoordinationState {
  if (!canTransition(from, to)) throw new InvalidTransitionError(`Invalid transition ${from} -> ${to}`);
  return to;
}
