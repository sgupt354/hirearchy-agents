import type { AgentProfile, Policy, Skill, TimeWindow } from '../../engine/types';
import type { Standing } from './points';

// Pay it forward demo network. Ids follow the prep-circle agents (a1 Aditya, a6 Leo, a7 Sam) so trust and
// evidence line up through personOf(); Priya (a9) is new to the network and has no record yet.

export const NEWCOMER = 'a9';
export const MENTOR = 'a1';
export const ONLINE_AT_START = ['a6', 'a7'];
export const SESSION_MINUTES = 45;
export const DEMO_WEEK = '2026-W44';
/** The demo's "today" (the event log's clock starts on this day). */
export const TODAY = '2026-10-25';

/** A mentor's PRIVATE capacity rules. Only their own agent reads them; the broker never sees them. */
export interface MentorRules {
  maxNewcomersPerWeek: number;
  /** Already taken this week before the demo. */
  newcomersThisWeek: number;
  eveningsOnly: boolean;
  topics: Skill[];
}

export const MENTOR_RULES: Record<string, MentorRules> = {
  a1: { maxNewcomersPerWeek: 2, newcomersThisWeek: 0, eveningsOnly: true, topics: ['DSA', 'Behavioral'] },
  a6: { maxNewcomersPerWeek: 2, newcomersThisWeek: 0, eveningsOnly: false, topics: ['System Design'] },
  a7: { maxNewcomersPerWeek: 2, newcomersThisWeek: 2, eveningsOnly: true, topics: ['DSA'] },
};

/** Points and completed sessions before the demo. Aditya has a record but no points yet. */
export const STANDING_SEED: Record<string, Standing> = {
  a1: { points: 0, completedSessions: 4 },
  a6: { points: 40, completedSessions: 6 },
  a7: { points: 120, completedSessions: 9 },
  a9: { points: 0, completedSessions: 0 },
  a2: { points: 10, completedSessions: 5 },
  a8: { points: 0, completedSessions: 1 },
};

export interface NeedInput {
  company: string;
  round: string;
  topic: Skill;
  /** YYYY-MM-DD. Only "this week" / "next week" ever leaves the agent. */
  deadline: string;
}

export const DEMO_NEED: NeedInput = { company: 'Microsoft', round: 'Technical', topic: 'DSA', deadline: '2026-10-29' };

const policy: Policy = {
  share_skills: true,
  share_approx_availability: true,
  share_exact_stage: false,
  abstract_interview_date: true,
  negotiate_schedule: true,
  join_session: 'ask',
  reveal_identity: 'ask',
  share_contact: 'ask',
  min_session_minutes: SESSION_MINUTES,
};

const person = (id: string, label: string, name: string, email: string, discord: string, availability: TimeWindow[], offers: Skill[]): AgentProfile => ({
  agent_id: id,
  label,
  private: { name, email, discord_id: discord, interview_date: null, stage: 'Applied', notes: '' },
  pipeline: { company: 'Microsoft', role: 'SWE Intern' },
  stage_public: 'applied',
  offers,
  needs: [],
  availability,
  policy,
});

const SEED: readonly AgentProfile[] = [
  person('a9', 'Newcomer #9', 'Priya Nair', 'priya.nair@example.edu', 'priyan#0909', [{ start: '18:00', end: '22:00' }], []),
  person('a1', 'Applicant #1', 'Aditya Raman', 'aditya.r@example.edu', 'adityar#0001', [{ start: '19:30', end: '21:30' }], ['DSA', 'Behavioral']),
  person('a6', 'Applicant #6', 'Leo Martins', 'leo.m@example.edu', 'leom#0606', [{ start: '17:00', end: '19:00' }], ['System Design']),
  person('a7', 'Applicant #7', 'Sam Okafor', 'sam.o@example.edu', 'samo#0707', [{ start: '20:00', end: '22:00' }], ['DSA']),
  // Project board juniors (Phase C).
  person('a2', 'Applicant #2', 'Sumit Kulkarni', 'sumit.k@example.edu', 'sumitk#0202', [{ start: '19:00', end: '21:00' }], ['Behavioral']),
  person('a8', 'Applicant #8', 'Riya Kapoor', 'riya.k@example.edu', 'riyak#0808', [{ start: '18:00', end: '20:00' }], []),
];

// ---- project board (Phase C) ---------------------------------------------------------------------

export const SENIOR = 'a7';
export const JUNIORS = ['a9', 'a2', 'a8'];

export interface ProjectInput {
  title: string;
  stack: string[];
  /** Hard cap on each junior's hours per week. */
  hoursPerWeek: number;
  scope: string;
  roles: string[];
}

export const DEMO_PROJECT: ProjectInput = {
  title: 'Campus ride-share matcher',
  stack: ['TypeScript', 'React', 'Postgres'],
  hoursPerWeek: 5,
  scope: 'Match students heading the same way after evening classes. Four-week build, one demo at the end.',
  roles: ['Frontend', 'Backend'],
};

/** The senior's PRIVATE shortlist rules. Only their own agent reads them. */
export interface SeniorRules {
  minStackOverlap: number;
  maxJuniors: number;
}

export const SENIOR_RULES: Record<string, SeniorRules> = { a7: { minStackOverlap: 1, maxJuniors: 2 } };

/** What each junior's agent knows about its human (skills, hours they can give, role). Shared only anonymously. */
export interface JuniorProfile {
  skills: string[];
  hoursPerWeek: number;
  role: string;
}

export const JUNIOR_PROFILES: Record<string, JuniorProfile> = {
  a9: { skills: ['React', 'Python'], hoursPerWeek: 4, role: 'Frontend' },
  a2: { skills: ['TypeScript', 'Postgres'], hoursPerWeek: 5, role: 'Backend' },
  a8: { skills: ['Go'], hoursPerWeek: 8, role: 'Backend' },
};

export function createCommunitySeed(): AgentProfile[] {
  return structuredClone(SEED) as AgentProfile[];
}
