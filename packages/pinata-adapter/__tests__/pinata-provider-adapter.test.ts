import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISE_PROVIDER_CAPABILITIES } from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderTranslation } from '@aoc-enterprise/provider-translation';
import { ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS, ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION } from '@aoc-enterprise/provider-translation';
import type { PinataProviderClient } from '../src/pinata-provider-client.js';
import { PinataProviderClientError } from '../src/pinata-provider-client.js';
import type { PinataProviderExecutionFailure, PinataProviderExecutionSuccess } from '../src/pinata-provider-adapter.js';
import {
  PINATA_PROVIDER_SYSTEM,
  PINATA_SUPPORTED_CAPABILITIES,
  PINATA_SUPPORTED_OBLIGATION_TYPES,
  PinataAdapterInputError,
  createPinataProviderCapabilityDeclaration,
  executePinataProviderTranslation,
} from '../src/pinata-provider-adapter.js';

const FIXED_NOW = '2026-08-04T12:00:00.000Z';

function makeTranslation(overrides: Partial<EnterpriseProviderTranslation> = {}): EnterpriseProviderTranslation {
  return {
    schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
    id: 'translation-1',
    providerSystem: PINATA_PROVIDER_SYSTEM,
    capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS,
    executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_TEMPORARY_ACCESS,
    grantRef: 'grant-1',
    resource: { kind: 'ipfs-object', id: 'QmTestCid123' },
    providerMetadata: { requestedDurationSeconds: 900 },
    translatedAt: FIXED_NOW,
    correlationId: 'corr-1',
    ...overrides,
  };
}

/** Strips `providerMetadata` entirely rather than overriding it with `undefined` (exactOptionalPropertyTypes forbids the latter). */
function withoutProviderMetadata(translation: EnterpriseProviderTranslation): EnterpriseProviderTranslation {
  const { providerMetadata: _providerMetadata, ...rest } = translation;
  return rest;
}

/** A fake client -- no test in this file contacts a real Pinata endpoint or requires a real credential. */
function makeFakeClient(overrides: Partial<PinataProviderClient> = {}): PinataProviderClient {
  return {
    createTemporaryAccessLink: async () => ({ url: 'https://gateway.pinata.cloud/files/QmTestCid123?X-Signature=fake' }),
    getResourceMetadata: async () => ({
      id: 'file-1',
      name: 'report.pdf',
      cid: 'QmTestCid123',
      sizeBytes: 2048,
      mimeType: 'application/pdf',
      keyvalues: { department: 'finance' },
      createdAt: '2026-08-01T00:00:00.000Z',
    }),
    invalidateResource: async () => ({ id: 'file-1', status: 'deleted' }),
    ...overrides,
  };
}

function assertExecuted(result: { outcome: string }): asserts result is PinataProviderExecutionSuccess {
  assert.equal(result.outcome, 'executed');
}

function assertFailed(result: { outcome: string }): asserts result is PinataProviderExecutionFailure {
  assert.equal(result.outcome, 'failed');
}

async function captureError(thunk: () => Promise<unknown>): Promise<unknown> {
  try {
    await thunk();
  } catch (error) {
    return error;
  }
  throw new Error('Expected thunk to throw, but it resolved.');
}

// ---------------------------------------------------------------------------
// Positive: successful translation + execution
// ---------------------------------------------------------------------------

