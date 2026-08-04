import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseGrantRevocation } from '../src/enterprise-grant-revocation.js';
import {
  ENTERPRISE_GRANT_REVOCATION_REASONS,
  ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
  deserializeEnterpriseGrantRevocation,
  enterpriseGrantRevocationEquals,
  enterpriseGrantRevocationIdentityEquals,
  EnterpriseGrantRevocationValidationError,
  serializeEnterpriseGrantRevocation,
  validateEnterpriseGrantRevocation,
  validateEnterpriseGrantRevocationSet,
} from '../src/enterprise-grant-revocation.js';

function makeRevocation(overrides: Partial<EnterpriseGrantRevocation> = {}): EnterpriseGrantRevocation {
  return {
    schemaVersion: ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
    id: 'revocation-1',
    grantRef: 'grant-1',
    revokedAt: '2026-08-04T12:00:00.000Z',
    reason: ENTERPRISE_GRANT_REVOCATION_REASONS.ADMINISTRATOR_REVOKED,
    issuerRef: 'admin-1',
    correlationId: 'corr-1',
    evidenceRefs: ['evidence-1', 'evidence-2'],
    description: 'Revoked after quarterly access review.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 10: Positive tests
// ---------------------------------------------------------------------------

describe('EnterpriseGrantRevocation construction', () => {
  it('constructs a full revocation record', () => {
    const revocation = makeRevocation();
    assert.equal(revocation.grantRef, 'grant-1');
    assert.equal(revocation.reason, 'administrator-revoked');
    assert.equal(revocation.issuerRef, 'admin-1');
  });

  it('constructs a minimal revocation record with only required fields', () => {
    const revocation: EnterpriseGrantRevocation = {
      schemaVersion: ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
      id: 'revocation-min',
      grantRef: 'grant-2',
      revokedAt: '2026-08-04T00:00:00Z',
      reason: ENTERPRISE_GRANT_REVOCATION_REASONS.EXPIRED,
      issuerRef: 'system-expiry-process',
      correlationId: 'corr-2',
    };
    assert.equal(validateEnterpriseGrantRevocation(revocation).valid, true);
  });

  it('accepts every canonical revocation reason', () => {
    for (const reason of Object.values(ENTERPRISE_GRANT_REVOCATION_REASONS)) {
      assert.equal(validateEnterpriseGrantRevocation(makeRevocation({ reason })).valid, true);
    }
  });
});

describe('composition with a future EnterpriseAccessGrant', () => {
  it('references the grant by grantRef rather than embedding grant fields', () => {
    const revocation = makeRevocation();
    const topLevelKeys = Object.keys(revocation);
    for (const grantLikeField of ['resource', 'request', 'scope', 'expiresAt', 'issuedAt', 'status']) {
      assert.equal(topLevelKeys.includes(grantLikeField), false, `revocation must not embed grant-shaped field '${grantLikeField}'`);
    }
    assert.equal(typeof revocation.grantRef, 'string');
  });
});

describe('enterpriseGrantRevocationIdentityEquals', () => {
  it('is true for the same id/grantRef/revokedAt regardless of every other field', () => {
    const a = makeRevocation({ reason: ENTERPRISE_GRANT_REVOCATION_REASONS.SECURITY_INCIDENT, issuerRef: 'issuer-a', description: 'first' });
    const b = makeRevocation({ reason: ENTERPRISE_GRANT_REVOCATION_REASONS.MANUAL_REVOCATION, issuerRef: 'issuer-b', description: 'second' });
    assert.equal(enterpriseGrantRevocationIdentityEquals(a, b), true);
    assert.equal(enterpriseGrantRevocationEquals(a, b), false);
  });

  it('is false when id differs', () => {
    const a = makeRevocation();
    const b = makeRevocation({ id: 'revocation-2' });
    assert.equal(enterpriseGrantRevocationIdentityEquals(a, b), false);
  });

  it('is false when grantRef differs', () => {
    const a = makeRevocation();
    const b = makeRevocation({ grantRef: 'grant-9' });
    assert.equal(enterpriseGrantRevocationIdentityEquals(a, b), false);
  });

  it('is false when revokedAt differs', () => {
    const a = makeRevocation();
    const b = makeRevocation({ revokedAt: '2026-09-01T00:00:00Z' });
    assert.equal(enterpriseGrantRevocationIdentityEquals(a, b), false);
  });
});

describe('enterpriseGrantRevocationEquals', () => {
  it('is true for two independently constructed but identical revocations', () => {
    assert.equal(enterpriseGrantRevocationEquals(makeRevocation(), makeRevocation()), true);
  });

  it('is insensitive to evidenceRefs construction order', () => {
    const a = makeRevocation({ evidenceRefs: ['evidence-1', 'evidence-2'] });
    const b = makeRevocation({ evidenceRefs: ['evidence-2', 'evidence-1'] });
    assert.equal(enterpriseGrantRevocationEquals(a, b), true);
  });

  it('is false when reason, issuerRef, correlationId, evidenceRefs, or description differ', () => {
    const base = makeRevocation();
    assert.equal(enterpriseGrantRevocationEquals(base, makeRevocation({ reason: ENTERPRISE_GRANT_REVOCATION_REASONS.EXPIRED })), false);
    assert.equal(enterpriseGrantRevocationEquals(base, makeRevocation({ issuerRef: 'someone-else' })), false);
    assert.equal(enterpriseGrantRevocationEquals(base, makeRevocation({ correlationId: 'corr-9' })), false);
    assert.equal(enterpriseGrantRevocationEquals(base, makeRevocation({ evidenceRefs: ['evidence-9'] })), false);
    assert.equal(enterpriseGrantRevocationEquals(base, makeRevocation({ description: 'different' })), false);
  });
});

describe('validateEnterpriseGrantRevocation', () => {
  it('accepts a fully populated valid revocation', () => {
    assert.equal(validateEnterpriseGrantRevocation(makeRevocation()).valid, true);
  });

  it('rejects a missing id', () => {
    const candidate = { ...makeRevocation(), id: undefined };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ID'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeRevocation(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing grantRef (reference integrity)', () => {
    const candidate = { ...makeRevocation(), grantRef: undefined };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_GRANT_REF'));
  });

  it('rejects a non-string grantRef (reference integrity)', () => {
    const candidate = { ...makeRevocation(), grantRef: 42 };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_GRANT_REF'));
  });

  it('rejects a missing revokedAt', () => {
    const candidate = { ...makeRevocation(), revokedAt: undefined };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_REVOKED_AT'));
  });

  it('rejects a malformed revokedAt (timestamp consistency)', () => {
    const candidate = { ...makeRevocation(), revokedAt: 'not-a-timestamp' };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_REVOKED_AT'));
  });

  it('rejects a missing reason', () => {
    const candidate = { ...makeRevocation(), reason: undefined };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_REASON'));
  });

  it('rejects a reason outside the canonical vocabulary (reason consistency)', () => {
    const candidate = { ...makeRevocation(), reason: 'pinata-unpin-failed' };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_REASON'));
  });

  it('rejects a missing issuerRef', () => {
    const candidate = { ...makeRevocation(), issuerRef: undefined };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ISSUER_REF'));
  });

  it('rejects a missing correlationId', () => {
    const candidate = { ...makeRevocation(), correlationId: undefined };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_CORRELATION_ID'));
  });

  it('rejects non-string evidenceRefs entries', () => {
    const candidate = { ...makeRevocation(), evidenceRefs: ['evidence-1', 42] };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EVIDENCE_REFS'));
  });

  it('rejects a non-string description', () => {
    const candidate = { ...makeRevocation(), description: 123 };
    const result = validateEnterpriseGrantRevocation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_DESCRIPTION'));
  });

  it('does not perform provider, network, or runtime-enforcement checks', () => {
    const candidate = makeRevocation({
      grantRef: 'a-grant-nobody-can-verify-exists',
      evidenceRefs: ['an-evidence-record-nobody-can-verify-exists'],
    });
    assert.equal(validateEnterpriseGrantRevocation(candidate).valid, true);
  });
});

describe('validateEnterpriseGrantRevocationSet (duplicate detection)', () => {
  it('accepts a set with no duplicate ids or grant references', () => {
    const result = validateEnterpriseGrantRevocationSet([
      makeRevocation({ id: 'revocation-1', grantRef: 'grant-1' }),
      makeRevocation({ id: 'revocation-2', grantRef: 'grant-2' }),
    ]);
    assert.equal(result.valid, true);
  });

  it('accepts an empty set', () => {
    assert.equal(validateEnterpriseGrantRevocationSet([]).valid, true);
  });

  it('rejects a set where two records share the same id', () => {
    const result = validateEnterpriseGrantRevocationSet([
      makeRevocation({ id: 'revocation-1', grantRef: 'grant-1' }),
      makeRevocation({ id: 'revocation-1', grantRef: 'grant-2' }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_REVOCATION_ID' && e.message.includes('revocation-1')));
  });

  it('rejects a set where the same grant is revoked more than once (duplicate revocations)', () => {
    const result = validateEnterpriseGrantRevocationSet([
      makeRevocation({ id: 'revocation-1', grantRef: 'grant-1', reason: ENTERPRISE_GRANT_REVOCATION_REASONS.EXPIRED }),
      makeRevocation({ id: 'revocation-2', grantRef: 'grant-1', reason: ENTERPRISE_GRANT_REVOCATION_REASONS.SECURITY_INCIDENT }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_GRANT_REVOCATION' && e.message.includes('grant-1')));
  });

  it('reports each duplicate exactly once regardless of how many times it repeats', () => {
    const result = validateEnterpriseGrantRevocationSet([
      makeRevocation({ id: 'revocation-1', grantRef: 'grant-1' }),
      makeRevocation({ id: 'revocation-1', grantRef: 'grant-1' }),
      makeRevocation({ id: 'revocation-1', grantRef: 'grant-1' }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.length === 2); // one DUPLICATE_REVOCATION_ID, one DUPLICATE_GRANT_REVOCATION
  });
});

// ---------------------------------------------------------------------------
// Phase 6 / Phase 10: Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full revocation record', () => {
    const original = makeRevocation();
    const json = serializeEnterpriseGrantRevocation(original);
    const restored = deserializeEnterpriseGrantRevocation(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseGrantRevocationEquals(original, restored), true);
  });

  it('round-trips a minimal revocation record without optional fields', () => {
    const original: EnterpriseGrantRevocation = {
      schemaVersion: ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
      id: 'revocation-min',
      grantRef: 'grant-2',
      revokedAt: '2026-08-04T00:00:00Z',
      reason: ENTERPRISE_GRANT_REVOCATION_REASONS.EXPIRED,
      issuerRef: 'system-expiry-process',
      correlationId: 'corr-2',
    };
    const restored = deserializeEnterpriseGrantRevocation(JSON.parse(JSON.stringify(serializeEnterpriseGrantRevocation(original))));
    assert.equal(enterpriseGrantRevocationEquals(original, restored), true);
  });

  it('serialization is deterministic regardless of evidenceRefs construction order', () => {
    const a = makeRevocation({ evidenceRefs: ['evidence-1', 'evidence-2'] });
    const b = makeRevocation({ evidenceRefs: ['evidence-2', 'evidence-1'] });
    assert.equal(JSON.stringify(serializeEnterpriseGrantRevocation(a)), JSON.stringify(serializeEnterpriseGrantRevocation(b)));
  });

  it('omits undefined optional fields rather than writing null', () => {
    const revocation: EnterpriseGrantRevocation = {
      schemaVersion: ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
      id: 'revocation-min',
      grantRef: 'grant-2',
      revokedAt: '2026-08-04T00:00:00Z',
      reason: ENTERPRISE_GRANT_REVOCATION_REASONS.EXPIRED,
      issuerRef: 'system-expiry-process',
      correlationId: 'corr-2',
    };
    const json = serializeEnterpriseGrantRevocation(revocation);
    assert.equal('evidenceRefs' in json, false);
    assert.equal('description' in json, false);
  });

  it('throws EnterpriseGrantRevocationValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseGrantRevocation({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseGrantRevocation({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseGrantRevocationValidationError);
    if (caught instanceof EnterpriseGrantRevocationValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 9: Negative tests -- compile-time proof the contract cannot carry
// provider URLs, JWTs, OAuth state, Pinata/S3/Azure SDK types, runtime
// callbacks, provider credentials, API keys, download URLs, or network
// clients. Mirrors the compile-time @ts-expect-error convention already
// established in `packages/resource-envelope`, `packages/access-decision`,
// and `packages/access-obligation`. These assertions fail `tsc` (this
// package's `test` script runs `tsc -p tsconfig.test.json` before `node
// --test`), not `node --test` itself -- a forbidden field compiles to
// nothing at runtime to assert against.
// ---------------------------------------------------------------------------

describe('negative: forbidden concepts (compile-time proof, see below)', () => {
  it('is checked entirely by the ts-expect-error assertions below this test file loads', () => {
    assert.ok(true);
  });
});

// Excess-property checks only fire on object literals assigned directly to a
// typed position, so each forbidden field is attempted as a fresh literal.

// @ts-expect-error -- EnterpriseGrantRevocation has no url field; revocations never carry a provider resource URL.
const _noUrl: EnterpriseGrantRevocation = { ...makeRevocation(), url: 'https://example.com/object' };

// @ts-expect-error -- EnterpriseGrantRevocation has no downloadUrl field.
const _noDownloadUrl: EnterpriseGrantRevocation = { ...makeRevocation(), downloadUrl: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseGrantRevocation has no jwt field; it does not invalidate tokens.
const _noJwt: EnterpriseGrantRevocation = { ...makeRevocation(), jwt: 'eyJhbGciOiJIUzI1NiJ9...' };

// @ts-expect-error -- EnterpriseGrantRevocation has no oauthToken/refreshToken field; it does not perform OAuth revocation.
const _noOAuth: EnterpriseGrantRevocation = { ...makeRevocation(), oauthToken: 'ya29.a0Ael9...' };

// @ts-expect-error -- EnterpriseGrantRevocation has no pinataSdk/client field; this contract is provider-neutral.
const _noPinataSdk: EnterpriseGrantRevocation = { ...makeRevocation(), pinataSdk: {} };

// @ts-expect-error -- EnterpriseGrantRevocation has no s3Client field; this contract is provider-neutral.
const _noS3Client: EnterpriseGrantRevocation = { ...makeRevocation(), s3Client: {} };

// @ts-expect-error -- EnterpriseGrantRevocation has no azureBlobClient field; this contract is provider-neutral.
const _noAzureClient: EnterpriseGrantRevocation = { ...makeRevocation(), azureBlobClient: {} };

// @ts-expect-error -- EnterpriseGrantRevocation has no credential field.
const _noCredential: EnterpriseGrantRevocation = { ...makeRevocation(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseGrantRevocation has no apiKey field.
const _noApiKey: EnterpriseGrantRevocation = { ...makeRevocation(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseGrantRevocation has no downloadLink field.
const _noDownloadLink: EnterpriseGrantRevocation = { ...makeRevocation(), downloadLink: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseGrantRevocation has no network client field; it never contacts a provider.
const _noNetworkClient: EnterpriseGrantRevocation = { ...makeRevocation(), httpClient: {} };

// @ts-expect-error -- EnterpriseGrantRevocation has no runtime callback field; a revocation never executes itself.
const _noRuntimeCallback: EnterpriseGrantRevocation = { ...makeRevocation(), onRevoked: () => {} };

// @ts-expect-error -- EnterpriseGrantRevocation has no sessionId field; it does not terminate sessions.
const _noSessionId: EnterpriseGrantRevocation = { ...makeRevocation(), sessionId: 'sess-123' };

// @ts-expect-error -- EnterpriseGrantRevocation has no cacheKey field; it does not invalidate caches.
const _noCacheKey: EnterpriseGrantRevocation = { ...makeRevocation(), cacheKey: 'cache-123' };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeRevocation().reason = ENTERPRISE_GRANT_REVOCATION_REASONS.EXPIRED;

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeRevocation().grantRef = 'grant-9';

void _noUrl;
void _noDownloadUrl;
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
