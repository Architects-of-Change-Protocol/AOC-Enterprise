import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISE_PROVIDER_CAPABILITIES } from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderTranslation } from '../src/enterprise-provider-translation.js';
import {
  ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS,
  ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
  EnterpriseProviderTranslationValidationError,
  deserializeEnterpriseProviderTranslation,
  enterpriseProviderTranslationEquals,
  enterpriseProviderTranslationIdentityEquals,
  enterpriseProviderTranslationRequiredCapability,
  serializeEnterpriseProviderTranslation,
  validateEnterpriseProviderTranslation,
  validateEnterpriseProviderTranslationSet,
} from '../src/enterprise-provider-translation.js';

function makeTranslation(overrides: Partial<EnterpriseProviderTranslation> = {}): EnterpriseProviderTranslation {
  return {
    schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
    id: 'translation-1',
    providerSystem: 's3',
    capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS,
    executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_TEMPORARY_ACCESS,
    grantRef: 'grant-1',
    resource: { kind: 's3-object', id: 'bucket/key' },
    providerMetadata: { requestedDurationSeconds: 900 },
    translatedAt: '2026-08-04T12:00:00.000Z',
    correlationId: 'corr-1',
    description: 'S3 temporary access translation.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Positive tests: construction
// ---------------------------------------------------------------------------

describe('EnterpriseProviderTranslation construction', () => {
  it('constructs a full translation', () => {
    const translation = makeTranslation();
    assert.equal(translation.providerSystem, 's3');
    assert.equal(translation.executionIntent, 'ProvideTemporaryAccess');
    assert.equal(translation.capability, 'SupportsTemporaryAccess');
  });

  it('constructs a minimal translation with only required fields', () => {
    const translation: EnterpriseProviderTranslation = {
      schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
      id: 'translation-min',
      providerSystem: 'pinata',
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.REGISTER_USAGE,
      grantRef: 'grant-min',
      resource: { kind: 'ipfs-object', id: 'Qm123' },
      translatedAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-min',
    };
    assert.equal(validateEnterpriseProviderTranslation(translation).valid, true);
  });

  it('accepts every canonical execution intent with its required capability', () => {
    for (const intent of Object.values(ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS)) {
      const capability = enterpriseProviderTranslationRequiredCapability(intent);
      const translation = makeTranslation({ executionIntent: intent, capability });
      assert.equal(validateEnterpriseProviderTranslation(translation).valid, true, `intent ${intent} with capability ${capability} should validate`);
    }
  });
});

describe('enterpriseProviderTranslationRequiredCapability', () => {
  it('maps ProvideTemporaryAccess and ProvideReadOnlyAccess to SupportsTemporaryAccess', () => {
    assert.equal(enterpriseProviderTranslationRequiredCapability('ProvideTemporaryAccess'), 'SupportsTemporaryAccess');
    assert.equal(enterpriseProviderTranslationRequiredCapability('ProvideReadOnlyAccess'), 'SupportsTemporaryAccess');
  });

  it('maps ProvideMetadata to SupportsProviderMetadata', () => {
    assert.equal(enterpriseProviderTranslationRequiredCapability('ProvideMetadata'), 'SupportsProviderMetadata');
  });

  it('maps RegisterUsage to SupportsUsageReporting', () => {
    assert.equal(enterpriseProviderTranslationRequiredCapability('RegisterUsage'), 'SupportsUsageReporting');
  });

  it('maps InvalidateGrant to SupportsGrantRevocation', () => {
    assert.equal(enterpriseProviderTranslationRequiredCapability('InvalidateGrant'), 'SupportsGrantRevocation');
  });

  it('is exhaustive over the closed execution intent vocabulary', () => {
    for (const intent of Object.values(ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS)) {
      assert.equal(typeof enterpriseProviderTranslationRequiredCapability(intent), 'string');
    }
  });
});

// ---------------------------------------------------------------------------
// Composition boundary: translation never embeds foreign fields from the
// grant, revocation, or usage-event contracts it references only by id.
// ---------------------------------------------------------------------------

describe('composition with EnterpriseAccessGrant / EnterpriseGrantRevocation / EnterpriseUsageEvent', () => {
  it('does not embed grant-, revocation-, or usage-event-shaped fields', () => {
    const translation = makeTranslation();
    const topLevelKeys = Object.keys(translation);
    for (const foreignField of ['status', 'expiresAt', 'issuedAt', 'reason', 'revokedAt', 'decisionRef', 'eventType', 'occurredAt', 'principalId']) {
      assert.equal(topLevelKeys.includes(foreignField), false, `translation must not embed foreign field '${foreignField}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// Identity vs. full structural equality (R005.B Phase 8)
// ---------------------------------------------------------------------------

describe('enterpriseProviderTranslationIdentityEquals', () => {
  it('is true for the same id/grantRef/providerSystem/executionIntent regardless of every other field', () => {
    const a = makeTranslation({ capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS, description: 'first' });
    const b = makeTranslation({ capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS, description: 'second', translatedAt: '2026-08-04T13:00:00.000Z' });
    assert.equal(enterpriseProviderTranslationIdentityEquals(a, b), true);
    assert.equal(enterpriseProviderTranslationEquals(a, b), false);
  });

  it('is false when id differs', () => {
    assert.equal(enterpriseProviderTranslationIdentityEquals(makeTranslation(), makeTranslation({ id: 'translation-2' })), false);
  });

  it('is false when grantRef differs', () => {
    assert.equal(enterpriseProviderTranslationIdentityEquals(makeTranslation(), makeTranslation({ grantRef: 'grant-2' })), false);
  });

  it('is false when providerSystem differs', () => {
    assert.equal(enterpriseProviderTranslationIdentityEquals(makeTranslation(), makeTranslation({ providerSystem: 'azure-blob' })), false);
  });

  it('is false when executionIntent differs', () => {
    assert.equal(
      enterpriseProviderTranslationIdentityEquals(
        makeTranslation(),
        makeTranslation({ executionIntent: 'ProvideReadOnlyAccess' }),
      ),
      false,
    );
  });

  it('never derives from execution -- there is no execution-shaped field to derive from', () => {
    const translation = makeTranslation();
    const topLevelKeys = Object.keys(translation);
    for (const executionField of ['success', 'executed', 'result', 'httpStatus', 'providerResponse']) {
      assert.equal(topLevelKeys.includes(executionField), false);
    }
  });
});

describe('enterpriseProviderTranslationEquals', () => {
  it('is true for two independently constructed but identical translations', () => {
    assert.equal(enterpriseProviderTranslationEquals(makeTranslation(), makeTranslation()), true);
  });

  it('is false when capability, resource, providerMetadata, correlationId, or description differ', () => {
    const base = makeTranslation();
    assert.equal(
      enterpriseProviderTranslationEquals(base, makeTranslation({ capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION })),
      false,
    );
    assert.equal(
      enterpriseProviderTranslationEquals(base, makeTranslation({ resource: { kind: 's3-object', id: 'bucket/other-key' } })),
      false,
    );
    assert.equal(
      enterpriseProviderTranslationEquals(base, makeTranslation({ providerMetadata: { requestedDurationSeconds: 60 } })),
      false,
    );
    assert.equal(enterpriseProviderTranslationEquals(base, makeTranslation({ correlationId: 'corr-9' })), false);
    assert.equal(enterpriseProviderTranslationEquals(base, makeTranslation({ description: 'different' })), false);
  });

  it('resource equality delegates to resourceRefIdentityEquals (tenantId/attributes-insensitive identity, attributes still compared structurally)', () => {
    const base = makeTranslation({ resource: { kind: 's3-object', id: 'bucket/key', attributes: { region: 'us-east-1' } } });
    const same = makeTranslation({ resource: { kind: 's3-object', id: 'bucket/key', attributes: { region: 'us-east-1' } } });
    const differentAttrs = makeTranslation({ resource: { kind: 's3-object', id: 'bucket/key', attributes: { region: 'eu-west-1' } } });
    assert.equal(enterpriseProviderTranslationEquals(base, same), true);
    assert.equal(enterpriseProviderTranslationEquals(base, differentAttrs), false);
  });
});

// ---------------------------------------------------------------------------
// Validation: required fields, translation consistency, capability
// consistency, reference integrity (R005.B Phase 6)
// ---------------------------------------------------------------------------

describe('validateEnterpriseProviderTranslation', () => {
  it('accepts a fully populated valid translation', () => {
    assert.equal(validateEnterpriseProviderTranslation(makeTranslation()).valid, true);
  });

  it('rejects a missing id', () => {
    const candidate = { ...makeTranslation(), id: undefined };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ID'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeTranslation(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing providerSystem', () => {
    const candidate = { ...makeTranslation(), providerSystem: undefined };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_PROVIDER_SYSTEM'));
  });

  it('rejects a capability outside the canonical vocabulary', () => {
    const candidate = { ...makeTranslation(), capability: 'SupportsPinataPinning' };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_CAPABILITY'));
  });

  it('rejects an executionIntent outside the canonical vocabulary', () => {
    const candidate = { ...makeTranslation(), executionIntent: 'IssueS3PresignedUrl' };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EXECUTION_INTENT'));
  });

  it('rejects a capability/executionIntent mismatch (capability consistency)', () => {
    const candidate = makeTranslation({
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.INVALIDATE_GRANT,
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS,
    });
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'CAPABILITY_EXECUTION_INTENT_MISMATCH'));
  });

  it('rejects a missing grantRef', () => {
    const candidate = { ...makeTranslation(), grantRef: undefined };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_GRANT_REF'));
  });

  it('rejects a missing or malformed resource', () => {
    const missing = validateEnterpriseProviderTranslation({ ...makeTranslation(), resource: undefined });
    assert.equal(missing.valid, false);
    assert.ok(!missing.valid && missing.errors.some((e) => e.code === 'MISSING_RESOURCE'));

    const malformed = validateEnterpriseProviderTranslation({ ...makeTranslation(), resource: { kind: '', id: '' } });
    assert.equal(malformed.valid, false);
    assert.ok(!malformed.valid && malformed.errors.some((e) => e.code === 'INVALID_RESOURCE_IDENTITY'));
  });

  it('rejects providerMetadata carrying a non-primitive value', () => {
    const candidate = { ...makeTranslation(), providerMetadata: { nested: { a: 1 } } };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_PROVIDER_METADATA'));
  });

  it('rejects providerMetadata keys resembling a credential, token, signature, or URL', () => {
    for (const key of ['apiKey', 'authToken', 'jwt', 'credential', 'password', 'clientSecret', 'bearerToken', 'signedUrl', 'accessKeyId', 'sessionId', 'cookie', 'signature']) {
      const candidate = { ...makeTranslation(), providerMetadata: { [key]: 'value' } };
      const result = validateEnterpriseProviderTranslation(candidate);
      assert.equal(result.valid, false, `expected key '${key}' to be rejected`);
      assert.ok(!result.valid && result.errors.some((e) => e.code === 'FORBIDDEN_PROVIDER_METADATA_KEY'), `expected FORBIDDEN_PROVIDER_METADATA_KEY for '${key}'`);
    }
  });

  it('rejects a malformed translatedAt', () => {
    const candidate = { ...makeTranslation(), translatedAt: 'not-a-timestamp' };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_TRANSLATED_AT'));
  });

  it('rejects a missing correlationId', () => {
    const candidate = { ...makeTranslation(), correlationId: undefined };
    const result = validateEnterpriseProviderTranslation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_CORRELATION_ID'));
  });

  it('does not perform provider, network, or execution-outcome checks', () => {
    const candidate = makeTranslation({ providerSystem: 'a-provider-nobody-can-verify-is-reachable' });
    assert.equal(validateEnterpriseProviderTranslation(candidate).valid, true);
  });

  it('does not check grantRef for existence -- only well-formedness', () => {
    const candidate = makeTranslation({ grantRef: 'grant-that-does-not-exist-anywhere' });
    assert.equal(validateEnterpriseProviderTranslation(candidate).valid, true);
  });
});

describe('validateEnterpriseProviderTranslationSet (duplicate translation identifiers)', () => {
  it('accepts a set with no duplicate ids, including two translations for the same grantRef', () => {
    const result = validateEnterpriseProviderTranslationSet([
      makeTranslation({ id: 'translation-1', grantRef: 'grant-1' }),
      makeTranslation({ id: 'translation-2', grantRef: 'grant-1' }),
    ]);
    assert.equal(result.valid, true);
  });

  it('accepts an empty set', () => {
    assert.equal(validateEnterpriseProviderTranslationSet([]).valid, true);
  });

  it('rejects a set where two translations share the same id', () => {
    const result = validateEnterpriseProviderTranslationSet([
      makeTranslation({ id: 'translation-1' }),
      makeTranslation({ id: 'translation-1' }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_TRANSLATION_ID' && e.message.includes('translation-1')));
  });
});

// ---------------------------------------------------------------------------
// Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full translation', () => {
    const original = makeTranslation();
    const json = serializeEnterpriseProviderTranslation(original);
    const restored = deserializeEnterpriseProviderTranslation(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseProviderTranslationEquals(original, restored), true);
  });

  it('round-trips a minimal translation without optional fields', () => {
    const original: EnterpriseProviderTranslation = {
      schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
      id: 'translation-min',
      providerSystem: 'pinata',
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.REGISTER_USAGE,
      grantRef: 'grant-min',
      resource: { kind: 'ipfs-object', id: 'Qm123' },
      translatedAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-min',
    };
    const restored = deserializeEnterpriseProviderTranslation(JSON.parse(JSON.stringify(serializeEnterpriseProviderTranslation(original))));
    assert.equal(enterpriseProviderTranslationEquals(original, restored), true);
  });

  it('omits undefined optional fields rather than writing null', () => {
    const translation: EnterpriseProviderTranslation = {
      schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
      id: 'translation-min',
      providerSystem: 'pinata',
      capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_USAGE_REPORTING,
      executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.REGISTER_USAGE,
      grantRef: 'grant-min',
      resource: { kind: 'ipfs-object', id: 'Qm123' },
      translatedAt: '2026-08-04T00:00:00Z',
      correlationId: 'corr-min',
    };
    const json = serializeEnterpriseProviderTranslation(translation);
    assert.equal('providerMetadata' in json, false);
    assert.equal('description' in json, false);
  });

  it('throws EnterpriseProviderTranslationValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseProviderTranslation({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseProviderTranslation({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseProviderTranslationValidationError);
    if (caught instanceof EnterpriseProviderTranslationValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Negative tests -- compile-time proof the Translation Model cannot carry a
// JWT, OAuth token, provider SDK, HTTP client, URL, signed URL, credential,
// network client, execution result, provider response, or storage object.
// Mirrors the ts-expect-error convention already established in
// `packages/provider-adapter`. These assertions fail `tsc` (this package's
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

// @ts-expect-error -- EnterpriseProviderTranslation has no jwt field; this contract carries no token of any kind.
const _noJwt: EnterpriseProviderTranslation = { ...makeTranslation(), jwt: 'eyJhbGciOiJIUzI1NiJ9.e30.abc' };

// @ts-expect-error -- EnterpriseProviderTranslation has no oauthToken/accessToken field.
const _noOAuthToken: EnterpriseProviderTranslation = { ...makeTranslation(), accessToken: 'ya29.a0AfH6SMC' };

// @ts-expect-error -- EnterpriseProviderTranslation has no url/signedUrl field; this is a pre-execution translation, not a provider response.
const _noSignedUrl: EnterpriseProviderTranslation = { ...makeTranslation(), signedUrl: 'https://example.com/object?sig=abc' };

// @ts-expect-error -- EnterpriseProviderTranslation has no apiKey field.
const _noApiKey: EnterpriseProviderTranslation = { ...makeTranslation(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseProviderTranslation has no credential field.
const _noCredential: EnterpriseProviderTranslation = { ...makeTranslation(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseProviderTranslation has no pinataSdk/client field; this contract is provider-neutral.
const _noPinataSdk: EnterpriseProviderTranslation = { ...makeTranslation(), pinataSdk: {} };

// @ts-expect-error -- EnterpriseProviderTranslation has no s3Client field; this contract is provider-neutral.
const _noS3Client: EnterpriseProviderTranslation = { ...makeTranslation(), s3Client: {} };

// @ts-expect-error -- EnterpriseProviderTranslation has no httpClient field; a translation never implements HTTP.
const _noHttpClient: EnterpriseProviderTranslation = { ...makeTranslation(), httpClient: {} };

// @ts-expect-error -- EnterpriseProviderTranslation has no socket/networkClient field; this contract implements no networking.
const _noNetworkClient: EnterpriseProviderTranslation = { ...makeTranslation(), socket: {} };

// @ts-expect-error -- EnterpriseProviderTranslation has no success/executionSucceeded field; it answers "what should happen," never "did it happen."
const _noExecutionSuccess: EnterpriseProviderTranslation = { ...makeTranslation(), success: true };

// @ts-expect-error -- EnterpriseProviderTranslation has no providerResponse/httpStatus field; provider responses belong to Provider Execution, never this model.
const _noProviderResponse: EnterpriseProviderTranslation = { ...makeTranslation(), httpStatus: 200 };

// @ts-expect-error -- EnterpriseProviderTranslation has no storageObject/blob field; this is not a storage implementation.
const _noStorageObject: EnterpriseProviderTranslation = { ...makeTranslation(), storageObject: { bytes: new Uint8Array() } };

// @ts-expect-error -- EnterpriseProviderTranslation has no retryPolicy field; this contract defines no retry logic.
const _noRetryPolicy: EnterpriseProviderTranslation = { ...makeTranslation(), retryPolicy: { maxAttempts: 3 } };

// @ts-expect-error -- EnterpriseProviderTranslation has no execute/run callback; this contract never executes anything.
const _noExecutionCallback: EnterpriseProviderTranslation = { ...makeTranslation(), execute: () => {} };

// @ts-expect-error -- EnterpriseProviderTranslation has no persist/save method; this contract implements no persistence.
const _noPersistence: EnterpriseProviderTranslation = { ...makeTranslation(), persist: () => {} };

// @ts-expect-error -- EnterpriseProviderTranslation has no telemetry/logger field.
const _noTelemetry: EnterpriseProviderTranslation = { ...makeTranslation(), logger: console };

// @ts-expect-error -- EnterpriseProviderTranslation has no policyEvaluation/outcome/authorization field; a translation never decides or carries authorization -- it only reads an already-issued grant's reference.
const _noPolicyEvaluation: EnterpriseProviderTranslation = { ...makeTranslation(), outcome: 'allow' };

// @ts-expect-error -- EnterpriseProviderTranslation has no grantOwner/principalId field; grant ownership stays on EnterpriseAccessGrant, never duplicated here.
const _noGrantOwnership: EnterpriseProviderTranslation = { ...makeTranslation(), principalId: 'principal-1' };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeTranslation().providerSystem = 'pinata';

void _noJwt;
void _noOAuthToken;
void _noSignedUrl;
void _noApiKey;
void _noCredential;
void _noPinataSdk;
void _noS3Client;
void _noHttpClient;
void _noNetworkClient;
void _noExecutionSuccess;
void _noProviderResponse;
void _noStorageObject;
void _noRetryPolicy;
void _noExecutionCallback;
void _noPersistence;
void _noTelemetry;
void _noPolicyEvaluation;
void _noGrantOwnership;
