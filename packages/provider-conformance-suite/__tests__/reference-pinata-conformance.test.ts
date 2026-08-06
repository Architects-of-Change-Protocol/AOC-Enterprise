import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PinataProviderClient } from '@aoc-enterprise/pinata-adapter';
import { PINATA_PROVIDER_SYSTEM, createPinataProviderCapabilityDeclaration, executePinataProviderTranslation } from '@aoc-enterprise/pinata-adapter';
import type { EnterpriseProviderConformanceHarness } from '../src/enterprise-provider-conformance-suite.js';
import { runEnterpriseProviderConformanceSuite } from '../src/enterprise-provider-conformance-suite.js';

/**
 * R005.D Phase 10 -- Reference Execution.
 *
 * This is the ONE file in this package permitted to import a concrete
 * Provider Adapter package (`@aoc-enterprise/pinata-adapter`), enforced by
 * `scripts/check-provider-conformance-boundary.mjs`. Its purpose is narrow:
 * prove the suite this package defines actually certifies a real,
 * already-frozen adapter -- never to test Pinata itself (that is
 * `packages/pinata-adapter`'s own, already-existing job), and never to
 * change `packages/pinata-adapter` in any way (zero files in that package
 * are touched by this sequence).
 *
 * The fake `PinataProviderClient` below mirrors the one
 * `packages/pinata-adapter/__tests__/pinata-provider-adapter.test.ts`
 * already uses -- no test in this file contacts a real Pinata endpoint or
 * requires a real credential.
 */

const FIXED_NOW = '2026-01-01T00:00:00.000Z';

function makeFakePinataClient(): PinataProviderClient {
  return {
    async createTemporaryAccessLink({ cid, expiresInSeconds }) {
      return { url: `https://gateway.pinata.cloud/files/${cid}?expires=${expiresInSeconds}` };
    },
    async getResourceMetadata({ resourceId }) {
      return {
        id: resourceId,
        name: 'conformance-fixture.txt',
        cid: 'QmConformanceFixtureCid',
        sizeBytes: 42,
        mimeType: 'text/plain',
        keyvalues: { owner: 'provider-conformance-suite' },
        createdAt: FIXED_NOW,
      };
    },
    async invalidateResource({ resourceId }) {
      return { id: resourceId, status: 'deleted' };
    },
    async uploadCiphertext() {
      return { pinataFileId: 'file-conformance-1', cid: 'QmConformanceFixtureCid', sizeBytes: 42 };
    },
  };
}

function buildPinataHarness(): EnterpriseProviderConformanceHarness {
  const client = makeFakePinataClient();
  return {
    providerSystem: PINATA_PROVIDER_SYSTEM,
    capabilityDeclaration: createPinataProviderCapabilityDeclaration({
      id: 'reference-pinata-declaration-1',
      declaredAt: FIXED_NOW,
      correlationId: 'reference-pinata-declaration-corr-1',
    }),
    providerMetadataFor(executionIntent) {
      if (executionIntent === 'ProvideTemporaryAccess' || executionIntent === 'ProvideReadOnlyAccess') {
        return { requestedDurationSeconds: 900 };
      }
      // GAP-012: ProvideMetadata/InvalidateGrant need Pinata's own file id,
      // distinct from the CID this suite's own `buildCanonicalResource()`
      // carries in `resource.id` -- see
      // `packages/pinata-adapter/src/pinata-provider-adapter.ts`'s
      // `requirePinataFileId`.
      if (executionIntent === 'ProvideMetadata' || executionIntent === 'InvalidateGrant') {
        return { pinataFileId: 'reference-conformance-pinata-file-id-1' };
      }
      return undefined;
    },
    execute: (candidate) => executePinataProviderTranslation(candidate, client, { now: () => FIXED_NOW }),
    // Not supplied: the filesystem-level SDK import boundary is already
    // independently proven by packages/pinata-adapter/scripts/check-pinata-boundary.mjs,
    // run as part of pinata-adapter's own `npm test`. Re-scanning the
    // filesystem from this package would duplicate, not strengthen, that
    // proof -- see the README's "Boundary validation" section.
  };
}

describe('Provider Conformance Suite — Phase 10 reference execution against the Pinata Provider Adapter', () => {
  it('PASSES: the Pinata Provider Adapter satisfies every applicable Provider Conformance Suite check', async () => {
    const report = await runEnterpriseProviderConformanceSuite(buildPinataHarness(), { now: () => FIXED_NOW });

    const failed = report.checks.filter((check) => check.status === 'failed');
    assert.deepEqual(failed, [], `Pinata Provider Adapter failed ${failed.length} conformance check(s):\n${JSON.stringify(failed, null, 2)}`);
    assert.equal(report.passed, true);
    assert.equal(report.providerSystem, PINATA_PROVIDER_SYSTEM);

    // Two, and only two, checks are expected to be 'skipped' -- both
    // documented, legitimate non-applicability, not suite gaps:
    //  - 'expired-grant-rejected': Pinata does not declare 'SupportsExpiration'
    //    (packages/pinata-adapter/README.md, "Unsupported capabilities") --
    //    this adapter consumes only EnterpriseProviderTranslation, which
    //    carries no expiresAt by R005.B's own design.
    //  - 'provider-sdk-import-boundary': this reference harness does not
    //    supply a boundaryEvaluation (see buildPinataHarness's comment
    //    above); the real filesystem scan already runs independently as
    //    part of packages/pinata-adapter's own `npm test`.
    const skipped = report.checks.filter((check) => check.status === 'skipped').map((check) => check.id).sort();
    assert.deepEqual(skipped, ['expired-grant-rejected', 'provider-sdk-import-boundary']);

    const passedCount = report.checks.filter((check) => check.status === 'passed').length;
    assert.ok(passedCount > 0, 'expected at least one passed check');
  });

  it('documents exactly which execution intents Pinata supports and rejects, per its own capability declaration', async () => {
    const report = await runEnterpriseProviderConformanceSuite(buildPinataHarness(), { now: () => FIXED_NOW });

    const unsupportedRejections = report.checks.filter((check) => check.id.startsWith('unsupported-capability-rejected-'));
    // Only RegisterUsage requires a capability (SupportsUsageReporting) Pinata
    // does not declare -- see packages/pinata-adapter/README.md, "Unsupported
    // capabilities". Every other execution intent's required capability is
    // declared, so no other 'unsupported-capability-rejected-*' check exists.
    assert.deepEqual(
      unsupportedRejections.map((check) => check.id),
      ['unsupported-capability-rejected-RegisterUsage'],
    );
    assert.equal(unsupportedRejections[0]?.status, 'passed');
  });
});
