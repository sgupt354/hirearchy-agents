// Outreach drafts: short, specific, and always a DRAFT. Nothing here sends anything; the student copies the text or
// opens it in their own mail client, edits it, and sends it themselves.

export type DraftKind = 'recruiter' | 'alum' | 'referrer';

export interface DraftInput {
  kind: DraftKind;
  company: string;
  role: string;
  contact: { name: string; title?: string; email?: string };
  student: { name: string; school?: string; highlight?: string };
}

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

export const MAX_WORDS = 120;
export const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;
const first = (name: string) => name.trim().split(/\s+/)[0] || 'there';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A highlight from the student's own resume, as a clause: "I built a REST API in TypeScript…" (trailing period dropped). */
export function asClause(bullet: string): string {
  const b = bullet.trim().replace(/[.;]+$/, '');
  return b ? `I ${b[0].toLowerCase()}${b.slice(1)}` : '';
}

/** Cold contacts get an easy out; the referral flow doesn't (the referrer already agreed to talk). */
const COURTESY = "If you're not the right person, no worries at all, and I won't follow up again.";

export function templateDraft(d: DraftInput): Draft {
  const to = d.contact.email && EMAIL.test(d.contact.email) ? d.contact.email : '';
  const hi = `Hi ${first(d.contact.name)},`;
  const me = `I'm ${d.student.name.trim() || 'a student'}${d.student.school ? `, a student at ${d.student.school}` : ''}`;
  const proof = d.student.highlight ? `${asClause(d.student.highlight)}.` : '';
  const sign = `Thank you,\n${d.student.name.trim() || ''}`.trim();
  const lines: string[] = [];
  let subject: string;

  if (d.kind === 'recruiter') {
    subject = `${d.role} application: ${d.student.name.trim() || 'student'}`;
    lines.push(hi, `${me}, and I just applied to the ${d.role} role at ${d.company}.`, proof,
      `Could you share what the team looks for at this stage, or point me to the right recruiter?`, COURTESY, sign);
  } else if (d.kind === 'alum') {
    subject = `Quick question about ${d.company}`;
    lines.push(hi, `${me}, and I'm applying to the ${d.role} role at ${d.company}.`, proof,
      `Would you have 15 minutes in the next two weeks to tell me what the work is like${d.contact.title ? ` as a ${d.contact.title}` : ''}?`, COURTESY, sign);
  } else {
    subject = `Thanks for the chat: ${d.role} at ${d.company}`;
    lines.push(hi, `Thanks again for making time for the coffee chat. As you asked, here's my resume tailored to the ${d.role} role at ${d.company}.`, proof,
      'If anything would make it stronger before you decide, I would really value your note.', sign);
  }
  return fit({ to, subject, body: lines.filter(Boolean).join('\n\n') });
}

/** Enforce the word cap by dropping optional lines (highlight first, then the courtesy line), never by cutting words. */
export function fit(draft: Draft): Draft {
  let body = draft.body;
  const drop = (re: RegExp) => (body = body.split('\n\n').filter((l) => !re.test(l)).join('\n\n'));
  if (wordCount(body) > MAX_WORDS) drop(/^I [a-z]/);
  if (wordCount(body) > MAX_WORDS) drop(/won't follow up again/);
  return { ...draft, body };
}

/** Placeholders that must never reach the student: {x}, [x], <x>, TODO, undefined, null. */
export const UNFILLED = /\{[^}]*\}|\[[A-Za-z ]+\]|<[A-Za-z ]+>|\bTODO\b|\bundefined\b|\bnull\b/;

export function gmailComposeUrl(d: Draft): string {
  const q = [['view', 'cm'], ['fs', '1'], ['to', d.to], ['su', d.subject], ['body', d.body]].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://mail.google.com/mail/?${q}`;
}

export function mailtoUrl(d: Draft): string {
  const to = EMAIL.test(d.to) ? d.to : '';
  return `mailto:${to}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}

/** At most `max` drafts per `windowMs`, per session (and per IP on the server). */
export class DraftLimiter {
  #hits: number[] = [];
  constructor(private max = 10, private windowMs = 10 * 60_000) {}
  tryTake(now = Date.now()): boolean {
    this.#hits = this.#hits.filter((t) => now - t < this.windowMs);
    if (this.#hits.length >= this.max) return false;
    this.#hits.push(now);
    return true;
  }
  reset(): void {
    this.#hits = [];
  }
}
