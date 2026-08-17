import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTERPRISE_ACTIONS_DISTINCT_FROM_LICENSE,
  ENTERPRISE_LICENSABLE_RIGHT_TYPES,
  ENTERPRISE_LICENSED_USE_TYPES,
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_LICENSE_LIFECYCLE_TYPES,
  ENTERPRISE_LICENSE_SCHEMA_VERSION,
  deserializeEnterpriseLicenseExecutionEvidence,
  deserializeEnterpriseLicenseLifecycleEvidence,
  deserializeEnterpriseLicenseMandate,
  deserializeEnterpriseLicenseRequest,
  enterpriseLicenseContextsWithin,
  enterpriseLicenseExclusivityWithin,
  enterpriseLicenseMandateAuthorizes,
  enterpriseLicenseRightsScopeWithin,
  enterpriseLicenseTermsEquals,
  enterpriseLicenseTermsWithin,
  enterpriseLicensedUnitsWithin,
  isEnterpriseLicenseCapability,
  serializeEnterpriseLicenseExecutionEvidence,
  serializeEnterpriseLicenseMandate,
  serializeEnterpriseLicenseRequest,
  validateEnterpriseLicenseExecutionEvidence,
  validateEnterpriseLicenseLifecycleEvidence,
  validateEnterpriseLicenseMandate,
  validateEnterpriseLicenseRequest,
} from '../src/index.js';
import type {
  EnterpriseLicenseConstraints,
  EnterpriseLicenseExecutionEvidence,
  EnterpriseLicenseExerciseAttempt,
  EnterpriseLicenseMandate,
  EnterpriseLicenseRequest,
  EnterpriseLicenseTerms,
} from '../src/index.js';

const ASSET = { kind: 'asset', id: 'digital-work-a', tenantId: 'org-a' } as const;

function terms(overrides: Partial<EnterpriseLicenseTerms> = {}): EnterpriseLicenseTerms {
  return {
    rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT],
    licenseeRef: 'party-company-b',
    permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY, ENTERPRISE_LICENSED_USE_TYPES.COMMERCIAL_USE],
    exclusivity: 'non-exclusive',
    executorRef: 'provider-platform-c',
    constraints: {
      prohibitedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING],
      permittedContexts: { territory: ['territory-a'], channel: ['channel-web'] },
      maximumLicenseTermEndsAt: '2027-01-01T00:00:00.000Z',
      maximumLicensedUnits: { units: 10, unitDenomination: 'seat' },
      sublicensing: 'prohibited',
      assignment: 'prohibited',
      additionalLicensesAllowed: false,
      externalAgreementReferenceRequired: true,
    },
    ...overrides,
  };
}

/**
 * Drops `prohibitedUses` entirely rather than setting it to `undefined`. The
 * repository compiles with `exactOptionalPropertyTypes`, and the domain draws
 * the same distinction: "declares no exclusion" is an absent field, never a
 * present one holding nothing.
 */
function withoutExclusions(constraints: EnterpriseLicenseConstraints): EnterpriseLicenseConstraints {
  const { prohibitedUses: _dropped, ...rest } = constraints;
  return rest;
}

function mandate(overrides: Partial<EnterpriseLicenseMandate> = {}): EnterpriseLicenseMandate {
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: 'license-mandate-1',
    status: 'active',
    asset: ASSET,
    terms: terms(),
    requestRef: 'license-request-1',
    requestedBy: 'actor-rights-manager',
    decisionRef: 'decision-1',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

function request(overrides: Partial<EnterpriseLicenseRequest> = {}): EnterpriseLicenseRequest {
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: 'license-request-1',
    capability: ENTERPRISE_LICENSE_CAPABILITY,
    asset: ASSET,
    requestedBy: 'actor-rights-manager',
    terms: terms(),
    requestedAt: '2026-01-01T00:00:00.000Z',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

function execution(overrides: Partial<EnterpriseLicenseExecutionEvidence> = {}): EnterpriseLicenseExecutionEvidence {
  return {
    schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
    id: 'license-execution-1',
    mandateRef: 'license-mandate-1',
    executedBy: 'provider-platform-c',
    executedAt: '2026-02-01T00:00:00.000Z',
    licenseeRef: 'party-company-b',
    rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT],
    grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY],
    exclusivity: 'non-exclusive',
    correlationId: 'execution-correlation-1',
    contexts: { territory: ['territory-a'], channel: ['channel-web'] },
    licenseEffectiveAt: '2026-02-01T00:00:00.000Z',
    licenseExpiresAt: '2026-12-01T00:00:00.000Z',
    licensedUnits: { units: 5, unitDenomination: 'seat' },
    externalAgreementReference: 'agreement-1',
    ...overrides,
  };
}

