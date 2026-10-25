import type { AgentProfile, Policy } from '../../engine/types';

// Referral network. Seekers are people from the shared trust network (p4 Jordan, p10 Theo); their evidence comes
// from there. The referrer interned at Stripe; their rules are PRIVATE to their own agent.

export const REFERRER = 'r1';
export const SEEKER = 'p4';
export const DECOY = 'p10';
export const CHAT_MINUTES = 15;

export interface ReferrerRules {
  /** Role must mention one of these (case-insensitive). */
  roles: string[];
  minSessions: number;
  minRating: number;
  minMockAverage: number;
  mustMeetFirst: boolean;
  monthlyLimit: number;
  usedThisMonth: number;
}

export interface ReferralOpening {
  company: string;
  role: string;
}

export const OPENING: ReferralOpening = { company: 'Stripe', role: 'SWE Intern' };

export const REFERRER_RULES: ReferrerRules = {
  roles: ['SWE', 'Software Engineer', 'Backend'],
  minSessions: 2,
  minRating: 4.5,
  minMockAverage: 4.0,
  mustMeetFirst: true,
  monthlyLimit: 2,
  usedThisMonth: 0,
};

const policy: Policy = {
  share_skills: true,
  share_approx_availability: true,
  share_exact_stage: false,
  abstract_interview_date: true,
  negotiate_schedule: true,
  join_session: 'ask',
  reveal_identity: 'ask',
  share_contact: 'ask',
  min_session_minutes: CHAT_MINUTES,
};

const person = (id: string, label: string, name: string, email: string, discord: string, start: string, end: string): AgentProfile => ({
  agent_id: id,
  label,
  private: { name, email, discord_id: discord, interview_date: null, stage: 'Applied', notes: '' },
  pipeline: { company: 'Stripe', role: 'SWE Intern' },
  stage_public: 'applied',
  offers: [],
  needs: [],
  availability: [{ start, end }],
  policy,
});

const SEED: readonly AgentProfile[] = [
  person('p4', 'Applicant #4', 'Jordan Ellis', 'jordan.ellis@example.edu', 'jellis#4004', '19:00', '21:30'),
  person('p10', 'Applicant #10', 'Theo Park', 'theo.p@example.edu', 'theop#1010', '18:00', '21:00'),
  person('r1', 'Stripe alum', 'Nadia Brooks', 'nadia.b@example.edu', 'nadiab#0101', '18:30', '19:30'),
];

export function createReferralSeed(): AgentProfile[] {
  return structuredClone(SEED) as AgentProfile[];
}
