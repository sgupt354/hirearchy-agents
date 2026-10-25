import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  anonymizeReport,
  describeAnonymization,
  getIntelContributionCount,
  MICROSOFT_SEED_INTEL,
  type RawInterviewReport,
} from '../../../src/features/intel/logic';
import { IntelTab } from '../../../src/features/intel';

const TAB_SOURCE = readFileSync('src/features/intel/Tab.tsx', 'utf8');

describe('getIntelContributionCount', () => {
  it('is exported as a function', () => {
    expect(typeof getIntelContributionCount).toBe('function');
  });

  it('returns a deterministic count for a seeded demo student', () => {
    expect(getIntelContributionCount('a2')).toBe(3);
    expect(getIntelContributionCount('a2')).toBe(getIntelContributionCount('a2'));
  });

  it('returns a non-negative integer for every seeded demo id', () => {
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']) {
      const count = getIntelContributionCount(id);
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(['zz9', 'unknown', 'Maya', 'a1 ; drop table', '__proto__', 'constructor'])(
    'returns 0 for the unknown id %j',
    (id) => {
      expect(getIntelContributionCount(id)).toBe(0);
    },
  );

  it.each(['', '   ', '\n\t'])('returns 0 for the blank id %j', (id) => {
    expect(getIntelContributionCount(id)).toBe(0);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(getIntelContributionCount('  A2 ')).toBe(3);
  });

  it('does not mutate anything or drift between calls', () => {
    const before = ['a1', 'a2', 'a3'].map(getIntelContributionCount);
    getIntelContributionCount('a2');
    getIntelContributionCount('unknown');
    expect(['a1', 'a2', 'a3'].map(getIntelContributionCount)).toEqual(before);
  });

  it('never leaks a student id into a shared report or privacy event', () => {
    const raw: RawInterviewReport = {
      company: 'Microsoft',
      round: 'Technical screen',
      topics: ['arrays'],
      difficulty: 3,
      tip: 'Think out loud.',
      interviewDate: '2026-10-24',
    };
    getIntelContributionCount('a1');

    const serialized = JSON.stringify([anonymizeReport(raw), describeAnonymization(raw), MICROSOFT_SEED_INTEL]);
    for (const id of ['a1', 'a2', 'a3', 'a4']) expect(serialized).not.toContain(id);
    expect(serialized).not.toContain('studentId');
  });
});

describe('IntelTab contract', () => {
  it('is exported from the feature index', () => {
    expect(typeof IntelTab).toBe('function');
  });

  it('takes a single props argument', () => {
    expect(IntelTab.length).toBeLessThanOrEqual(1);
  });

  it('uses the shared TabProps type instead of a local duplicate', () => {
    expect(TAB_SOURCE).toMatch(/type TabProps/);
    expect(TAB_SOURCE).not.toMatch(/(type|interface)\s+TabProps\s*[=({]/);
    expect(TAB_SOURCE).toMatch(/IntelTab\(\{ speed, resetKey \}: TabProps\)/);
  });

  it('reads both speed and resetKey from props', () => {
    expect(TAB_SOURCE).toContain('SPEEDS[speed]');
    expect(TAB_SOURCE).toContain('resetKey');
  });

  it('resets its state when resetKey changes', () => {
    expect(TAB_SOURCE).toMatch(/if \(resetKey !== firstReset\.current\) reset\(\);/);
  });

  it('clears every piece of journey state in reset()', () => {
    const body = TAB_SOURCE.slice(TAB_SOURCE.indexOf('const reset = ()'), TAB_SOURCE.indexOf('const firstReset'));
    for (const setter of [
      'setStep', 'setRound', 'setTopics', 'setDifficulty', 'setDraft',
      'setSaid', 'setCredits', 'setShared', 'setEvents', 'setTyping', 'setDrawer',
    ]) {
      expect(body).toContain(`${setter}(`);
    }
  });

  it('has a reset call for every useState hook it declares', () => {
    const setters = [...TAB_SOURCE.matchAll(/const \[\w+, (set\w+)\] = useState/g)].map((m) => m[1]);
    const body = TAB_SOURCE.slice(TAB_SOURCE.indexOf('const reset = ()'), TAB_SOURCE.indexOf('const firstReset'));
    expect(setters.length).toBeGreaterThan(0);
    for (const setter of setters) expect(body).toContain(`${setter}(`);
  });

  it('delegates every privacy decision to logic.ts', () => {
    for (const fn of [
      'anonymizeReport', 'checkIntelAccess', 'recordContribution', 'selectRelevantIntel',
      'describeAnonymization', 'describeAccess',
    ]) {
      expect(TAB_SOURCE).toContain(`${fn}(`);
    }
  });

  it('imports UI only from the shared kit', () => {
    expect(TAB_SOURCE).toContain("from '../../ui/kit'");
    expect(TAB_SOURCE).not.toMatch(/from '\.\.\/\.\.\/ui\/(?!kit')/);
  });

  it('injects now into the gate rather than letting logic call the clock', () => {
    expect(TAB_SOURCE).toMatch(/now,?\s*\n?\s*\}\);/);
  });
});
