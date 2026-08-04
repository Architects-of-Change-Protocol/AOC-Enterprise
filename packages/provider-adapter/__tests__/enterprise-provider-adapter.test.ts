import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseAccessGrant } from '@aoc-enterprise/access-grant';
import { ENTERPRISE_ACCESS_OBLIGATION_TYPES } from '@aoc-enterprise/access-obligation';
import type { EnterpriseGrantRevocation } from '@aoc-enterprise/grant-revocation';
import { ENTERPRISE_GRANT_REVOCATION_REASONS } from '@aoc-enterprise/grant-revocation';
import type {
  EnterpriseGrantRevocationInterpretationInput,
  EnterpriseGrantTranslationInput,
  EnterpriseProviderCapabilityDeclaration,
} from '../src/enterprise-provider-adapter.js';
import {
  ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
  ENTERPRISE_PROVIDER_CAPABILITIES,
  ENTERPRISE_PROVIDER_FAILURE_REASONS,
  EnterpriseProviderCapabilityDeclarationValidationError,
  deserializeEnterpriseProviderCapabilityDeclaration,
  enterpriseProviderCapabilityDeclarationEquals,
  enterpriseProviderCapabilityDeclarationHasCapability,
  enterpriseProviderCapabilityDeclarationIdentityEquals,
  enterpriseProviderCapabilityDeclarationSupportsObligation,
  mapEnterpriseProviderFailureToUsageEventType,
  serializeEnterpriseProviderCapabilityDeclaration,
  toEnterpriseGrantRevocationInterpretationInput,
  toEnterpriseGrantTranslationInput,
  validateEnterpriseProviderCapabilityDeclaration,
  validateEnterpriseProviderCapabilityDeclarationSet,
} from '../src/enterprise-provider-adapter.js';

function makeDeclaration(overrides: Partial<EnterpriseProviderCapabilityDeclaration> = {}): EnterpriseProviderCapabilityDeclaration {
  return {
    schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
    id: 'declaration-1',
    providerSystem: 's3',
    capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS, ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION],
    supportedObligationTypes: [ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT, ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY],
    declaredAt: '2026-08-04T12:00:00.000Z',
    correlationId: 'corr-1',
    description: 'S3 adapter capability declaration.',
    ...overrides,
  };
}

function makeGrant(overrides: Partial<EnterpriseAccessGrant> = {}): EnterpriseAccessGrant {
  return {
    schemaVersion: '1.0.0',
    id: 'grant-1',
    status: 'active',
    resource: { kind: 's3-object', id: 'bucket/key' },
    decisionRef: 'decision-1',
    principalId: 'principal-1',
    issuedAt: '2026-08-04T00:00:00.000Z',
    expiresAt: '2026-08-05T00:00:00.000Z',
    correlationId: 'grant-corr-1',
    ...overrides,
  };
}

function makeRevocation(overrides: Partial<EnterpriseGrantRevocation> = {}): EnterpriseGrantRevocation {
  return {
    schemaVersion: '1.0.0',
    id: 'revocation-1',
    grantRef: 'grant-1',
    revokedAt: '2026-08-04T12:00:00.000Z',
    reason: ENTERPRISE_GRANT_REVOCATION_REASONS.SECURITY_INCIDENT,
    issuerRef: 'admin-1',
    correlationId: 'revocation-corr-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Positive tests: EnterpriseProviderCapabilityDeclaration
// ---------------------------------------------------------------------------

describe('EnterpriseProviderCapabilityDeclaration construction', () => {
  it('constructs a full declaration', () => {
    const declaration = makeDeclaration();
    assert.equal(declaration.providerSystem, 's3');
    assert.deepEqual(
      [...declaration.capabilities].sort(),
      [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION, ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS].sort(),
    );
  });

  it('constructs a minimal declaration with only required fields', () => {
    const declaration: EnterpriseProviderCapabilityDeclaration = {
      schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
      id: 'declaration-min',
      providerSystem: 'pinata',
      capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING],
      declaredAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-min',
    };
    assert.equal(validateEnterpriseProviderCapabilityDeclaration(declaration).valid, true);
  });

  it('accepts every canonical capability category', () => {
    for (const capability of Object.values(ENTERPRISE_PROVIDER_CAPABILITIES)) {
      assert.equal(validateEnterpriseProviderCapabilityDeclaration(makeDeclaration({ capabilities: [capability] })).valid, true);
    }
  });

  it('accepts every canonical obligation type in supportedObligationTypes', () => {
    for (const type of Object.values(ENTERPRISE_ACCESS_OBLIGATION_TYPES)) {
      assert.equal(validateEnterpriseProviderCapabilityDeclaration(makeDeclaration({ supportedObligationTypes: [type] })).valid, true);
    }
  });
});

describe('composition with EnterpriseAccessGrant / EnterpriseGrantRevocation', () => {
  it('does not embed grant- or revocation-shaped fields', () => {
    const declaration = makeDeclaration();
    const topLevelKeys = Object.keys(declaration);
    for (const foreignField of ['resource', 'status', 'expiresAt', 'grantRef', 'reason', 'revokedAt', 'decisionRef']) {
      assert.equal(topLevelKeys.includes(foreignField), false, `declaration must not embed foreign field '${foreignField}'`);
    }
  });
});

describe('enterpriseProviderCapabilityDeclarationIdentityEquals', () => {
  it('is true for the same id regardless of every other field', () => {
    const a = makeDeclaration({ providerSystem: 's3', description: 'first' });
    const b = makeDeclaration({ providerSystem: 'azure-blob', description: 'second' });
    assert.equal(enterpriseProviderCapabilityDeclarationIdentityEquals(a, b), true);
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(a, b), false);
  });

  it('is false when id differs', () => {
    const a = makeDeclaration();
    const b = makeDeclaration({ id: 'declaration-2' });
    assert.equal(enterpriseProviderCapabilityDeclarationIdentityEquals(a, b), false);
  });
});

