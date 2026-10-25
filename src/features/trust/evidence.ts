import type { Skill } from '../../engine/types';
import { RUBRIC, type Rubric } from '../mock/scores';
import { round1 } from './ledger';

/** A private thank-you left on a mentor's proof of work. Never disclosed to referrers. */
export interface ThankYouOnFile {
  fromLabel: string;
  text: string;
  at: string;
}

/** A student's private proof of work, kept by their own agent. */
export interface EvidenceFile {
  owner: string;
  sessionsAttended: number;
  /** Reliability (1–5) once there are ≥ 2 ratings, else null. Never individual ratings. */
  averageRating: number | null;
  ratingCount: number;
  /** Per-category averages of peer mock scores, or null if no peer mocks yet. */
  mockAverages: Rubric | null;
  mockCount: number;
  intelReports: number;
  skillsTaught: Skill[];
  targetRoles: string[];
  projectLinks: string[];
  /** Pay it forward: who they've helped, never their points. Null if they haven't mentored. */
  mentoring: MentoringStats | null;
  /**
   * Private thank-you notes from people this student mentored. Owner-only: discloseEvidence never
   * copies these, so a referrer never sees them.
   */
  thankYouNotes: ThankYouOnFile[];
}

export interface MentoringStats {
  sessions: number;
  newcomersHelped: number;
  /** 1–5 once there are at least 2 mentoring ratings, else null (same rule as every rating). */
  averageRating: number | null;
  ratingCount: number;
}

export const mockOverall = (r: Rubric | null): number | null =>
  r ? round1(RUBRIC.reduce((a, { key }) => a + r[key], 0) / RUBRIC.length) : null;

/** Stage 1: stats only. */
export interface EvidenceStage1 {
  stage: 1;
  sessionsAttended: number;
  averageRating: number | null;
  mockAverage: number | null;
  skillsTaught: Skill[];
  intelReports: number;
  targetRoles: string[];
  /** Present only for people who have mentored. */
  mentoring?: MentoringStats;
}

/** Stage 2: + rubric breakdown and project links (only after a fit check passes). */
export interface EvidenceStage2 extends Omit<EvidenceStage1, 'stage'> {
  stage: 2;
  mockAverages: Rubric | null;
  projectLinks: string[];
}

/**
 * Staged disclosure: what leaves the agent at each stage. Identity (stage 3) is never part of the evidence
 * file; it comes only from the consent-gated identity vault after mutual consent.
 */
export function discloseEvidence(file: EvidenceFile, stage: 1): EvidenceStage1;
export function discloseEvidence(file: EvidenceFile, stage: 2): EvidenceStage2;
export function discloseEvidence(file: EvidenceFile, stage: 1 | 2): EvidenceStage1 | EvidenceStage2 {
  const base = {
    sessionsAttended: file.sessionsAttended,
    averageRating: file.averageRating,
    mockAverage: mockOverall(file.mockAverages),
    skillsTaught: [...file.skillsTaught],
    intelReports: file.intelReports,
    targetRoles: [...file.targetRoles],
    ...(file.mentoring ? { mentoring: { ...file.mentoring } } : {}),
  };
  if (stage === 1) return { stage: 1, ...base };
  return { stage: 2, ...base, mockAverages: file.mockAverages ? { ...file.mockAverages } : null, projectLinks: [...file.projectLinks] };
}
