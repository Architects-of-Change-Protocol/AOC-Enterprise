import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PINATA_PROVIDER_SYSTEM, createPinataProviderCapabilityDeclaration, executePinataProviderTranslation } from '@aoc-enterprise/pinata-adapter';
import type { EnterpriseProviderConformanceHarness } from '@aoc-enterprise/provider-conformance-suite';
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
      return undefined;
    },
    execute: (candidate) => executePinataProviderTranslation(candidate, client, { now: () => FIXED_NOW }),
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
