import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vercel runs each api/ function as native ES modules ("type": "module"), compiled file by file. Node then
// needs every relative import to name its file: '../src/live/http' or a bare directory crashes the function
// on load (FUNCTION_INVOCATION_FAILED). Walk each function's relative imports and require '.js' paths.
// Type-only imports are erased at compile time, so they never load.
const RELATIVE = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+'(\.\.?\/[^']+)'/g;

function walk(file: string, seen: Set<string>, bad: string[]) {
  if (seen.has(file)) return;
  seen.add(file);
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(RELATIVE)) {
    if (!spec.endsWith('.js')) bad.push(`${file}: '${spec}'`);
    const target = join(dirname(file), spec.replace(/\.js$/, '.ts'));
    if (existsSync(target)) walk(target, seen, bad);
  }
}

describe('api functions load as native ES modules', () => {
  const functions = readdirSync('api').filter((f) => f.endsWith('.ts'));

  it.each(functions)('%s imports only explicit .js paths', (fn) => {
    const bad: string[] = [];
    walk(join('api', fn), new Set(), bad);
    expect(bad).toEqual([]);
  });
});
