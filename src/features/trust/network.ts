import type { Skill } from '../../engine/types';
import { RUBRIC, type Rubric } from '../mock/scores';
import { discloseEvidence, type EvidenceFile, type EvidenceStage1, type EvidenceStage2 } from './evidence';
import { TrustLedger, round1, type Rating, type TrustSummary } from './ledger';
import { getIntelContributionCount } from '../intel/logic';
import { PAST_SESSIONS, PEOPLE_SEED, type PersonSeed } from './seed';

/** Intel reports contributed, from the Intel feature (keyed by prep agent id: person p4 ↔ a4). */
const intelFromFeature = (person: string) => getIntelContributionCount(`a${person.replace(/^\D+/, '')}`);

export class EvidenceLockedError extends Error {}

interface Session {
  id: string;
  kind: 'prep' | 'mock';
  members: string[];
  taught: Record<string, Skill[]>;
}

/**
 * Trust across the whole journey: sessions, private ratings, peer mock scores and each person's evidence
 * file. Shared by every tab (one module-level instance); global Reset restores the seed.
 */
export class TrustNetwork {
  #ledger = new TrustLedger();
  #sessions = new Map<string, Session>();
  #mockScores = new Map<string, Rubric[]>();
  /** "person|session" pairs where someone marked the person as a no-show. */
  #noShows = new Set<string>();
  #people: Record<string, PersonSeed> = {};
  #intelCount: (person: string) => number = intelFromFeature;
  #listeners = new Set<() => void>();
  #version = 0;
  #resetKey: number | null = null;

  constructor() {
    this.#load();
  }

  // ---- sessions and ratings ------------------------------------------------------------------------

  /** A session that actually happened (prep circle or mock). Idempotent per id. */
  recordSession(s: Session): void {
    if (this.#sessions.has(s.id)) return;
    this.#sessions.set(s.id, structuredClone(s));
    this.#changed();
  }

  hasSession(id: string): boolean {
    return this.#sessions.has(id);
  }

  /** Only someone who was in the session can rate another member of it, once. */
  rate(rater: string, subject: string, sessionId: string, rating: Rating): void {
    const s = this.#sessions.get(sessionId);
    if (!s || !s.members.includes(rater) || !s.members.includes(subject)) throw new Error('Only members of a session can rate each other');
    this.#ledger.add(rater, subject, sessionId, rating);
    if (!rating.showedUp) this.#noShows.add(`${subject}|${sessionId}`);
    this.#changed();
  }

  hasRated(rater: string, subject: string, sessionId: string): boolean {
    return this.#ledger.hasRated(rater, subject, sessionId);
  }

  /** Aggregate only: count, and reliability once there are ≥ 2 ratings. Safe to show anyone. */
  summary(person: string): TrustSummary {
    return this.#ledger.summary(person);
  }

  reliability(person: string): number | null {
    return this.#ledger.reliability(person);
  }

  /** The owner's own peer mock scores, added by their agent after a mock (never someone else's). */
  addMockScores(person: string, rubrics: Rubric[]): void {
    this.#mockScores.set(person, [...(this.#mockScores.get(person) ?? []), ...rubrics.map((r) => ({ ...r }))]);
    this.#changed();
  }

  /** Override the intel source (tests); by default it's the Intel feature's getIntelContributionCount. */
  setIntelCounter(fn: (person: string) => number): void {
    this.#intelCount = fn;
    this.#changed();
  }

  // ---- evidence file -------------------------------------------------------------------------------

  /** The full evidence file, readable only by its owner. */
  evidence(requester: string, person: string): EvidenceFile {
    if (requester !== person) throw new EvidenceLockedError('An evidence file is private to its owner');
    return this.#build(person);
  }

  /** What the owner's agent may disclose at a stage (used by the referral flow, with the owner's OK). */
  disclose(person: string, stage: 1): EvidenceStage1;
  disclose(person: string, stage: 2): EvidenceStage2;
  disclose(person: string, stage: 1 | 2): EvidenceStage1 | EvidenceStage2 {
    return stage === 1 ? discloseEvidence(this.#build(person), 1) : discloseEvidence(this.#build(person), 2);
  }

  // ---- lifecycle -----------------------------------------------------------------------------------

  /** Global Reset: every tab calls this with the new resetKey; only the first call per key resets. */
  resetFor(resetKey: number): void {
    if (this.#resetKey === resetKey) return;
    this.#resetKey = resetKey;
    this.#load();
    this.#changed();
  }

  subscribe = (fn: () => void) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };

  getVersion = () => this.#version;

  #build(person: string): EvidenceFile {
    const mine = [...this.#sessions.values()].filter((s) => s.members.includes(person));
    // A session counts as attended unless someone in it marked this person as a no-show.
    const attended = mine.filter((s) => !this.#noShowIn(person, s.id));
    const taught = [...new Set(attended.flatMap((s) => s.taught[person] ?? []))];
    const scores = this.#mockScores.get(person) ?? [];
    let mockAverages: Rubric | null = null;
    if (scores.length) {
      mockAverages = {} as Rubric;
      for (const { key } of RUBRIC) mockAverages[key] = round1(scores.reduce((a, r) => a + r[key], 0) / scores.length);
    }
    const summary = this.#ledger.summary(person);
    const seed = this.#people[person] ?? { targetRoles: [], projectLinks: [] };
    return {
      owner: person,
      sessionsAttended: attended.length,
      averageRating: summary.reliability,
      ratingCount: summary.count,
      mockAverages,
      mockCount: scores.length,
      intelReports: this.#intelCount(person),
      skillsTaught: taught,
      targetRoles: [...seed.targetRoles],
      projectLinks: [...seed.projectLinks],
    };
  }

  #noShowIn(person: string, session: string) {
    return this.#noShows.has(`${person}|${session}`);
  }

  #load() {
    this.#ledger = new TrustLedger();
    this.#sessions = new Map();
    this.#mockScores = new Map();
    this.#noShows = new Set();
    this.#people = structuredClone(PEOPLE_SEED);
    this.#intelCount = intelFromFeature;
    for (const s of PAST_SESSIONS) {
      this.#sessions.set(s.id, { id: s.id, kind: s.kind, members: [...s.members], taught: structuredClone(s.taught) });
      for (const r of s.ratings) this.#ledger.add(r.rater, r.subject, s.id, r.rating);
      for (const m of s.mockScores ?? []) this.#mockScores.set(m.subject, [...(this.#mockScores.get(m.subject) ?? []), { ...m.rubric }]);
    }
    for (const s of PAST_SESSIONS) for (const r of s.ratings) if (!r.rating.showedUp) this.#noShows.add(`${r.subject}|${s.id}`);
  }

  #changed() {
    this.#version += 1;
    for (const fn of this.#listeners) fn();
  }
}

/** The one trust network every tab shares. */
export const trust = new TrustNetwork();
