// Shared release-manifest construction (PR-008 / PR-RC).
//
// Used by generate-release-manifest.mjs (writes the manifest) and
// verify-release-manifest.mjs (regenerates in memory and compares) so both
// always agree on what a manifest contains. Deterministic for a given
// commit + build output: no timestamps, artifacts sorted by path.

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function buildReleaseManifest() {

  const root = resolve(new URL('..', import.meta.url).pathname);

  const sha256 = (buffer) => `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
  const fileChecksum = (path) => sha256(readFileSync(resolve(root, path)));
  const git = (args) => execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();

  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

  const enterprise = await import(resolve(root, 'dist/src/enterprise/index.js'));

  // Public build artifacts: every export target declared in package.json.
  const artifactPaths = [
    ...new Set(
      Object.values(pkg.exports)
        .map((entry) => (typeof entry === 'string' ? entry : entry.default))
        .filter((path) => typeof path === 'string'),
    ),
  ].sort();

  const artifacts = artifactPaths
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => ({ path, checksum: fileChecksum(path) }));

  return {
    name: pkg.name,
    version: pkg.version,
    generated: {
      commit: git('rev-parse HEAD'),
      branch: git('rev-parse --abbrev-ref HEAD'),
      node: process.version,
    },
    runtimeVersions: {
      enterpriseHost: enterprise.AOC_ENTERPRISE_HOST_VERSION,
      kernel: (await import(resolve(root, 'dist/src/kernel/index.js'))).AOC_KERNEL_VERSION,
      governanceStore: enterprise.AOC_GOVERNANCE_STORE_VERSION,
      evidenceBundle: enterprise.AOC_EVIDENCE_BUNDLE_VERSION,
      agentPassportRuntime: enterprise.AOC_AGENT_PASSPORT_RUNTIME_VERSION,
      assuranceRuntime: enterprise.AOC_ASSURANCE_RUNTIME_VERSION,
    },
    storeSchemaVersions: {
      governance: enterprise.GOVERNANCE_STORE_SCHEMA_VERSION,
      evidence: enterprise.EVIDENCE_BUNDLE_SCHEMA_VERSION,
      agentPassport: enterprise.AGENT_PASSPORT_SCHEMA_VERSION,
      assurance: enterprise.ASSURANCE_STORE_SCHEMA_VERSION,
    },
    canonicalizationVersion: enterprise.AOC_CANONICALIZATION_VERSION,
    frameworks: [
      {
        frameworkId: enterprise.AOC_SAF_FRAMEWORK_V1.frameworkId,
        frameworkVersion: enterprise.AOC_SAF_FRAMEWORK_V1.frameworkVersion,
        status: enterprise.AOC_SAF_FRAMEWORK_V1.status,
        digest: sha256(JSON.stringify(enterprise.AOC_SAF_FRAMEWORK_V1)),
      },
    ],
    api: {
      surface: 'aoc-enterprise-host-http.v1',
      documentation: 'docs/enterprise/API_STABILITY_V1.md',
      endpointCount: 27,
    },
    compatibilityMatrix: {
      node: '>=22',
      'better-sqlite3': pkg.dependencies['better-sqlite3'],
      stores:
        'A store written by schema version X opens only under a runtime with the same schema version; ' +
        'mismatches are refused at startup (fail closed). See docs/enterprise/MIGRATION_REVIEW_V1.md.',
      api: 'v1.x guarantees backward-compatible HTTP surface; breaking changes require /v2. See docs/enterprise/API_STABILITY_V1.md.',
    },
    artifacts,
    generatedArtifacts: [
      'release/RELEASE_MANIFEST.json',
      'docs/performance/BENCHMARK_BASELINE_V1.md',
      'docs/performance/LOAD_TEST_V1.md',
    ],
  };

}
