import { isClosed, type Application } from '../apply/applications';
import { scrubIdentityText } from '../intel/logic';

// Closing the loop: after the interview the agent asks for a quick intel report; thank-you notes stay
// private on the mentor's proof of work; circle-complete Discord copy is built from structured fields only.
// Pure and deterministic. Never invents an outcome or a date.

export interface FollowUp {
  /** `${appId}|followup`: at most one ask per application. */
  id: string;
  appId: string;
  owner: string;
  company: string;
  role: string;
  interviewDate: string;
  /** Demo-clock time it was planned. */
  at: string;
  text: string;
}

export interface FollowUpState {
  sent: FollowUp[];
  /** Application ids the student already answered (shared intel, or set a closed stage). */
  done: string[];
}

export const EMPTY_FOLLOWUPS: FollowUpState = { sent: [], done: [] };

/** A private thank-you left for a mentor after a help session. Free text is scrubbed first. */
export interface ThankYouNote {
  id: string;
  /** Person id of the mentor who receives it on their proof of work. */
  mentor: string;
  /** Anonymous label ("a newcomer you helped") — never a real name. */
  fromLabel: string;
  /** Scrubbed text. */
  text: string;
  at: string;
  sessionId: string;
}

const dayOf = (now: string) => now.slice(0, 10);

/**
 * After the interview date, ask once for a quick intel report. Skips closed records, records with no
 * real interview date, apps that already shared intel, and apps already answered.
 */
export function planFollowUps(apps: Application[], now: string, state: FollowUpState): FollowUp[] {
  const today = dayOf(now);
  const out: FollowUp[] = [];
  for (const app of apps) {
    if (isClosed(app.stage) || !app.interviewDate) continue;
    if (today < app.interviewDate) continue;
    if (app.links.some((l) => l.kind === 'intel-shared')) continue;
    if (state.done.includes(app.id)) continue;
    const id = `${app.id}|followup`;
    if (state.sent.some((f) => f.id === id)) continue;
    out.push({
      id,
      appId: app.id,
      owner: app.owner,
      company: app.company,
      role: app.role,
      interviewDate: app.interviewDate,
      at: now,
      text: `Your ${app.company} interview was ${shortDate(app.interviewDate)}. How did it go? Share a quick anonymous intel report — it unlocks points and helps the next student — and update your stage.`,
    });
  }
  return out;
}

/** Scrub phones, @handles, emails and exact dates from a thank-you. Empty after scrub → null. */
export function makeThankYou(raw: string, meta: { mentor: string; sessionId: string; at: string; fromLabel?: string }): ThankYouNote | null {
  const text = scrubIdentityText(raw ?? '');
  if (!text) return null;
  return {
    id: `${meta.sessionId}|thanks`,
    mentor: meta.mentor,
    fromLabel: meta.fromLabel ?? 'a newcomer you helped',
    text,
    at: meta.at,
    sessionId: meta.sessionId,
  };
}

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`;
}
