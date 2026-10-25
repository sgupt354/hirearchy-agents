import type { AgentProfile, Policy, Skill, TimeWindow } from '../../engine/types';

// Mock-interview network. Same students as the prep circle; strong areas map to the engine's `offers`
// and weak areas to `needs`, so discovery, scheduling and negotiation are reused as is.

export type Difficulty = 'easy' | 'medium' | 'hard' | 'any';

export interface MockProfile extends AgentProfile {
  /** Which interview round they're preparing for (public within the pipeline). */
  round: string;
  difficulty: Difficulty;
  /** PRIVATE: how many mocks they've done with each other student. */
  practiced: Record<string, number>;
  /** PRIVATE policy: never pair me with someone I've practiced with this many times. */
  max_repeats: number;
}

export const MOCK_SEEKER = 'm1';
export const SOLO_SEEKER = 'm8';
export const MOCK_MINUTES = 60;
export const ROUND_MINUTES = 30;

const policy: Policy = {
  share_skills: true,
  share_approx_availability: true,
  share_exact_stage: true,
  abstract_interview_date: true,
  negotiate_schedule: true,
  join_session: 'ask',
  reveal_identity: 'ask',
  share_contact: 'ask',
  min_session_minutes: MOCK_MINUTES,
};

interface Row {
  id: string;
  n: number;
  name: string;
  email: string;
  discord: string;
  company: string;
  role: string;
  round: string;
  strong: Skill[];
  weak: Skill[];
  hours: TimeWindow;
  difficulty: Difficulty;
  practiced?: Record<string, number>;
}

const MS = { company: 'Microsoft', role: 'SWE Intern' };

const ROWS: Row[] = [
  { id: 'm1', n: 1, name: 'Aditya Raman', email: 'aditya.raman@example.edu', discord: 'aditya_r#1001', ...MS, round: 'Technical', strong: ['DSA'], weak: ['System Design'], hours: { start: '18:00', end: '21:30' }, difficulty: 'medium', practiced: { m3: 2, m5: 1 } },
  { id: 'm2', n: 2, name: 'Sumit Kulkarni', email: 'sumit.k@example.edu', discord: 'sumitk#2002', ...MS, round: 'Final', strong: ['Behavioral'], weak: ['System Design'], hours: { start: '19:00', end: '21:00' }, difficulty: 'medium' },
  { id: 'm3', n: 3, name: 'Maya Okonkwo', email: 'maya.o@example.edu', discord: 'mayao#3003', ...MS, round: 'Technical', strong: ['System Design'], weak: ['DSA'], hours: { start: '19:30', end: '22:00' }, difficulty: 'medium', practiced: { m1: 2 } },
  { id: 'm4', n: 4, name: 'Jordan Ellis', email: 'jordan.ellis@example.edu', discord: 'jellis#4004', ...MS, round: 'Technical', strong: ['System Design'], weak: ['DSA'], hours: { start: '19:00', end: '21:30' }, difficulty: 'medium' },
  { id: 'm5', n: 5, name: 'Priya Desai', email: 'priya.d@example.edu', discord: 'priyad#5005', ...MS, round: 'Technical', strong: ['DSA'], weak: ['Behavioral'], hours: { start: '19:00', end: '21:00' }, difficulty: 'medium', practiced: { m1: 1 } },
  { id: 'm6', n: 6, name: 'Leo Martins', email: 'leo.m@example.edu', discord: 'leom#6006', ...MS, round: 'Technical', strong: ['System Design'], weak: ['DSA'], hours: { start: '20:30', end: '21:00' }, difficulty: 'medium' },
  { id: 'm7', n: 7, name: 'Sam Okafor', email: 'sam.o@example.edu', discord: 'samo#7007', ...MS, round: 'Technical', strong: ['System Design'], weak: ['DSA'], hours: { start: '19:00', end: '21:00' }, difficulty: 'hard' },
  { id: 'm8', n: 8, name: 'Riya Kapoor', email: 'riya.k@example.edu', discord: 'riyak#8008', company: 'Google', role: 'SWE', round: 'Technical', strong: ['DSA'], weak: ['System Design'], hours: { start: '19:00', end: '21:00' }, difficulty: 'medium' },
];

const SEED: readonly MockProfile[] = ROWS.map((r) => ({
  agent_id: r.id,
  label: `Applicant #${r.n}`,
  private: { name: r.name, email: r.email, discord_id: r.discord, interview_date: '2026-11-05', stage: `${r.round} round`, notes: '' },
  pipeline: { company: r.company, role: r.role },
  stage_public: 'interview',
  offers: r.strong,
  needs: r.weak,
  availability: [r.hours],
  policy,
  round: r.round,
  difficulty: r.difficulty,
  practiced: r.practiced ?? {},
  max_repeats: 2,
}));

export function createMockSeed(): MockProfile[] {
  return structuredClone(SEED) as MockProfile[];
}
