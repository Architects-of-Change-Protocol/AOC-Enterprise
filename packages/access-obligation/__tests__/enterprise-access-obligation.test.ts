import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseAccessObligation } from '../src/enterprise-access-obligation.js';
import {
  ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
  ENTERPRISE_ACCESS_OBLIGATION_TYPES,
  deserializeEnterpriseAccessObligation,
  enterpriseAccessObligationEquals,
  enterpriseAccessObligationIdentityEquals,
  EnterpriseAccessObligationValidationError,
  serializeEnterpriseAccessObligation,
  validateEnterpriseAccessObligation,
  validateEnterpriseAccessObligationSet,
} from '../src/enterprise-access-obligation.js';

function makeObligation(overrides: Partial<EnterpriseAccessObligation> = {}): EnterpriseAccessObligation {
  return {
    schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
    id: 'obligation-1',
    type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT,
    mandatory: true,
    decisionRef: 'corr-1',
    severity: 'warning',
    parameters: { durationSeconds: 3600 },
    description: 'Access expires one hour after grant.',
    evidenceRefs: ['evidence-1', 'evidence-2'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 11: Positive tests
// ---------------------------------------------------------------------------

describe('EnterpriseAccessObligation construction', () => {
  it('constructs a full obligation', () => {
    const obligation = makeObligation();
    assert.equal(obligation.type, 'time-limit');
    assert.equal(obligation.mandatory, true);
    assert.equal(obligation.decisionRef, 'corr-1');
  });

  it('constructs a minimal obligation with only required fields', () => {
    const obligation: EnterpriseAccessObligation = {
      schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
      id: 'obligation-min',
      type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY,
      mandatory: false,
      decisionRef: 'corr-2',
    };
    assert.equal(validateEnterpriseAccessObligation(obligation).valid, true);
  });

  it('accepts every canonical obligation type', () => {
    for (const type of Object.values(ENTERPRISE_ACCESS_OBLIGATION_TYPES)) {
      assert.equal(validateEnterpriseAccessObligation(makeObligation({ type })).valid, true);
    }
  });

  it('accepts every canonical severity, and omits severity entirely', () => {
    for (const severity of ['info', 'warning', 'error', 'critical'] as const) {
      assert.equal(validateEnterpriseAccessObligation(makeObligation({ severity })).valid, true);
    }
    const { severity, ...withoutSeverity } = makeObligation();
    assert.equal(validateEnterpriseAccessObligation(withoutSeverity).valid, true);
  });
});

describe('composition with EnterpriseAccessDecision', () => {
  it('references the decision by decisionRef rather than embedding it', () => {
    const obligation = makeObligation();
    const topLevelKeys = Object.keys(obligation);
    for (const decisionField of ['request', 'resource', 'outcome', 'evaluatedAt']) {
      assert.equal(topLevelKeys.includes(decisionField), false, `obligation must not embed EnterpriseAccessDecision.${decisionField}`);
    }
    assert.equal(typeof obligation.decisionRef, 'string');
  });
});

describe('enterpriseAccessObligationIdentityEquals', () => {
  it('is true for the same id regardless of every other field', () => {
    const a = makeObligation({ type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.NO_DOWNLOAD, mandatory: true, description: 'first' });
    const b = makeObligation({ type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.WATERMARK_CONTENT, mandatory: false, description: 'second' });
    assert.equal(enterpriseAccessObligationIdentityEquals(a, b), true);
    assert.equal(enterpriseAccessObligationEquals(a, b), false);
  });

  it('is false when id differs', () => {
    const a = makeObligation();
    const b = makeObligation({ id: 'obligation-2' });
    assert.equal(enterpriseAccessObligationIdentityEquals(a, b), false);
  });
});

describe('enterpriseAccessObligationEquals', () => {
  it('is true for two independently constructed but identical obligations', () => {
    assert.equal(enterpriseAccessObligationEquals(makeObligation(), makeObligation()), true);
  });

  it('is insensitive to parameters/evidenceRefs construction order', () => {
    const a = makeObligation({ parameters: { a: 1, b: 2 }, evidenceRefs: ['evidence-1', 'evidence-2'] });
    const b = makeObligation({ parameters: { b: 2, a: 1 }, evidenceRefs: ['evidence-2', 'evidence-1'] });
    assert.equal(enterpriseAccessObligationEquals(a, b), true);
  });

  it('is false when type, mandatory, decisionRef, severity, parameters, description, or evidenceRefs differ', () => {
    const base = makeObligation();
    assert.equal(enterpriseAccessObligationEquals(base, makeObligation({ type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY })), false);
    assert.equal(enterpriseAccessObligationEquals(base, makeObligation({ mandatory: false })), false);
    assert.equal(enterpriseAccessObligationEquals(base, makeObligation({ decisionRef: 'corr-9' })), false);
    assert.equal(enterpriseAccessObligationEquals(base, makeObligation({ severity: 'critical' })), false);
    assert.equal(enterpriseAccessObligationEquals(base, makeObligation({ parameters: { durationSeconds: 60 } })), false);
    assert.equal(enterpriseAccessObligationEquals(base, makeObligation({ description: 'different' })), false);
    assert.equal(enterpriseAccessObligationEquals(base, makeObligation({ evidenceRefs: ['evidence-9'] })), false);
  });
});

describe('validateEnterpriseAccessObligation', () => {
  it('accepts a fully populated valid obligation', () => {
    assert.equal(validateEnterpriseAccessObligation(makeObligation()).valid, true);
  });

  it('rejects a missing id', () => {
    const candidate = { ...makeObligation(), id: undefined };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_ID'));
  });

  it('rejects an unsupported schema version', () => {
    const candidate = { ...makeObligation(), schemaVersion: '2.0.0' };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'));
  });

  it('rejects a missing type', () => {
    const candidate = { ...makeObligation(), type: undefined };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_TYPE'));
  });

  it('rejects a type outside the canonical vocabulary', () => {
    const candidate = { ...makeObligation(), type: 'delete-everything' };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_TYPE'));
  });

  it('rejects a missing mandatory flag', () => {
    const candidate = { ...makeObligation(), mandatory: undefined };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_MANDATORY'));
  });

  it('rejects a non-boolean mandatory flag', () => {
    const candidate = { ...makeObligation(), mandatory: 'yes' };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_MANDATORY'));
  });

  it('rejects a missing decisionRef', () => {
    const candidate = { ...makeObligation(), decisionRef: undefined };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'MISSING_DECISION_REF'));
  });

  it('rejects an invalid severity', () => {
    const candidate = { ...makeObligation(), severity: 'catastrophic' };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_SEVERITY'));
  });

  it('rejects non-primitive parameter values (invalid parameter combination)', () => {
    const candidate = { ...makeObligation(), parameters: { nested: { not: 'allowed' } } };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_PARAMETERS'));
  });

  it('rejects parameter keys shaped like a credential, token, or URL', () => {
    for (const forbiddenKey of ['apiKey', 'bearerToken', 'jwt', 'password', 'downloadUrl', 'sessionId']) {
      const candidate = { ...makeObligation(), parameters: { [forbiddenKey]: 'value' } };
      const result = validateEnterpriseAccessObligation(candidate);
      assert.equal(result.valid, false, `expected ${forbiddenKey} to be rejected`);
      assert.ok(!result.valid && result.errors.some((e) => e.code === 'FORBIDDEN_PARAMETER_KEY'), `expected ${forbiddenKey} to raise FORBIDDEN_PARAMETER_KEY`);
    }
  });

  it('accepts provider-neutral, non-forbidden parameter keys', () => {
    const candidate = { ...makeObligation(), parameters: { durationSeconds: 60, approverRole: 'compliance-officer', notifyOnBreach: true } };
    assert.equal(validateEnterpriseAccessObligation(candidate).valid, true);
  });

  it('rejects non-string evidenceRefs entries', () => {
    const candidate = { ...makeObligation(), evidenceRefs: ['evidence-1', 42] };
    const result = validateEnterpriseAccessObligation(candidate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'INVALID_EVIDENCE_REFS'));
  });

  it('does not perform provider, network, user, role, or permission checks', () => {
    const candidate = makeObligation({
      decisionRef: 'a-decision-nobody-can-verify-exists',
      evidenceRefs: ['an-evidence-record-nobody-can-verify-exists'],
    });
    assert.equal(validateEnterpriseAccessObligation(candidate).valid, true);
  });
});

