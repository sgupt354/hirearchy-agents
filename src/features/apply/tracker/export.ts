import type { TrackedPosting, TrackerStatus } from '../store';

// Tracker export. Huntr has no public API or documented import format for individual job seekers (its API is for
// organizations: https://docs.huntr.co/), so we export a generic tracker the student can keep or bring into any tool
// that imports CSV / JSON, and link to Huntr for manual entry or its Chrome extension.

export const HUNTR_URL = 'https://huntr.co/';
export const TRACKER_COLUMNS = ['Company', 'Job Title', 'Status', 'Location', 'URL', 'Date Saved', 'Source'] as const;

export interface TrackerRow {
  company: string;
  title: string;
  status: TrackerStatus;
  location: string;
  url: string;
  dateSaved: string;
  source: 'Live job board' | 'Demo data';
}

export function trackerRows(tracked: TrackedPosting[], savedOn: string): TrackerRow[] {
  return tracked.map((p) => ({
    company: p.company,
    title: p.title,
    status: p.status ?? 'Saved',
    location: p.location,
    url: p.url,
    dateSaved: savedOn,
    source: p.source === 'live' ? 'Live job board' : 'Demo data',
  }));
}

/** RFC 4180 field: quote when needed, double inner quotes, and neutralise spreadsheet formulas (=, +, -, @). */
export function csvField(v: string): string {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: TrackerRow[]): string {
  const lines = [TRACKER_COLUMNS.join(',')];
  for (const r of rows) lines.push([r.company, r.title, r.status, r.location, r.url, r.dateSaved, r.source].map(csvField).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export function toJson(rows: TrackerRow[], exportedAt: string): string {
  return JSON.stringify({ format: 'hirearchy-tracker', version: 1, exportedAt, jobs: rows }, null, 2);
}

export interface TrackerSummary {
  tracked: number;
  /** Everything past "Saved": Applied, OA, Interview, Offer or Rejected. */
  applied: number;
  oa: number;
  interviews: number;
  offers: number;
  rejected: number;
  /** (Interview + Offer) / applied, 0 when nothing is applied yet (jobapp's definition). */
  interviewRate: number;
}

export function summarize(rows: Pick<TrackerRow, 'status'>[]): TrackerSummary {
  const n = (s: TrackerStatus) => rows.filter((r) => r.status === s).length;
  const applied = rows.filter((r) => r.status !== 'Saved').length;
  const interviews = n('Interview');
  const offers = n('Offer');
  return { tracked: rows.length, applied, oa: n('OA'), interviews, offers, rejected: n('Rejected'), interviewRate: applied ? (interviews + offers) / applied : 0 };
}

export const trackerFileName = (ext: 'csv' | 'json', date: string) => `Hirearchy tracker ${date}.${ext}`;
