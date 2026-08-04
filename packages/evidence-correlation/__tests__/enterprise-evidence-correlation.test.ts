import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseEvidenceCorrelation } from '../src/enterprise-evidence-correlation.js';
import {
  ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
  deserializeEnterpriseEvidenceCorrelation,
  enterpriseEvidenceCorrelationEquals,
  enterpriseEvidenceCorrelationIdentityEquals,
  EnterpriseEvidenceCorrelationValidationError,
  serializeEnterpriseEvidenceCorrelation,
  validateEnterpriseEvidenceCorrelation,
  validateEnterpriseEvidenceCorrelationSet,
} from '../src/enterprise-evidence-correlation.js';

function makeCorrelation(overrides: Partial<EnterpriseEvidenceCorrelation> = {}): EnterpriseEvidenceCorrelation {
  return {
    schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
    id: 'correlation-1',
    resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
    decisionRefs: ['decision-1'],
    correlatedAt: '2026-08-04T12:00:00.000Z',
    obligationRefs: ['obligation-1', 'obligation-2'],
    grantRefs: ['grant-1'],
    usageRefs: ['usage-1', 'usage-2'],
    revocationRefs: ['revocation-1'],
    metadata: { batch: 'nightly-export', priority: 3 },
    description: 'Correlates the full lifecycle for contract-42.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 11: Positive tests
// ---------------------------------------------------------------------------

describe('EnterpriseEvidenceCorrelation construction', () => {
  it('constructs a full correlation graph', () => {
    const correlation = makeCorrelation();
    assert.equal(correlation.id, 'correlation-1');
    assert.equal(correlation.resource.id, 'contract-42');
    assert.deepEqual([...correlation.decisionRefs], ['decision-1']);
    assert.deepEqual([...(correlation.grantRefs ?? [])], ['grant-1']);
  });

  it('constructs a minimal correlation graph with only required fields', () => {
    const correlation: EnterpriseEvidenceCorrelation = {
      schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
      id: 'correlation-min',
      resource: { kind: 'dataset', id: 'example' },
      decisionRefs: ['decision-min'],
      correlatedAt: '2026-08-04T00:00:00Z',
    };
    assert.equal(validateEnterpriseEvidenceCorrelation(correlation).valid, true);
  });

  it('allows a correlation graph with only resource and decision (no grant issued yet)', () => {
    const correlation: EnterpriseEvidenceCorrelation = {
      schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
      id: 'correlation-early',
      resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
      decisionRefs: ['decision-1'],
      correlatedAt: '2026-08-04T12:00:00.000Z',
    };
    assert.equal(validateEnterpriseEvidenceCorrelation(correlation).valid, true);
  });

  it('allows multiple decision references (a re-evaluated lifecycle)', () => {
    const correlation: EnterpriseEvidenceCorrelation = {
      schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
      id: 'correlation-reevaluated',
      resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
      decisionRefs: ['decision-1', 'decision-2'],
      correlatedAt: '2026-08-04T12:00:00.000Z',
    };
    assert.equal(validateEnterpriseEvidenceCorrelation(correlation).valid, true);
  });
});

describe('composition with the R004 line (references, never embeddings)', () => {
  it('references every other contract by opaque id, never embedding their fields', () => {
    const correlation = makeCorrelation();
    const topLevelKeys = Object.keys(correlation);
    for (const foreignField of ['outcome', 'evaluatedAt', 'mandatory', 'status', 'issuedAt', 'expiresAt', 'reason', 'eventType', 'occurredAt', 'principalId']) {
      assert.equal(topLevelKeys.includes(foreignField), false, `correlation graph must not embed a field from a composed contract (${foreignField})`);
    }
    for (const refField of ['decisionRefs', 'obligationRefs', 'grantRefs', 'usageRefs', 'revocationRefs']) {
      assert.equal(topLevelKeys.includes(refField), true, `correlation graph must expose ${refField}`);
    }
  });

  it('carries the resource directly rather than requiring any referenced record to be dereferenced', () => {
    const correlation = makeCorrelation();
    assert.equal(typeof correlation.resource.kind, 'string');
    assert.equal(typeof correlation.resource.id, 'string');
  });
});

describe('enterpriseEvidenceCorrelationIdentityEquals', () => {
  it('is true for the same id/resource/graph composition regardless of every other field', () => {
    const a = makeCorrelation({ correlatedAt: '2026-08-04T00:00:00Z', description: 'first', metadata: { a: 1 } });
    const b = makeCorrelation({ correlatedAt: '2026-09-01T00:00:00Z', description: 'second', metadata: { b: 2 } });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), true);
    assert.equal(enterpriseEvidenceCorrelationEquals(a, b), false);
  });

  it('is insensitive to reference array construction order (graph composition is a set)', () => {
    const a = makeCorrelation({ obligationRefs: ['obligation-1', 'obligation-2'], usageRefs: ['usage-1', 'usage-2'] });
    const b = makeCorrelation({ obligationRefs: ['obligation-2', 'obligation-1'], usageRefs: ['usage-2', 'usage-1'] });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), true);
  });

  it('is false when id differs', () => {
    const a = makeCorrelation();
    const b = makeCorrelation({ id: 'correlation-2' });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), false);
  });

  it('is false when resource identity differs', () => {
    const a = makeCorrelation();
    const b = makeCorrelation({ resource: { kind: 'document', id: 'other-doc' } });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), false);
  });

  it('is false when decisionRefs differ', () => {
    const a = makeCorrelation();
    const b = makeCorrelation({ decisionRefs: ['decision-9'] });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), false);
  });

  it('is false when grantRefs differ', () => {
    const a = makeCorrelation();
    const b = makeCorrelation({ grantRefs: ['grant-9'] });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), false);
  });

  it('is false when usageRefs differ', () => {
    const a = makeCorrelation();
    const b = makeCorrelation({ usageRefs: ['usage-9'] });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), false);
  });

  it('is false when revocationRefs differ', () => {
    const a = makeCorrelation();
    const b = makeCorrelation({ revocationRefs: ['revocation-9'] });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), false);
  });

  it('is false when obligationRefs differ', () => {
    const a = makeCorrelation();
    const b = makeCorrelation({ obligationRefs: ['obligation-9'] });
    assert.equal(enterpriseEvidenceCorrelationIdentityEquals(a, b), false);
  });
});

