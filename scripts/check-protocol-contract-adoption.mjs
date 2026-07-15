// Governance guard for the "Protocol Contract Adoption" sprint. Narrower and
// additive to scripts/check-protocol-consumption.mjs (which already forbids
// deep imports, source imports, and undeclared ambient module augmentation of
// the '@aoc/protocol' package outside its own allowlist). This script
// enforces the sprint-specific rules that check does not:
//
//   1. `AocIdentityClaims` must never be imported by name from '@aoc/protocol'.
//      It was never a real Protocol export (Enterprise's own former ambient
//      shim invented it) and Protocol's governance has explicitly determined
//      identity claims are Enterprise-owned (`@aoc-enterprise/identity`,
//      `VerifiedActorClaims`). This is enforced independent of whether the
//      ambient shim mechanism ever returns, and independent of whether a
//      future Protocol version happens to add a same-named export.
//   2. `packages/control-plane/audit-envelope-mapper.ts` (the sole boundary
//      between the legacy `ControlPlaneAuditEvent` and the real
//      `AuditEventEnvelope`) must never use an object spread of the legacy
//      event into the mapped result, and must never use a structural type
//      cast (`as AuditEventEnvelope` / `as ControlPlaneAuditEvent`) to paper
//      over a field mismatch instead of mapping it explicitly.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const scanRoots = ['src', 'packages', 'types', 'tests'];
const EXCLUDED_DIR_NAMES = new Set(['dist', 'dist-test', 'node_modules']);

// Negative-test fixture: contains the forbidden pattern as string *data*
// passed to a unit-tested detector function, not as a real import.
const allowFiles = new Set(['tests/protocol-contract-adoption.test.mjs']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(ts|d\.ts|mts|cts|mjs|cjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relPath(file) {
  return file.slice(ROOT.length + 1).replace(/\\/g, '/');
}

const AOC_IDENTITY_CLAIMS_IMPORT_RE = /import\s+(?:type\s+)?\{[^}]*\bAocIdentityClaims\b[^}]*\}\s+from\s+['"]@aoc\/protocol['"]/;

export function importsAocIdentityClaimsFromProtocol(text) {
  return AOC_IDENTITY_CLAIMS_IMPORT_RE.test(text);
}

export function mapperUsesSpreadOrCast(text) {
  const hasSpreadOfEvent = /\.\.\.\s*event\b/.test(text);
  const hasUnsafeCast = /\bas\s+(AuditEventEnvelope|ControlPlaneAuditEvent)\b/.test(text);
  return hasSpreadOfEvent || hasUnsafeCast;
}

async function main() {
  const violations = [];

  for (const root of scanRoots) {
    const abs = join(ROOT, root);
    let files = [];
    try {
      files = await walk(abs);
    } catch {
      continue;
    }
    for (const file of files) {
      const rel = relPath(file);
      if (allowFiles.has(rel)) continue;
      const text = await readFile(file, 'utf8');
      if (importsAocIdentityClaimsFromProtocol(text)) {
        violations.push(`${rel}: imports 'AocIdentityClaims' from '@aoc/protocol'. Identity claims are Enterprise-owned -- import 'VerifiedActorClaims' from '@aoc-enterprise/identity' instead.`);
      }
    }
  }

  const mapperPath = join(ROOT, 'packages/control-plane/audit-envelope-mapper.ts');
  const mapperText = await readFile(mapperPath, 'utf8').catch(() => null);
  if (mapperText === null) {
    violations.push('packages/control-plane/audit-envelope-mapper.ts is missing.');
  } else if (mapperUsesSpreadOrCast(mapperText)) {
    violations.push('packages/control-plane/audit-envelope-mapper.ts: must map every field explicitly -- no object spread of the legacy event, and no structural cast between ControlPlaneAuditEvent and AuditEventEnvelope.');
  }

  if (violations.length > 0) {
    console.error('Protocol contract adoption check failed:');
    for (const violation of violations) console.error(` - ${violation}`);
    process.exit(1);
  }

  console.log('Protocol contract adoption check passed.');
}

main();
