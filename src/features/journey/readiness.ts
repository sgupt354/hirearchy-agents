import type { Application } from '../apply/applications';
import { PACKS } from '../community/packs';
import { MICROSOFT_SEED_INTEL, selectRelevantIntel } from '../intel/logic';

// Readiness for one interview. Pure and deterministic: every number comes from the application record (what the
// student actually did) or from data that exists (the company's question packs, its intel reports). A part with no
// data behind it is left out of the score, never counted as 0 or as full.

export type PartId = 'mocks' | 'topics' | 'intel' | 'circle';

export interface ReadinessPart {
  id: PartId;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export type NextTab = 'mock' | 'prep' | 'intel';

export type Readiness =
  | { ready: true; score: number; parts: ReadinessPart[]; daysLeft: number; next: { text: string; tab: NextTab } | null; missingTopics: string[] }
  | { ready: false; reason: string };

export const MOCKS_FOR_FULL = 2;
const MAX: Record<PartId, number> = { mocks: 25, topics: 35, intel: 15, circle: 25 };

/** The topics a company's question packs cover (empty when there is no pack for it). */
export function packTopics(company: string): string[] {
  const areas = PACKS.filter((p) => p.company.toLowerCase() === company.trim().toLowerCase()).map((p) => (p.area === 'Behavioral and final' ? 'Behavioral' : p.area));
  return [...new Set(areas)];
}

/** How many anonymized intel reports exist for the company. */
export const intelAvailable = (company: string) => selectRelevantIntel(MICROSOFT_SEED_INTEL, company).length;

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function readiness(app: Application, today: string): Readiness {
  if (!app.interviewDate) return { ready: false, reason: 'No interview date yet. It comes from your interview invite.' };
  const daysLeft = days(today, app.interviewDate);
  if (daysLeft < 0) return { ready: false, reason: 'The interview has passed.' };

  const linked = (kind: string) => app.links.filter((l) => l.kind === kind);
  const parts: ReadinessPart[] = [];

  const mocks = linked('mock').length;
  parts.push({
    id: 'mocks',
    label: 'Mock interviews',
    points: Math.round((Math.min(mocks, MOCKS_FOR_FULL) / MOCKS_FOR_FULL) * MAX.mocks),
    max: MAX.mocks,
    detail: `${mocks} of ${MOCKS_FOR_FULL} done`,
  });

  const wanted = packTopics(app.company);
  const practiced = new Set(app.links.flatMap((l) => l.topics ?? []));
  const covered = wanted.filter((t) => practiced.has(t));
  const missingTopics = wanted.filter((t) => !practiced.has(t));
  if (wanted.length) {
    parts.push({
      id: 'topics',
      label: `Topics in the ${app.company} question pack`,
      points: Math.round((covered.length / wanted.length) * MAX.topics),
      max: MAX.topics,
      detail: `${covered.length} of ${wanted.length} covered${covered.length ? ` (${covered.join(', ')})` : ''}${missingTopics.length ? `; missing ${missingTopics.join(', ')}` : ''}`,
    });
  }

  const available = intelAvailable(app.company);
  if (available) {
    const read = Math.min(Math.max(0, ...linked('intel').map((l) => l.count ?? 0)), available);
    parts.push({ id: 'intel', label: 'Intel reports read', points: Math.round((read / available) * MAX.intel), max: MAX.intel, detail: `${read} of ${available} read` });
  }

  const circle = linked('prep').length > 0;
  parts.push({ id: 'circle', label: 'Prep circle', points: circle ? MAX.circle : 0, max: MAX.circle, detail: circle ? 'Attended' : 'Not yet' });

  const total = parts.reduce((a, p) => a + p.max, 0);
  const score = Math.round((parts.reduce((a, p) => a + p.points, 0) / total) * 100);
  return { ready: true, score, parts, daysLeft, next: nextStep(app, parts, missingTopics, daysLeft), missingTopics };
}

/** The single most useful next step, from the biggest gap. */
function nextStep(app: Application, parts: ReadinessPart[], missing: string[], daysLeft: number): { text: string; tab: NextTab } | null {
  const part = (id: PartId) => parts.find((p) => p.id === id);
  const when = daysLeft <= 2 ? ' tonight' : '';
  if (missing.length) return { text: `one ${missing[0]} mock${when}`, tab: 'mock' };
  if (part('circle')!.points === 0) return { text: 'join a prep circle', tab: 'prep' };
  const intel = part('intel');
  if (intel && intel.points < intel.max) return { text: `read the ${app.company} intel`, tab: 'intel' };
  if (part('mocks')!.points < part('mocks')!.max) return { text: `one more mock${when}`, tab: 'mock' };
  return null;
}