describe('enterpriseEvidenceCorrelationEquals', () => {
  it('is true for two independently constructed but identical correlation graphs', () => {
    assert.equal(enterpriseEvidenceCorrelationEquals(makeCorrelation(), makeCorrelation()), true);
  });

  it('is insensitive to metadata key construction order', () => {
    const a = makeCorrelation({ metadata: { batch: 'nightly-export', priority: 3 } });
    const b = makeCorrelation({ metadata: { priority: 3, batch: 'nightly-export' } });
    assert.equal(enterpriseEvidenceCorrelationEquals(a, b), true);
  });

  it('is false when correlatedAt, metadata, or description differ', () => {
    const base = makeCorrelation();
    assert.equal(enterpriseEvidenceCorrelationEquals(base, makeCorrelation({ correlatedAt: '2026-09-01T00:00:00Z' })), false);
    assert.equal(enterpriseEvidenceCorrelationEquals(base, makeCorrelation({ metadata: { priority: 9 } })), false);
    assert.equal(enterpriseEvidenceCorrelationEquals(base, makeCorrelation({ description: 'different' })), false);
  });
});

describe('validateEnterpriseEvidenceCorrelation', () => {
  it('accepts a fully populated valid correlation graph', () => {
    assert.equal(validateEnterpriseEvidenceCorrelation(makeCorrelation()).valid, true);
  });

  it('rejects a missing id', () => {
    const candidate = { ...makeCorrelation(), id: undefined };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ID'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeCorrelation(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing resource', () => {
    const candidate = { ...makeCorrelation(), resource: undefined };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_RESOURCE'));
  });

  it('rejects a resource missing kind or id', () => {
    const candidate = { ...makeCorrelation(), resource: { kind: 'document' } };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_RESOURCE_IDENTITY'));
  });

  it('rejects a missing decisionRefs (required references)', () => {
    const candidate = { ...makeCorrelation(), decisionRefs: undefined };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_DECISION_REFS'));
  });

  it('rejects an empty decisionRefs array (required references)', () => {
    const candidate = { ...makeCorrelation(), decisionRefs: [] };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_DECISION_REFS'));
  });

  it('rejects a non-string entry in decisionRefs (reference integrity)', () => {
    const candidate = { ...makeCorrelation(), decisionRefs: ['decision-1', 42] };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_DECISION_REFS'));
  });

  it('rejects duplicate references within decisionRefs (duplicate references)', () => {
    const candidate = { ...makeCorrelation(), decisionRefs: ['decision-1', 'decision-1'] };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_DECISION_REF'));
  });

  it('rejects duplicate references within each optional reference array', () => {
    for (const [field, code] of [
      ['obligationRefs', 'DUPLICATE_OBLIGATION_REF'],
      ['grantRefs', 'DUPLICATE_GRANT_REF'],
      ['usageRefs', 'DUPLICATE_USAGE_REF'],
      ['revocationRefs', 'DUPLICATE_REVOCATION_REF'],
    ] as const) {
      const candidate = { ...makeCorrelation(), [field]: ['ref-1', 'ref-1'] };
      const result = validateEnterpriseEvidenceCorrelation(candidate);
      assert.equal(result.valid, false, `expected duplicate detection for ${field}`);
      assert.ok(!result.valid && result.errors.some((e) => e.code === code));
    }
  });

  it('rejects an empty optional reference array when present', () => {
    const candidate = { ...makeCorrelation(), grantRefs: [] };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_GRANT_REFS'));
  });

  it('rejects usageRefs populated without grantRefs (graph consistency)', () => {
    const candidate = { ...makeCorrelation(), grantRefs: undefined, usageRefs: ['usage-1'] };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'USAGE_WITHOUT_GRANT'));
  });

  it('rejects revocationRefs populated without grantRefs (graph consistency)', () => {
    const candidate = { ...makeCorrelation(), grantRefs: undefined, revocationRefs: ['revocation-1'] };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'REVOCATION_WITHOUT_GRANT'));
  });

  it('accepts usageRefs and revocationRefs when grantRefs is populated', () => {
    const candidate = makeCorrelation({ grantRefs: ['grant-1'], usageRefs: ['usage-1'], revocationRefs: ['revocation-1'] });
    assert.equal(validateEnterpriseEvidenceCorrelation(candidate).valid, true);
  });

  it('rejects a missing correlatedAt', () => {
    const candidate = { ...makeCorrelation(), correlatedAt: undefined };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_CORRELATED_AT'));
  });

  it('rejects a malformed correlatedAt (timestamp consistency)', () => {
    const candidate = { ...makeCorrelation(), correlatedAt: 'not-a-timestamp' };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_CORRELATED_AT'));
  });

  it('rejects a non-primitive metadata value', () => {
    const candidate = { ...makeCorrelation(), metadata: { nested: { not: 'a primitive' } } };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_METADATA'));
  });

  it('rejects a metadata key that resembles a credential, token, or URL', () => {
    for (const key of ['apiKey', 'sessionId', 'downloadUrl', 'authToken', 'x-api-key']) {
      const candidate = { ...makeCorrelation(), metadata: { [key]: 'value' } };
      const result = validateEnterpriseEvidenceCorrelation(candidate);
      assert.equal(result.valid, false, `expected metadata key '${key}' to be rejected`);
      assert.ok(!result.valid && result.errors.some((e) => e.code === 'FORBIDDEN_METADATA_KEY'));
    }
  });

  it('rejects a non-string description', () => {
    const candidate = { ...makeCorrelation(), description: 123 };
    const result = validateEnterpriseEvidenceCorrelation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_DESCRIPTION'));
  });

  it('does not perform provider, network, storage, or existence checks on referenced records', () => {
    const candidate = makeCorrelation({
      decisionRefs: ['a-decision-nobody-can-verify-exists'],
      grantRefs: ['a-grant-nobody-can-verify-exists'],
      usageRefs: ['a-usage-record-nobody-can-verify-exists'],
      revocationRefs: ['a-revocation-nobody-can-verify-exists'],
    });
    assert.equal(validateEnterpriseEvidenceCorrelation(candidate).valid, true);
  });
});