const CONFORMING_ATTEMPT: EnterpriseLicenseExerciseAttempt = {
  executedBy: 'provider-platform-c',
  licenseeRef: 'party-company-b',
  rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT],
  grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY],
  exclusivity: 'non-exclusive',
  at: '2026-02-01T00:00:00.000Z',
  contexts: { territory: ['territory-a'], channel: ['channel-web'] },
  licenseExpiresAt: '2026-12-01T00:00:00.000Z',
  licensedUnits: { units: 5, unitDenomination: 'seat' },
  hasExternalAgreementReference: true,
};

function codes(result: { valid: boolean; errors?: readonly { code: string }[] }): readonly string[] {
  return (result.errors ?? []).map((issue) => issue.code);
}

/** Asserts a deserializer refused its input by throwing the package's own typed validation error, carrying the full issue list. */
function expectValidationError(name: string, run: () => unknown): void {
  try {
    run();
  } catch (error) {
    if (!(error instanceof Error)) throw new Error(`expected an Error, received ${String(error)}`);
    assert.equal(error.name, name);
    assert.ok(Array.isArray((error as { issues?: unknown }).issues), 'the error must carry every issue, not just the first');
    return;
  }
  throw new Error(`expected ${name} to be thrown`);
}

// ---------------------------------------------------------------------------
// 1. Contract validation
// ---------------------------------------------------------------------------

describe('LICENSE contracts — the action is distinct and named on its face', () => {
  it('recognizes only the exact capability identifier', () => {
    assert.equal(isEnterpriseLicenseCapability('license'), true);
    assert.equal(isEnterpriseLicenseCapability('license.partial'), false);
    assert.equal(isEnterpriseLicenseCapability('LICENSE'), false);
  });

  it('records the neighbouring actions it must never be conflated with', () => {
    for (const other of ['tokenize', 'collateralize', 'transfer', 'protocolize', 'access'] as const) {
      assert.ok(ENTERPRISE_ACTIONS_DISTINCT_FROM_LICENSE.includes(other), `${other} must be recorded as distinct from LICENSE`);
      assert.notEqual(other, ENTERPRISE_LICENSE_CAPABILITY);
    }
  });

  it('refuses a request carrying any other governed action', () => {
    assert.deepEqual(codes(validateEnterpriseLicenseRequest(request({ capability: 'tokenize' as never }))), ['CAPABILITY_MISMATCH']);
  });
});

