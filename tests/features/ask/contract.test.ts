import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AskTab } from '../../../src/features/ask';

const TAB_SOURCE = readFileSync('src/features/ask/Tab.tsx', 'utf8');
const INDEX_SOURCE = readFileSync('src/features/ask/index.tsx', 'utf8');
const LOGIC_SOURCE = readFileSync('src/features/ask/logic.ts', 'utf8');

describe('AskTab contract', () => {
  it('is exported from the feature index', () => {
    expect(typeof AskTab).toBe('function');
    expect(INDEX_SOURCE).toMatch(/export \{ AskTab \}/);
  });

  it('takes a single props argument', () => {
    expect(AskTab.length).toBeLessThanOrEqual(1);
  });

  it('uses the shared TabProps type instead of a local duplicate', () => {
    expect(TAB_SOURCE).toMatch(/type TabProps/);
    expect(TAB_SOURCE).not.toMatch(/(type|interface)\s+TabProps\s*[=({]/);
    expect(TAB_SOURCE).toMatch(/AskTab\(\{ speed, resetKey \}: TabProps\)/);
  });

  it('reads both speed and resetKey from props', () => {
    expect(TAB_SOURCE).toContain('SPEEDS[speed]');
    expect(TAB_SOURCE).toContain('resetKey');
  });

  it('resets its state when resetKey changes', () => {
    expect(TAB_SOURCE).toMatch(/if \(resetKey !== firstReset\.current\) reset\(\);/);
  });

  it('has a reset call for every useState hook it declares', () => {
    const setters = [...TAB_SOURCE.matchAll(/const \[\w+, (set\w+)\] = useState/g)].map((m) => m[1]);
    const body = TAB_SOURCE.slice(TAB_SOURCE.indexOf('const reset = ()'), TAB_SOURCE.indexOf('const firstReset'));
    expect(setters.length).toBeGreaterThan(0);
    for (const setter of setters) expect(body).toContain(`${setter}(`);
  });

  it('imports UI only from the shared kit', () => {
    expect(TAB_SOURCE).toContain("from '../../ui/kit'");
    expect(TAB_SOURCE).not.toMatch(/from '\.\.\/\.\.\/ui\/(?!kit')/);
  });

  it('does not register itself in the tab bar', () => {
    expect(TAB_SOURCE).not.toContain('tabs.tsx');
    expect(INDEX_SOURCE).not.toContain('tabs.tsx');
  });

  it('keeps emoji out of the student-facing copy', () => {
    expect(TAB_SOURCE).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('routes privacy through logic.ts', () => {
    for (const fn of ['parseQuestion', 'answerQuestion', 'startIntroConsent', 'parseQuestionWithLlm']) {
      expect(TAB_SOURCE).toContain(`${fn}(`);
    }
    expect(LOGIC_SOURCE).toContain('scrubQuestion');
    expect(LOGIC_SOURCE).toContain('never');
  });

  it('only turns the LLM parser on behind VITE_USE_LLM_COPY', () => {
    expect(TAB_SOURCE).toContain('VITE_USE_LLM_COPY');
    expect(TAB_SOURCE).toMatch(/parseQuestionWithLlm/);
  });
});
