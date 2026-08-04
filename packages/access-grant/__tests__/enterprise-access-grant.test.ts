import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseAccessGrant } from '../src/enterprise-access-grant.js';
import {
  ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
  deserializeEnterpriseAccessGrant,
  enterpriseAccessGrantEquals,
  enterpriseAccessGrantIdentityEquals,
  EnterpriseAccessGrantValidationError,
  serializeEnterpriseAccessGrant,
  validateEnterpriseAccessGrant,
} from '../src/enterprise-access-grant.js';

function makeGrant(overrides: Partial<EnterpriseAccessGrant> = {}): EnterpriseAccessGrant {
  return {
    schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
    id: 'grant-1',
    status: 'active',
    resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
    decisionRef: 'corr-decision-1',
    principalId: 'actor-1',
    issuedAt: '2026-01-01T00:00:10.000Z',
    expiresAt: '2026-01-02T00:00:10.000Z',
    correlationId: 'corr-grant-1',
    issuerRef: 'approval-engine-1',
    obligationRefs: ['obligation-1', 'obligation-2'],
    auditRefs: ['audit-1', 'audit-2'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 11: Positive tests
// ---------------------------------------------------------------------------

describe('EnterpriseAccessGrant construction', () => {
  it('constructs a full grant', () => {
    const grant = makeGrant();
    assert.equal(grant.status, 'active');
    assert.equal(grant.decisionRef, 'corr-decision-1');
    assert.equal(grant.principalId, 'actor-1');
    assert.equal(grant.resource.id, 'contract-42');
  });

  it('constructs a minimal grant with only required fields', () => {
    const grant: EnterpriseAccessGrant = {
      schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
      id: 'grant-min',
      status: 'active',
      resource: { kind: 'dataset', id: 'example' },
      decisionRef: 'corr-decision-2',
      principalId: 'actor-2',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-08T00:00:00.000Z',
      correlationId: 'corr-grant-2',
    };
    assert.equal(validateEnterpriseAccessGrant(grant).valid, true);
  });

  it('accepts every canonical status', () => {
    for (const status of ['active', 'revoked'] as const) {
      assert.equal(validateEnterpriseAccessGrant(makeGrant({ status })).valid, true);
    }
  });
});

describe('composition with EnterpriseAccessDecision and EnterpriseAccessObligation', () => {
  it('references the decision by decisionRef rather than embedding it', () => {
    const grant = makeGrant();
    const topLevelKeys = Object.keys(grant);
    for (const decisionField of ['request', 'resource', 'outcome', 'evaluatedAt', 'reason', 'policyEvaluationRef', 'evidenceRefs']) {
      if (decisionField === 'resource') continue; // grant.resource is a ResourceRef, not the decision's EnterpriseResourceEnvelope field
      assert.equal(topLevelKeys.includes(decisionField), false, `grant must not embed EnterpriseAccessDecision.${decisionField}`);
    }
    assert.equal(typeof grant.decisionRef, 'string');
  });

  it('references obligations by obligationRefs rather than embedding them', () => {
    const grant = makeGrant();
    const topLevelKeys = Object.keys(grant);
    for (const obligationField of ['type', 'mandatory', 'severity', 'parameters']) {
      assert.equal(topLevelKeys.includes(obligationField), false, `grant must not embed EnterpriseAccessObligation.${obligationField}`);
    }
    assert.ok(Array.isArray(grant.obligationRefs));
    assert.ok(grant.obligationRefs?.every((ref) => typeof ref === 'string'));
  });

  it('composes ResourceRef directly, never a full EnterpriseResourceEnvelope', () => {
    const grant = makeGrant();
    const topLevelResourceKeys = Object.keys(grant.resource);
    for (const envelopeField of ['location', 'integrity', 'descriptor', 'lifecycleState', 'registeredAt']) {
      assert.equal(topLevelResourceKeys.includes(envelopeField), false, `grant.resource must not embed EnterpriseResourceEnvelope.${envelopeField}`);
    }
  });
});

describe('enterpriseAccessGrantIdentityEquals', () => {
  it('is true for the same id/decisionRef/principalId/resource regardless of every other field', () => {
    const a = makeGrant({ status: 'active', issuerRef: 'first' });
    const b = makeGrant({ status: 'revoked', issuerRef: 'second' });
    assert.equal(enterpriseAccessGrantIdentityEquals(a, b), true);
    assert.equal(enterpriseAccessGrantEquals(a, b), false);
  });

  it('is false when id differs', () => {
    assert.equal(enterpriseAccessGrantIdentityEquals(makeGrant(), makeGrant({ id: 'grant-2' })), false);
  });

  it('is false when decisionRef differs', () => {
    assert.equal(enterpriseAccessGrantIdentityEquals(makeGrant(), makeGrant({ decisionRef: 'corr-decision-9' })), false);
  });

  it('is false when principalId differs', () => {
    assert.equal(enterpriseAccessGrantIdentityEquals(makeGrant(), makeGrant({ principalId: 'actor-9' })), false);
  });

  it('is false when resource identity differs', () => {
    assert.equal(
      enterpriseAccessGrantIdentityEquals(makeGrant(), makeGrant({ resource: { kind: 'document', id: 'contract-99', tenantId: 'tenant-a' } })),
      false,
    );
  });

  it('is true when only resource.attributes differs (attributes are descriptive, not identifying)', () => {
    const a = makeGrant({ resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a', attributes: { a: '1' } } });
    const b = makeGrant({ resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a', attributes: { a: '2' } } });
    assert.equal(enterpriseAccessGrantIdentityEquals(a, b), true);
  });
});

describe('enterpriseAccessGrantEquals', () => {
  it('is true for two independently constructed but identical grants', () => {
    assert.equal(enterpriseAccessGrantEquals(makeGrant(), makeGrant()), true);
  });

  it('is insensitive to obligationRefs/auditRefs construction order', () => {
    const a = makeGrant({ obligationRefs: ['obligation-1', 'obligation-2'], auditRefs: ['audit-1', 'audit-2'] });
    const b = makeGrant({ obligationRefs: ['obligation-2', 'obligation-1'], auditRefs: ['audit-2', 'audit-1'] });
    assert.equal(enterpriseAccessGrantEquals(a, b), true);
  });

  it('is false when status, issuedAt, expiresAt, correlationId, issuerRef, obligationRefs, or auditRefs differ', () => {
    const base = makeGrant();
    assert.equal(enterpriseAccessGrantEquals(base, makeGrant({ status: 'revoked' })), false);
    assert.equal(enterpriseAccessGrantEquals(base, makeGrant({ issuedAt: '2026-01-01T00:00:11.000Z' })), false);
    assert.equal(enterpriseAccessGrantEquals(base, makeGrant({ expiresAt: '2026-01-03T00:00:10.000Z' })), false);
    assert.equal(enterpriseAccessGrantEquals(base, makeGrant({ correlationId: 'corr-grant-9' })), false);
    assert.equal(enterpriseAccessGrantEquals(base, makeGrant({ issuerRef: 'approval-engine-9' })), false);
    assert.equal(enterpriseAccessGrantEquals(base, makeGrant({ obligationRefs: ['obligation-9'] })), false);
    assert.equal(enterpriseAccessGrantEquals(base, makeGrant({ auditRefs: ['audit-9'] })), false);
  });
});

describe('validateEnterpriseAccessGrant', () => {
  it('accepts a fully populated valid grant', () => {
    assert.equal(validateEnterpriseAccessGrant(makeGrant()).valid, true);
  });

  it('rejects a missing id', () => {
    const candidate = { ...makeGrant(), id: undefined };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ID'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeGrant(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing status', () => {
    const candidate = { ...makeGrant(), status: undefined };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_STATUS'));
  });

  it('rejects a status outside the canonical vocabulary', () => {
    const candidate = { ...makeGrant(), status: 'pending' };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_STATUS'));
  });

  it('rejects a missing resource', () => {
    const candidate = { ...makeGrant(), resource: undefined };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_RESOURCE'));
  });

  it('rejects a resource missing kind or id', () => {
    const candidate = { ...makeGrant(), resource: { kind: 'document' } };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_RESOURCE_IDENTITY'));
  });

  it('rejects a missing decisionRef', () => {
    const candidate = { ...makeGrant(), decisionRef: undefined };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_DECISION_REF'));
  });

  it('rejects a missing principalId', () => {
    const candidate = { ...makeGrant(), principalId: undefined };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_PRINCIPAL_ID'));
  });

  it('rejects a missing or malformed issuedAt', () => {
    assert.ok(!validateEnterpriseAccessGrant({ ...makeGrant(), issuedAt: undefined }).valid);
    const result = validateEnterpriseAccessGrant({ ...makeGrant(), issuedAt: 'not-a-timestamp' });
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_ISSUED_AT'));
  });

  it('rejects a missing or malformed expiresAt', () => {
    assert.ok(!validateEnterpriseAccessGrant({ ...makeGrant(), expiresAt: undefined }).valid);
    const result = validateEnterpriseAccessGrant({ ...makeGrant(), expiresAt: 'not-a-timestamp' });
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EXPIRES_AT'));
  });

  it('rejects expiresAt at or before issuedAt (expiration consistency)', () => {
    const sameInstant = validateEnterpriseAccessGrant({ ...makeGrant(), issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-01T00:00:00.000Z' });
    assert.equal(sameInstant.valid, false);
    assert.ok(!sameInstant.valid && sameInstant.errors.some((e) => e.code === 'INVALID_EXPIRATION_ORDER'));

    const reversed = validateEnterpriseAccessGrant({ ...makeGrant(), issuedAt: '2026-01-02T00:00:00.000Z', expiresAt: '2026-01-01T00:00:00.000Z' });
    assert.equal(reversed.valid, false);
    assert.ok(!reversed.valid && reversed.errors.some((e) => e.code === 'INVALID_EXPIRATION_ORDER'));
  });

  it('rejects a missing correlationId', () => {
    const candidate = { ...makeGrant(), correlationId: undefined };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_CORRELATION_ID'));
  });

  it('rejects a non-string issuerRef', () => {
    const candidate = { ...makeGrant(), issuerRef: '' };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_ISSUER_REF'));
  });

  it('rejects an empty obligationRefs array (invalid state combination: present but empty)', () => {
    const candidate = { ...makeGrant(), obligationRefs: [] };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_OBLIGATION_REFS'));
  });

  it('rejects duplicate obligationRefs entries', () => {
    const candidate = { ...makeGrant(), obligationRefs: ['obligation-1', 'obligation-1'] };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_OBLIGATION_REF'));
  });

  it('rejects duplicate auditRefs entries', () => {
    const candidate = { ...makeGrant(), auditRefs: ['audit-1', 'audit-1'] };
    const result = validateEnterpriseAccessGrant(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_AUDIT_REF'));
  });

  it('rejects non-string entries in obligationRefs/auditRefs', () => {
    const obligationResult = validateEnterpriseAccessGrant({ ...makeGrant(), obligationRefs: ['obligation-1', 42] });
    assert.equal(obligationResult.valid, false);
    assert.ok(!obligationResult.valid && obligationResult.errors.some((e) => e.code === 'INVALID_OBLIGATION_REFS'));

    const auditResult = validateEnterpriseAccessGrant({ ...makeGrant(), auditRefs: ['audit-1', 42] });
    assert.equal(auditResult.valid, false);
    assert.ok(!auditResult.valid && auditResult.errors.some((e) => e.code === 'INVALID_AUDIT_REFS'));
  });

  it('does not perform provider, network, existence, or wall-clock checks', () => {
    const candidate = makeGrant({
      decisionRef: 'a-decision-nobody-can-verify-exists',
      obligationRefs: ['an-obligation-nobody-can-verify-exists'],
      auditRefs: ['an-audit-record-nobody-can-verify-exists'],
      issuedAt: '1999-01-01T00:00:00.000Z',
      expiresAt: '1999-01-02T00:00:00.000Z',
    });
    // expiresAt is long past "now" -- validation only checks issuedAt < expiresAt, never wall-clock time.
    assert.equal(validateEnterpriseAccessGrant(candidate).valid, true);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 / Phase 11: Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full grant', () => {
    const original = makeGrant();
    const json = serializeEnterpriseAccessGrant(original);
    const restored = deserializeEnterpriseAccessGrant(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseAccessGrantEquals(original, restored), true);
  });

  it('round-trips a minimal grant without optional fields', () => {
    const original: EnterpriseAccessGrant = {
      schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
      id: 'grant-min',
      status: 'active',
      resource: { kind: 'dataset', id: 'example' },
      decisionRef: 'corr-decision-2',
      principalId: 'actor-2',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-08T00:00:00.000Z',
      correlationId: 'corr-grant-2',
    };
    const restored = deserializeEnterpriseAccessGrant(JSON.parse(JSON.stringify(serializeEnterpriseAccessGrant(original))));
    assert.equal(enterpriseAccessGrantEquals(original, restored), true);
  });

  it('serialization is deterministic regardless of obligationRefs/auditRefs construction order', () => {
    const a = makeGrant({ obligationRefs: ['obligation-1', 'obligation-2'], auditRefs: ['audit-1', 'audit-2'] });
    const b = makeGrant({ obligationRefs: ['obligation-2', 'obligation-1'], auditRefs: ['audit-2', 'audit-1'] });
    assert.equal(JSON.stringify(serializeEnterpriseAccessGrant(a)), JSON.stringify(serializeEnterpriseAccessGrant(b)));
  });

  it('omits undefined optional fields rather than writing null', () => {
    const grant: EnterpriseAccessGrant = {
      schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
      id: 'grant-min',
      status: 'active',
      resource: { kind: 'dataset', id: 'example' },
      decisionRef: 'corr-decision-2',
      principalId: 'actor-2',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-08T00:00:00.000Z',
      correlationId: 'corr-grant-2',
    };
    const json = serializeEnterpriseAccessGrant(grant);
    assert.equal('issuerRef' in json, false);
    assert.equal('obligationRefs' in json, false);
    assert.equal('auditRefs' in json, false);
    assert.equal('tenantId' in json.resource, false);
    assert.equal('attributes' in json.resource, false);
  });

  it('throws EnterpriseAccessGrantValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseAccessGrant({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseAccessGrant({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseAccessGrantValidationError);
    if (caught instanceof EnterpriseAccessGrantValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 10: Negative tests -- compile-time proof the contract cannot carry a
// JWT, an OAuth token, a Pinata/S3/Azure SAS URL, an API key, a provider SDK
// instance, a runtime session, or approval-workflow runtime state. Mirrors
// the compile-time @ts-expect-error convention already established in
// `packages/resource-envelope`, `packages/access-decision`, and
// `packages/access-obligation`. These assertions fail `tsc` (this package's
// `test` script runs `tsc -p tsconfig.test.json` before `node --test`), not
// `node --test` itself -- a forbidden field compiles to nothing at runtime to
// assert against.
// ---------------------------------------------------------------------------

describe('negative: forbidden concepts (compile-time proof, see below)', () => {
  it('is checked entirely by the ts-expect-error assertions below this test file loads', () => {
    assert.ok(true);
  });
});

// Excess-property checks only fire on object literals assigned directly to a
// typed position, so each forbidden field is attempted as a fresh literal.

// @ts-expect-error -- EnterpriseAccessGrant has no jwt field; a grant is not a JWT.
const _noJwt: EnterpriseAccessGrant = { ...makeGrant(), jwt: 'eyJhbGciOiJIUzI1NiJ9...' };

// @ts-expect-error -- EnterpriseAccessGrant has no accessToken/oauthToken field; a grant is not an OAuth token.
const _noOAuthToken: EnterpriseAccessGrant = { ...makeGrant(), accessToken: 'ya29.a0Af...' };

// @ts-expect-error -- EnterpriseAccessGrant has no refreshToken field.
const _noRefreshToken: EnterpriseAccessGrant = { ...makeGrant(), refreshToken: 'refresh-secret' };

// @ts-expect-error -- EnterpriseAccessGrant has no downloadUrl field; a grant is not a signed URL.
const _noDownloadUrl: EnterpriseAccessGrant = { ...makeGrant(), downloadUrl: 'https://example.com/download?sig=abc' };

// @ts-expect-error -- EnterpriseAccessGrant has no signedUrl field.
const _noSignedUrl: EnterpriseAccessGrant = { ...makeGrant(), signedUrl: 'https://pinata.cloud/ipfs/xyz?token=abc' };

// @ts-expect-error -- EnterpriseAccessGrant has no sasToken field; this contract is provider-neutral.
const _noAzureSasToken: EnterpriseAccessGrant = { ...makeGrant(), sasToken: 'sv=2022-11-02&ss=b&sig=abc' };

// @ts-expect-error -- EnterpriseAccessGrant has no apiKey field.
const _noApiKey: EnterpriseAccessGrant = { ...makeGrant(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseAccessGrant has no credential field.
const _noCredential: EnterpriseAccessGrant = { ...makeGrant(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseAccessGrant has no pinataSdk/client field; this contract is provider-neutral.
const _noPinataSdk: EnterpriseAccessGrant = { ...makeGrant(), pinataSdk: {} };

// @ts-expect-error -- EnterpriseAccessGrant has no s3Client field; this contract is provider-neutral.
const _noS3Client: EnterpriseAccessGrant = { ...makeGrant(), s3Client: {} };

// @ts-expect-error -- EnterpriseAccessGrant has no azureBlobClient field; this contract is provider-neutral.
const _noAzureClient: EnterpriseAccessGrant = { ...makeGrant(), azureBlobClient: {} };

// @ts-expect-error -- EnterpriseAccessGrant has no sessionId/session field; a grant is not a runtime session.
const _noRuntimeSession: EnterpriseAccessGrant = { ...makeGrant(), sessionId: 'sess-abc123' };

// @ts-expect-error -- EnterpriseAccessGrant has no cookie field.
const _noCookie: EnterpriseAccessGrant = { ...makeGrant(), cookie: 'connect.sid=abc' };

// @ts-expect-error -- EnterpriseAccessGrant has no execute/run field; this contract never executes anything.
const _noExecutionEngine: EnterpriseAccessGrant = { ...makeGrant(), execute: () => {} };

// @ts-expect-error -- EnterpriseAccessGrant has no approvalState/workflowState field; approval workflow runtime state belongs elsewhere.
const _noApprovalWorkflowState: EnterpriseAccessGrant = { ...makeGrant(), approvalState: 'pending' };

// @ts-expect-error -- EnterpriseAccessGrant has no policyEngine field; this contract does not evaluate policy.
const _noPolicyEngine: EnterpriseAccessGrant = { ...makeGrant(), policyEngine: {} };

// @ts-expect-error -- decision outcome lives only on EnterpriseAccessDecision.outcome, never duplicated here.
const _noOutcome: EnterpriseAccessGrant = { ...makeGrant(), outcome: 'allow' };

// @ts-expect-error -- expirationTimer/expiresIn-as-scheduled-job has no place here; this contract records timestamps only, never schedules anything.
const _noExpirationTimer: EnterpriseAccessGrant = { ...makeGrant(), expirationTimer: setTimeout };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeGrant().status = 'revoked';

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeGrant().expiresAt = '2099-01-01T00:00:00.000Z';

void _noJwt;
void _noOAuthToken;
void _noRefreshToken;
void _noDownloadUrl;
void _noSignedUrl;
void _noAzureSasToken;
void _noApiKey;
void _noCredential;
void _noPinataSdk;
void _noS3Client;
void _noAzureClient;
void _noRuntimeSession;
void _noCookie;
void _noExecutionEngine;
void _noApprovalWorkflowState;
void _noPolicyEngine;
void _noOutcome;
void _noExpirationTimer;
