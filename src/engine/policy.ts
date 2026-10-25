import type { AgentProfile } from './types';

// Privacy levels:
//   PUBLIC       pipeline, stage_public (visible to anyone in the same pipeline)
//   SHAREABLE    offers / needs / approx availability / exact stage, if the policy allows
//   ABSTRACTABLE interview_date -> "time-sensitive prep need"
//   PRIVATE      name, email, discord_id, notes (only via consent-gated identity reveal)

export type Field =
  | 'pipeline'
  | 'stage_public'
  | 'stage_exact'
  | 'offers'
  | 'needs'
  | 'availability'
  | 'interview_date'
  | 'name'
  | 'email'
  | 'discord_id'
  | 'notes';

export type Action = 'negotiate_schedule' | 'join_session' | 'reveal_identity' | 'share_contact';

export const TIME_SENSITIVE = 'time-sensitive prep need';

export function canShare(agent: AgentProfile, field: Field): boolean {
  switch (field) {
    case 'pipeline':
    case 'stage_public':
      return true;
    case 'offers':
    case 'needs':
      return agent.policy.share_skills;
    case 'availability':
      return agent.policy.share_approx_availability;
    case 'stage_exact':
      return agent.policy.share_exact_stage;
    default:
      // interview_date is never shared raw (only abstracted); identity fields are PRIVATE.
      return false;
  }
}

/** Abstracted value of a field, or null if the policy doesn't allow abstraction. */
export function abstract(agent: AgentProfile, field: Field): string | null {
  if (field === 'interview_date' && agent.policy.abstract_interview_date && agent.private.interview_date) {
    return TIME_SENSITIVE;
  }
  return null;
}

export function requiresHuman(agent: AgentProfile, action: Action): boolean {
  switch (action) {
    case 'negotiate_schedule':
      return !agent.policy.negotiate_schedule;
    case 'join_session':
      return agent.policy.join_session === 'ask';
    case 'reveal_identity':
      return agent.policy.reveal_identity === 'ask';
    case 'share_contact':
      return agent.policy.share_contact === 'ask';
  }
}
