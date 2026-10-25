import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIcs, downloadIcs } from '../../src/integrations';

const circle = {
  title: 'Microsoft SWE Interview Prep Circle',
  date: '2026-10-25',
  start: '20:00',
  end: '21:00',
  description: 'Interview prep session',
};

/** Captures everything downloadIcs touches: Blob, object URLs and the anchor. */
function stubBrowser() {
  const blobs: Array<{ parts: unknown[]; type: string }> = [];
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();

  vi.stubGlobal(
    'Blob',
    class {
      parts: unknown[];
      type: string;
      constructor(parts: unknown[], options: { type: string }) {
        this.parts = parts;
        this.type = options.type;
        blobs.push({ parts, type: options.type });
      }
    },
  );
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  vi.stubGlobal('document', {
    createElement: vi.fn(() => anchor),
    body: { appendChild: vi.fn() },
  });

  return { blobs, anchor, createObjectURL, revokeObjectURL, text: () => String(blobs[0]?.parts[0] ?? '') };
}

describe('downloadIcs — browser download behaviour', () => {
  let browser: ReturnType<typeof stubBrowser>;

  beforeEach(() => {
    browser = stubBrowser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Blob with the text/calendar MIME type', () => {
    downloadIcs(circle);
    expect(browser.blobs).toHaveLength(1);
    expect(browser.blobs[0].type).toBe('text/calendar;charset=utf-8');
  });

  it('creates and revokes an object URL', () => {
    downloadIcs(circle);
    expect(browser.createObjectURL).toHaveBeenCalledTimes(1);
    expect(browser.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('points an anchor at the object URL with a .ics filename and clicks it', () => {
    downloadIcs(circle);
    expect(browser.anchor.href).toBe('blob:mock-url');
    expect(browser.anchor.download).toMatch(/\.ics$/);
    expect(browser.anchor.download).toBe('microsoft-swe-interview-prep-circle.ics');
    expect(browser.anchor.click).toHaveBeenCalledTimes(1);
  });

  it('removes the anchor after clicking', () => {
    downloadIcs(circle);
    expect(browser.anchor.remove).toHaveBeenCalledTimes(1);
  });

  it('falls back to a safe filename when the title has no usable characters', () => {
    downloadIcs({ ...circle, title: '///' });
    expect(browser.anchor.download).toBe('event.ics');
  });
});

describe('downloadIcs — calendar contents', () => {
  const ics = buildIcs(circle, new Date('2026-10-24T03:04:05.000Z'));

  it('wraps a VEVENT in a VCALENDAR', () => {
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('includes the required calendar headers', () => {
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Hirearchy//Agent Network//EN');
    expect(ics).toContain('CALSCALE:GREGORIAN');
  });

  it('uses CRLF line endings', () => {
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('includes the supplied title as the summary', () => {
    expect(ics).toContain('SUMMARY:Microsoft SWE Interview Prep Circle');
  });

  it('derives DTSTART and DTEND from the supplied date and times', () => {
    expect(ics).toContain('DTSTART:20261025T200000');
    expect(ics).toContain('DTEND:20261025T210000');
  });

  it('pads single-digit hours', () => {
    const padded = buildIcs({ ...circle, start: '8:30', end: '09:05' });
    expect(padded).toContain('DTSTART:20261025T083000');
    expect(padded).toContain('DTEND:20261025T090500');
  });

  it('writes DTSTAMP as a UTC ICS timestamp', () => {
    expect(ics).toContain('DTSTAMP:20261024T030405Z');
  });

  it('generates a unique UID per call', () => {
    const first = buildIcs(circle).match(/UID:(.+)/)![1];
    const second = buildIcs(circle).match(/UID:(.+)/)![1];
    expect(first).not.toBe(second);
    expect(first.trim()).not.toBe('');
  });

  it('escapes backslashes, commas and semicolons', () => {
    const escaped = buildIcs({ ...circle, title: 'A,B;C\\D', description: 'x,y;z' });
    expect(escaped).toContain('SUMMARY:A\\,B\\;C\\\\D');
    expect(escaped).toContain('DESCRIPTION:x\\,y\\;z');
  });

  it('escapes newlines so a description cannot inject a new ICS property', () => {
    const injected = buildIcs({
      ...circle,
      description: 'line one\r\nSUMMARY:evil\nEND:VEVENT',
    });
    expect(injected).toContain('DESCRIPTION:line one\\nSUMMARY:evil\\nEND:VEVENT');
    expect(injected).not.toContain('\r\nSUMMARY:evil');
    expect(injected.match(/\r\nEND:VEVENT/g)).toHaveLength(1);
    expect(injected.match(/\r\nSUMMARY:/g)).toHaveLength(1);
  });
});
