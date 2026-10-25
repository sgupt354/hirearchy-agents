import type { Skill } from '../../engine/types';
import type { Rubric } from '../mock/scores';
import type { Rating } from './ledger';

// History from before the demo (starting conditions). Intel contributions come from the Intel feature. Everything is computed from these raw entries;
// no score or rating is stored pre-aggregated.

export interface PastSession {
  id: string;
  kind: 'prep' | 'mock';
  members: string[];
  /** Skills each member taught in that session. */
  taught: Record<string, Skill[]>;
  ratings: { rater: string; subject: string; rating: Rating }[];
  /** Peer mock scores received (mock sessions only). */
  mockScores?: { subject: string; rubric: Rubric }[];
}

export interface PersonSeed {
  targetRoles: string[];
  /** PRIVATE until stage 2 of a staged disclosure. */
  projectLinks: string[];
}

const yes = (helpful: number): Rating => ({ showedUp: true, helpful });
const noShow: Rating = { showedUp: false, helpful: 1 };

export const PEOPLE_SEED: Record<string, PersonSeed> = {
  p1: { targetRoles: ['Microsoft SWE Intern'], projectLinks: ['github.example/aditya-r/route-planner'] },
  p2: { targetRoles: ['Microsoft SWE Intern'], projectLinks: [] },
  p3: { targetRoles: ['Microsoft SWE Intern'], projectLinks: ['github.example/mayao/raft-lite'] },
  p4: { targetRoles: ['Stripe SWE Intern', 'Microsoft SWE Intern'], projectLinks: ['github.example/jellis/sharded-kv', 'github.example/jellis/rate-limiter'] },
  p5: { targetRoles: ['Microsoft SWE Intern'], projectLinks: [] },
  p6: { targetRoles: ['Microsoft SWE Intern'], projectLinks: [] },
  p7: { targetRoles: ['Microsoft SWE Intern'], projectLinks: [] },
  p8: { targetRoles: ['Google SWE'], projectLinks: [] },
};

/** Past sessions. Raters q1…q9 are earlier partners who aren't in this demo's network. */
export const PAST_SESSIONS: PastSession[] = [
  {
    id: 'past-1', kind: 'prep', members: ['p4', 'q1', 'q2'], taught: { p4: ['System Design'], q1: ['DSA'], q2: ['Behavioral'] },
    ratings: [{ rater: 'q1', subject: 'p4', rating: yes(5) }, { rater: 'q2', subject: 'p4', rating: yes(5) }],
  },
  {
    id: 'past-2', kind: 'prep', members: ['p4', 'p3', 'q3'], taught: { p4: ['DSA'], p3: ['System Design'], q3: ['Behavioral'] },
    ratings: [
      { rater: 'p3', subject: 'p4', rating: yes(5) }, { rater: 'q3', subject: 'p4', rating: yes(5) },
      { rater: 'p4', subject: 'p3', rating: yes(5) }, { rater: 'q3', subject: 'p3', rating: yes(4) },
    ],
  },
  {
    id: 'past-3', kind: 'mock', members: ['p4', 'q4'], taught: { p4: ['System Design'], q4: ['DSA'] },
    ratings: [{ rater: 'q4', subject: 'p4', rating: yes(4) }],
    mockScores: [{ subject: 'p4', rubric: { communication: 4, problem_solving: 4, code_quality: 5, behavioral_structure: 4 } }],
  },
  {
    id: 'past-4', kind: 'mock', members: ['p1', 'q5'], taught: { p1: ['DSA'], q5: ['System Design'] },
    ratings: [{ rater: 'q5', subject: 'p1', rating: yes(5) }],
    mockScores: [{ subject: 'p1', rubric: { communication: 3, problem_solving: 4, code_quality: 3, behavioral_structure: 4 } }],
  },
  {
    id: 'past-5', kind: 'prep', members: ['p1', 'p2', 'q6'], taught: { p1: ['DSA'], p2: ['Behavioral'], q6: ['System Design'] },
    ratings: [{ rater: 'q6', subject: 'p1', rating: yes(4) }, { rater: 'q6', subject: 'p2', rating: yes(5) }],
  },
  {
    id: 'past-6', kind: 'mock', members: ['p5', 'q7'], taught: { p5: ['DSA'], q7: ['Behavioral'] },
    ratings: [{ rater: 'q7', subject: 'p5', rating: yes(3) }],
  },
  {
    id: 'past-7', kind: 'mock', members: ['p5', 'q8'], taught: {},
    ratings: [{ rater: 'q8', subject: 'p5', rating: noShow }],
  },
  {
    id: 'past-8', kind: 'mock', members: ['p3', 'q9'], taught: { p3: ['System Design'], q9: ['DSA'] },
    ratings: [{ rater: 'q9', subject: 'p3', rating: yes(5) }],
  },
];
