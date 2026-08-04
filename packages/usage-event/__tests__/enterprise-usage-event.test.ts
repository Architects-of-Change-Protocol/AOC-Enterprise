import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseUsageEvent } from '../src/enterprise-usage-event.js';
import {
  ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION,
  ENTERPRISE_USAGE_EVENT_TYPES,
  deserializeEnterpriseUsageEvent,
  enterpriseUsageEventEquals,
  enterpriseUsageEventIdentityEquals,
  EnterpriseUsageEventValidationError,
  serializeEnterpriseUsageEvent,
  validateEnterpriseUsageEvent,
  validateEnterpriseUsageEventSet,
} from '../src/enterprise-usage-event.js';

function makeEvent(overrides: Partial<EnterpriseUsageEvent> = {}): EnterpriseUsageEvent {
  return {
    schemaVersion: ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION,
    id: 'usage-1',
    eventType: ENTERPRISE_USAGE_EVENT_TYPES.CONTENT_VIEWED,
    grantRef: 'grant-1',
    resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
    principalId: 'actor-1',
    occurredAt: '2026-08-04T12:00:00.000Z',
    correlationId: 'corr-usage-1',
    metadata: { renderedPages: 3, viewer: 'web' },
    evidenceRefs: ['evidence-1', 'evidence-2'],
    description: 'Viewed via the web reader.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 11: Positive tests
// ---------------------------------------------------------------------------

describe('EnterpriseUsageEvent construction', () => {
  it('constructs a full usage event', () => {
    const event = makeEvent();
    assert.equal(event.eventType, 'ContentViewed');
    assert.equal(event.grantRef, 'grant-1');
    assert.equal(event.principalId, 'actor-1');
    assert.equal(event.resource.id, 'contract-42');
  });

  it('constructs a minimal usage event with only required fields', () => {
    const event: EnterpriseUsageEvent = {
      schemaVersion: ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION,
      id: 'usage-min',
      eventType: ENTERPRISE_USAGE_EVENT_TYPES.GRANT_CONSUMED,
      grantRef: 'grant-2',
      resource: { kind: 'dataset', id: 'example' },
      principalId: 'actor-2',
      occurredAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-usage-2',
    };
    assert.equal(validateEnterpriseUsageEvent(event).valid, true);
  });

  it('accepts every canonical usage event type', () => {
    for (const eventType of Object.values(ENTERPRISE_USAGE_EVENT_TYPES)) {
      assert.equal(validateEnterpriseUsageEvent(makeEvent({ eventType })).valid, true);
    }
  });
});

describe('composition with EnterpriseAccessGrant', () => {
  it('references the grant by grantRef rather than embedding grant fields', () => {
    const event = makeEvent();
    const topLevelKeys = Object.keys(event);
    for (const grantLikeField of ['status', 'decisionRef', 'issuedAt', 'expiresAt', 'issuerRef', 'obligationRefs', 'auditRefs']) {
      assert.equal(topLevelKeys.includes(grantLikeField), false, `usage event must not embed EnterpriseAccessGrant.${grantLikeField}`);
    }
    assert.equal(typeof event.grantRef, 'string');
  });

  it('carries resource and principal directly rather than requiring the grant to be dereferenced', () => {
    const event = makeEvent();
    assert.equal(typeof event.resource.kind, 'string');
    assert.equal(typeof event.resource.id, 'string');
    assert.equal(typeof event.principalId, 'string');
  });
});

describe('composition with a collection (many events per grant)', () => {
  it('allows the same grant to be referenced by many usage events', () => {
    const result = validateEnterpriseUsageEventSet([
      makeEvent({ id: 'usage-1', grantRef: 'grant-shared', eventType: ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_STARTED }),
      makeEvent({ id: 'usage-2', grantRef: 'grant-shared', eventType: ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_COMPLETED }),
      makeEvent({ id: 'usage-3', grantRef: 'grant-shared', eventType: ENTERPRISE_USAGE_EVENT_TYPES.CONTENT_DOWNLOADED }),
    ]);
    assert.equal(result.valid, true);
  });
});

describe('enterpriseUsageEventIdentityEquals', () => {
  it('is true for the same id/occurredAt/grantRef/eventType regardless of every other field', () => {
    const a = makeEvent({ principalId: 'actor-a', description: 'first', metadata: { a: 1 } });
    const b = makeEvent({ principalId: 'actor-b', description: 'second', metadata: { b: 2 } });
    assert.equal(enterpriseUsageEventIdentityEquals(a, b), true);
    assert.equal(enterpriseUsageEventEquals(a, b), false);
  });

  it('is false when id differs', () => {
    const a = makeEvent();
    const b = makeEvent({ id: 'usage-2' });
    assert.equal(enterpriseUsageEventIdentityEquals(a, b), false);
  });

  it('is false when occurredAt differs', () => {
    const a = makeEvent();
    const b = makeEvent({ occurredAt: '2026-09-01T00:00:00Z' });
    assert.equal(enterpriseUsageEventIdentityEquals(a, b), false);
  });

  it('is false when grantRef differs', () => {
    const a = makeEvent();
    const b = makeEvent({ grantRef: 'grant-9' });
    assert.equal(enterpriseUsageEventIdentityEquals(a, b), false);
  });

  it('is false when eventType differs', () => {
    const a = makeEvent();
    const b = makeEvent({ eventType: ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_DENIED });
    assert.equal(enterpriseUsageEventIdentityEquals(a, b), false);
  });
});

describe('enterpriseUsageEventEquals', () => {
  it('is true for two independently constructed but identical events', () => {
    assert.equal(enterpriseUsageEventEquals(makeEvent(), makeEvent()), true);
  });

  it('is insensitive to evidenceRefs construction order', () => {
    const a = makeEvent({ evidenceRefs: ['evidence-1', 'evidence-2'] });
    const b = makeEvent({ evidenceRefs: ['evidence-2', 'evidence-1'] });
    assert.equal(enterpriseUsageEventEquals(a, b), true);
  });

  it('is insensitive to metadata key construction order', () => {
    const a = makeEvent({ metadata: { renderedPages: 3, viewer: 'web' } });
    const b = makeEvent({ metadata: { viewer: 'web', renderedPages: 3 } });
    assert.equal(enterpriseUsageEventEquals(a, b), true);
  });

  it('is false when resource identity, principalId, correlationId, metadata, evidenceRefs, or description differ', () => {
    const base = makeEvent();
    assert.equal(enterpriseUsageEventEquals(base, makeEvent({ resource: { kind: 'document', id: 'other-doc' } })), false);
    assert.equal(enterpriseUsageEventEquals(base, makeEvent({ principalId: 'someone-else' })), false);
    assert.equal(enterpriseUsageEventEquals(base, makeEvent({ correlationId: 'corr-9' })), false);
    assert.equal(enterpriseUsageEventEquals(base, makeEvent({ metadata: { renderedPages: 9 } })), false);
    assert.equal(enterpriseUsageEventEquals(base, makeEvent({ evidenceRefs: ['evidence-9'] })), false);
    assert.equal(enterpriseUsageEventEquals(base, makeEvent({ description: 'different' })), false);
  });
});

describe('validateEnterpriseUsageEvent', () => {
  it('accepts a fully populated valid event', () => {
    assert.equal(validateEnterpriseUsageEvent(makeEvent()).valid, true);
  });

  it('rejects a missing id', () => {
    const candidate = { ...makeEvent(), id: undefined };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ID'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeEvent(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing eventType', () => {
    const candidate = { ...makeEvent(), eventType: undefined };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_EVENT_TYPE'));
  });

  it('rejects an eventType outside the canonical vocabulary', () => {
    const candidate = { ...makeEvent(), eventType: 'pinata-pin-succeeded' };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EVENT_TYPE'));
  });

  it('rejects a missing grantRef (reference integrity)', () => {
    const candidate = { ...makeEvent(), grantRef: undefined };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_GRANT_REF'));
  });

  it('rejects a non-string grantRef (reference integrity)', () => {
    const candidate = { ...makeEvent(), grantRef: 42 };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_GRANT_REF'));
  });

  it('rejects a missing resource', () => {
    const candidate = { ...makeEvent(), resource: undefined };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_RESOURCE'));
  });

  it('rejects a resource missing kind or id', () => {
    const candidate = { ...makeEvent(), resource: { kind: 'document' } };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_RESOURCE_IDENTITY'));
  });

  it('rejects a missing principalId', () => {
    const candidate = { ...makeEvent(), principalId: undefined };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_PRINCIPAL_ID'));
  });

  it('rejects a missing occurredAt', () => {
    const candidate = { ...makeEvent(), occurredAt: undefined };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_OCCURRED_AT'));
  });

  it('rejects a malformed occurredAt (timestamp consistency)', () => {
    const candidate = { ...makeEvent(), occurredAt: 'not-a-timestamp' };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_OCCURRED_AT'));
  });

  it('rejects a missing correlationId', () => {
    const candidate = { ...makeEvent(), correlationId: undefined };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_CORRELATION_ID'));
  });

  it('rejects a non-primitive metadata value', () => {
    const candidate = { ...makeEvent(), metadata: { nested: { not: 'a primitive' } } };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_METADATA'));
  });

  it('rejects a metadata key that resembles a credential, token, or URL', () => {
    for (const key of ['apiKey', 'sessionId', 'downloadUrl', 'authToken', 'x-api-key']) {
      const candidate = { ...makeEvent(), metadata: { [key]: 'value' } };
      const result = validateEnterpriseUsageEvent(candidate);
      assert.equal(result.valid, false, `expected metadata key '${key}' to be rejected`);
      assert.ok(!result.valid && result.errors.some((e) => e.code === 'FORBIDDEN_METADATA_KEY'));
    }
  });

  it('rejects non-string evidenceRefs entries', () => {
    const candidate = { ...makeEvent(), evidenceRefs: ['evidence-1', 42] };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EVIDENCE_REFS'));
  });

  it('rejects a non-string description', () => {
    const candidate = { ...makeEvent(), description: 123 };
    const result = validateEnterpriseUsageEvent(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_DESCRIPTION'));
  });

  it('does not perform provider, network, or authorization-decision checks', () => {
    const candidate = makeEvent({
      grantRef: 'a-grant-nobody-can-verify-exists',
      evidenceRefs: ['an-evidence-record-nobody-can-verify-exists'],
    });
    assert.equal(validateEnterpriseUsageEvent(candidate).valid, true);
  });
});

describe('validateEnterpriseUsageEventSet (duplicate detection)', () => {
  it('accepts a set with no duplicate ids', () => {
    const result = validateEnterpriseUsageEventSet([makeEvent({ id: 'usage-1' }), makeEvent({ id: 'usage-2' })]);
    assert.equal(result.valid, true);
  });

  it('accepts an empty set', () => {
    assert.equal(validateEnterpriseUsageEventSet([]).valid, true);
  });

  it('rejects a set where two events share the same id', () => {
    const result = validateEnterpriseUsageEventSet([makeEvent({ id: 'usage-1' }), makeEvent({ id: 'usage-1' })]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_EVENT_ID' && e.message.includes('usage-1')));
  });

  it('reports each duplicate exactly once regardless of how many times it repeats', () => {
    const result = validateEnterpriseUsageEventSet([
      makeEvent({ id: 'usage-1' }),
      makeEvent({ id: 'usage-1' }),
      makeEvent({ id: 'usage-1' }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.length === 1);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 / Phase 11: Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full usage event', () => {
    const original = makeEvent();
    const json = serializeEnterpriseUsageEvent(original);
    const restored = deserializeEnterpriseUsageEvent(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseUsageEventEquals(original, restored), true);
  });

  it('round-trips a minimal usage event without optional fields', () => {
    const original: EnterpriseUsageEvent = {
      schemaVersion: ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION,
      id: 'usage-min',
      eventType: ENTERPRISE_USAGE_EVENT_TYPES.GRANT_CONSUMED,
      grantRef: 'grant-2',
      resource: { kind: 'dataset', id: 'example' },
      principalId: 'actor-2',
      occurredAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-usage-2',
    };
    const restored = deserializeEnterpriseUsageEvent(JSON.parse(JSON.stringify(serializeEnterpriseUsageEvent(original))));
    assert.equal(enterpriseUsageEventEquals(original, restored), true);
  });

  it('serialization is deterministic regardless of evidenceRefs/metadata construction order', () => {
    const a = makeEvent({ evidenceRefs: ['evidence-1', 'evidence-2'], metadata: { renderedPages: 3, viewer: 'web' } });
    const b = makeEvent({ evidenceRefs: ['evidence-2', 'evidence-1'], metadata: { viewer: 'web', renderedPages: 3 } });
    assert.equal(JSON.stringify(serializeEnterpriseUsageEvent(a)), JSON.stringify(serializeEnterpriseUsageEvent(b)));
  });

  it('omits undefined optional fields rather than writing null', () => {
    const event: EnterpriseUsageEvent = {
      schemaVersion: ENTERPRISE_USAGE_EVENT_SCHEMA_VERSION,
      id: 'usage-min',
      eventType: ENTERPRISE_USAGE_EVENT_TYPES.GRANT_CONSUMED,
      grantRef: 'grant-2',
      resource: { kind: 'dataset', id: 'example' },
      principalId: 'actor-2',
      occurredAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-usage-2',
    };
    const json = serializeEnterpriseUsageEvent(event);
    assert.equal('metadata' in json, false);
    assert.equal('evidenceRefs' in json, false);
    assert.equal('description' in json, false);
  });

  it('throws EnterpriseUsageEventValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseUsageEvent({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseUsageEvent({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseUsageEventValidationError);
    if (caught instanceof EnterpriseUsageEventValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 10: Negative tests -- compile-time proof the contract cannot carry
// provider URLs, JWTs, OAuth state, Pinata/S3/Azure SDK types, runtime
// callbacks, provider credentials, API keys, download URLs, network clients,
// or -- specific to this contract -- an authorization/enforcement/provider
// success judgment ("was it allowed?", "was it enforced?", "was it
// successful from the provider's perspective?" all belong elsewhere; see
// Phase 5). Mirrors the compile-time @ts-expect-error convention already
// established in `packages/resource-envelope`, `packages/access-decision`,
// `packages/access-obligation`, `packages/access-grant`, and
// `packages/grant-revocation`. These assertions fail `tsc` (this package's
// `test` script runs `tsc -p tsconfig.test.json` before `node --test`), not
// `node --test` itself -- a forbidden field compiles to nothing at runtime
// to assert against.
// ---------------------------------------------------------------------------

describe('negative: forbidden concepts (compile-time proof, see below)', () => {
  it('is checked entirely by the ts-expect-error assertions below this test file loads', () => {
    assert.ok(true);
  });
});

// Excess-property checks only fire on object literals assigned directly to a
// typed position, so each forbidden field is attempted as a fresh literal.

// @ts-expect-error -- EnterpriseUsageEvent has no url field; it never carries a provider resource URL.
const _noUrl: EnterpriseUsageEvent = { ...makeEvent(), url: 'https://example.com/object' };

// @ts-expect-error -- EnterpriseUsageEvent has no downloadUrl field.
const _noDownloadUrl: EnterpriseUsageEvent = { ...makeEvent(), downloadUrl: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseUsageEvent has no signedUrl field.
const _noSignedUrl: EnterpriseUsageEvent = { ...makeEvent(), signedUrl: 'https://example.com/signed' };

// @ts-expect-error -- EnterpriseUsageEvent has no jwt field.
const _noJwt: EnterpriseUsageEvent = { ...makeEvent(), jwt: 'eyJhbGciOiJIUzI1NiJ9...' };

// @ts-expect-error -- EnterpriseUsageEvent has no oauthToken/refreshToken field.
const _noOAuth: EnterpriseUsageEvent = { ...makeEvent(), oauthToken: 'ya29.a0Ael9...' };

// @ts-expect-error -- EnterpriseUsageEvent has no pinataSdk/client field; this contract is provider-neutral.
const _noPinataSdk: EnterpriseUsageEvent = { ...makeEvent(), pinataSdk: {} };

// @ts-expect-error -- EnterpriseUsageEvent has no s3Client field; this contract is provider-neutral.
const _noS3Client: EnterpriseUsageEvent = { ...makeEvent(), s3Client: {} };

// @ts-expect-error -- EnterpriseUsageEvent has no azureBlobClient field; this contract is provider-neutral.
const _noAzureClient: EnterpriseUsageEvent = { ...makeEvent(), azureBlobClient: {} };

// @ts-expect-error -- EnterpriseUsageEvent has no credential field.
const _noCredential: EnterpriseUsageEvent = { ...makeEvent(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseUsageEvent has no apiKey field.
const _noApiKey: EnterpriseUsageEvent = { ...makeEvent(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseUsageEvent has no downloadLink field.
const _noDownloadLink: EnterpriseUsageEvent = { ...makeEvent(), downloadLink: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseUsageEvent has no network client field; it never contacts a provider.
const _noNetworkClient: EnterpriseUsageEvent = { ...makeEvent(), httpClient: {} };

// @ts-expect-error -- EnterpriseUsageEvent has no runtime callback field; a usage event never executes itself.
const _noRuntimeCallback: EnterpriseUsageEvent = { ...makeEvent(), onObserved: () => {} };

// @ts-expect-error -- EnterpriseUsageEvent has no sessionId field.
const _noSessionId: EnterpriseUsageEvent = { ...makeEvent(), sessionId: 'sess-123' };

// @ts-expect-error -- EnterpriseUsageEvent has no cacheKey field.
const _noCacheKey: EnterpriseUsageEvent = { ...makeEvent(), cacheKey: 'cache-123' };

// @ts-expect-error -- EnterpriseUsageEvent has no allowed field; whether access was permitted is EnterpriseAccessDecision's/EnterpriseAccessGrant's fact, never re-decided here.
const _noAllowed: EnterpriseUsageEvent = { ...makeEvent(), allowed: true };

// @ts-expect-error -- EnterpriseUsageEvent has no enforced field; whether an obligation was carried out belongs to a future enforcement layer.
const _noEnforced: EnterpriseUsageEvent = { ...makeEvent(), enforced: true };

// @ts-expect-error -- EnterpriseUsageEvent has no success/httpStatus field; provider-perspective outcome is never recorded by this contract.
const _noProviderSuccess: EnterpriseUsageEvent = { ...makeEvent(), success: true, httpStatus: 200 };

// @ts-expect-error -- EnterpriseUsageEvent has no policyEvaluationRef field; policy evaluation is EnterpriseAccessDecision's responsibility.
const _noPolicyEvaluationRef: EnterpriseUsageEvent = { ...makeEvent(), policyEvaluationRef: 'policy-eval-1' };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeEvent().eventType = ENTERPRISE_USAGE_EVENT_TYPES.ACCESS_DENIED;

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeEvent().grantRef = 'grant-9';

void _noUrl;
void _noDownloadUrl;
void _noSignedUrl;
void _noJwt;
void _noOAuth;
void _noPinataSdk;
void _noS3Client;
void _noAzureClient;
void _noCredential;
void _noApiKey;
void _noDownloadLink;
void _noNetworkClient;
void _noRuntimeCallback;
void _noSessionId;
void _noCacheKey;
void _noAllowed;
void _noEnforced;
void _noProviderSuccess;
void _noPolicyEvaluationRef;