describe('LICENSE contracts — terms validation', () => {
  it('accepts the canonical terms', () => {
    assert.equal(validateEnterpriseLicenseRequest(request()).valid, true);
    assert.equal(validateEnterpriseLicenseMandate(mandate()).valid, true);
  });

  it('requires a licensee, at least one right, at least one use, and an exclusivity', () => {
    const { licenseeRef: _l, ...noLicensee } = terms();
    assert.ok(codes(validateEnterpriseLicenseMandate(mandate({ terms: noLicensee as EnterpriseLicenseTerms }))).includes('MISSING_LICENSEE_REF'));
    assert.ok(codes(validateEnterpriseLicenseMandate(mandate({ terms: terms({ rights: [] }) }))).includes('EMPTY_RIGHTS'));
    assert.ok(codes(validateEnterpriseLicenseMandate(mandate({ terms: terms({ permittedUses: [] }) }))).includes('EMPTY_PERMITTED_USES'));
    const { exclusivity: _e, ...noExclusivity } = terms();
    assert.ok(codes(validateEnterpriseLicenseMandate(mandate({ terms: noExclusivity as EnterpriseLicenseTerms }))).includes('MISSING_EXCLUSIVITY'));
  });

  it('requires the sublicensing, assignment and repeatability dispositions, because none has a safe default', () => {
    const base = terms();
    for (const field of ['sublicensing', 'assignment', 'additionalLicensesAllowed'] as const) {
      const { [field]: _omitted, ...constraints } = base.constraints;
      const issues = codes(validateEnterpriseLicenseMandate(mandate({ terms: { ...base, constraints: constraints as never } })));
      assert.ok(
        issues.some((code) => code.startsWith('MISSING_')),
        `${field} must be required, received ${issues.join(', ')}`,
      );
    }
  });

  it('refuses an authorization that both permits and forbids the same use', () => {
    const contradictory = terms({
      permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY, ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING],
    });
    assert.ok(codes(validateEnterpriseLicenseMandate(mandate({ terms: contradictory }))).includes('CONTRADICTORY_USES'));
  });

  it('refuses a malformed operating-context map without inventing a default dimension', () => {
    for (const contexts of [{}, { territory: [] }, { '': ['a'] }, { territory: 'territory-a' }] as const) {
      const candidate = terms({ constraints: { ...terms().constraints, permittedContexts: contexts as never } });
      assert.ok(
        codes(validateEnterpriseLicenseMandate(mandate({ terms: candidate }))).includes('INVALID_PERMITTED_CONTEXTS'),
        `${JSON.stringify(contexts)} must be rejected`,
      );
    }
  });

  it('refuses a floating-point or out-of-range rights scope', () => {
    for (const scope of [{ kind: 'proportional', basisPoints: 25.5 }, { kind: 'proportional', basisPoints: 10_001 }, { kind: 'proportional', basisPoints: 0 }] as const) {
      const candidate = terms({ rightsScope: scope as never });
      assert.ok(codes(validateEnterpriseLicenseMandate(mandate({ terms: candidate }))).includes('INVALID_RIGHTS_SCOPE_BASIS_POINTS'));
    }
  });

  it('requires a mandate expiry, and requires it to be after the effective instant', () => {
    const { expiresAt: _x, ...noExpiry } = mandate();
    assert.ok(codes(validateEnterpriseLicenseMandate(noExpiry)).includes('MISSING_EXPIRES_AT'));
    assert.ok(
      codes(validateEnterpriseLicenseMandate(mandate({ expiresAt: '2025-01-01T00:00:00.000Z' }))).includes('EXPIRY_NOT_AFTER_EFFECTIVE_FROM'),
    );
  });

  it('requires a decision reference, because a mandate exists only because a decision produced it', () => {
    const { decisionRef: _d, ...noDecision } = mandate();
    assert.ok(codes(validateEnterpriseLicenseMandate(noDecision)).includes('MISSING_DECISION_REF'));
  });
});

// ---------------------------------------------------------------------------
// Containment primitives — the semantics the whole action rests on.
// ---------------------------------------------------------------------------

describe('LICENSE contracts — rights scope is optional and never coerced', () => {
  it('treats absence as "not fractionally expressed", never as 100%', () => {
    assert.equal(enterpriseLicenseRightsScopeWithin(undefined, undefined), true);
    assert.equal(
      enterpriseLicenseRightsScopeWithin(undefined, { kind: 'proportional', basisPoints: 2500 }),
      false,
      'an unfractioned claim cannot be shown to sit inside a 25% authorization',
    );
    assert.equal(
      enterpriseLicenseRightsScopeWithin({ kind: 'proportional', basisPoints: 1 }, undefined),
      false,
      'an authorization that expressed no portion did not authorize one to be asserted',
    );
  });

  it('compares commensurable scopes and refuses incommensurable ones', () => {
    assert.equal(enterpriseLicenseRightsScopeWithin({ kind: 'proportional', basisPoints: 2500 }, { kind: 'proportional', basisPoints: 10_000 }), true);
    assert.equal(enterpriseLicenseRightsScopeWithin({ kind: 'proportional', basisPoints: 10_000 }, { kind: 'proportional', basisPoints: 2500 }), false);
    assert.equal(
      enterpriseLicenseRightsScopeWithin({ kind: 'unitized', units: 1, unitDenomination: 'share' }, { kind: 'proportional', basisPoints: 10_000 }),
      false,
      'a unit count is never coerced into a proportional share',
    );
    assert.equal(
      enterpriseLicenseRightsScopeWithin({ kind: 'unitized', units: 1, unitDenomination: 'a' }, { kind: 'unitized', units: 500, unitDenomination: 'b' }),
      false,
      'denominations must match',
    );
  });
});

