import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src', 'packages'];
const ignoredDirs = new Set(['dist','build','node_modules']);
const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) { if (!ignoredDirs.has(name)) walk(path); }
    else if (path.endsWith('.ts')) checkFile(path);
  }
}

// Matches the TypeScript `any` escape hatch itself (`: any`, `as any`, `any[]`,
// or `any` as a generic type argument like `Array<any>`/`Record<string, any>`)
// -- not the English word "any" appearing in a string literal, identifier, or
// comment (e.g. a `PolicyConditionOperator` value of `'any'`, or prose noting
// something applies "in any jurisdiction").
const explicitAnyPattern = /:\s*any\b|<[^<>]*\bany\b[^<>]*>|\bas\s+any\b|\bany\[\]/;

function checkFile(path) {
  const text = readFileSync(path, 'utf8');
  if (path.startsWith('src/runtime/') && !path.endsWith('/index.ts') && /\bexport\s*\*/.test(text)) violations.push(`${path}: wildcard export is not allowed in runtime internals`);
  if (explicitAnyPattern.test(text)) violations.push(`${path}: explicit any is not allowed`);
}

for (const r of roots) walk(r);

if (violations.length) {
  console.error('Architecture lint violations:');
  for (const v of violations) console.error(`- ${v}`);
  process.exit(1);
}

console.log('Architecture lint passed');