describe('executePinataProviderTranslation -- successful execution', () => {
  it('executes a ProvideTemporaryAccess translation into a Pinata signed access link', async () => {
    const translation = makeTranslation();
    const client = makeFakeClient();
    const result = await executePinataProviderTranslation(translation, client, { now: () => FIXED_NOW });
    assertExecuted(result);
    assert.equal(result.detail.kind, 'temporary-access');
    if (result.detail.kind === 'temporary-access') {
      assert.equal(result.detail.accessUrl, 'https://gateway.pinata.cloud/files/QmTestCid123?X-Signature=fake');
      assert.equal(result.detail.expiresAt, new Date(Date.parse(FIXED_NOW) + 900_000).toISOString());
    }
    assert.equal(result.providerSystem, PINATA_PROVIDER_SYSTEM);
    assert.equal(result.grantRef, 'grant-1');
    assert.equal(result.correlationId, 'corr-1');
  });

  it('executes a ProvideReadOnlyAccess translation the same way as ProvideTemporaryAccess', async () => {
    const translation = makeTranslation({ executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_READ_ONLY_ACCESS });
    const result = await executePinataProviderTranslation(translation, makeFakeClient(), { now: () => FIXED_NOW });
    assertExecuted(result);
    assert.equal(result.detail.kind, 'temporary-access');
  });

  it('retrieves metadata for a ProvideMetadata translation, never exposing bytes', async () => {
    const translation = makeTranslation({
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_PROVIDER_METADATA,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_METADATA,
      providerMetadata: { pinataFileId: 'file-1' },
    });
    const result = await executePinataProviderTranslation(translation, makeFakeClient(), { now: () => FIXED_NOW });
    assertExecuted(result);
    assert.equal(result.detail.kind, 'metadata');
    if (result.detail.kind === 'metadata') {
      assert.equal(result.detail.metadata.cid, 'QmTestCid123');
      assert.equal(result.detail.metadata.name, 'report.pdf');
      assert.equal(result.detail.metadata['keyvalue.department'], 'finance');
      assert.equal('bytes' in result.detail.metadata, false);
    }
  });

  it('invalidates a grant via the nearest valid Pinata operation (unpin/delete)', async () => {
    const translation = makeTranslation({
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_GRANT_REVOCATION,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.INVALIDATE_GRANT,
      providerMetadata: { pinataFileId: 'file-1' },
    });
    const result = await executePinataProviderTranslation(translation, makeFakeClient(), { now: () => FIXED_NOW });
    assertExecuted(result);
    assert.equal(result.detail.kind, 'grant-invalidated');
    if (result.detail.kind === 'grant-invalidated') {
      assert.equal(result.detail.providerResourceStatus, 'deleted');
    }
  });

  it('(GAP-012) uses providerMetadata.pinataFileId, never resource.id (the CID), for ProvideMetadata/InvalidateGrant', async () => {
    let observedResourceId: string | undefined;
    const client = makeFakeClient({
      getResourceMetadata: async (request) => {
        observedResourceId = request.resourceId;
        return {
          id: 'file-1',
          name: 'report.pdf',
          cid: 'QmTestCid123',
          sizeBytes: 2048,
          mimeType: 'application/pdf',
          keyvalues: {},
          createdAt: '2026-08-01T00:00:00.000Z',
        };
      },
    });
    const translation = makeTranslation({
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_PROVIDER_METADATA,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_METADATA,
      resource: { kind: 'ipfs-object', id: 'QmTestCid123' },
      providerMetadata: { pinataFileId: 'file-1-distinct-from-cid' },
    });
    await executePinataProviderTranslation(translation, client, { now: () => FIXED_NOW });
    assert.equal(observedResourceId, 'file-1-distinct-from-cid');
    assert.notEqual(observedResourceId, translation.resource.id);
  });
});

// ---------------------------------------------------------------------------
// Negative: capability unsupported (Phase 4 -- never faked)
// ---------------------------------------------------------------------------