describe('LICENSE contracts — exclusivity is a rank, not a boolean', () => {
  it('admits a narrower grant and refuses a wider one, including the middle case', () => {
    assert.equal(enterpriseLicenseExclusivityWithin('non-exclusive', 'exclusive'), true);
    assert.equal(enterpriseLicenseExclusivityWithin('sole', 'exclusive'), true);
    assert.equal(enterpriseLicenseExclusivityWithin('non-exclusive', 'sole'), true);
    assert.equal(enterpriseLicenseExclusivityWithin('sole', 'non-exclusive'), false);
    assert.equal(enterpriseLicenseExclusivityWithin('exclusive', 'sole'), false);
    assert.equal(enterpriseLicenseExclusivityWithin('exclusive', 'non-exclusive'), false);
  });
});

describe('LICENSE contracts — operating context is compared per dimension, as a set', () => {
  it('places no limit on a dimension the authorization does not restrict', () => {
    assert.equal(enterpriseLicenseContextsWithin({ channel: ['anything'] }, undefined), true);
    assert.equal(enterpriseLicenseContextsWithin({ channel: ['anything'] }, { territory: ['a'] }), false, 'a restricted dimension must still be satisfied');
    assert.equal(enterpriseLicenseContextsWithin({ territory: ['a'], channel: ['anything'] }, { territory: ['a'] }), true);
  });

  it('refuses a widened value set rather than matching on the first value', () => {
    assert.equal(enterpriseLicenseContextsWithin({ territory: ['a'] }, { territory: ['a', 'b'] }), true);
    assert.equal(enterpriseLicenseContextsWithin({ territory: ['a', 'b'] }, { territory: ['a'] }), false);
  });

  it('refuses an omitted dimension the authorization restricts', () => {
    assert.equal(enterpriseLicenseContextsWithin(undefined, { territory: ['a'] }), false);
    assert.equal(enterpriseLicenseContextsWithin({ territory: [] }, { territory: ['a'] }), false);
  });
});

describe('LICENSE contracts — licensed units are a per-grant ceiling, not a rights portion', () => {
  it('compares only within a matching denomination', () => {
    assert.equal(enterpriseLicensedUnitsWithin({ units: 5, unitDenomination: 'seat' }, { units: 10, unitDenomination: 'seat' }), true);
    assert.equal(enterpriseLicensedUnitsWithin({ units: 50, unitDenomination: 'seat' }, { units: 10, unitDenomination: 'seat' }), false);
    assert.equal(enterpriseLicensedUnitsWithin({ units: 1, unitDenomination: 'deployment' }, { units: 10, unitDenomination: 'seat' }), false);
  });
});

