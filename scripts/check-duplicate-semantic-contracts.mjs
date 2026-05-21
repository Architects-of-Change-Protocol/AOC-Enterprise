/**
 * Detects duplicate semantic contract definitions across packages.
 *
 * Specifically looks for type aliases and interfaces whose names
 * exist in more than one package outside of the canonical contracts package.
 * This catches cases where semantic concepts are redefined locally instead
 * of being consumed from @aoc-enterprise/canonical-runtime-contracts.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANONICAL_PACKAGE_PATH = 'packages/canonical-runtime-contracts';
const sourceExt = new Set(['.ts', '.mts', '.cts']);

const typeDeclaration = /^\s*(?:export\s+)?(?:type|interface)\s+([A-Z][A-Za-z0-9]+)/gm;
const constDeclaration = /^\s*export\s+const\s+([A-Z][A-Z0-9_]+)\s*=/gm;

const definitionMap = new Map();
const violations = [];

function walk(dir, packageName) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
      walk(path, packageName);
    } else if ([...sourceExt].some((ext) => path.endsWith(ext))) {
      collectDefinitions(path, packageName);
    }
  }
}

function collectDefinitions(filePath, packageName) {
  const text = readFileSync(filePath, 'utf8');

  for (const pattern of [typeDeclaration, constDeclaration]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (!definitionMap.has(name)) {
        definitionMap.set(name, []);
      }
      definitionMap.get(name).push({ filePath, packageName });
    }
  }
}

try {
  const packages = readdirSync('packages');
  for (const pkg of packages) {
    const pkgPath = join('packages', pkg);
    const st = statSync(pkgPath);
    if (!st.isDirectory()) continue;

    const srcPath = join(pkgPath, 'src');
    try {
      walk(srcPath, pkg);
    } catch {
      walk(pkgPath, pkg);
    }
  }
} catch (e) {
  console.error('Failed to scan packages:', e.message);
  process.exit(1);
}

for (const [name, locations] of definitionMap) {
  if (locations.length <= 1) continue;

  const nonCanonical = locations.filter((l) => !l.filePath.includes(CANONICAL_PACKAGE_PATH));
  const inCanonical = locations.some((l) => l.filePath.includes(CANONICAL_PACKAGE_PATH));

  if (nonCanonical.length > 1 && !inCanonical) {
    violations.push(
      `Duplicate definition "${name}" found in ${nonCanonical.length} non-canonical locations:\n` +
      nonCanonical.map((l) => `    ${l.filePath}`).join('\n')
    );
  }
}

if (violations.length) {
  console.error('Duplicate semantic contract violations:');
  for (const v of violations) console.error(`\n  ${v}`);
  console.error(`\nMove these to @aoc-enterprise/canonical-runtime-contracts.`);
  process.exit(1);
}

console.log('Duplicate semantic contract check passed');