describe('enterpriseProviderCapabilityDeclarationEquals', () => {
  it('is true for two independently constructed but identical declarations', () => {
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(makeDeclaration(), makeDeclaration()), true);
  });

  it('is insensitive to capabilities / supportedObligationTypes construction order', () => {
    const a = makeDeclaration({
      capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS, ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION],
      supportedObligationTypes: [ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT, ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY],
    });
    const b = makeDeclaration({
      capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION, ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS],
      supportedObligationTypes: [ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY, ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT],
    });
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(a, b), true);
  });

  it('is false when providerSystem, capabilities, supportedObligationTypes, correlationId, or description differ', () => {
    const base = makeDeclaration();
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(base, makeDeclaration({ providerSystem: 'pinata' })), false);
    assert.equal(
      enterpriseProviderCapabilityDeclarationEquals(base, makeDeclaration({ capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_CORRELATION] })),
      false,
    );
    assert.equal(
      enterpriseProviderCapabilityDeclarationEquals(
        base,
        makeDeclaration({ supportedObligationTypes: [ENTERPRISE_ACCESS_OBLIGATION_TYPES.REQUIRE_MFA] }),
      ),
      false,
    );
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(base, makeDeclaration({ correlationId: 'corr-9' })), false);
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(base, makeDeclaration({ description: 'different' })), false);
  });
});

