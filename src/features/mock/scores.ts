export const RUBRIC = [
  { key: 'communication', label: 'Communication' },
  { key: 'problem_solving', label: 'Problem solving' },
  { key: 'code_quality', label: 'Code quality' },
  { key: 'behavioral_structure', label: 'Behavioral structure' },
] as const;

export type RubricKey = (typeof RUBRIC)[number]['key'];
export type Rubric = Record<RubricKey, number>;

export interface ScoreEntry {
  /** Who gave it: a student's id, or 'agent' for a self-assessment during agent practice. */
  from: string;
  rubric: Rubric;
  note: string;
  practice: boolean;
}

export class ScoresLockedError extends Error {}

export function validateRubric(r: Rubric): void {
  for (const { key } of RUBRIC) {
    const v = r[key];
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`Rubric score for ${key} must be a whole number from 1 to 5`);
  }
}

/**
 * Mock scores are private to the person scored. Nobody else can read them unless that person grants it.
 * This is the only store of scores; events and other students' phones never carry them.
 */
export class ScoreVault {
  #bySubject = new Map<string, ScoreEntry[]>();
  #grants = new Set<string>();

  submit(rater: string, subject: string, rubric: Rubric, note: string, practice = false): void {
    if (rater === subject) throw new Error('You cannot score yourself in a peer mock');
    validateRubric(rubric);
    const list = this.#bySubject.get(subject) ?? [];
    list.push({ from: rater, rubric: { ...rubric }, note: note.trim().slice(0, 280), practice });
    this.#bySubject.set(subject, list);
  }

  /** The subject can always read their own scores; anyone else only with the subject's explicit grant. */
  read(requester: string, subject: string): ScoreEntry[] {
    if (requester !== subject && !this.#grants.has(`${subject}→${requester}`)) {
      throw new ScoresLockedError('Mock scores are private to the person scored');
    }
    return structuredClone(this.#bySubject.get(subject) ?? []);
  }

  /** Called on the subject's own say-so (their consent); never by anyone else. */
  grant(subject: string, viewer: string): void {
    this.#grants.add(`${subject}→${viewer}`);
  }

  /** Per-category averages of peer scores (practice self-assessments excluded), for the owner's evidence file. */
  averages(requester: string, subject: string): Rubric | null {
    const peer = this.read(requester, subject).filter((s) => !s.practice);
    if (!peer.length) return null;
    const avg = {} as Rubric;
    for (const { key } of RUBRIC) avg[key] = Math.round((peer.reduce((a, s) => a + s.rubric[key], 0) / peer.length) * 10) / 10;
    return avg;
  }
}