describe('LICENSE contracts — granted terms may narrow but never widen requested terms', () => {
  it('accepts a narrowing and refuses every widening', () => {
    const requested = terms();
    assert.equal(enterpriseLicenseTermsWithin(terms({ permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY] }), requested), true);

    for (const [label, granted] of [
      ['a wider use set', terms({ permittedUses: [...requested.permittedUses, ENTERPRISE_LICENSED_USE_TYPES.DISTRIBUTE] })],
      ['a higher exclusivity', terms({ exclusivity: 'exclusive' })],
      ['a different licensee', terms({ licenseeRef: 'party-company-c' })],
      ['a different executor', terms({ executorRef: 'provider-platform-d' })],
      ['a looser assignment disposition', terms({ constraints: { ...requested.constraints, assignment: 'permitted' } })],
      ['a longer term ceiling', terms({ constraints: { ...requested.constraints, maximumLicenseTermEndsAt: '2030-01-01T00:00:00.000Z' } })],
      ['a larger unit ceiling', terms({ constraints: { ...requested.constraints, maximumLicensedUnits: { units: 1000, unitDenomination: 'seat' } } })],
      ['repeatability that was not requested', terms({ constraints: { ...requested.constraints, additionalLicensesAllowed: true } })],
      ['a dropped exclusion', terms({ constraints: withoutExclusions(requested.constraints) })],
    ] as const) {
      assert.equal(enterpriseLicenseTermsWithin(granted, requested), false, `${label} must not be contained by the requested terms`);
    }
  });

  it('compares rights and uses as sets, so ordering is never significant', () => {
    const a = terms({ permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY, ENTERPRISE_LICENSED_USE_TYPES.COMMERCIAL_USE] });
    const b = terms({ permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.COMMERCIAL_USE, ENTERPRISE_LICENSED_USE_TYPES.DISPLAY] });
    assert.equal(enterpriseLicenseTermsEquals(a, b), true);
    assert.equal(enterpriseLicenseTermsWithin(a, b), true);
  });
});

// ---------------------------------------------------------------------------
// The authorization decision itself.
// ---------------------------------------------------------------------------