describe('validateEnterpriseEvidenceCorrelationSet (duplicate detection)', () => {
  it('accepts a set with no duplicate ids', () => {
    const result = validateEnterpriseEvidenceCorrelationSet([makeCorrelation({ id: 'correlation-1' }), makeCorrelation({ id: 'correlation-2' })]);
    assert.equal(result.valid, true);
  });

  it('accepts an empty set', () => {
    assert.equal(validateEnterpriseEvidenceCorrelationSet([]).valid, true);
  });

  it('rejects a set where two graphs share the same id', () => {
    const result = validateEnterpriseEvidenceCorrelationSet([makeCorrelation({ id: 'correlation-1' }), makeCorrelation({ id: 'correlation-1' })]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_CORRELATION_ID' && e.message.includes('correlation-1')));
  });

  it('reports each duplicate exactly once regardless of how many times it repeats', () => {
    const result = validateEnterpriseEvidenceCorrelationSet([
      makeCorrelation({ id: 'correlation-1' }),
      makeCorrelation({ id: 'correlation-1' }),
      makeCorrelation({ id: 'correlation-1' }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.length === 1);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 / Phase 11: Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full correlation graph', () => {
    const original = makeCorrelation();
    const json = serializeEnterpriseEvidenceCorrelation(original);
    const restored = deserializeEnterpriseEvidenceCorrelation(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseEvidenceCorrelationEquals(original, restored), true);
  });

  it('round-trips a minimal correlation graph without optional fields', () => {
    const original: EnterpriseEvidenceCorrelation = {
      schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
      id: 'correlation-min',
      resource: { kind: 'dataset', id: 'example' },
      decisionRefs: ['decision-min'],
      correlatedAt: '2026-08-04T00:00:00Z',
    };
    const restored = deserializeEnterpriseEvidenceCorrelation(JSON.parse(JSON.stringify(serializeEnterpriseEvidenceCorrelation(original))));
    assert.equal(enterpriseEvidenceCorrelationEquals(original, restored), true);
  });

  it('serialization is deterministic regardless of reference array/metadata construction order', () => {
    const a = makeCorrelation({ obligationRefs: ['obligation-1', 'obligation-2'], metadata: { batch: 'nightly-export', priority: 3 } });
    const b = makeCorrelation({ obligationRefs: ['obligation-2', 'obligation-1'], metadata: { priority: 3, batch: 'nightly-export' } });
    assert.equal(JSON.stringify(serializeEnterpriseEvidenceCorrelation(a)), JSON.stringify(serializeEnterpriseEvidenceCorrelation(b)));
  });

  it('omits undefined optional fields rather than writing null', () => {
    const correlation: EnterpriseEvidenceCorrelation = {
      schemaVersion: ENTERPRISE_EVIDENCE_CORRELATION_SCHEMA_VERSION,
      id: 'correlation-min',
      resource: { kind: 'dataset', id: 'example' },
      decisionRefs: ['decision-min'],
      correlatedAt: '2026-08-04T00:00:00Z',
    };
    const json = serializeEnterpriseEvidenceCorrelation(correlation);
    assert.equal('obligationRefs' in json, false);
    assert.equal('grantRefs' in json, false);
    assert.equal('usageRefs' in json, false);
    assert.equal('revocationRefs' in json, false);
    assert.equal('metadata' in json, false);
    assert.equal('description' in json, false);
  });

  it('throws EnterpriseEvidenceCorrelationValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseEvidenceCorrelation({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseEvidenceCorrelation({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseEvidenceCorrelationValidationError);
    if (caught instanceof EnterpriseEvidenceCorrelationValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 10: Negative tests -- compile-time proof the contract cannot carry a
// JWT, a URL, any provider SDK (Pinata/Azure/S3), a network client, a
// storage object, a provider credential, an API key, a runtime trace, a
// telemetry payload, an analytics payload, or an audit report. Mirrors the
// compile-time @ts-expect-error convention already established in
// `packages/resource-envelope`, `packages/access-decision`,
// `packages/access-obligation`, `packages/access-grant`,
// `packages/grant-revocation`, and `packages/usage-event`. These assertions
// fail `tsc` (this package's `test` script runs `tsc -p tsconfig.test.json`
// before `node --test`), not `node --test` itself -- a forbidden field
// compiles to nothing at runtime to assert against.
// ---------------------------------------------------------------------------

describe('negative: forbidden concepts (compile-time proof, see below)', () => {
  it('is checked entirely by the ts-expect-error assertions below this test file loads', () => {
    assert.ok(true);
  });
});

// Excess-property checks only fire on object literals assigned directly to a
// typed position, so each forbidden field is attempted as a fresh literal.

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no jwt field.
const _noJwt: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), jwt: 'eyJhbGciOiJIUzI1NiJ9...' };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no oauthToken field.
const _noOAuth: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), oauthToken: 'ya29.a0Ael9...' };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no url field; it never carries a provider resource URL.
const _noUrl: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), url: 'https://example.com/object' };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no downloadUrl field.
const _noDownloadUrl: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), downloadUrl: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no signedUrl field.
const _noSignedUrl: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), signedUrl: 'https://example.com/signed' };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no pinataSdk field; this contract is provider-neutral.
const _noPinataSdk: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), pinataSdk: {} };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no s3Client field; this contract is provider-neutral.
const _noS3Client: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), s3Client: {} };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no azureBlobClient field; this contract is provider-neutral.
const _noAzureClient: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), azureBlobClient: {} };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no network/http client field; it never contacts a provider.
const _noNetworkClient: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), httpClient: {} };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no storage/bucket/blob object field; it does not implement storage.
const _noStorageObject: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), bucket: { name: 'evidence-bucket' } };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no credential field.
const _noCredential: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no apiKey field.
const _noApiKey: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no runtime trace field; it performs no runtime execution.
const _noRuntimeTrace: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), trace: { spanId: 'span-1', traceId: 'trace-1' } };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no telemetry payload field.
const _noTelemetry: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), telemetry: { latencyMs: 12 } };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no analytics payload field.
const _noAnalytics: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), analytics: { viewCount: 3 } };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no audit report field; it never performs audit execution.
const _noAuditReport: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), auditReport: { findings: [] } };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no runtime callback field; a correlation graph never executes itself.
const _noRuntimeCallback: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), onCorrelated: () => {} };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no sessionId field.
const _noSessionId: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), sessionId: 'sess-123' };

// @ts-expect-error -- EnterpriseEvidenceCorrelation has no success/httpStatus/provider-response field; provider outcomes belong to a future provider adapter, never this graph.
const _noProviderSuccess: EnterpriseEvidenceCorrelation = { ...makeCorrelation(), success: true, httpStatus: 200 };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeCorrelation().id = 'correlation-9';

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeCorrelation().decisionRefs = ['decision-9'];

void _noJwt;
void _noOAuth;
void _noUrl;
void _noDownloadUrl;
void _noSignedUrl;
void _noPinataSdk;
void _noS3Client;
void _noAzureClient;
void _noNetworkClient;
void _noStorageObject;
void _noCredential;
void _noApiKey;
void _noRuntimeTrace;
void _noTelemetry;
void _noAnalytics;
void _noAuditReport;
void _noRuntimeCallback;
void _noSessionId;
void _noProviderSuccess;
