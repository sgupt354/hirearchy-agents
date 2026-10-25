import { describe, expect, it } from 'vitest';
import type { TrackedPosting } from '../../../src/features/apply/store';
import { TRACKER_COLUMNS, csvField, toCsv, toJson, trackerFileName, trackerRows } from '../../../src/features/apply/tracker/export';

const p = (over: Partial<TrackedPosting>): TrackedPosting => ({
  id: 'x', company: 'Stripe', provider: 'greenhouse', title: 'Software Engineer, Intern', location: 'Seattle, WA', url: 'https://stripe.com/jobs/1', posted: null,
  description: '', score: 0, isIntern: true, visaFlag: false, years: null, reasons: [], source: 'live', trackedAt: '8:00 AM', ...over,
});

describe('tracker export (generic CSV / JSON; Huntr has no student import API)', () => {
  it('CSV: header row, one row per tracked job, CRLF line endings', () => {
    const csv = toCsv(trackerRows([p({}), p({ company: 'Ramp', title: 'SWE Intern', location: 'New York; San Francisco', source: 'demo', url: '' })], '2026-10-25'));
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(TRACKER_COLUMNS.join(','));
    expect(lines[1]).toBe('Stripe,"Software Engineer, Intern",Saved,"Seattle, WA",https://stripe.com/jobs/1,2026-10-25,Live job board');
    expect(lines[2]).toBe('Ramp,SWE Intern,Saved,New York; San Francisco,,2026-10-25,Saved posting');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('CSV escaping: quotes doubled, newlines quoted, formulas neutralised', () => {
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('plain')).toBe('plain');
  });

  it('JSON: versioned, round-trips', () => {
    const json = JSON.parse(toJson(trackerRows([p({})], '2026-10-25'), '2026-10-25T08:00:00Z'));
    expect(json).toMatchObject({ format: 'hirearchy-tracker', version: 1, jobs: [{ company: 'Stripe', status: 'Saved', source: 'Live job board' }] });
  });

  it('empty tracker still exports a valid header', () => {
    expect(toCsv([])).toBe(`${TRACKER_COLUMNS.join(',')}\r\n`);
    expect(trackerFileName('csv', '2026-10-25')).toBe('Hirearchy tracker 2026-10-25.csv');
  });
});
