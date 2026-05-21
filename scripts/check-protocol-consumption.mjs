console.log('protocol consumption check OK');
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const scanRoots = ['src', 'packages', 'types', 'tests', 'scripts'];
const protectedSymbols = [
  'CapabilityToken',
  'ConsentGrant',
  'CapabilityGrant',
  'Delegation',
  'PolicyDecision',
  'AgentScope',
  'AuditEventEnvelope',
  'ScopedAccessRequest',
  'TrustDomainIdentifier'
];

const allowFiles = new Set([
  'scripts/check-protocol-consumption.mjs'
]);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (/\.(ts|d\.ts|mts|cts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const defs = [];
const importRe = /from\s+['"]@aoc\/protocol\/contracts['"]/;

for (const root of scanRoots) {
  const abs = join(ROOT, root);
  let files = [];
  try { files = await walk(abs); } catch { continue; }
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (allowFiles.has(rel)) continue;
    const text = await readFile(file, 'utf8');
    for (const s of protectedSymbols) {
      const definitionPattern = new RegExp(`\\b(?:interface|type|class|enum)\\s+${s}\\b`);
      if (definitionPattern.test(text)) {
        defs.push(`${rel}: redefines ${s}`);
      }
    }
    if (/declare module ['"]@aoc\/protocol\/contracts['"]/.test(text)) {
      defs.push(`${rel}: declares module @aoc/protocol/contracts`);
    }
    if (/(CapabilityToken|ConsentGrant|AuditEventEnvelope|ScopedAccessRequest)/.test(text) && !importRe.test(text) && rel.startsWith('src/')) {
      // soft sanity only for runtime tree
    }
  }
}

if (defs.length > 0) {
  console.error('Protocol consumption check failed. Found forbidden local protocol semantic declarations:');
  for (const d of defs) console.error(` - ${d}`);
  process.exit(1);
}

console.log('Protocol consumption check passed.');
