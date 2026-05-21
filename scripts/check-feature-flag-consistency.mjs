/**
 * Verifies feature flag identifiers are only defined in the canonical contracts package.
 *
 * Scans all packages for string literals that look like feature flag identifiers
 * (matching the values in FEATURE_FLAGS) defined outside the canonical package.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANONICAL_PACKAGE = '@aoc-enterprise/canonical-runtime-contracts';
const CANONICAL_PACKAGE_PATH = 'packages/canonical-runtime-contracts';

const CANONICAL_FEATURE_FLAG_VALUES = [
  'agent_governance',
  'multi_tenant_isolation',
  'governance_treaties',
  'runtime_negotiation',
  'enterprise_audit_routing',
  'sovereign_audit_sink',
  'integration_runtime',
  'capability_delegation',
  'control_plane_sdk',
  'enhanced_risk_assessment',
  'federated_trust_domains',
  'operational_memory',
  'portfolio_memory',
  'advanced_ingestion',
  'ai_analysis',
  'operational_cognition',
];

const sourceExt = new Set(['.ts', '.mts', '.cts']);
const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
      walk(path);
    } else if ([...sourceExt].some((ext) => path.endsWith(ext))) {
      checkFile(path);
    }
  }
}

function checkFile(filePath) {
  if (filePath.includes(CANONICAL_PACKAGE_PATH)) return;

  const text = readFileSync(filePath, 'utf8');

  for (const flag of CANONICAL_FEATURE_FLAG_VALUES) {
    const pattern = new RegExp(`['"]${flag}['"]`);
    if (pattern.test(text) && !text.includes(CANONICAL_PACKAGE)) {
      violations.push(
        `${filePath}: inline feature flag literal '${flag}' detected — import FEATURE_FLAGS from ${CANONICAL_PACKAGE}`
      );
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
  console.error('Feature flag consistency violations:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('Feature flag consistency check passed');