describe('validateEnterpriseProviderCapabilityDeclaration', () => {
  it('accepts a fully populated valid declaration', () => {
    assert.equal(validateEnterpriseProviderCapabilityDeclaration(makeDeclaration()).valid, true);
  });

  it('rejects a missing id', () => {
    const candidate = { ...makeDeclaration(), id: undefined };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ID'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeDeclaration(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing providerSystem', () => {
    const candidate = { ...makeDeclaration(), providerSystem: undefined };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_PROVIDER_SYSTEM'));
  });

  it('rejects an empty capabilities array', () => {
    const candidate = { ...makeDeclaration(), capabilities: [] };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_CAPABILITIES'));
  });

  it('rejects a capability outside the canonical vocabulary', () => {
    const candidate = { ...makeDeclaration(), capabilities: ['SupportsPinataPinning'] };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_CAPABILITIES'));
  });

  it('rejects duplicate capabilities', () => {
    const candidate = { ...makeDeclaration(), capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION, ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION] };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_CAPABILITY'));
  });

  it('rejects an obligation type outside the canonical vocabulary in supportedObligationTypes', () => {
    const candidate = { ...makeDeclaration(), supportedObligationTypes: ['pinata-unpin-on-revoke'] };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_SUPPORTED_OBLIGATION_TYPES'));
  });

  it('rejects duplicate supportedObligationTypes', () => {
    const candidate = {
      ...makeDeclaration(),
      supportedObligationTypes: [ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY, ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY],
    };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_SUPPORTED_OBLIGATION_TYPE'));
  });

  it('rejects a malformed declaredAt', () => {
    const candidate = { ...makeDeclaration(), declaredAt: 'not-a-timestamp' };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_DECLARED_AT'));
  });

  it('rejects a missing correlationId', () => {
    const candidate = { ...makeDeclaration(), correlationId: undefined };
    const result = validateEnterpriseProviderCapabilityDeclaration(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_CORRELATION_ID'));
  });

  it('does not perform provider, network, or capability-probing checks', () => {
    const candidate = makeDeclaration({ providerSystem: 'a-provider-nobody-can-verify-is-reachable' });
    assert.equal(validateEnterpriseProviderCapabilityDeclaration(candidate).valid, true);
  });
});

describe('validateEnterpriseProviderCapabilityDeclarationSet (duplicate detection)', () => {
  it('accepts a set with no duplicate ids, including two declarations for the same providerSystem', () => {
    const result = validateEnterpriseProviderCapabilityDeclarationSet([
      makeDeclaration({ id: 'declaration-1', providerSystem: 's3' }),
      makeDeclaration({ id: 'declaration-2', providerSystem: 's3' }),
    ]);
    assert.equal(result.valid, true);
  });

  it('accepts an empty set', () => {
    assert.equal(validateEnterpriseProviderCapabilityDeclarationSet([]).valid, true);
  });

  it('rejects a set where two declarations share the same id', () => {
    const result = validateEnterpriseProviderCapabilityDeclarationSet([
      makeDeclaration({ id: 'declaration-1' }),
      makeDeclaration({ id: 'declaration-1' }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_DECLARATION_ID' && e.message.includes('declaration-1')));
  });
});

describe('enterpriseProviderCapabilityDeclarationHasCapability / SupportsObligation', () => {
  it('looks up declared capabilities and obligation support without contacting anything', () => {
    const declaration = makeDeclaration();
    assert.equal(enterpriseProviderCapabilityDeclarationHasCapability(declaration, ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS), true);
    assert.equal(enterpriseProviderCapabilityDeclarationHasCapability(declaration, ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_GRANT_REVOCATION), false);
    assert.equal(enterpriseProviderCapabilityDeclarationSupportsObligation(declaration, ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT), true);
    assert.equal(enterpriseProviderCapabilityDeclarationSupportsObligation(declaration, ENTERPRISE_ACCESS_OBLIGATION_TYPES.REQUIRE_MFA), false);
  });

  it('treats a declaration with no supportedObligationTypes as supporting none', () => {
    const declaration: EnterpriseProviderCapabilityDeclaration = {
      schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
      id: 'declaration-no-obligations',
      providerSystem: 's3',
      capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS],
      declaredAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-no-obligations',
    };
    assert.equal(enterpriseProviderCapabilityDeclarationSupportsObligation(declaration, ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY), false);
  });
});

// ---------------------------------------------------------------------------
// Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full declaration', () => {
    const original = makeDeclaration();
    const json = serializeEnterpriseProviderCapabilityDeclaration(original);
    const restored = deserializeEnterpriseProviderCapabilityDeclaration(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(original, restored), true);
  });

  it('round-trips a minimal declaration without optional fields', () => {
    const original: EnterpriseProviderCapabilityDeclaration = {
      schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
      id: 'declaration-min',
      providerSystem: 'pinata',
      capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING],
      declaredAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-min',
    };
    const restored = deserializeEnterpriseProviderCapabilityDeclaration(JSON.parse(JSON.stringify(serializeEnterpriseProviderCapabilityDeclaration(original))));
    assert.equal(enterpriseProviderCapabilityDeclarationEquals(original, restored), true);
  });

  it('omits undefined optional fields rather than writing null', () => {
    const declaration: EnterpriseProviderCapabilityDeclaration = {
      schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
      id: 'declaration-min',
      providerSystem: 'pinata',
      capabilities: [ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING],
      declaredAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-min',
    };
    const json = serializeEnterpriseProviderCapabilityDeclaration(declaration);
    assert.equal('supportedObligationTypes' in json, false);
    assert.equal('description' in json, false);
  });

  it('throws EnterpriseProviderCapabilityDeclarationValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseProviderCapabilityDeclaration({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseProviderCapabilityDeclaration({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseProviderCapabilityDeclarationValidationError);
    if (caught instanceof EnterpriseProviderCapabilityDeclarationValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Translation model: pure narrowing projections
// ---------------------------------------------------------------------------

describe('toEnterpriseGrantTranslationInput', () => {
  it('projects only resource, status, and expiresAt', () => {
    const grant = makeGrant({ id: 'grant-9', principalId: 'principal-9', decisionRef: 'decision-9', issuerRef: 'issuer-9' });
    const input = toEnterpriseGrantTranslationInput(grant);
    assert.deepEqual(Object.keys(input).sort(), ['expiresAt', 'resource', 'status']);
    assert.equal(input.resource, grant.resource);
    assert.equal(input.status, grant.status);
    assert.equal(input.expiresAt, grant.expiresAt);
  });
});

describe('toEnterpriseGrantRevocationInterpretationInput', () => {
  it('projects only grantRef and reason', () => {
    const revocation = makeRevocation({ id: 'revocation-9', issuerRef: 'issuer-9', correlationId: 'corr-9' });
    const input = toEnterpriseGrantRevocationInterpretationInput(revocation);
    assert.deepEqual(Object.keys(input).sort(), ['grantRef', 'reason']);
    assert.equal(input.grantRef, revocation.grantRef);
    assert.equal(input.reason, revocation.reason);
  });
});

// ---------------------------------------------------------------------------
// Failure contract: closed vocabulary and its pure mapping
// ---------------------------------------------------------------------------

describe('mapEnterpriseProviderFailureToUsageEventType', () => {
  it('maps grant-expired to AccessExpired', () => {
    assert.equal(mapEnterpriseProviderFailureToUsageEventType(ENTERPRISE_PROVIDER_FAILURE_REASONS.GRANT_EXPIRED), 'AccessExpired');
  });

  it('maps capability-unsupported and execution-rejected to AccessDenied', () => {
    assert.equal(mapEnterpriseProviderFailureToUsageEventType(ENTERPRISE_PROVIDER_FAILURE_REASONS.CAPABILITY_UNSUPPORTED), 'AccessDenied');
    assert.equal(mapEnterpriseProviderFailureToUsageEventType(ENTERPRISE_PROVIDER_FAILURE_REASONS.EXECUTION_REJECTED), 'AccessDenied');
  });

  it('maps provider-unavailable, provider-timeout, and unexpected-provider-failure to AccessFailed', () => {
    assert.equal(mapEnterpriseProviderFailureToUsageEventType(ENTERPRISE_PROVIDER_FAILURE_REASONS.PROVIDER_UNAVAILABLE), 'AccessFailed');
    assert.equal(mapEnterpriseProviderFailureToUsageEventType(ENTERPRISE_PROVIDER_FAILURE_REASONS.PROVIDER_TIMEOUT), 'AccessFailed');
    assert.equal(mapEnterpriseProviderFailureToUsageEventType(ENTERPRISE_PROVIDER_FAILURE_REASONS.UNEXPECTED_PROVIDER_FAILURE), 'AccessFailed');
  });

  it('covers every canonical failure reason exhaustively', () => {
    for (const reason of Object.values(ENTERPRISE_PROVIDER_FAILURE_REASONS)) {
      assert.equal(typeof mapEnterpriseProviderFailureToUsageEventType(reason), 'string');
    }
  });
});

// ---------------------------------------------------------------------------
// Negative tests -- compile-time proof the contract cannot carry a provider
// SDK, HTTP client, credential, signed/temporary URL, retry policy,
// persistence, telemetry, or execution callback. Mirrors the ts-expect-error
// convention already established in `packages/resource-envelope`,
// `packages/access-grant`, and `packages/grant-revocation`. These assertions
// fail `tsc` (this package's
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

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no url/signedUrl field; capabilities describe behavior only.
const _noSignedUrl: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), signedUrl: 'https://example.com/object?sig=abc' };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no apiKey field.
const _noApiKey: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no credential field.
const _noCredential: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no pinataSdk/client field; this contract is provider-neutral.
const _noPinataSdk: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), pinataSdk: {} };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no s3Client field; this contract is provider-neutral.
const _noS3Client: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), s3Client: {} };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no httpClient field; a Provider Adapter contract never implements HTTP.
const _noHttpClient: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), httpClient: {} };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no retryPolicy field; this contract defines no retry logic.
const _noRetryPolicy: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), retryPolicy: { maxAttempts: 3 } };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no execute/run callback; this contract never executes anything.
const _noExecutionCallback: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), execute: () => {} };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no persist/save method; this contract implements no persistence.
const _noPersistence: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), persist: () => {} };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no policyEvaluation/decision field; a Provider Adapter never evaluates policy.
const _noPolicyEvaluation: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), outcome: 'allow' };