describe('executePinataProviderTranslation -- unsupported capability', () => {
  it('returns capability-unsupported for RegisterUsage -- Pinata has no provider-side usage registration', async () => {
    const translation = withoutProviderMetadata(
      makeTranslation({
        capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING,
        executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.REGISTER_USAGE,
      }),
    );
    const result = await executePinataProviderTranslation(translation, makeFakeClient(), { now: () => FIXED_NOW });
    assertFailed(result);
    assert.equal(result.failureReason, 'capability-unsupported');
  });

  it('never contacts the client when the capability is unsupported', async () => {
    let called = false;
    const client = makeFakeClient({ createTemporaryAccessLink: async () => { called = true; return { url: 'unused' }; } });
    const translation = withoutProviderMetadata(
      makeTranslation({
        capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING,
        executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.REGISTER_USAGE,
      }),
    );
    await executePinataProviderTranslation(translation, client, { now: () => FIXED_NOW });
    assert.equal(called, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: invalid / malformed translation (thrown, not returned -- a
// programming-contract violation, never a Pinata-side failure)
// ---------------------------------------------------------------------------

describe('executePinataProviderTranslation -- invalid or malformed translation', () => {
  it('throws PinataAdapterInputError for a malformed translation (fails validateEnterpriseProviderTranslation)', async () => {
    const malformed = { ...makeTranslation(), id: undefined };
    const error = await captureError(() => executePinataProviderTranslation(malformed, makeFakeClient()));
    assert.ok(error instanceof PinataAdapterInputError);
  });

  it('throws PinataAdapterInputError for a well-formed translation targeting a different providerSystem', async () => {
    const translation = makeTranslation({ providerSystem: 's3' });
    const error = await captureError(() => executePinataProviderTranslation(translation, makeFakeClient()));
    assert.ok(error instanceof PinataAdapterInputError);
    if (error instanceof PinataAdapterInputError) {
      assert.ok(error.message.includes("providerSystem 's3'"));
    }
  });

  it('throws PinataAdapterInputError when providerMetadata.requestedDurationSeconds is missing for temporary access', async () => {
    const translation = withoutProviderMetadata(makeTranslation());
    const error = await captureError(() => executePinataProviderTranslation(translation, makeFakeClient()));
    assert.ok(error instanceof PinataAdapterInputError);
    if (error instanceof PinataAdapterInputError) {
      assert.ok(error.message.includes('requestedDurationSeconds'));
    }
  });

  it('does not check grantRef or resource for existence -- only well-formedness (mirrors validateEnterpriseProviderTranslation)', async () => {
    const translation = makeTranslation({ grantRef: 'a-grant-that-does-not-exist-anywhere' });
    const result = await executePinataProviderTranslation(translation, makeFakeClient(), { now: () => FIXED_NOW });
    assertExecuted(result);
  });

  it('(GAP-012) throws PinataAdapterInputError when providerMetadata.pinataFileId is missing for ProvideMetadata', async () => {
    const translation = withoutProviderMetadata(
      makeTranslation({
        capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_PROVIDER_METADATA,
        executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_METADATA,
      }),
    );
    const error = await captureError(() => executePinataProviderTranslation(translation, makeFakeClient()));
    assert.ok(error instanceof PinataAdapterInputError);
    if (error instanceof PinataAdapterInputError) {
      assert.ok(error.message.includes('pinataFileId'));
    }
  });

  it('(GAP-012) throws PinataAdapterInputError when providerMetadata.pinataFileId is missing for InvalidateGrant', async () => {
    const translation = withoutProviderMetadata(
      makeTranslation({
        capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_GRANT_REVOCATION,
        executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.INVALIDATE_GRANT,
      }),
    );
    const error = await captureError(() => executePinataProviderTranslation(translation, makeFakeClient()));
    assert.ok(error instanceof PinataAdapterInputError);
    if (error instanceof PinataAdapterInputError) {
      assert.ok(error.message.includes('pinataFileId'));
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: provider unavailable / SDK failure -- failure normalization
// ---------------------------------------------------------------------------

describe('executePinataProviderTranslation -- failure normalization', () => {
  it('normalizes a classified PinataProviderClientError (provider unavailable) into a canonical failure', async () => {
    const client = makeFakeClient({
      createTemporaryAccessLink: async () => {
        throw new PinataProviderClientError('provider-unavailable', 'Pinata could not be reached.');
      },
    });
    const result = await executePinataProviderTranslation(makeTranslation(), client, { now: () => FIXED_NOW });
    assertFailed(result);
    assert.equal(result.failureReason, 'provider-unavailable');
    assert.equal(result.message, 'Pinata could not be reached.');
    assert.equal(result.failedAt, FIXED_NOW);
  });

  it('normalizes an unclassified SDK/client failure into unexpected-provider-failure, never leaking the raw error', async () => {
    const client = makeFakeClient({
      getResourceMetadata: async () => {
        throw new Error('ECONNRESET at 10.0.0.4:443 (raw socket detail that must never surface)');
      },
    });
    const translation = makeTranslation({
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_PROVIDER_METADATA,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_METADATA,
      providerMetadata: { pinataFileId: 'file-1' },
    });
    const result = await executePinataProviderTranslation(translation, client, { now: () => FIXED_NOW });
    assertFailed(result);
    assert.equal(result.failureReason, 'unexpected-provider-failure');
  });

  it('never returns a raw client object, HTTP status, or stack trace on the failure result', async () => {
    const client = makeFakeClient({
      invalidateResource: async () => {
        throw new PinataProviderClientError('execution-rejected', 'Pinata declined to carry out the request.');
      },
    });
    const translation = makeTranslation({
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_GRANT_REVOCATION,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.INVALIDATE_GRANT,
      providerMetadata: { pinataFileId: 'file-1' },
    });
    const result = await executePinataProviderTranslation(translation, client, { now: () => FIXED_NOW });
    assertFailed(result);
    const keys = Object.keys(result);
    for (const forbidden of ['stack', 'httpStatus', 'statusCode', 'response', 'rawError']) {
      assert.equal(keys.includes(forbidden), false);
    }
  });
});

// ---------------------------------------------------------------------------
// Capability declaration
// ---------------------------------------------------------------------------

describe('createPinataProviderCapabilityDeclaration', () => {
  it('declares exactly the capabilities and obligation types Pinata can genuinely satisfy', () => {
    const declaration = createPinataProviderCapabilityDeclaration({
      id: 'declaration-1',
      declaredAt: FIXED_NOW,
      correlationId: 'corr-decl-1',
    });
    assert.equal(declaration.providerSystem, PINATA_PROVIDER_SYSTEM);
    assert.deepEqual([...declaration.capabilities].sort(), [...PINATA_SUPPORTED_CAPABILITIES].sort());
    assert.deepEqual([...(declaration.supportedObligationTypes ?? [])].sort(), [...PINATA_SUPPORTED_OBLIGATION_TYPES].sort());
    assert.equal(declaration.capabilities.includes('SupportsUsageReporting'), false);
    assert.equal(declaration.capabilities.includes('SupportsExpiration'), false);
  });
});
