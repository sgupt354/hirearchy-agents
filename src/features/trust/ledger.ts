/** One private rating after a session: did they show up, and how helpful were they (1–5). */
export interface Rating {
  showedUp: boolean;
  helpful: number;
}

export const MIN_RATINGS = 2;

export interface TrustSummary {
  /** How many ratings exist (a count, never their values). */
  count: number;
  /** 1–5, one decimal; null until there are at least MIN_RATINGS. */
  reliability: number | null;
  /** 0–1; null until there are at least MIN_RATINGS. */
  showUpRate: number | null;
}

interface Entry extends Rating {
  rater: string;
  session: string;
}

export const round1 = (x: number) => Math.round(x * 10) / 10;

/** A no-show counts as 1/5; otherwise the helpful score counts as is. */
const points = (r: Rating) => (r.showedUp ? r.helpful : 1);

export function validateRating(r: Rating): void {
  if (typeof r.showedUp !== 'boolean') throw new Error('showedUp must be yes or no');
  if (!Number.isInteger(r.helpful) || r.helpful < 1 || r.helpful > 5) throw new Error('Helpful must be a whole number from 1 to 5');
}

/**
 * Private ratings. Nothing here returns an individual rating, not even to the person rated:
 * only the count, and a reliability score once there are at least MIN_RATINGS of them.
 */
export class TrustLedger {
  #bySubject = new Map<string, Entry[]>();

  add(rater: string, subject: string, session: string, rating: Rating): void {
    if (rater === subject) throw new Error("You can't rate yourself");
    validateRating(rating);
    const list = this.#bySubject.get(subject) ?? [];
    if (list.some((e) => e.rater === rater && e.session === session)) throw new Error('Already rated for this session');
    list.push({ rater, session, showedUp: rating.showedUp, helpful: rating.helpful });
    this.#bySubject.set(subject, list);
  }

  hasRated(rater: string, subject: string, session: string): boolean {
    return (this.#bySubject.get(subject) ?? []).some((e) => e.rater === rater && e.session === session);
  }

  summary(subject: string): TrustSummary {
    const list = this.#bySubject.get(subject) ?? [];
    if (list.length < MIN_RATINGS) return { count: list.length, reliability: null, showUpRate: null };
    return {
      count: list.length,
      reliability: round1(list.reduce((a, e) => a + points(e), 0) / list.length),
      showUpRate: round1(list.filter((e) => e.showedUp).length / list.length),
    };
  }

  reliability(subject: string): number | null {
    return this.summary(subject).reliability;
  }
}
