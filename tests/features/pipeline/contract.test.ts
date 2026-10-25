import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PipelineTab } from '../../../src/features/pipeline';
import { getPipelineInspector, getPublicPipelineStats, MIN_REPORTS } from '../../../src/features/pipeline/logic';

const TAB_SOURCE = readFileSync('src/features/pipeline/Tab.tsx', 'utf8');
const INDEX_SOURCE = readFileSync('src/features/pipeline/index.tsx', 'utf8');
const TABS_SOURCE = readFileSync('src/app/tabs.tsx', 'utf8');

describe('PipelineTab contract', () => {
  it('is exported from the feature index', () => {
    expect(typeof PipelineTab).toBe('function');
    expect(INDEX_SOURCE).toContain("export { PipelineTab } from './Tab'");
  });

  it('uses the shared TabProps type instead of a local duplicate', () => {
    expect(TAB_SOURCE).toMatch(/type TabProps/);
    expect(TAB_SOURCE).not.toMatch(/(type|interface)\s+TabProps\s*[=({]/);
    expect(TAB_SOURCE).toMatch(/PipelineTab\(\{ speed, resetKey \}: TabProps\)/);
  });

  it('imports UI only from the shared kit', () => {
    expect(TAB_SOURCE).toContain("from '../../ui/kit'");
    expect(TAB_SOURCE).not.toMatch(/from '\.\.\/\.\.\/ui\/(?!kit')/);
  });

  it('renders from the public stats API', () => {
    expect(TAB_SOURCE).toContain('getPublicPipelineStats(');
  });

  it('powers the inspector from getPipelineInspector', () => {
    expect(TAB_SOURCE).toContain('getPipelineInspector(');
  });

  it('takes the threshold from logic.ts rather than redefining one', () => {
    expect(TAB_SOURCE).toContain('MIN_REPORTS');
    // No second numeric threshold compared against a report count.
    expect(TAB_SOURCE).not.toMatch(/reportCount\s*[<>]=?\s*\d/);
    expect(TAB_SOURCE).not.toMatch(/const\s+\w*MIN\w*\s*=\s*\d/);
  });

  it('never reaches past the public API into raw cohort data', () => {
    expect(TAB_SOURCE).not.toContain('SEED_COHORTS');
    expect(TAB_SOURCE).not.toMatch(/\.reportCount/);
    expect(TAB_SOURCE).not.toMatch(/stats\.\w+\.value/);
  });

  it('defaults to Microsoft', () => {
    expect(TAB_SOURCE).toMatch(/const DEFAULT_COMPANY = 'Microsoft'/);
    expect(TAB_SOURCE).toMatch(/useState\(DEFAULT_COMPANY\)/);
  });

  it('offers the three demo companies', () => {
    expect(TAB_SOURCE).toMatch(/const COMPANIES = \['Microsoft', 'Stripe', 'Datadog'\]/);
  });

  it('resets when resetKey changes', () => {
    expect(TAB_SOURCE).toMatch(/if \(resetKey !== firstReset\.current\) reset\(\);/);
    expect(TAB_SOURCE).toMatch(/\}, \[resetKey\]\);/);
  });

  it('resets the selected company back to Microsoft', () => {
    const body = TAB_SOURCE.slice(TAB_SOURCE.indexOf('const reset = ()'), TAB_SOURCE.indexOf('const firstReset'));
    expect(body).toContain('setCompany(DEFAULT_COMPANY)');
  });

  it('has a reset call for every useState hook it declares', () => {
    const setters = [...TAB_SOURCE.matchAll(/const \[\w+, (set\w+)\] = useState/g)].map((m) => m[1]);
    const body = TAB_SOURCE.slice(TAB_SOURCE.indexOf('const reset = ()'), TAB_SOURCE.indexOf('const firstReset'));
    expect(setters.length).toBeGreaterThan(0);
    for (const setter of setters) expect(body).toContain(`${setter}(`);
  });

  it('uses the shared speed system', () => {
    expect(TAB_SOURCE).toContain('SPEEDS[speed]');
    expect(TAB_SOURCE).toContain('* pace');
  });

  it('holds no network, storage or randomness', () => {
    expect(TAB_SOURCE).not.toMatch(/\bfetch\(|localStorage|sessionStorage|Math\.random/);
  });

  it('hardcodes no identity data', () => {
    expect(TAB_SOURCE).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(TAB_SOURCE).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
    for (const name of ['Maya', 'Sumit', 'Jordan', 'studentId', 'userId', 'reporterId']) {
      expect(TAB_SOURCE).not.toContain(name);
    }
  });

  it('does not register itself in the app tab registry', () => {
    const code = TABS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/from '\.\.\/features\/pipeline'/);
    expect(code).not.toMatch(/Component:\s*PipelineTab/);
    expect(code).toMatch(/id: 'pipeline'[^}]*Component: soon\(/);
  });
});

describe('PipelineTab renders the privacy-safe story', () => {
  it('shows the Microsoft numbers the demo expects', () => {
    const stats = getPublicPipelineStats('Microsoft');
    expect(stats.pipeline.display).toBe('23 in your pipeline');
    expect(stats.interview.display).toBe('6 at interview');
    expect(stats.offers.display).toBe('Not enough reports yet');
  });

  it('never exposes the suppressed offers value through what the tab renders', () => {
    const stats = getPublicPipelineStats('Microsoft');
    expect(stats.offers.visible).toBe(false);
    expect(JSON.stringify(stats)).not.toContain('"value"');
    expect(stats.offers.display).not.toMatch(/\d/);
  });

  it('explains the suppression with aggregate counts only', () => {
    const offers = getPipelineInspector('Microsoft').find((e) => e.stat === 'offers')!;
    expect(offers.status).toBe('hidden');
    expect(offers.reason).toBe(`2 reports < minimum ${MIN_REPORTS}`);
    expect(Object.keys(offers).sort()).toEqual(['minReports', 'reason', 'reportCount', 'stat', 'status']);
  });

  it('keeps every demo company renderable', () => {
    for (const company of ['Microsoft', 'Stripe', 'Datadog']) {
      const stats = getPublicPipelineStats(company);
      expect(stats.company).toBe(company);
      expect(getPipelineInspector(company)).toHaveLength(3);
    }
  });
});
