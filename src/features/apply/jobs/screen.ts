// Evidence-backed screening (ported from jobapp app/screen.py): every label carries the exact sentence it came from,
// and a posting that says nothing is "needs verification", never assumed friendly. Pure: text in, labels out.

export type F1Status = 'compatible' | 'needs_verification' | 'incompatible';
export type GradStatus = 'fits' | 'not_excluded' | 'excluded' | 'unclear';

export interface Screen<S extends string> {
  status: S;
  /** The exact sentence from the posting (trimmed to 320 characters), or null when the posting is silent. */
  evidence: string | null;
}

const MAX_EVIDENCE = 320;

/** Sentences, splitting on . ! ? or newlines but not inside "U.S." / "U.S.A.". */
export function sentences(text: string): string[] {
  if (!text) return [];
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\bU\.S\.A\./gi, 'U.S.A\u0000').replace(/\bU\.S\./gi, 'U.S\u0000');
  return clean
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])|\n+/)
    .map((s) => s.replace(/\u0000/g, '.').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The first sentence matching any pattern (case-insensitive), trimmed for display. */
export function findSentence(text: string, patterns: RegExp[]): string | null {
  for (const s of sentences(text)) {
    const low = s.toLowerCase();
    if (patterns.some((p) => p.test(low))) return s.length <= MAX_EVIDENCE ? s : `${s.slice(0, MAX_EVIDENCE - 3)}...`;
  }
  return null;
}

// ---------------------------------------------------------------- F-1 / work authorization

const F1_INCOMPATIBLE = [
  /(?:must|required to|need to)\b[^.]{0,25}be a (?:u\.?s\.?|united states) citizen/,
  /be a (?:u\.?s\.?|united states) citizen/,
  /u\.?s\.? citizenship (?:is )?required/,
  /citizens?\s+only/,
  /requires?\b[^.]{0,30}\bsecurity clearance/,
  /security clearance (?:is )?required/,
  /able to obtain a? ?security clearance/,
  /permanent(?:ly)? (?:authorized|resident).{0,40}without sponsorship/,
  /not (?:able|willing) to sponsor/,
  /will not sponsor/,
  /do(?:es)? not (?:provide|offer) (?:visa )?sponsorship/,
  /no (?:visa )?sponsorship (?:is )?(?:available|provided|offered)/,
  /unable to sponsor/,
  /without (?:the need for )?(?:current or future )?sponsorship/,
  /not require sponsorship (?:now or in the future)/,
];

// Each needs an immigration / work-authorization word, so event or relocation "sponsorship" doesn't count.
const F1_COMPATIBLE = [
  /visa sponsorship (?:is )?(?:available|offered|provided)/,
  /(?:we|company|employer) (?:will |can |are willing to |do |are happy to |offer to )?sponsor\w* (?:your |a |an |work )?(?:visa|visas|h-?1b|h1b|green card|employment authorization)/,
  /(?:happy|willing|able|glad) to sponsor (?:visa|visas|work authorization|candidates|you)/,
  /sponsor\w* (?:is |are )?(?:available|offered|provided) for (?:visa|work authorization|employment)/,
  /open to (?:sponsoring )?(?:opt|cpt|f-?1)/,
  /(?:welcome|welcomes|accept|accepts|encourage|encourages)\b[^.]{0,25}\b(?:opt|cpt|f-?1)\b/,
  /(?:opt|cpt|f-?1)\s+(?:candidates|students|visa holders)?\s*(?:are |is )?(?:welcome|eligible|accepted|encouraged)/,
  /(?:visa |immigration )?sponsorship (?:now or in the future|is available)/,
  /support(?:s)? (?:visa |work[\s-]?authorization )sponsorship/,
  /will (?:provide|offer) (?:visa )?sponsorship/,
];

/** An explicit "no" wins (safety first), then an explicit "yes"; silence is "needs verification". */
export function classifyF1(description: string): Screen<F1Status> {
  const no = findSentence(description, F1_INCOMPATIBLE);
  if (no) return { status: 'incompatible', evidence: no };
  const yes = findSentence(description, F1_COMPATIBLE);
  if (yes) return { status: 'compatible', evidence: yes };
  return { status: 'needs_verification', evidence: null };
}

// ---------------------------------------------------------------- graduation window

const ENTRY_SIGNAL = /\b(new\s*grad(?:uate)?s?|university\s*grad(?:uate)?|recent\s*grad(?:uate)?|early[\s-]*career|entry[\s-]*level|associate|junior|jr\.?|campus|rotational|no (?:prior )?experience (?:required|necessary)|(?:currently )?(?:pursuing|enrolled in)\b[^.]{0,40}(?:bachelor|master|degree|b\.?s\.?|m\.?s\.?))\b/;

/**
 * Does a student graduating in `gradYear` (spring) fit the posting's graduation window? From the description only:
 * 1. a window that ends before them → excluded; 2. a window naming their year or the year before → fits;
 * 3. only earlier years → excluded; 4. entry-level with no window → not excluded; 5. otherwise unclear.
 */
export function classifyGradWindow(description: string, gradYear: number, entryLevel = false): Screen<GradStatus> {
  const prev = gradYear - 1;
  const past = Array.from({ length: Math.max(0, gradYear - 2 - 2000 + 1) }, (_, i) => 2000 + i).join('|');
  const lateLast = `december\\s+${prev}|fall\\s+${prev}|winter\\s+${prev}`;
  const excludes = new RegExp(
    `(must (?:have )?(?:already )?graduat\\w*` +
      `|graduat\\w*[^.\\n]{0,20}(?:on or )?(?:before|by|no later than)[^.\\n]{0,12}(?:${past}|${lateLast})` +
      `|(?:graduat\\w*|start)[^.\\n]{0,25}(?:in |by )?(?:${lateLast}|${past})(?![^.\\n]{0,20}${gradYear}))`,
  );
  const fits = new RegExp(`(graduat\\w*|degree|complet\\w*|class of)[^.\\n]{0,40}?(${prev}|${gradYear}|(?:spring|summer|fall|winter|may|december)\\s+(?:${prev}|${gradYear}))`);
  const pastOnly = new RegExp(`(graduat\\w*|degree|class of)\\W{0,30}(${past})\\b`);

  const ex = findSentence(description, [excludes]);
  if (ex) return { status: 'excluded', evidence: ex };
  const ok = findSentence(description, [fits]);
  if (ok) return { status: 'fits', evidence: ok };
  const old = findSentence(description, [pastOnly]);
  if (old && !findSentence(description, [new RegExp(`${prev}|${gradYear}`)])) return { status: 'excluded', evidence: old };
  const entry = findSentence(description, [ENTRY_SIGNAL]);
  if (entry || entryLevel) return { status: 'not_excluded', evidence: entry };
  return { status: 'unclear', evidence: null };
}

/** The graduation year from the student's own profile (last year in their first education entry), or null. */
export function gradYearOf(dates: string | undefined): number | null {
  const years = (dates ?? '').match(/\b20\d\d\b/g);
  return years ? Number(years.at(-1)) : null;
}

export const F1_LABEL: Record<F1Status, string> = { compatible: 'F-1 friendly', needs_verification: 'F-1: needs verification', incompatible: 'F-1: not eligible' };
export const GRAD_LABEL = (s: GradStatus, year: number) =>
  ({ fits: `Fits May ${year} grads`, not_excluded: `May ${year} not excluded`, excluded: `Excludes May ${year} grads`, unclear: 'Grad window unclear' })[s];