describe('LICENSE contracts — a mandate authorizes exactly what it says', () => {
  it('authorizes a conforming exercise', () => {
    assert.deepEqual(enterpriseLicenseMandateAuthorizes(mandate(), CONFORMING_ATTEMPT), { authorized: true });
  });

  it('reports each refusal by its own cause, identity bindings first', () => {
    const cases: readonly (readonly [string, Partial<EnterpriseLicenseExerciseAttempt>, Record<string, unknown>?])[] = [
      ['EXECUTOR_NOT_AUTHORIZED', { executedBy: 'provider-platform-d' }],
      ['LICENSEE_NOT_AUTHORIZED', { licenseeRef: 'party-company-c' }],
      ['RIGHTS_NOT_AUTHORIZED', { rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.ECONOMIC_INTEREST] }],
      ['USES_NOT_AUTHORIZED', { grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISTRIBUTE] }],
      ['EXCLUSIVITY_EXCEEDS_MANDATE', { exclusivity: 'exclusive' }],
      ['CONTEXT_NOT_PERMITTED', { contexts: { territory: ['territory-a', 'territory-b'], channel: ['channel-web'] } }],
      ['LICENSE_TERM_EXCEEDS_MANDATE', { licenseExpiresAt: '2029-01-01T00:00:00.000Z' }],
      ['LICENSED_UNITS_EXCEED_MANDATE', { licensedUnits: { units: 500, unitDenomination: 'seat' } }],
      ['EXTERNAL_AGREEMENT_REFERENCE_REQUIRED', { hasExternalAgreementReference: false }],
      ['ADDITIONAL_LICENSES_PROHIBITED', { priorExecutionCount: 1 }],
      ['MANDATE_NOT_YET_EFFECTIVE', { at: '2025-01-01T00:00:00.000Z' }],
      ['MANDATE_EXPIRED', { at: '2027-01-01T00:00:00.000Z' }],
      ['INVALID_EXERCISE_INSTANT', { at: 'not-a-time' }],
    ];
    for (const [expected, overrides] of cases) {
      const result = enterpriseLicenseMandateAuthorizes(mandate(), { ...CONFORMING_ATTEMPT, ...overrides });
      assert.equal(result.authorized, false, `${expected} must refuse`);
      assert.equal(result.authorized === false ? result.code : '', expected);
    }
  });

  it('refuses a revoked mandate before anything else', () => {
    const result = enterpriseLicenseMandateAuthorizes(mandate({ status: 'revoked' }), { ...CONFORMING_ATTEMPT, licenseeRef: 'party-company-c' });
    assert.equal(result.authorized === false ? result.code : '', 'MANDATE_REVOKED');
  });

  it('reports an explicitly excluded use as an exclusion rather than as an unlisted one', () => {
    const permissive = mandate({
      terms: terms({
        permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY, ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING],
        constraints: withoutExclusions(terms().constraints),
      }),
    });
    // With the exclusion dropped, training is permitted...
    assert.equal(
      enterpriseLicenseMandateAuthorizes(permissive, { ...CONFORMING_ATTEMPT, grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING] }).authorized,
      true,
    );
    // ...and re-adding it as an exclusion makes the same grant a USE_PROHIBITED.
    const excluded = mandate({
      terms: terms({
        permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY],
        constraints: { ...terms().constraints, prohibitedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING] },
      }),
    });
    const result = enterpriseLicenseMandateAuthorizes(excluded, {
      ...CONFORMING_ATTEMPT,
      grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING],
    });
    assert.equal(result.authorized, false);
  });

  it('binds no executor when the authorization named none, and still binds the licensee', () => {
    const { executorRef: _unused, ...withoutExecutor } = terms();
    const unbound = mandate({ terms: { ...withoutExecutor, constraints: { ...terms().constraints, externalAgreementReferenceRequired: false } } });

    assert.equal(
      enterpriseLicenseMandateAuthorizes(unbound, { ...CONFORMING_ATTEMPT, executedBy: 'anyone-at-all', hasExternalAgreementReference: false })
        .authorized,
      true,
      'an unbound executor constrains nothing',
    );
    const substituted = enterpriseLicenseMandateAuthorizes(unbound, {
      ...CONFORMING_ATTEMPT,
      licenseeRef: 'party-company-c',
      hasExternalAgreementReference: false,
    });
    assert.equal(substituted.authorized === false ? substituted.code : '', 'LICENSEE_NOT_AUTHORIZED', 'the licensee is bound regardless');
  });

  it('admits a substituted licensee only when the license is declared freely assignable', () => {
    for (const [disposition, expected] of [
      ['prohibited', false],
      ['approval-required', false],
      ['permitted', true],
    ] as const) {
      const candidate = mandate({ terms: terms({ constraints: { ...terms().constraints, assignment: disposition } }) });
      const result = enterpriseLicenseMandateAuthorizes(candidate, { ...CONFORMING_ATTEMPT, licenseeRef: 'party-company-c' });
      assert.equal(result.authorized, expected, `assignment '${disposition}' must ${expected ? 'admit' : 'refuse'} a substituted licensee`);
    }
  });

  it('refuses an unbounded external license under a bounded authorization', () => {
    const { licenseExpiresAt: _dropped, ...unbounded } = CONFORMING_ATTEMPT;
    const result = enterpriseLicenseMandateAuthorizes(mandate(), unbounded);
    assert.equal(result.authorized === false ? result.code : '', 'LICENSE_TERM_EXCEEDS_MANDATE');
  });
});

// ---------------------------------------------------------------------------
// Serialization round trips.
// ---------------------------------------------------------------------------

