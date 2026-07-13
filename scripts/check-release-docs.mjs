// Release documentation verification (PR-RC Objective 11).
//
// Asserts the v1 release documentation set exists and that load-bearing
// facts agree across documents: the package version, CHANGELOG heading,
// manifest version, and README index must all reference the same release.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const problems = [];

const REQUIRED_DOCS = [
  'README.md',
  'CHANGELOG.md',
  'release/RELEASE_MANIFEST.json',
  'release/api-surface.v1.json',
  'docs/security/THREAT_MODEL_V1.md',
  'docs/security/SECURITY_HARDENING_V1.md',
  'docs/enterprise/API_STABILITY_V1.md',
  'docs/enterprise/MIGRATION_REVIEW_V1.md',
  'docs/testing/TEST_STRATEGY_V1.md',
  'docs/operations/DEPLOYMENT_GUIDE_V1.md',
  'docs/operations/RUNBOOKS_V1.md',
  'docs/operations/BACKUP_RECOVERY_V1.md',
  'docs/performance/BENCHMARK_BASELINE_V1.md',
  'docs/performance/LOAD_TEST_V1.md',
  'docs/release/DEPENDENCY_AUDIT_V1.md',
  'docs/release/DOCUMENTATION_AUDIT_V1.md',
  'docs/release/RELEASE_CANDIDATE_V1.md',
  'packages/enterprise-host-sdk/README.md',
  'docs/release/AOC_ENTERPRISE_V1_PORTABILITY_CURRENT_STATE.md',
  'docs/release/AOC_ENTERPRISE_V1_PORTABILITY_REPORT.md',
  'docs/release/AOC_ENTERPRISE_V1_TAGGING_RUNBOOK.md',
  'docs/operations/AOC_ENTERPRISE_BACKUP_V1.md',
  'docs/operations/AOC_ENTERPRISE_RESTORE_V1.md',
  'docs/operations/AOC_ENTERPRISE_CLEAN_ROOM_DRILL.md',
];

for (const doc of REQUIRED_DOCS) {
  if (!existsSync(resolve(root, doc))) {
    problems.push(`Required release document missing: ${doc}`);
  }
}

const read = (path) => readFileSync(resolve(root, path), 'utf8');

if (problems.length === 0) {
  const pkg = JSON.parse(read('package.json'));
  const manifest = JSON.parse(read('release/RELEASE_MANIFEST.json'));
  const changelog = read('CHANGELOG.md');

  if (manifest.version !== pkg.version) {
    problems.push(`Version mismatch: package.json ${pkg.version} vs RELEASE_MANIFEST ${manifest.version}.`);
  }
  if (!changelog.includes(`## [${pkg.version}]`)) {
    problems.push(`CHANGELOG.md has no '## [${pkg.version}]' section for the package version.`);
  }
  if (pkg.engines?.node === undefined) {
    problems.push('package.json declares no engines.node; the deployment guide states a Node floor.');
  }

  // Reproducibility instructions must exist where the release claims them.
  for (const [doc, needle] of [
    ['docs/performance/BENCHMARK_BASELINE_V1.md', 'benchmark-enterprise.mjs'],
    ['docs/performance/LOAD_TEST_V1.md', 'load-test-enterprise.mjs'],
    ['docs/testing/TEST_STRATEGY_V1.md', 'npm test'],
    ['docs/enterprise/API_STABILITY_V1.md', 'node-http-adapter'],
  ]) {
    if (!read(doc).includes(needle)) {
      problems.push(`${doc} no longer references '${needle}' — reproduction instructions may have been lost.`);
    }
  }

  // The README release index must point at documents that exist (already
  // asserted above) and reference the current version's manifest.
  if (!read('README.md').includes('release/RELEASE_MANIFEST.json')) {
    problems.push('README.md release documentation index no longer references the release manifest.');
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`[release-docs] ${problem}`);
  process.exit(1);
}
console.log(`Release documentation check passed: ${REQUIRED_DOCS.length} documents present, versions consistent.`);
