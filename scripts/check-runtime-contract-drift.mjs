/**
 * Detects semantic drift by scanning for inline reason code string literals
 * that should instead be imported from @aoc-enterprise/canonical-runtime-contracts.
 *
 * Reason codes defined inline in packages create runtime/SDK divergence risk.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANONICAL_PACKAGE = '@aoc-enterprise/canonical-runtime-contracts';

const KNOWN_REASON_CODE_PATTERNS = [
  /['"]grant_signature_invalid['"]/,
  /['"]grant_key_untrusted['"]/,
  /['"]grant_expired['"]/,
  /['"]grant_unknown['"]/,
  /['"]grant_revoked['"]/,
  /['"]grant_replayed['"]/,
  /['"]grant_scope_mismatch['"]/,
  /['"]delegation_signature_invalid['"]/,
  /['"]delegation_key_untrusted['"]/,
  /['"]delegation_expired['"]/,
  /['"]delegation_invalid['"]/,
  /['"]delegation_revoked['"]/,
  /['"]delegation_scope_mismatch['"]/,
  /['"]delegation_policy_denied['"]/,
  /['"]claim_signature_invalid['"]/,
  /['"]claim_key_untrusted['"]/,
  /['"]claim_expired['"]/,
  /['"]claim_unknown['"]/,
  /['"]claim_revoked['"]/,
  /['"]claim_actor_mismatch['"]/,
  /['"]claim_org_mismatch['"]/,
  /['"]claim_trust_domain_mismatch['"]/,
  /['"]claim_verification_window_invalid['"]/,
  /['"]audit_emit_failed['"]/,
  /['"]org_boundary_violated['"]/,
  /['"]governance_denied['"]/,
  /['"]lifecycle_error['"]/,
];

const EXEMPT_PATHS = new Set([
  'packages/canonical-runtime-contracts',
]);

const violations = [];
const sourceExt = new Set(['.ts', '.mts', '.cts']);

function isExempt(filePath) {
  return [...EXEMPT_PATHS].some((p) => filePath.includes(p));
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(path);
    } else if ([...sourceExt].some((ext) => path.endsWith(ext))) {
      checkFile(path);
    }
  }
}

function checkFile(filePath) {
  if (isExempt(filePath)) return;

  const text = readFileSync(filePath, 'utf8');

  for (const pattern of KNOWN_REASON_CODE_PATTERNS) {
    if (pattern.test(text)) {
      const isDefinition = text.includes(CANONICAL_PACKAGE) || filePath.includes('canonical-runtime-contracts');
      if (!isDefinition) {
        violations.push(`${filePath}: inline reason code literal detected (${pattern}) — import from ${CANONICAL_PACKAGE} instead`);
      }
    }
  }
}

const roots = ['src', 'packages'];
for (const root of roots) {
  try {
    walk(root);
  } catch {
    // Optional roots may not exist.
  }
}

if (violations.length) {
  console.error('Runtime contract drift violations detected:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('Runtime contract drift check passed');