describe('LICENSE contracts — deterministic serialization round trips', () => {
  it('round-trips a request, a mandate and execution evidence without semantic drift', () => {
    assert.equal(enterpriseLicenseTermsEquals(deserializeEnterpriseLicenseRequest(serializeEnterpriseLicenseRequest(request())).terms, terms()), true);
    assert.equal(enterpriseLicenseTermsEquals(deserializeEnterpriseLicenseMandate(serializeEnterpriseLicenseMandate(mandate())).terms, terms()), true);

    const evidence = deserializeEnterpriseLicenseExecutionEvidence(serializeEnterpriseLicenseExecutionEvidence(execution()));
    assert.deepEqual(evidence.contexts, { territory: ['territory-a'], channel: ['channel-web'] });
    assert.deepEqual(evidence.licensedUnits, { units: 5, unitDenomination: 'seat' });
    assert.equal(evidence.exclusivity, 'non-exclusive');
  });

  it('serializes deterministically regardless of input ordering', () => {
    const a = serializeEnterpriseLicenseMandate(mandate({ terms: terms({ permittedUses: ['display', 'commercial-use'] }) }));
    const b = serializeEnterpriseLicenseMandate(mandate({ terms: terms({ permittedUses: ['commercial-use', 'display'] }) }));
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'a set must serialize to the same bytes however it was ordered');
  });

  it('keeps an absent executor and an absent rights scope absent through a round trip', () => {
    const { executorRef: _unused, ...withoutExecutor } = terms();
    const roundTripped = deserializeEnterpriseLicenseMandate(serializeEnterpriseLicenseMandate(mandate({ terms: withoutExecutor })));
    assert.equal(roundTripped.terms.executorRef, undefined);
    assert.equal(roundTripped.terms.rightsScope, undefined);
  });

  it('refuses to deserialize an invalid candidate rather than reconstructing a partial authorization', () => {
    expectValidationError('EnterpriseLicenseMandateValidationError', () => deserializeEnterpriseLicenseMandate({ ...mandate(), status: 'terminated' }));
    expectValidationError('EnterpriseLicenseRequestValidationError', () => deserializeEnterpriseLicenseRequest({ ...request(), capability: 'transfer' }));
  });
});

// ---------------------------------------------------------------------------
// Execution and lifecycle evidence validation.
// ---------------------------------------------------------------------------

describe('LICENSE contracts — evidence validation', () => {
  it('requires evidence to record who performed the act and who received the permission', () => {
    const { executedBy: _e, ...noExecutor } = execution();
    assert.ok(codes(validateEnterpriseLicenseExecutionEvidence(noExecutor)).includes('MISSING_EXECUTED_BY'));
    const { licenseeRef: _l, ...noLicensee } = execution();
    assert.ok(codes(validateEnterpriseLicenseExecutionEvidence(noLicensee)).includes('MISSING_LICENSEE_REF'));
  });

  it('refuses evidence of a license that ends before it begins', () => {
    const issues = codes(
      validateEnterpriseLicenseExecutionEvidence(execution({ licenseEffectiveAt: '2026-12-01T00:00:00.000Z', licenseExpiresAt: '2026-02-01T00:00:00.000Z' })),
    );
    assert.ok(issues.includes('LICENSE_EXPIRY_NOT_AFTER_EFFECTIVE'));
  });

  it('accepts every reported lifecycle category and refuses anything else', () => {
    for (const lifecycleType of Object.values(ENTERPRISE_LICENSE_LIFECYCLE_TYPES)) {
      const candidate = {
        schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
        id: 'license-lifecycle-1',
        mandateRef: 'license-mandate-1',
        executionRef: 'license-execution-1',
        reportedBy: 'provider-platform-c',
        occurredAt: '2026-06-01T00:00:00.000Z',
        lifecycleType,
        correlationId: 'lifecycle-correlation-1',
      };
      assert.equal(validateEnterpriseLicenseLifecycleEvidence(candidate).valid, true, `${lifecycleType} must be a recognized report`);
      assert.equal(deserializeEnterpriseLicenseLifecycleEvidence(candidate).lifecycleType, lifecycleType);
    }

    const invalid = validateEnterpriseLicenseLifecycleEvidence({
      schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
      id: 'x',
      mandateRef: 'm',
      executionRef: 'e',
      reportedBy: 'p',
      occurredAt: '2026-06-01T00:00:00.000Z',
      lifecycleType: 'evaporated',
      correlationId: 'c',
    });
    assert.ok(codes(invalid).includes('INVALID_LIFECYCLE_TYPE'));
  });

  it('requires a lifecycle report to name the specific license it ends', () => {
    const issues = codes(
      validateEnterpriseLicenseLifecycleEvidence({
        schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
        id: 'x',
        mandateRef: 'm',
        reportedBy: 'p',
        occurredAt: '2026-06-01T00:00:00.000Z',
        lifecycleType: ENTERPRISE_LICENSE_LIFECYCLE_TYPES.EXPIRED,
        correlationId: 'c',
      }),
    );
    assert.ok(issues.includes('MISSING_EXECUTION_REF'));
  });
});
