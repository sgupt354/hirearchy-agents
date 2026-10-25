import type { AgentProfile, Policy } from './types.js';

// The single source of demo starting conditions. Outcomes are computed by the engine, not stored here.

export const TRIGGER_AGENT_ID = 'a1';
export const COORDINATION_ID = 'coord-1';
export const PIPELINE = { company: 'Microsoft', role: 'SWE Intern' };

/** What the "Simulate interview invite" button changes on Aditya's private profile. */
export const TRIGGER_INVITE = { stage: 'Technical interview scheduled', interview_date: '2026-11-04' };

const basePolicy: Policy = {
  share_skills: true,
  share_approx_availability: true,
  share_exact_stage: true,
  abstract_interview_date: false,
  negotiate_schedule: true,
  join_session: 'ask',
  reveal_identity: 'ask',
  share_contact: 'ask',
  min_session_minutes: 45,
};

const SEED: readonly AgentProfile[] = [
  {
    agent_id: 'a1',
    label: 'Applicant #1',
    private: {
      name: 'Aditya Raman',
      email: 'aditya.raman@example.edu',
      discord_id: 'aditya_r#1001',
      interview_date: null,
      stage: 'Application submitted',
      notes: 'Nervous about behavioral rounds.',
    },
    pipeline: PIPELINE,
    stage_public: 'applied',
    offers: ['DSA'],
    needs: ['Behavioral'],
    availability: [{ start: '18:00', end: '21:30' }],
    policy: { ...basePolicy, share_exact_stage: false },
  },
  {
    agent_id: 'a2',
    label: 'Applicant #2',
    private: {
      name: 'Sumit Kulkarni',
      email: 'sumit.k@example.edu',
      discord_id: 'sumitk#2002',
      interview_date: '2026-11-05',
      stage: 'Final round loop',
      notes: 'Has done 20+ mock behavioral interviews.',
    },
    pipeline: PIPELINE,
    stage_public: 'interview',
    offers: ['Behavioral'],
    needs: ['System Design'],
    availability: [{ start: '19:00', end: '21:00' }],
    policy: { ...basePolicy },
  },
  {
    agent_id: 'a3',
    label: 'Applicant #3',
    private: {
      name: 'Maya Okonkwo',
      email: 'maya.o@example.edu',
      discord_id: 'mayao#3003',
      interview_date: '2026-11-03',
      stage: 'Technical round 2',
      notes: 'Interned on a distributed systems team.',
    },
    pipeline: PIPELINE,
    stage_public: 'interview',
    offers: ['System Design'],
    needs: ['DSA'],
    availability: [{ start: '19:30', end: '22:00' }],
    policy: { ...basePolicy, abstract_interview_date: true },
  },
  {
    agent_id: 'a4',
    label: 'Applicant #4',
    private: {
      name: 'Jordan Ellis',
      email: 'jordan.ellis@example.edu',
      discord_id: 'jellis#4004',
      interview_date: '2026-11-07',
      stage: 'Technical round 1',
      notes: 'Backend-focused, built a sharded KV store.',
    },
    pipeline: PIPELINE,
    stage_public: 'interview',
    offers: ['System Design'],
    needs: ['DSA'],
    availability: [{ start: '19:00', end: '21:30' }],
    policy: { ...basePolicy },
  },
  {
    agent_id: 'a5',
    label: 'Applicant #5',
    private: {
      name: 'Priya Desai',
      email: 'priya.d@example.edu',
      discord_id: 'priyad#5005',
      interview_date: '2026-11-06',
      stage: 'Technical round 1',
      notes: '',
    },
    pipeline: PIPELINE,
    stage_public: 'interview',
    offers: ['DSA'],
    needs: ['DSA'],
    availability: [{ start: '19:00', end: '21:00' }],
    policy: { ...basePolicy },
  },
  {
    agent_id: 'a6',
    label: 'Applicant #6',
    private: {
      name: 'Leo Martins',
      email: 'leo.m@example.edu',
      discord_id: 'leom#6006',
      interview_date: '2026-11-06',
      stage: 'Technical round 1',
      notes: 'Early riser, works evenings.',
    },
    pipeline: PIPELINE,
    stage_public: 'interview',
    offers: ['Behavioral'],
    needs: ['DSA'],
    availability: [{ start: '08:00', end: '10:00' }],
    // Keeps its hours private, so the broker has to ask and the agent decides on its own.
    policy: { ...basePolicy, share_approx_availability: false },
  },
  {
    agent_id: 'a7',
    label: 'Applicant #7',
    private: {
      name: 'Sam Okafor',
      email: 'sam.o@example.edu',
      discord_id: 'samo#7007',
      interview_date: '2026-11-08',
      stage: 'Technical round 1',
      notes: '',
    },
    pipeline: PIPELINE,
    stage_public: 'interview',
    offers: ['System Design'],
    needs: ['Behavioral'],
    availability: [{ start: '18:00', end: '22:00' }],
    policy: { ...basePolicy, share_skills: false },
  },
  {
    agent_id: 'a8',
    label: 'Applicant #8',
    private: {
      name: 'Riya Kapoor',
      email: 'riya.k@example.edu',
      discord_id: 'riyak#8008',
      interview_date: '2026-11-05',
      stage: 'Technical round 1',
      notes: '',
    },
    pipeline: { company: 'Google', role: 'SWE' },
    stage_public: 'interview',
    offers: ['DSA'],
    needs: ['Behavioral'],
    availability: [{ start: '19:00', end: '21:00' }],
    policy: { ...basePolicy },
  },
];

/** A fresh deep copy of the seed. Every engine run starts from this. */
export function createSeed(): AgentProfile[] {
  return structuredClone(SEED) as AgentProfile[];
}
