// Stand-in for the teammate's integrations module (server-side, branch aditya/integrations).
// Same signatures; local fake behaviour so the demo works offline. Swap the import after merge.

import { messageText } from '../engine/voice';

const COMPANIES = ['Microsoft', 'Google', 'Amazon', 'Meta', 'Apple'];

/** Stub: keyword parse. Returns null unless the text reads like an interview invite from a known company. */
export async function parseInvite(text: string): Promise<{ company: string; role: string; stage: string } | null> {
  if (!/interview/i.test(text) || /unfortunately|not (be )?moving forward|regret/i.test(text)) return null;
  const company = COMPANIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(text));
  if (!company) return null;
  const role = /\b(SWE|software (development |engineering? )?engineer(ing)?)\s*intern(ship)?\b/i.test(text)
    ? 'SWE Intern'
    : /\b(SWE|software engineer)\b/i.test(text)
      ? 'SWE'
      : 'Unknown role';
  return { company, role, stage: 'interview' };
}

/** Stub: the engine's template text, so the stub and the fallback always match. */
export async function generateMessage(input: {
  recipientLabel: string;
  kind: 'proposal' | 'counter' | 'reveal' | 'complete';
  details: Record<string, string>;
}): Promise<string> {
  return messageText(input.kind, input.details);
}

/** Stub: logs instead of pushing to a real phone. */
export async function notifyPhone(text: string): Promise<void> {
  console.info('[notifyPhone stub]', text);
}

/** Stub: builds a minimal .ics in the browser and downloads it. */
export function downloadIcs(circle: { title: string; start: string; end: string; date: string; description: string }): void {
  const stamp = (date: string, hhmm: string) => `${date.replaceAll('-', '')}T${hhmm.replace(':', '')}00`;
  const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hirearchy-agents//stub//EN',
    'BEGIN:VEVENT',
    `UID:prep-circle-${stamp(circle.date, circle.start)}@hirearchy-agents`,
    `DTSTAMP:${stamp(circle.date, circle.start)}`,
    `DTSTART:${stamp(circle.date, circle.start)}`,
    `DTEND:${stamp(circle.date, circle.end)}`,
    `SUMMARY:${escape(circle.title)}`,
    `DESCRIPTION:${escape(circle.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prep-circle.ics';
  a.click();
  URL.revokeObjectURL(url);
}
