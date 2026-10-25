import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FindTab } from '../../../src/features/find';

const TAB_SOURCE = readFileSync('src/features/find/Tab.tsx', 'utf8');
const INDEX_SOURCE = readFileSync('src/features/find/index.tsx', 'utf8');
const TABS_SOURCE = readFileSync('src/app/tabs.tsx', 'utf8');

describe('FindTab contract', () => {
  it('is exported from the feature index', () => {
    expect(typeof FindTab).toBe('function');
    expect(INDEX_SOURCE).toContain("export { FindTab } from './Tab'");
  });

  it('takes a single props argument', () => {
    expect(FindTab.length).toBeLessThanOrEqual(1);
  });

  it('uses the shared TabProps type instead of a local duplicate', () => {
    expect(TAB_SOURCE).toMatch(/type TabProps/);
    expect(TAB_SOURCE).not.toMatch(/(type|interface)\s+TabProps\s*[=({]/);
    expect(TAB_SOURCE).toMatch(/FindTab\(\{ speed, resetKey \}: TabProps\)/);
  });

  it('imports UI only from the shared kit', () => {
    expect(TAB_SOURCE).toContain("from '../../ui/kit'");
    expect(TAB_SOURCE).not.toMatch(/from '\.\.\/\.\.\/ui\/(?!kit')/);
  });

  it('uses the shared speed system rather than inventing one', () => {
    expect(TAB_SOURCE).toContain('SPEEDS[speed]');
    expect(TAB_SOURCE).toContain('* pace');
  });

  it('resets when resetKey changes', () => {
    expect(TAB_SOURCE).toMatch(/if \(resetKey !== firstReset\.current\) reset\(\);/);
    expect(TAB_SOURCE).toMatch(/\}, \[resetKey\]\);/);
  });

  it('has a reset call for every useState hook it declares', () => {
    const setters = [...TAB_SOURCE.matchAll(/const \[\w+, (set\w+)\] = useState/g)].map((m) => m[1]);
    const body = TAB_SOURCE.slice(TAB_SOURCE.indexOf('const reset = ()'), TAB_SOURCE.indexOf('const firstReset'));
    expect(setters.length).toBeGreaterThan(0);
    for (const setter of setters) expect(body).toContain(`${setter}(`);
  });

  it('delegates every decision to logic.ts', () => {
    for (const fn of ['surfacedMatches(', 'trackJob(', 'dismissJob(', 'describeMatch(', 'describeTrack(', 'describeDismiss(']) {
      expect(TAB_SOURCE).toContain(fn);
    }
  });

  it('holds no backend, network or global state', () => {
    expect(TAB_SOURCE).not.toMatch(/\bfetch\(|localStorage|sessionStorage|Math\.random/);
  });

  it('credits Job Sniper so the Track 1 link is visible', () => {
    expect(TAB_SOURCE).toContain('Job Sniper');
  });

  it('is registered by the app tab registry, never by itself', () => {
    // Updated at merge (Phase G): the shell now registers FindTab; the tab itself still never touches app/tabs.
    const code = TABS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/from '\.\.\/features\/find'/);
    expect(code).toMatch(/id: 'find'[^}]*Component: FindTab/);
    expect(TAB_SOURCE).not.toContain('app/tabs');
  });
});
