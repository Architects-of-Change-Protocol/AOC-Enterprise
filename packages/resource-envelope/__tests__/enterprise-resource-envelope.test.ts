import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseResourceEnvelope } from '../src/enterprise-resource-envelope.js';
import {
  ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
  deserializeEnterpriseResourceEnvelope,
  enterpriseResourceEnvelopeEquals,
  enterpriseResourceEnvelopeIdentityEquals,
  EnterpriseResourceEnvelopeValidationError,
  resourceRefIdentityEquals,
  serializeEnterpriseResourceEnvelope,
  validateEnterpriseResourceEnvelope,
} from '../src/enterprise-resource-envelope.js';

function makeEnvelope(overrides: Partial<EnterpriseResourceEnvelope> = {}): EnterpriseResourceEnvelope {
  return {
    schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
    resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
    location: { uri: 's3://acme-bucket/contract-42.pdf', system: 's3', systemReference: 'acme-bucket/contract-42.pdf' },
    lifecycleState: 'active',
    registeredAt: '2026-01-01T00:00:00.000Z',
    integrity: { algorithm: 'sha256', value: 'a'.repeat(64), sizeBytes: 1024 },
    descriptor: { displayName: 'Contract 42', contentType: 'application/pdf', tags: ['legal', 'contract'] },
    correlationId: 'corr-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 11: Positive tests
// ---------------------------------------------------------------------------

describe('EnterpriseResourceEnvelope construction', () => {
  it('constructs a full envelope composing a real Protocol ResourceRef', () => {
    const envelope = makeEnvelope();
    assert.equal(envelope.resource.kind, 'document');
    assert.equal(envelope.resource.id, 'contract-42');
    assert.equal(envelope.resource.tenantId, 'tenant-a');
  });

  it('constructs a minimal envelope with only required fields', () => {
    const envelope: EnterpriseResourceEnvelope = {
      schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
      resource: { kind: 'dataset', id: 'example' },
      location: { uri: 'ipfs://bafybeigdyrzt' },
      lifecycleState: 'registered',
      registeredAt: '2026-01-01T00:00:00.000Z',
    };
    assert.equal(validateEnterpriseResourceEnvelope(envelope).valid, true);
  });
});

describe('composition over ResourceRef', () => {
  it('does not duplicate identity fields at the top level', () => {
    const envelope = makeEnvelope();
    const topLevelKeys = Object.keys(envelope);
    for (const identityField of ['kind', 'id', 'tenantId', 'attributes']) {
      assert.equal(topLevelKeys.includes(identityField), false, `envelope must not duplicate ResourceRef.${identityField}`);
    }
  });

  it('reads identity exclusively through envelope.resource', () => {
    const envelope = makeEnvelope({ resource: { kind: 'record', id: 'r-1' } });
    assert.deepEqual(envelope.resource, { kind: 'record', id: 'r-1' });
  });
});

describe('resourceRefIdentityEquals / enterpriseResourceEnvelopeIdentityEquals', () => {
  it('is true for the same kind/id/tenantId regardless of attributes', () => {
    const a = { kind: 'record', id: 'r-1', tenantId: 't-1', attributes: { region: 'eu' } };
    const b = { kind: 'record', id: 'r-1', tenantId: 't-1' };
    assert.equal(resourceRefIdentityEquals(a, b), true);
  });

  it('is false when kind, id, or tenantId differ', () => {
    const base = { kind: 'record', id: 'r-1', tenantId: 't-1' };
    assert.equal(resourceRefIdentityEquals(base, { ...base, kind: 'dataset' }), false);
    assert.equal(resourceRefIdentityEquals(base, { ...base, id: 'r-2' }), false);
    assert.equal(resourceRefIdentityEquals(base, { ...base, tenantId: 't-2' }), false);
  });

  it('envelope identity equality delegates to resourceRefIdentityEquals, not a second algorithm', () => {
    const a = makeEnvelope({ location: { uri: 's3://bucket/a' } });
    const b = makeEnvelope({ location: { uri: 'ipfs://different-entirely' }, lifecycleState: 'archived' });
    assert.equal(enterpriseResourceEnvelopeIdentityEquals(a, b), true);
    assert.equal(enterpriseResourceEnvelopeEquals(a, b), false);
  });
});

describe('enterpriseResourceEnvelopeEquals', () => {
  it('is true for two independently constructed but identical envelopes', () => {
    assert.equal(enterpriseResourceEnvelopeEquals(makeEnvelope(), makeEnvelope()), true);
  });

  it('is insensitive to attribute/tag insertion order', () => {
    const a = makeEnvelope({
      resource: { kind: 'document', id: 'd-1', attributes: { region: 'eu', tier: 'gold' } },
      descriptor: { tags: ['a', 'b'] },
    });
    const b = makeEnvelope({
      resource: { kind: 'document', id: 'd-1', attributes: { tier: 'gold', region: 'eu' } },
      descriptor: { tags: ['b', 'a'] },
    });
    assert.equal(enterpriseResourceEnvelopeEquals(a, b), true);
  });

  it('is false when location, integrity, lifecycle, or correlation differ', () => {
    const base = makeEnvelope();
    assert.equal(enterpriseResourceEnvelopeEquals(base, makeEnvelope({ location: { uri: 'different://uri' } })), false);
    const { integrity: _removedIntegrity, ...withoutIntegrity } = makeEnvelope();
    assert.equal(enterpriseResourceEnvelopeEquals(base, withoutIntegrity), false);
    assert.equal(enterpriseResourceEnvelopeEquals(base, makeEnvelope({ lifecycleState: 'archived' })), false);
    assert.equal(enterpriseResourceEnvelopeEquals(base, makeEnvelope({ correlationId: 'corr-2' })), false);
  });
});

describe('validateEnterpriseResourceEnvelope', () => {
  it('accepts a fully populated valid envelope', () => {
    assert.equal(validateEnterpriseResourceEnvelope(makeEnvelope()).valid, true);
  });

  it('rejects a missing resource', () => {
    const candidate = { ...makeEnvelope(), resource: undefined };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_RESOURCE'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeEnvelope(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing location.uri', () => {
    const candidate = { ...makeEnvelope(), location: { system: 's3' } };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_LOCATION_URI'));
  });

  it('rejects an invalid combination: systemReference without system', () => {
    const candidate = { ...makeEnvelope(), location: { uri: 's3://bucket/key', systemReference: 'bucket/key' } };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'ORPHANED_SYSTEM_REFERENCE'));
  });

  it('rejects an invalid lifecycleState', () => {
    const candidate = { ...makeEnvelope(), lifecycleState: 'approved' };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_LIFECYCLE_STATE'));
  });

  it('rejects an invalid combination: integrity.algorithm without integrity.value', () => {
    const candidate = { ...makeEnvelope(), integrity: { algorithm: 'sha256' } };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INCOMPLETE_INTEGRITY'));
  });

  it('rejects an unsupported integrity algorithm', () => {
    const candidate = { ...makeEnvelope(), integrity: { algorithm: 'md5', value: 'a'.repeat(32) } };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_INTEGRITY_ALGORITHM'));
  });

  it('rejects a malformed sha256 digest', () => {
    const candidate = { ...makeEnvelope(), integrity: { algorithm: 'sha256', value: 'not-hex' } };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_INTEGRITY_VALUE'));
  });

  it('rejects a malformed registeredAt', () => {
    const candidate = { ...makeEnvelope(), registeredAt: 'not-a-date' };
    const result = validateEnterpriseResourceEnvelope(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_REGISTERED_AT'));
  });

  it('does not perform provider, credential, network, existence, or authorization checks -- an unreachable uri and unknown system are both valid', () => {
    const candidate = makeEnvelope({
      location: { uri: 'https://this-host-does-not-resolve.invalid/object', system: 'a-provider-nobody-has-heard-of' },
    });
    assert.equal(validateEnterpriseResourceEnvelope(candidate).valid, true);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 / Phase 11: Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full envelope', () => {
    const original = makeEnvelope();
    const json = serializeEnterpriseResourceEnvelope(original);
    const restored = deserializeEnterpriseResourceEnvelope(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseResourceEnvelopeEquals(original, restored), true);
  });

  it('round-trips a minimal envelope without optional fields', () => {
    const original: EnterpriseResourceEnvelope = {
      schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
      resource: { kind: 'dataset', id: 'example' },
      location: { uri: 'ipfs://bafybeigdyrzt' },
      lifecycleState: 'registered',
      registeredAt: '2026-01-01T00:00:00.000Z',
    };
    const restored = deserializeEnterpriseResourceEnvelope(JSON.parse(JSON.stringify(serializeEnterpriseResourceEnvelope(original))));
    assert.equal(enterpriseResourceEnvelopeEquals(original, restored), true);
  });

  it('serialization is deterministic regardless of attribute/tag construction order', () => {
    const a = makeEnvelope({
      resource: { kind: 'document', id: 'd-1', attributes: { region: 'eu', tier: 'gold' } },
      descriptor: { tags: ['a', 'b'] },
    });
    const b = makeEnvelope({
      resource: { kind: 'document', id: 'd-1', attributes: { tier: 'gold', region: 'eu' } },
      descriptor: { tags: ['b', 'a'] },
    });
    assert.equal(JSON.stringify(serializeEnterpriseResourceEnvelope(a)), JSON.stringify(serializeEnterpriseResourceEnvelope(b)));
  });

  it('omits undefined optional fields rather than writing null', () => {
    const envelope: EnterpriseResourceEnvelope = {
      schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
      resource: { kind: 'dataset', id: 'example' },
      location: { uri: 'ipfs://bafybeigdyrzt' },
      lifecycleState: 'registered',
      registeredAt: '2026-01-01T00:00:00.000Z',
    };
    const json = serializeEnterpriseResourceEnvelope(envelope);
    assert.equal('integrity' in json, false);
    assert.equal('descriptor' in json, false);
    assert.equal('correlationId' in json, false);
    assert.equal('tenantId' in json.resource, false);
    assert.equal('attributes' in json.resource, false);
  });

  it('throws EnterpriseResourceEnvelopeValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseResourceEnvelope({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseResourceEnvelope({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseResourceEnvelopeValidationError);
    if (caught instanceof EnterpriseResourceEnvelopeValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 10: Negative tests -- compile-time proof the contract cannot carry
// provider credentials, runtime state, or business/authorization state.
// Mirrors the compile-time @ts-expect-error convention already used for
// Protocol's own contracts (see EnterpriseScopedAccessRequest's header
// comment in @aoc-enterprise/scoped-access). These assertions fail `tsc`
// (this package's `test` script runs `tsc -p tsconfig.test.json` before
// `node --test`), not `node --test` itself -- a forbidden field compiles to
// nothing at runtime to assert against.
// ---------------------------------------------------------------------------

describe('negative: forbidden concepts (compile-time proof, see below)', () => {
  it('is checked entirely by the ts-expect-error assertions below this test file loads', () => {
    assert.ok(true);
  });
});

// Excess-property checks only fire on object literals assigned directly to a
// typed position, so each forbidden field is attempted as a fresh literal.

// @ts-expect-error -- EnterpriseResourceEnvelope has no apiKey field.
const _noApiKey: EnterpriseResourceEnvelope = { ...makeEnvelope(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseResourceEnvelope has no bearerToken field.
const _noBearerToken: EnterpriseResourceEnvelope = { ...makeEnvelope(), bearerToken: 'secret' };

// @ts-expect-error -- EnterpriseResourceEnvelope has no credential field.
const _noCredential: EnterpriseResourceEnvelope = { ...makeEnvelope(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseResourceEnvelope has no accessKeyId field.
const _noAccessKeyId: EnterpriseResourceEnvelope = { ...makeEnvelope(), accessKeyId: 'AKIA...' };

// @ts-expect-error -- EnterpriseResourceEnvelope has no authorizationHeader field.
const _noAuthorizationHeader: EnterpriseResourceEnvelope = { ...makeEnvelope(), authorizationHeader: 'Bearer xyz' };

// @ts-expect-error -- EnterpriseResourceEnvelope has no temporary-grant field; grants live on a future AccessGrant contract, not here.
const _noTemporaryGrant: EnterpriseResourceEnvelope = { ...makeEnvelope(), grantedScopes: ['read'] };

// @ts-expect-error -- location is provider-neutral and must never carry an embedded credential field.
const _noSignedUrl: EnterpriseResourceEnvelope = { ...makeEnvelope(), location: { uri: 's3://bucket/key', signedUrl: 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=...' } };

// @ts-expect-error -- EnterpriseResourceEnvelope has no runtime client/SDK instance field.
const _noRuntimeClient: EnterpriseResourceEnvelope = { ...makeEnvelope(), client: {} };

// @ts-expect-error -- EnterpriseResourceEnvelope has no provider SDK type field.
const _noSdkInstance: EnterpriseResourceEnvelope = { ...makeEnvelope(), s3Client: {} };

// @ts-expect-error -- business policy is not this contract's concern.
const _noPolicyField: EnterpriseResourceEnvelope = { ...makeEnvelope(), policy: 'deny-by-default' };

// @ts-expect-error -- approval state belongs to a future AccessGrant, not the resource envelope.
const _noApprovalState: EnterpriseResourceEnvelope = { ...makeEnvelope(), approvalState: 'approved' };

// @ts-expect-error -- revocation state belongs to a future AccessGrant, not the resource envelope's own storage lifecycle.
const _noRevocationState: EnterpriseResourceEnvelope = { ...makeEnvelope(), revoked: false };

// @ts-expect-error -- identity is never duplicated onto the envelope itself; it lives only on envelope.resource.
const _noDuplicatedKind: EnterpriseResourceEnvelope = { ...makeEnvelope(), kind: 'document' };

// @ts-expect-error -- identity is never duplicated onto the envelope itself; it lives only on envelope.resource.
const _noDuplicatedId: EnterpriseResourceEnvelope = { ...makeEnvelope(), id: 'contract-42' };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeEnvelope().lifecycleState = 'archived';

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeEnvelope().resource = { kind: 'other', id: 'x' };

void _noApiKey;
void _noBearerToken;
void _noCredential;
void _noAccessKeyId;
void _noAuthorizationHeader;
void _noTemporaryGrant;
void _noSignedUrl;
void _noRuntimeClient;
void _noSdkInstance;
void _noPolicyField;
void _noApprovalState;
void _noRevocationState;
void _noDuplicatedKind;
void _noDuplicatedId;
