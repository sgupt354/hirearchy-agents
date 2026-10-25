/** Deterministic, local detection of interview invitations in pasted email/message text. */

export interface ParsedInvite {
  company: string;
  role: string;
  stage: string;
}

/** Phrases that signal an invitation to an upcoming interview. */
const INVITE_SIGNALS = [
  /\binterview invitation\b/,
  /\binvit(?:e|ation|ing|ed)\b[^.]{0,60}\binterview\b/,
  /\btechnical interview\b/,
  /\bphone (?:screen|interview)\b/,
  /\bvirtual interview\b/,
  /\bon-?site interview\b/,
  /\bfinal round\b/,
  /\bnext round\b/,
  /\bschedule (?:your|the|an|a) interview\b/,
  /\binterview\b[^.]{0,60}\b(?:ready to schedule|to schedule)\b/,
  /\bschedule a call\b/,
  /\bmov(?:e|ing) forward\b/,
];

/** Phrases that override any positive signal (past interviews, rejections, postings, offers). */
const DISQUALIFIERS = [
  /\bthanks? (?:you )?for interviewing\b/,
  /\bthank you for (?:your )?(?:time|interest|applying|application)\b/,
  /\bafter (?:careful )?(?:review|consideration)\b/,
  /\bwe (?:have )?(?:decided|regret)\b/,
  /\bnot (?:be )?mov(?:e|ing) forward\b/,
  /\bunfortunately\b/,
  /\bapplication (?:has been )?received\b/,
  /\bwe(?:'ve| have) received your application\b/,
  /\bjob (?:recommendations?|alert|posting)\b/,
  /\brecommended (?:jobs?|for you)\b/,
  /\bnow hiring\b/,
  /\bapply now\b/,
  /\bjob offer\b|\boffer letter\b|\bpleased to offer\b|\bextend(?:ing)? (?:you )?an offer\b/,
];

/** Explicit company allow-list: pattern -> canonical name. */
const COMPANIES: Array<[RegExp, string]> = [
  [/\bmicrosoft\b/, 'Microsoft'],
  [/\bgoogle\b/, 'Google'],
  [/\bamazon\b/, 'Amazon'],
  [/\bapple\b/, 'Apple'],
  [/\bmeta\b/, 'Meta'],
  [/\bnetflix\b/, 'Netflix'],
  [/\bnvidia\b/, 'Nvidia'],
  [/\bstripe\b/, 'Stripe'],
  [/\bopenai\b/, 'OpenAI'],
  [/\banthropic\b/, 'Anthropic'],
];

/** Explicit role allow-list: pattern -> canonical title. */
const ROLES: Array<[RegExp, string]> = [
  [/\b(?:swe|software enginee?r(?:ing)?)\s+intern\b/, 'SWE Intern'],
  [/\bsoftware engineering internship\b/, 'SWE Intern'],
  [/\bdata (?:science|scientist) intern\b/, 'Data Science Intern'],
  [/\bproduct manage(?:ment|r) intern\b/, 'Product Management Intern'],
  [/\bsoftware enginee?r\b/, 'Software Engineer'],
];

function matchFirst(table: Array<[RegExp, string]>, text: string): string | null {
  for (const [pattern, value] of table) {
    if (pattern.test(text)) return value;
  }
  return null;
}

/**
 * Returns the company, role and stage when `text` reads as an interview invitation,
 * or `null` when it does not or when either field cannot be determined confidently.
 */
export async function parseInvite(text: string): Promise<ParsedInvite | null> {
  if (typeof text !== 'string') return null;

  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return null;

  if (DISQUALIFIERS.some((pattern) => pattern.test(normalized))) return null;
  if (!INVITE_SIGNALS.some((pattern) => pattern.test(normalized))) return null;

  const company = matchFirst(COMPANIES, normalized);
  const role = matchFirst(ROLES, normalized);
  if (!company || !role) return null;

  return { company, role, stage: 'interview' };
}

export interface CircleEvent {
  title: string;
  start: string;
  end: string;
  date: string;
  description: string;
}

/** Escape RFC 5545 TEXT values so arbitrary user input cannot break the ICS structure. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** "2026-10-25" + "20:00" -> "20261025T200000" (floating local time, no timezone dependency). */
function toIcsLocalDateTime(date: string, time: string): string {
  const [hours = '00', minutes = '00'] = time.trim().split(':');
  return `${date.replace(/-/g, '')}T${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;
}

function toIcsUtcStamp(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function newUid(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${uuid}@hirearchy`;
}

function toFilename(title: string): string {
  const slug = title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug.toLowerCase() || 'event'}.ics`;
}

/** Build the VCALENDAR text for a prep circle. Exported for testing and reuse. */
export function buildIcs(circle: CircleEvent, now: Date = new Date()): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hirearchy//Agent Network//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${newUid()}`,
    `DTSTAMP:${toIcsUtcStamp(now)}`,
    `DTSTART:${toIcsLocalDateTime(circle.date, circle.start)}`,
    `DTEND:${toIcsLocalDateTime(circle.date, circle.end)}`,
    `SUMMARY:${escapeIcsText(circle.title)}`,
    `DESCRIPTION:${escapeIcsText(circle.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Generate the circle's .ics file in the browser and trigger its download. */
export function downloadIcs(circle: CircleEvent): void {
  const blob = new Blob([buildIcs(circle)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = toFilename(circle.title);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
