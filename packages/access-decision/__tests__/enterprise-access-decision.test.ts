import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseAccessDecision } from '../src/enterprise-access-decision.js';
import {
  ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
  deserializeEnterpriseAccessDecision,
  enterpriseAccessDecisionEquals,
  enterpriseAccessDecisionIdentityEquals,
  EnterpriseAccessDecisionValidationError,
  serializeEnterpriseAccessDecision,
  validateEnterpriseAccessDecision,
} from '../src/enterprise-access-decision.js';
import { ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION } from '@aoc-enterprise/resource-envelope';

function makeDecision(overrides: Partial<EnterpriseAccessDecision> = {}): EnterpriseAccessDecision {
  return {
    schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
    request: {
      principalId: 'actor-1',
      resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
      requestedScope: ['record:read'],
      requestedAt: '2026-01-01T00:00:00.000Z',
      action: 'read',
    },
    resource: {
      schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
      resource: { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' },
      location: { uri: 's3://acme-bucket/contract-42.pdf', system: 's3' },
      lifecycleState: 'active',
      registeredAt: '2025-12-01T00:00:00.000Z',
    },
    outcome: 'allow',
    evaluatedAt: '2026-01-01T00:00:05.000Z',
    correlationId: 'corr-1',
    reason: 'principal holds an active capability for record:read',
    policyEvaluationRef: 'policy-eval-9',
    evidenceRefs: ['evidence-1', 'evidence-2'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 10: Positive tests
// ---------------------------------------------------------------------------

describe('EnterpriseAccessDecision construction', () => {
  it('constructs a full decision composing a real request and resource envelope', () => {
    const decision = makeDecision();
    assert.equal(decision.outcome, 'allow');
    assert.equal(decision.request.principalId, 'actor-1');
    assert.equal(decision.resource.resource.id, 'contract-42');
  });

  it('constructs a minimal decision with only required fields', () => {
    const decision: EnterpriseAccessDecision = {
      schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
      request: {
        principalId: 'actor-1',
        resource: { kind: 'dataset', id: 'example' },
        requestedScope: ['dataset:read'],
        requestedAt: '2026-01-01T00:00:00.000Z',
      },
      resource: {
        schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
        resource: { kind: 'dataset', id: 'example' },
        location: { uri: 'ipfs://bafybeigdyrzt' },
        lifecycleState: 'registered',
        registeredAt: '2026-01-01T00:00:00.000Z',
      },
      outcome: 'deny',
      evaluatedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-2',
    };
    assert.equal(validateEnterpriseAccessDecision(decision).valid, true);
  });
});

describe('composition over EnterpriseScopedAccessRequest and EnterpriseResourceEnvelope', () => {
  it('does not duplicate principal or resource identity at the top level', () => {
    const decision = makeDecision();
    const topLevelKeys = Object.keys(decision);
    for (const foreignField of ['principalId', 'kind', 'id', 'tenantId', 'requestedScope', 'location', 'lifecycleState']) {
      assert.equal(topLevelKeys.includes(foreignField), false, `decision must not duplicate ${foreignField}`);
    }
  });

  it('reads the requesting principal exclusively through decision.request.principalId', () => {
    const decision = makeDecision({ request: { ...makeDecision().request, principalId: 'actor-77' } });
    assert.equal(decision.request.principalId, 'actor-77');
  });

  it('reads the governed resource exclusively through decision.resource (the canonical envelope)', () => {
    const decision = makeDecision();
    assert.equal(decision.resource.schemaVersion, ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION);
    assert.deepEqual(decision.resource.resource, { kind: 'document', id: 'contract-42', tenantId: 'tenant-a' });
  });
});

describe('enterpriseAccessDecisionIdentityEquals', () => {
  it('is true for the same resource, principal, and evaluation instant regardless of outcome or reason', () => {
    const a = makeDecision({ outcome: 'allow', reason: 'first pass' });
    const b = makeDecision({ outcome: 'deny', reason: 'reconsidered', policyEvaluationRef: 'different-ref' });
    assert.equal(enterpriseAccessDecisionIdentityEquals(a, b), true);
    assert.equal(enterpriseAccessDecisionEquals(a, b), false);
  });

  it('is false when the resource identity differs', () => {
    const a = makeDecision();
    const b = makeDecision({ resource: { ...makeDecision().resource, resource: { kind: 'document', id: 'other-doc' } } });
    assert.equal(enterpriseAccessDecisionIdentityEquals(a, b), false);
  });

  it('is false when the principal differs', () => {
    const a = makeDecision();
    const b = makeDecision({ request: { ...makeDecision().request, principalId: 'actor-2' } });
    assert.equal(enterpriseAccessDecisionIdentityEquals(a, b), false);
  });

  it('is false when the evaluation instant differs', () => {
    const a = makeDecision();
    const b = makeDecision({ evaluatedAt: '2026-01-02T00:00:00.000Z' });
    assert.equal(enterpriseAccessDecisionIdentityEquals(a, b), false);
  });
});

describe('enterpriseAccessDecisionEquals', () => {
  it('is true for two independently constructed but identical decisions', () => {
    assert.equal(enterpriseAccessDecisionEquals(makeDecision(), makeDecision()), true);
  });

  it('is insensitive to requestedScope/evidenceRefs/attribute construction order', () => {
    const a = makeDecision({
      request: { ...makeDecision().request, requestedScope: ['a', 'b'] },
      evidenceRefs: ['evidence-1', 'evidence-2'],
    });
    const b = makeDecision({
      request: { ...makeDecision().request, requestedScope: ['b', 'a'] },
      evidenceRefs: ['evidence-2', 'evidence-1'],
    });
    assert.equal(enterpriseAccessDecisionEquals(a, b), true);
  });

  it('is false when outcome, correlationId, reason, or the resource envelope differ', () => {
    const base = makeDecision();
    assert.equal(enterpriseAccessDecisionEquals(base, makeDecision({ outcome: 'deny' })), false);
    assert.equal(enterpriseAccessDecisionEquals(base, makeDecision({ correlationId: 'corr-9' })), false);
    assert.equal(enterpriseAccessDecisionEquals(base, makeDecision({ reason: 'different reason' })), false);
    assert.equal(
      enterpriseAccessDecisionEquals(base, makeDecision({ resource: { ...makeDecision().resource, lifecycleState: 'archived' } })),
      false,
    );
  });
});

describe('validateEnterpriseAccessDecision', () => {
  it('accepts a fully populated valid decision', () => {
    assert.equal(validateEnterpriseAccessDecision(makeDecision()).valid, true);
  });

  it('rejects a missing request', () => {
    const candidate = { ...makeDecision(), request: undefined };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_REQUEST'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeDecision(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing resource envelope', () => {
    const candidate = { ...makeDecision(), resource: undefined };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_RESOURCE_ENVELOPE'));
  });

  it('delegates resource-envelope shape validation to validateEnterpriseResourceEnvelope', () => {
    const candidate = { ...makeDecision(), resource: { ...makeDecision().resource, location: undefined } };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_RESOURCE_ENVELOPE'));
  });

  it('rejects the impossible combination: request.resource and resource.resource disagree on identity', () => {
    const base = makeDecision();
    const candidate = { ...base, request: { ...base.request, resource: { kind: 'document', id: 'a-different-document' } } };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'RESOURCE_IDENTITY_MISMATCH'));
  });

  it('rejects a missing outcome', () => {
    const candidate = { ...makeDecision(), outcome: undefined };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_OUTCOME'));
  });

  it('rejects an outcome outside the canonical PolicyDecision vocabulary', () => {
    const candidate = { ...makeDecision(), outcome: 'maybe' };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_OUTCOME'));
  });

  it('accepts every canonical PolicyDecision outcome', () => {
    for (const outcome of ['allow', 'deny', 'conditional'] as const) {
      assert.equal(validateEnterpriseAccessDecision(makeDecision({ outcome })).valid, true);
    }
  });

  it('rejects a malformed evaluatedAt', () => {
    const candidate = { ...makeDecision(), evaluatedAt: 'not-a-date' };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EVALUATED_AT'));
  });

  it('rejects a missing correlationId', () => {
    const candidate = { ...makeDecision(), correlationId: undefined };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_CORRELATION_ID'));
  });

  it('rejects non-string evidenceRefs entries', () => {
    const candidate = { ...makeDecision(), evidenceRefs: ['evidence-1', 42] };
    const result = validateEnterpriseAccessDecision(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EVIDENCE_REFS'));
  });

  it('does not perform provider, credential, network, existence, or policy-correctness checks', () => {
    const candidate = makeDecision({
      resource: {
        ...makeDecision().resource,
        location: { uri: 'https://this-host-does-not-resolve.invalid/object', system: 'a-provider-nobody-has-heard-of' },
      },
      policyEvaluationRef: 'a-policy-evaluation-nobody-can-verify-exists',
    });
    assert.equal(validateEnterpriseAccessDecision(candidate).valid, true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6 / Phase 10: Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full decision', () => {
    const original = makeDecision();
    const json = serializeEnterpriseAccessDecision(original);
    const restored = deserializeEnterpriseAccessDecision(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseAccessDecisionEquals(original, restored), true);
  });

  it('round-trips a minimal decision without optional fields', () => {
    const original: EnterpriseAccessDecision = {
      schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
      request: {
        principalId: 'actor-1',
        resource: { kind: 'dataset', id: 'example' },
        requestedScope: ['dataset:read'],
        requestedAt: '2026-01-01T00:00:00.000Z',
      },
      resource: {
        schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
        resource: { kind: 'dataset', id: 'example' },
        location: { uri: 'ipfs://bafybeigdyrzt' },
        lifecycleState: 'registered',
        registeredAt: '2026-01-01T00:00:00.000Z',
      },
      outcome: 'deny',
      evaluatedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-2',
    };
    const restored = deserializeEnterpriseAccessDecision(JSON.parse(JSON.stringify(serializeEnterpriseAccessDecision(original))));
    assert.equal(enterpriseAccessDecisionEquals(original, restored), true);
  });

  it('serialization is deterministic regardless of requestedScope/evidenceRefs construction order', () => {
    const a = makeDecision({
      request: { ...makeDecision().request, requestedScope: ['a', 'b'] },
      evidenceRefs: ['evidence-1', 'evidence-2'],
    });
    const b = makeDecision({
      request: { ...makeDecision().request, requestedScope: ['b', 'a'] },
      evidenceRefs: ['evidence-2', 'evidence-1'],
    });
    assert.equal(JSON.stringify(serializeEnterpriseAccessDecision(a)), JSON.stringify(serializeEnterpriseAccessDecision(b)));
  });

  it('omits undefined optional fields rather than writing null', () => {
    const decision: EnterpriseAccessDecision = {
      schemaVersion: ENTERPRISE_ACCESS_DECISION_SCHEMA_VERSION,
      request: {
        principalId: 'actor-1',
        resource: { kind: 'dataset', id: 'example' },
        requestedScope: ['dataset:read'],
        requestedAt: '2026-01-01T00:00:00.000Z',
      },
      resource: {
        schemaVersion: ENTERPRISE_RESOURCE_ENVELOPE_SCHEMA_VERSION,
        resource: { kind: 'dataset', id: 'example' },
        location: { uri: 'ipfs://bafybeigdyrzt' },
        lifecycleState: 'registered',
        registeredAt: '2026-01-01T00:00:00.000Z',
      },
      outcome: 'deny',
      evaluatedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-2',
    };
    const json = serializeEnterpriseAccessDecision(decision);
    assert.equal('reason' in json, false);
    assert.equal('policyEvaluationRef' in json, false);
    assert.equal('evidenceRefs' in json, false);
    assert.equal('action' in json.request, false);
  });

  it('throws EnterpriseAccessDecisionValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseAccessDecision({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseAccessDecision({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseAccessDecisionValidationError);
    if (caught instanceof EnterpriseAccessDecisionValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 9: Negative tests -- compile-time proof the contract cannot carry
// API keys, provider credentials, JWTs, URLs/download links, Pinata/S3
// objects, runtime clients, SDK instances, grant identifiers, or approval
// workflow runtime state. Mirrors the compile-time @ts-expect-error
// convention already established in
// `packages/resource-envelope/__tests__/enterprise-resource-envelope.test.ts`.
// These assertions fail `tsc` (this package's `test` script runs
// `tsc -p tsconfig.test.json` before `node --test`), not `node --test`
// itself -- a forbidden field compiles to nothing at runtime to assert
// against.
// ---------------------------------------------------------------------------

describe('negative: forbidden concepts (compile-time proof, see below)', () => {
  it('is checked entirely by the ts-expect-error assertions below this test file loads', () => {
    assert.ok(true);
  });
});

// Excess-property checks only fire on object literals assigned directly to a
// typed position, so each forbidden field is attempted as a fresh literal.

// @ts-expect-error -- EnterpriseAccessDecision has no apiKey field.
const _noApiKey: EnterpriseAccessDecision = { ...makeDecision(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseAccessDecision has no bearerToken field.
const _noBearerToken: EnterpriseAccessDecision = { ...makeDecision(), bearerToken: 'secret' };

// @ts-expect-error -- EnterpriseAccessDecision has no jwt field.
const _noJwt: EnterpriseAccessDecision = { ...makeDecision(), jwt: 'eyJhbGciOiJIUzI1NiJ9...' };

// @ts-expect-error -- EnterpriseAccessDecision has no credential field.
const _noCredential: EnterpriseAccessDecision = { ...makeDecision(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseAccessDecision has no accessKeyId field.
const _noAccessKeyId: EnterpriseAccessDecision = { ...makeDecision(), accessKeyId: 'AKIA...' };

// @ts-expect-error -- EnterpriseAccessDecision has no authorizationHeader field.
const _noAuthorizationHeader: EnterpriseAccessDecision = { ...makeDecision(), authorizationHeader: 'Bearer xyz' };

// @ts-expect-error -- EnterpriseAccessDecision has no url/downloadUrl field; access is never executed or linked from a decision.
const _noDownloadUrl: EnterpriseAccessDecision = { ...makeDecision(), downloadUrl: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseAccessDecision has no url field.
const _noUrl: EnterpriseAccessDecision = { ...makeDecision(), url: 'https://example.com/object' };

// @ts-expect-error -- EnterpriseAccessDecision has no Pinata-shaped field; this contract is provider-neutral.
const _noPinataObject: EnterpriseAccessDecision = { ...makeDecision(), pinataObject: { ipfsHash: 'bafybeigdyrzt' } };

// @ts-expect-error -- EnterpriseAccessDecision has no S3-shaped field; this contract is provider-neutral.
const _noS3Object: EnterpriseAccessDecision = { ...makeDecision(), s3Object: { bucket: 'acme', key: 'contract-42.pdf' } };

// @ts-expect-error -- EnterpriseAccessDecision has no runtime client/SDK instance field.
const _noRuntimeClient: EnterpriseAccessDecision = { ...makeDecision(), client: {} };

// @ts-expect-error -- EnterpriseAccessDecision has no provider SDK instance field.
const _noSdkInstance: EnterpriseAccessDecision = { ...makeDecision(), s3Client: {} };

// @ts-expect-error -- a grant identifier belongs to a future AccessGrant, never this immutable evaluation record.
const _noGrantId: EnterpriseAccessDecision = { ...makeDecision(), grantId: 'grant-1' };

// @ts-expect-error -- approval workflow runtime state belongs to a future AccessGrant, not this contract.
const _noApprovalWorkflowState: EnterpriseAccessDecision = { ...makeDecision(), approvalWorkflowState: 'pending-review' };

// @ts-expect-error -- revocation state belongs to a future AccessGrant, never an immutable evaluation record.
const _noRevocationState: EnterpriseAccessDecision = { ...makeDecision(), revoked: false };

// @ts-expect-error -- this contract does not evaluate policy; it has no policy-engine/rule-set field.
const _noPolicyEngine: EnterpriseAccessDecision = { ...makeDecision(), policyEngine: {} };

// @ts-expect-error -- identity is never duplicated onto the decision itself; the principal lives only on decision.request.principalId.
const _noDuplicatedPrincipalId: EnterpriseAccessDecision = { ...makeDecision(), principalId: 'actor-1' };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeDecision().outcome = 'deny';

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeDecision().resource = makeDecision().resource;

void _noApiKey;
void _noBearerToken;
void _noJwt;
void _noCredential;
void _noAccessKeyId;
void _noAuthorizationHeader;
void _noDownloadUrl;
void _noUrl;
void _noPinataObject;
void _noS3Object;
void _noRuntimeClient;
void _noSdkInstance;
void _noGrantId;
void _noApprovalWorkflowState;
void _noRevocationState;
void _noPolicyEngine;
void _noDuplicatedPrincipalId;
