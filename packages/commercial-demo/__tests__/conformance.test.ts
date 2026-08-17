import { existsSync, readFileSync } from 'fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PINATA_PROVIDER_SYSTEM, createPinataProviderCapabilityDeclaration, executePinataProviderTranslation } from '@aoc-enterprise/pinata-adapter';
import type { EnterpriseProviderConformanceBoundaryResult, EnterpriseProviderConformanceHarness } from '@aoc-enterprise/provider-conformance-suite';
import { runEnterpriseProviderConformanceSuite } from '@aoc-enterprise/provider-conformance-suite';

import { createMockPinataProviderClient } from '../src/mock-pinata-client.js';

/**
 * Bonus architecture-validation check (referenced by this package's README,
 * "Architecture validation"): this demo's own Pinata usage, wrapped in an
 * `EnterpriseProviderConformanceHarness`, is certified by the frozen R005.D
 * Provider Conformance Suite -- the same suite every future Provider
 * Adapter is certified against, never modified here. Proves this demo's
 * scenario construction (obligations, translations, execution) does not
 * quietly drift from what R005.0-R005.C already froze.
 */

const FIXED_NOW = '2026-08-04T09:00:00.000Z';

/**
 * Boundary validation is required for certification — a harness omitting it
 * *fails* the check rather than skipping it, because a Provider Adapter
 * cannot be certified without proving no provider SDK leaks outside its own
 * declared file(s). The suite performs no filesystem I/O itself, so
 * `scripts/compute-demo-pinata-boundary-evidence.mjs` — wired in as the first
 * step of this package's `npm test` — runs a REAL scan of the current working
 * tree and writes its result here, rather than this test hard-coding an
 * importer-file list that could go stale. `process.cwd()` is the package root
 * for any `npm test` invocation (root-level, per-workspace, or run directly
 * from this package), matching the compute script's own output path.
 */
const PINATA_BOUNDARY_EVIDENCE_PATH = `${process.cwd()}/dist-test/pinata-boundary-evidence.json`;

function loadRealPinataBoundaryEvidence(): EnterpriseProviderConformanceBoundaryResult {
  if (!existsSync(PINATA_BOUNDARY_EVIDENCE_PATH)) {
    throw new Error(
      `Missing real Pinata SDK import-boundary evidence at '${PINATA_BOUNDARY_EVIDENCE_PATH}'. Run 'npm test' (which runs scripts/compute-demo-pinata-boundary-evidence.mjs as its first step) rather than invoking 'node --test' directly.`,
    );
  }
  return JSON.parse(readFileSync(PINATA_BOUNDARY_EVIDENCE_PATH, 'utf8')) as EnterpriseProviderConformanceBoundaryResult;
}

function buildDemoHarness(): EnterpriseProviderConformanceHarness {
  const client = createMockPinataProviderClient();
  return {
    providerSystem: PINATA_PROVIDER_SYSTEM,
    capabilityDeclaration: createPinataProviderCapabilityDeclaration({
      id: 'commercial-demo-pinata-declaration-1',
      declaredAt: FIXED_NOW,
      correlationId: 'commercial-demo-pinata-declaration-corr-1',
    }),
    providerMetadataFor(executionIntent) {
      if (executionIntent === 'ProvideTemporaryAccess' || executionIntent === 'ProvideReadOnlyAccess') {
        return { requestedDurationSeconds: 86_400 };
      }
      // GAP-012: ProvideMetadata/InvalidateGrant need Pinata's own file id,
      // distinct from the CID carried in resource.id -- see
      // `packages/pinata-adapter/src/pinata-provider-adapter.ts`'s
      // `requirePinataFileId` and `docs/architecture/ADR-DURABLE-GRANTS-REVOCATION.md`.
      if (executionIntent === 'ProvideMetadata' || executionIntent === 'InvalidateGrant') {
        return { pinataFileId: 'commercial-demo-pinata-file-id-1' };
      }
      return undefined;
    },
    execute: (candidate) => executePinataProviderTranslation(candidate, client, { now: () => FIXED_NOW }),
    boundaryEvaluation: loadRealPinataBoundaryEvidence(),
  };
}

describe("Provider Conformance Suite certification of this demo's Pinata usage", () => {
  it("certifies clean against every applicable check, using this package's own mock Pinata client", async () => {
    const report = await runEnterpriseProviderConformanceSuite(buildDemoHarness(), { now: () => FIXED_NOW });

    const failed = report.checks.filter((check) => check.status === 'failed');
    assert.deepEqual(failed, [], `Commercial demo Pinata usage failed ${failed.length} conformance check(s):\n${JSON.stringify(failed, null, 2)}`);
    assert.equal(report.passed, true);
    assert.equal(report.providerSystem, PINATA_PROVIDER_SYSTEM);
  });
});