// @ts-expect-error -- EnterpriseProviderCapabilityDeclaration has no telemetry/logger field.
const _noTelemetry: EnterpriseProviderCapabilityDeclaration = { ...makeDeclaration(), logger: console };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeDeclaration().providerSystem = 'pinata';

// @ts-expect-error -- EnterpriseGrantTranslationInput has no principalId field; a translation never reads who a grant was issued to.
const _translationNoPrincipal: EnterpriseGrantTranslationInput = { resource: { kind: 's3-object', id: 'bucket/key' }, status: 'active', expiresAt: '2026-08-05T00:00:00.000Z', principalId: 'principal-1' };

// @ts-expect-error -- EnterpriseGrantRevocationInterpretationInput has no revokedAt field; interpretation never reads revocation audit metadata.
const _revocationInterpretationNoRevokedAt: EnterpriseGrantRevocationInterpretationInput = { grantRef: 'grant-1', reason: 'security-incident', revokedAt: '2026-08-04T12:00:00.000Z' };

void _noSignedUrl;
void _noApiKey;
void _noCredential;
void _noPinataSdk;
void _noS3Client;
void _noHttpClient;
void _noRetryPolicy;
void _noExecutionCallback;
void _noPersistence;
void _noPolicyEvaluation;
void _noTelemetry;
void _translationNoPrincipal;
void _revocationInterpretationNoRevokedAt;
