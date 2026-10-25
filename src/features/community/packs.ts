import type { Skill } from '../../engine/types';
import { MICROSOFT_SEED_INTEL, type SharedInterviewReport } from '../intel/logic';
import { REPORTS, type Report } from '../mock/questions';
import { perksFor, type Level } from './points';

// Question packs, unlocked by level. Built only from existing anonymized data (the mock interview reports and the
// shared intel reports), copied word for word with their source. Nothing here is written by a model or invented.

export type PackSource = 'Anonymized interview report' | 'Shared intel report';

export interface PackItem {
  /** The source record's id: "ms-t-1", or "intel-2" for the third Microsoft intel report. */
  sourceId: string;
  source: PackSource;
  kind: 'question' | 'tip';
  text: string;
  /** What interviewers looked for (questions only). */
  lookFor?: string;
}

export interface QuestionPack {
  id: string;
  title: string;
  company: string;
  area: Skill | 'Behavioral and final';
  items: PackItem[];
}

const fromReport = (r: Report): PackItem => ({ sourceId: r.id, source: 'Anonymized interview report', kind: 'question', text: r.prompt, lookFor: r.lookFor });
const fromIntel = (r: SharedInterviewReport, i: number): PackItem => ({ sourceId: `intel-${i}`, source: 'Shared intel report', kind: 'tip', text: r.tip });

const reports = (pred: (r: Report) => boolean) => REPORTS.filter(pred).map(fromReport);
const intel = (pred: (r: SharedInterviewReport) => boolean) =>
  MICROSOFT_SEED_INTEL.map((r, i) => [r, i] as const).filter(([r]) => pred(r)).map(([r, i]) => fromIntel(r, i));

/** The catalog, in unlock order after the starter pack. */
export const PACKS: readonly QuestionPack[] = [
  {
    id: 'ms-dsa',
    title: 'Microsoft technical: DSA',
    company: 'Microsoft',
    area: 'DSA',
    items: [...reports((r) => r.company === 'Microsoft' && r.round === 'Technical' && r.area === 'DSA'), ...intel((r) => /^Technical/.test(r.round))],
  },
  {
    id: 'ms-sd',
    title: 'Microsoft technical: system design',
    company: 'Microsoft',
    area: 'System Design',
    items: reports((r) => r.company === 'Microsoft' && r.area === 'System Design'),
  },
  {
    id: 'ms-behavioral',
    title: 'Microsoft behavioral and final round',
    company: 'Microsoft',
    area: 'Behavioral and final',
    items: [...reports((r) => r.company === 'Microsoft' && r.area === 'Behavioral'), ...intel((r) => r.round === 'Behavioral' || r.round === 'Final round')],
  },
  {
    id: 'google-tech',
    title: 'Google technical',
    company: 'Google',
    area: 'DSA',
    items: reports((r) => r.company === 'Google'),
  },
];

/** How many packs a level unlocks: Newcomer 1 (the free starter), Contributor 3, Mentor and up all. */
export function packLimit(level: Level): number {
  const n = perksFor(level).packs;
  return n === 'all' ? PACKS.length : n;
}

/** The free starter pack: the one closest to what the newcomer asked for. */
export function starterPackFor(need: { company: string; topic: string }): string {
  return (
    PACKS.find((p) => p.company === need.company && (p.area === need.topic || (need.topic === 'Behavioral' && p.area === 'Behavioral and final')))?.id ??
    PACKS.find((p) => p.company === need.company)?.id ??
    PACKS[0].id
  );
}

/** Unlocked packs for a level: the starter first, then the catalog in order, up to the level's limit. */
export function unlockedPacks(level: Level, starter: string = PACKS[0].id): QuestionPack[] {
  const order = [...PACKS.filter((p) => p.id === starter), ...PACKS.filter((p) => p.id !== starter)];
  return structuredClone(order.slice(0, packLimit(level)));
}