describe('validateEnterpriseAccessObligationSet (duplicate detection)', () => {
  it('accepts a set with no duplicate ids', () => {
    const result = validateEnterpriseAccessObligationSet([makeObligation({ id: 'obligation-1' }), makeObligation({ id: 'obligation-2' })]);
    assert.equal(result.valid, true);
  });

  it('accepts an empty set', () => {
    assert.equal(validateEnterpriseAccessObligationSet([]).valid, true);
  });

  it('rejects a set where two obligations share the same id, even with different types', () => {
    const result = validateEnterpriseAccessObligationSet([
      makeObligation({ id: 'obligation-1', type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY }),
      makeObligation({ id: 'obligation-1', type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.NO_DOWNLOAD }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((e) => e.code === 'DUPLICATE_OBLIGATION_ID' && e.message.includes('obligation-1')));
  });

  it('reports each duplicate id exactly once regardless of how many times it repeats', () => {
    const result = validateEnterpriseAccessObligationSet([
      makeObligation({ id: 'obligation-1' }),
      makeObligation({ id: 'obligation-1' }),
      makeObligation({ id: 'obligation-1' }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.length === 1);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 / Phase 11: Serialization, round-trip
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('round-trips a full obligation', () => {
    const original = makeObligation();
    const json = serializeEnterpriseAccessObligation(original);
    const restored = deserializeEnterpriseAccessObligation(JSON.parse(JSON.stringify(json)));
    assert.equal(enterpriseAccessObligationEquals(original, restored), true);
  });

  it('round-trips a minimal obligation without optional fields', () => {
    const original: EnterpriseAccessObligation = {
      schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
      id: 'obligation-min',
      type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.REQUIRE_MFA,
      mandatory: true,
      decisionRef: 'corr-2',
    };
    const restored = deserializeEnterpriseAccessObligation(JSON.parse(JSON.stringify(serializeEnterpriseAccessObligation(original))));
    assert.equal(enterpriseAccessObligationEquals(original, restored), true);
  });

  it('serialization is deterministic regardless of parameters/evidenceRefs construction order', () => {
    const a = makeObligation({ parameters: { a: 1, b: 2 }, evidenceRefs: ['evidence-1', 'evidence-2'] });
    const b = makeObligation({ parameters: { b: 2, a: 1 }, evidenceRefs: ['evidence-2', 'evidence-1'] });
    assert.equal(JSON.stringify(serializeEnterpriseAccessObligation(a)), JSON.stringify(serializeEnterpriseAccessObligation(b)));
  });

  it('omits undefined optional fields rather than writing null', () => {
    const obligation: EnterpriseAccessObligation = {
      schemaVersion: ENTERPRISE_ACCESS_OBLIGATION_SCHEMA_VERSION,
      id: 'obligation-min',
      type: ENTERPRISE_ACCESS_OBLIGATION_TYPES.REQUIRE_MFA,
      mandatory: true,
      decisionRef: 'corr-2',
    };
    const json = serializeEnterpriseAccessObligation(obligation);
    assert.equal('severity' in json, false);
    assert.equal('parameters' in json, false);
    assert.equal('description' in json, false);
    assert.equal('evidenceRefs' in json, false);
  });

  it('throws EnterpriseAccessObligationValidationError on invalid input, carrying every issue', () => {
    assert.throws(() => deserializeEnterpriseAccessObligation({ schemaVersion: '2.0.0' }));

    let caught: unknown;
    try {
      deserializeEnterpriseAccessObligation({ schemaVersion: '2.0.0' });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnterpriseAccessObligationValidationError);
    if (caught instanceof EnterpriseAccessObligationValidationError) {
      assert.ok(caught.issues.length > 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 10: Negative tests -- compile-time proof the contract cannot carry
// URLs, JWTs, provider SDK types, credentials, download links, provider
// clients, runtime callbacks, approval state, or grant identifiers. Mirrors
// the compile-time @ts-expect-error convention already established in
// `packages/resource-envelope` and `packages/access-decision`. These
// assertions fail `tsc` (this package's `test` script runs
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

// @ts-expect-error -- EnterpriseAccessObligation has no url field; obligations never link to a resource directly.
const _noUrl: EnterpriseAccessObligation = { ...makeObligation(), url: 'https://example.com/object' };

// @ts-expect-error -- EnterpriseAccessObligation has no downloadUrl field.
const _noDownloadUrl: EnterpriseAccessObligation = { ...makeObligation(), downloadUrl: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseAccessObligation has no jwt field.
const _noJwt: EnterpriseAccessObligation = { ...makeObligation(), jwt: 'eyJhbGciOiJIUzI1NiJ9...' };

// @ts-expect-error -- EnterpriseAccessObligation has no pinataSdk/client field; this contract is provider-neutral.
const _noPinataSdk: EnterpriseAccessObligation = { ...makeObligation(), pinataSdk: {} };

// @ts-expect-error -- EnterpriseAccessObligation has no s3Client field; this contract is provider-neutral.
const _noS3Client: EnterpriseAccessObligation = { ...makeObligation(), s3Client: {} };

// @ts-expect-error -- EnterpriseAccessObligation has no credential field.
const _noCredential: EnterpriseAccessObligation = { ...makeObligation(), credential: { type: 'aws-sig-v4' } };

// @ts-expect-error -- EnterpriseAccessObligation has no apiKey field.
const _noApiKey: EnterpriseAccessObligation = { ...makeObligation(), apiKey: 'secret' };

// @ts-expect-error -- EnterpriseAccessObligation has no downloadLink field.
const _noDownloadLink: EnterpriseAccessObligation = { ...makeObligation(), downloadLink: 'https://example.com/download' };

// @ts-expect-error -- EnterpriseAccessObligation has no provider client field.
const _noProviderClient: EnterpriseAccessObligation = { ...makeObligation(), client: {} };

// @ts-expect-error -- EnterpriseAccessObligation has no runtime callback field; obligations never execute themselves.
const _noRuntimeCallback: EnterpriseAccessObligation = { ...makeObligation(), onSatisfied: () => {} };

// @ts-expect-error -- approval state belongs to a future approval engine, never this declarative record.
const _noApprovalState: EnterpriseAccessObligation = { ...makeObligation(), approvalState: 'approved' };

// @ts-expect-error -- a grant identifier belongs to a future AccessGrant, never an obligation.
const _noGrantId: EnterpriseAccessObligation = { ...makeObligation(), grantId: 'grant-1' };

// @ts-expect-error -- this contract does not evaluate policy; it has no policy-engine/rule-set field.
const _noPolicyEngine: EnterpriseAccessObligation = { ...makeObligation(), policyEngine: {} };

// @ts-expect-error -- decision outcome lives only on EnterpriseAccessDecision.outcome, never duplicated here.
const _noOutcome: EnterpriseAccessObligation = { ...makeObligation(), outcome: 'allow' };

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeObligation().mandatory = false;

// @ts-expect-error -- readonly fields cannot be reassigned; there is no in-place mutation API.
makeObligation().type = ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY;

void _noUrl;
void _noDownloadUrl;
void _noJwt;
void _noPinataSdk;
void _noS3Client;
void _noCredential;
void _noApiKey;
void _noDownloadLink;
void _noProviderClient;
void _noRuntimeCallback;
void _noApprovalState;
void _noGrantId;
void _noPolicyEngine;
void _noOutcome;
