import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Runs the real test suite and writes the counts the UI's "Privacy proof" badge shows.

const LEAK_SCAN = 'identity is unreadable before full consent and never leaks into events';
const raw = 'node_modules/.cache/vitest-results.json';
const out = 'src/ui/test-summary.json';

mkdirSync('node_modules/.cache', { recursive: true });
const vitest = 'node_modules/vitest/vitest.mjs';
spawnSync(process.execPath, [vitest, 'run', '--reporter=json', `--outputFile=${raw}`], { stdio: 'inherit' });

interface Result { title: string; status: string }
const report = JSON.parse(readFileSync(raw, 'utf8')) as {
  numTotalTests: number;
  numPassedTests: number;
  testResults: { assertionResults: Result[] }[];
};
const leak = report.testResults.flatMap((f) => f.assertionResults).find((t) => t.title === LEAK_SCAN);
const summary = {
  passed: report.numPassedTests,
  total: report.numTotalTests,
  privacyTest: { name: LEAK_SCAN, passed: leak?.status === 'passed' },
};
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Privacy proof: ${summary.passed}/${summary.total} tests passing (leak scan ${summary.privacyTest.passed ? 'passed' : 'FAILED'})`);
