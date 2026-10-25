import type { EvidenceStage1 } from '../trust/evidence';
import type { ReferrerRules } from './seed';

export type RuleId = 'role' | 'sessions' | 'rating' | 'mock' | 'meet' | 'limit';

export interface RuleResult {
  id: RuleId;
  label: string;
  pass: boolean;
  /** What was observed, e.g. "3 sessions" (shown to the referrer only). */
  observed: string;
}

export interface FitResult {
  pass: boolean;
  results: RuleResult[];
}

/**
 * The referrer agent's deterministic fit check over a stage-1 (stats only) summary. Runs inside the referrer's
 * agent; the results never leave it except as "fit / not a fit".
 */
export function fitCheck(rules: ReferrerRules, stage1: EvidenceStage1, role: string): FitResult {
  const left = rules.monthlyLimit - rules.usedThisMonth;
  const results: RuleResult[] = [
    {
      id: 'role',
      label: `Role is ${rules.roles.slice(0, 2).join(' / ')} or ${rules.roles.at(-1)}`,
      pass: rules.roles.some((r) => role.toLowerCase().includes(r.toLowerCase())),
      observed: role,
    },
    {
      id: 'sessions',
      label: `At least ${rules.minSessions} prep sessions`,
      pass: stage1.sessionsAttended >= rules.minSessions,
      observed: `${stage1.sessionsAttended} sessions`,
    },
    {
      id: 'rating',
      label: `Peer rating ≥ ${rules.minRating}`,
      pass: stage1.averageRating !== null && stage1.averageRating >= rules.minRating,
      observed: stage1.averageRating === null ? 'not enough ratings' : `★ ${stage1.averageRating.toFixed(1)}`,
    },
    {
      id: 'mock',
      label: `Mock average ≥ ${rules.minMockAverage.toFixed(1)}`,
      pass: stage1.mockAverage !== null && stage1.mockAverage >= rules.minMockAverage,
      observed: stage1.mockAverage === null ? 'no peer mocks' : stage1.mockAverage.toFixed(1),
    },
    {
      id: 'meet',
      label: 'Must meet first (15-minute chat)',
      pass: true,
      observed: rules.mustMeetFirst ? 'chat will be scheduled' : 'not required',
    },
    {
      id: 'limit',
      label: `At most ${rules.monthlyLimit} referrals a month`,
      pass: left > 0,
      observed: `${Math.max(0, left)} left this month`,
    },
  ];
  return { pass: results.every((r) => r.pass), results };
}
