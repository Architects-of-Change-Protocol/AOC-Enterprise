import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTERPRISE_ACTIONS_DISTINCT_FROM_COLLATERALIZE,
  ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES,
  ENTERPRISE_COLLATERALIZATION_FULL_BASIS_POINTS,
  ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  ENTERPRISE_COLLATERAL_RELEASE_TYPES,
  deserializeEnterpriseCollateralizationMandate,
  deserializeEnterpriseCollateralizationReleaseEvidence,
  deserializeEnterpriseCollateralizationRequest,
  enterpriseCollateralizationConstraintsWithin,
  enterpriseCollateralizationMandateAuthorizes,
  enterpriseCollateralizationMandateEquals,
  enterpriseCollateralizationScopeSum,
  enterpriseCollateralizationScopeWithin,
  enterpriseCollateralizationTermsWithin,
  enterpriseSecuredAmountWithin,
  isEnterpriseCollateralizeCapability,
  serializeEnterpriseCollateralizationExecutionEvidence,
  serializeEnterpriseCollateralizationMandate,
  serializeEnterpriseCollateralizationRequest,
  validateEnterpriseCollateralizationExecutionEvidence,
  validateEnterpriseCollateralizationMandate,
  validateEnterpriseCollateralizationReleaseEvidence,
  validateEnterpriseCollateralizationRequest,
  type EnterpriseCollateralizationConstraints,
  type EnterpriseCollateralizationExecutionEvidence,
  type EnterpriseCollateralizationMandate,
  type EnterpriseCollateralizationReleaseEvidence,
  type EnterpriseCollateralizationRequest,
  type EnterpriseCollateralizationTerms,
} from '../src/index.js';

const RIGHTS = [ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.REVENUE_RIGHT] as const;

function constraints(overrides: Partial<EnterpriseCollateralizationConstraints> = {}): EnterpriseCollateralizationConstraints {
  return { additionalCollateralizationAllowed: false, ...overrides };
}

function terms(overrides: Partial<EnterpriseCollateralizationTerms> = {}): EnterpriseCollateralizationTerms {
  return {
    rights: [...RIGHTS],
    scope: { kind: 'proportional', basisPoints: 2000 },
    securedObligationRef: 'obligation-001',
    securedPartyRef: 'party-lender-b',
    executorRef: 'provider-c',
    constraints: constraints(),
    ...overrides,
  };
}

function mandate(overrides: Partial<EnterpriseCollateralizationMandate> = {}): EnterpriseCollateralizationMandate {
  return {
    schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
    id: 'collateralization-mandate-1',
    status: 'active',
    asset: { kind: 'asset', id: 'building-a', tenantId: 'org-a' },
    terms: terms(),
    requestRef: 'collateralization-request-1',
    requestedBy: 'actor-steward',
    decisionRef: 'decision-1',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    executorRef: 'provider-c',
    securedObligationRef: 'obligation-001',
    securedPartyRef: 'party-lender-b',
    rights: [...RIGHTS],
    scope: { kind: 'proportional', basisPoints: 2000 } as const,
    at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('COLLATERALIZE action identity', () => {
  it('is a distinct governed action, never confused with its neighbours', () => {
    assert.equal(ENTERPRISE_COLLATERALIZE_CAPABILITY, 'collateralize');
    assert.ok(isEnterpriseCollateralizeCapability('collateralize'));
    assert.equal(isEnterpriseCollateralizeCapability('collateralize.partial'), false, 'never a prefix match');
    for (const other of ENTERPRISE_ACTIONS_DISTINCT_FROM_COLLATERALIZE) {
      assert.notEqual(other, ENTERPRISE_COLLATERALIZE_CAPABILITY);
      assert.equal(isEnterpriseCollateralizeCapability(other), false);
    }
    // The three distinctions the documentation calls out by name.
    for (const neighbour of ['transfer', 'tokenize', 'protocolize'] as const) {
      assert.ok(ENTERPRISE_ACTIONS_DISTINCT_FROM_COLLATERALIZE.includes(neighbour));
    }
  });

  it('refuses a request that names any other action', () => {
    const result = validateEnterpriseCollateralizationRequest({
      schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
      id: 'request-1',
      capability: 'tokenize',
      asset: { kind: 'asset', id: 'building-a' },
      requestedBy: 'actor-steward',
      terms: terms(),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'correlation-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'CAPABILITY_MISMATCH'));
  });
});

describe('scope', () => {
  it('is expressed in integer basis points, never a float', () => {
    assert.equal(ENTERPRISE_COLLATERALIZATION_FULL_BASIS_POINTS, 10_000);
    const fractional = validateEnterpriseCollateralizationMandate(mandate({ terms: terms({ scope: { kind: 'proportional', basisPoints: 20.5 } }) }));
    assert.equal(fractional.valid, false);
    assert.ok(fractional.valid === false && fractional.errors.some((issue) => issue.code === 'INVALID_SCOPE_BASIS_POINTS'));
  });

  it('never compares a proportional share against a unit count', () => {
    assert.equal(
      enterpriseCollateralizationScopeWithin({ kind: 'proportional', basisPoints: 1 }, { kind: 'unitized', units: 10_000, unitDenomination: 'u' }),
      false,
    );
    assert.equal(
      enterpriseCollateralizationScopeWithin({ kind: 'unitized', units: 1, unitDenomination: 'u' }, { kind: 'proportional', basisPoints: 10_000 }),
      false,
    );
  });

  it('never treats units of one denomination as units of another', () => {
    assert.equal(
      enterpriseCollateralizationScopeWithin({ kind: 'unitized', units: 1, unitDenomination: 'a' }, { kind: 'unitized', units: 500, unitDenomination: 'b' }),
      false,
    );
  });

  it('sums commensurable scopes exactly, and refuses to sum incommensurable ones', () => {
    assert.deepEqual(enterpriseCollateralizationScopeSum({ kind: 'proportional', basisPoints: 1500 }, { kind: 'proportional', basisPoints: 1500 }), {
      kind: 'proportional',
      basisPoints: 3000,
    });
    assert.deepEqual(
      enterpriseCollateralizationScopeSum({ kind: 'unitized', units: 3, unitDenomination: 'u' }, { kind: 'unitized', units: 4, unitDenomination: 'u' }),
      { kind: 'unitized', units: 7, unitDenomination: 'u' },
    );
    assert.equal(enterpriseCollateralizationScopeSum({ kind: 'proportional', basisPoints: 1 }, { kind: 'unitized', units: 1, unitDenomination: 'u' }), null);
    assert.equal(
      enterpriseCollateralizationScopeSum({ kind: 'unitized', units: 1, unitDenomination: 'a' }, { kind: 'unitized', units: 1, unitDenomination: 'b' }),
      null,
    );
  });
});

describe('secured amount', () => {
  it('compares exactly within a currency and never converts between currencies', () => {
    assert.ok(enterpriseSecuredAmountWithin({ minorUnits: 100, currency: 'x' }, { minorUnits: 100, currency: 'x' }));
    assert.equal(enterpriseSecuredAmountWithin({ minorUnits: 101, currency: 'x' }, { minorUnits: 100, currency: 'x' }), false);
    assert.equal(
      enterpriseSecuredAmountWithin({ minorUnits: 1, currency: 'y' }, { minorUnits: 1_000_000, currency: 'x' }),
      false,
      'a different currency label is never coerced into a comparison',
    );
  });
});

describe('terms containment', () => {
  it('permits narrowing and refuses widening of scope', () => {
    assert.ok(enterpriseCollateralizationTermsWithin(terms({ scope: { kind: 'proportional', basisPoints: 1000 } }), terms()));
    assert.equal(enterpriseCollateralizationTermsWithin(terms({ scope: { kind: 'proportional', basisPoints: 10_000 } }), terms()), false);
  });

  it('refuses substitution of the secured obligation, the secured party, or the executor', () => {
    assert.equal(enterpriseCollateralizationTermsWithin(terms({ securedObligationRef: 'obligation-002' }), terms()), false);
    assert.equal(enterpriseCollateralizationTermsWithin(terms({ securedPartyRef: 'party-lender-c' }), terms()), false);
    assert.equal(enterpriseCollateralizationTermsWithin(terms({ executorRef: 'provider-d' }), terms()), false);
  });

  it('treats a lower required priority rank as the stricter requirement', () => {
    const outer = constraints({ requiredPriorityRank: 3 });
    assert.ok(enterpriseCollateralizationConstraintsWithin(constraints({ requiredPriorityRank: 1 }), outer));
    assert.equal(enterpriseCollateralizationConstraintsWithin(constraints({ requiredPriorityRank: 4 }), outer), false);
    assert.equal(enterpriseCollateralizationConstraintsWithin(constraints(), outer), false, 'an unrestricted inner is not inside a restricted outer');
  });

  it('refuses to loosen exclusivity, release-evidence, or additional-collateralization limits', () => {
    assert.equal(enterpriseCollateralizationConstraintsWithin(constraints(), constraints({ exclusive: true })), false);
    assert.equal(enterpriseCollateralizationConstraintsWithin(constraints(), constraints({ releaseEvidenceRequired: true })), false);
    assert.equal(
      enterpriseCollateralizationConstraintsWithin(constraints({ additionalCollateralizationAllowed: true }), constraints({ additionalCollateralizationAllowed: false })),
      false,
    );
  });

  it('treats an absent outer allow-list as no restriction and a restricted outer as binding', () => {
    assert.ok(enterpriseCollateralizationConstraintsWithin(constraints({ permittedRegistries: ['r1'] }), constraints()));
    assert.equal(enterpriseCollateralizationConstraintsWithin(constraints(), constraints({ permittedRegistries: ['r1'] })), false);
    assert.equal(
      enterpriseCollateralizationConstraintsWithin(constraints({ permittedRegistries: ['r2'] }), constraints({ permittedRegistries: ['r1'] })),
      false,
    );
  });
});

describe('mandate authorization', () => {
  it('authorizes a conforming exercise', () => {
    assert.deepEqual(enterpriseCollateralizationMandateAuthorizes(mandate(), attempt()), { authorized: true });
  });

  it('refuses a revoked, not-yet-effective, expired, or unreadable-instant exercise', () => {
    const revoked = enterpriseCollateralizationMandateAuthorizes(mandate({ status: 'revoked' }), attempt());
    assert.equal(revoked.authorized, false);
    assert.equal(revoked.authorized === false && revoked.code, 'MANDATE_REVOKED');

    const early = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ at: '2025-12-31T23:59:59.000Z' }));
    assert.equal(early.authorized === false && early.code, 'MANDATE_NOT_YET_EFFECTIVE');

    const late = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ at: '2027-01-01T00:00:00.000Z' }));
    assert.equal(late.authorized === false && late.code, 'MANDATE_EXPIRED');

    // An unparseable instant must be refused outright, never silently
    // compared as NaN into an authorization.
    const unreadable = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ at: 'whenever' }));
    assert.equal(unreadable.authorized === false && unreadable.code, 'INVALID_EXERCISE_INSTANT');
  });

  it('binds the executor, the secured obligation and the secured party independently', () => {
    const wrongExecutor = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ executorRef: 'provider-d' }));
    assert.equal(wrongExecutor.authorized === false && wrongExecutor.code, 'EXECUTOR_NOT_AUTHORIZED');

    const wrongObligation = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ securedObligationRef: 'obligation-002' }));
    assert.equal(wrongObligation.authorized === false && wrongObligation.code, 'SECURED_OBLIGATION_NOT_AUTHORIZED');

    const wrongParty = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ securedPartyRef: 'party-lender-c' }));
    assert.equal(wrongParty.authorized === false && wrongParty.code, 'SECURED_PARTY_NOT_AUTHORIZED');
  });

  it('refuses an exercise that widens scope, and one that names an unauthorized right', () => {
    const wide = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ scope: { kind: 'proportional', basisPoints: 10_000 } }));
    assert.equal(wide.authorized === false && wide.code, 'SCOPE_EXCEEDS_MANDATE');

    const foreign = enterpriseCollateralizationMandateAuthorizes(
      mandate(),
      attempt({ rights: [ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.OWNERSHIP_INTEREST] }),
    );
    assert.equal(foreign.authorized === false && foreign.code, 'RIGHTS_NOT_AUTHORIZED');

    const none = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ rights: [] }));
    assert.equal(none.authorized === false && none.code, 'RIGHTS_NOT_AUTHORIZED');
  });

  it('refuses a second commitment that would exceed the authorized scope cumulatively', () => {
    const divisible = mandate({ terms: terms({ constraints: constraints({ additionalCollateralizationAllowed: true }) }) });

    // 15% on its own is inside 20% ...
    const first = enterpriseCollateralizationMandateAuthorizes(divisible, attempt({ scope: { kind: 'proportional', basisPoints: 1500 } }));
    assert.deepEqual(first, { authorized: true });

    // ... but not once 15% has already been committed.
    const second = enterpriseCollateralizationMandateAuthorizes(
      divisible,
      attempt({
        scope: { kind: 'proportional', basisPoints: 1500 },
        alreadyCommittedScope: { kind: 'proportional', basisPoints: 1500 },
        priorExecutionCount: 1,
      }),
    );
    assert.equal(second.authorized === false && second.code, 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE');

    // A commitment that exactly fills the remaining headroom is still allowed.
    const exact = enterpriseCollateralizationMandateAuthorizes(
      divisible,
      attempt({
        scope: { kind: 'proportional', basisPoints: 500 },
        alreadyCommittedScope: { kind: 'proportional', basisPoints: 1500 },
        priorExecutionCount: 1,
      }),
    );
    assert.deepEqual(exact, { authorized: true });
  });

  it('refuses a repeat exercise when additional collateralization is prohibited', () => {
    const repeat = enterpriseCollateralizationMandateAuthorizes(mandate(), attempt({ priorExecutionCount: 1 }));
    assert.equal(repeat.authorized === false && repeat.code, 'ADDITIONAL_COLLATERALIZATION_PROHIBITED');
  });

  it('enforces the declared secured-amount ceiling, and refuses an unreported amount rather than assuming zero', () => {
    const capped = mandate({ terms: terms({ constraints: constraints({ maximumSecuredAmount: { minorUnits: 1000, currency: 'x' } }) }) });

    assert.deepEqual(enterpriseCollateralizationMandateAuthorizes(capped, attempt({ securedAmount: { minorUnits: 1000, currency: 'x' } })), {
      authorized: true,
    });

    const over = enterpriseCollateralizationMandateAuthorizes(capped, attempt({ securedAmount: { minorUnits: 1001, currency: 'x' } }));
    assert.equal(over.authorized === false && over.code, 'SECURED_AMOUNT_EXCEEDS_MANDATE');

    const otherCurrency = enterpriseCollateralizationMandateAuthorizes(capped, attempt({ securedAmount: { minorUnits: 1, currency: 'y' } }));
    assert.equal(otherCurrency.authorized === false && otherCurrency.code, 'SECURED_AMOUNT_EXCEEDS_MANDATE');

    const unreported = enterpriseCollateralizationMandateAuthorizes(capped, attempt());
    assert.equal(unreported.authorized === false && unreported.code, 'SECURED_AMOUNT_EXCEEDS_MANDATE');
  });

  it('enforces declared registry, jurisdiction and priority limits against what the external system reports', () => {
    const restricted = mandate({
      terms: terms({
        constraints: constraints({ permittedRegistries: ['r1'], permittedJurisdictions: ['j1'], requiredPriorityRank: 1 }),
      }),
    });

    const conforming = attempt({ externalRegistry: 'r1', jurisdiction: 'j1', priorityRank: 1 });
    assert.deepEqual(enterpriseCollateralizationMandateAuthorizes(restricted, conforming), { authorized: true });

    const wrongRegistry = enterpriseCollateralizationMandateAuthorizes(restricted, attempt({ ...conforming, externalRegistry: 'r2' }));
    assert.equal(wrongRegistry.authorized === false && wrongRegistry.code, 'REGISTRY_NOT_PERMITTED');

    const wrongJurisdiction = enterpriseCollateralizationMandateAuthorizes(restricted, attempt({ ...conforming, jurisdiction: 'j2' }));
    assert.equal(wrongJurisdiction.authorized === false && wrongJurisdiction.code, 'JURISDICTION_NOT_PERMITTED');

    const tooJunior = enterpriseCollateralizationMandateAuthorizes(restricted, attempt({ ...conforming, priorityRank: 2 }));
    assert.equal(tooJunior.authorized === false && tooJunior.code, 'PRIORITY_RANK_NOT_AUTHORIZED');
  });
});

describe('mandate contract', () => {
  it('requires a decision reference — a mandate can only exist because a decision produced it', () => {
    const orphan = { ...mandate() } as Record<string, unknown>;
    delete orphan.decisionRef;
    const result = validateEnterpriseCollateralizationMandate(orphan);
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'MISSING_DECISION_REF'));
  });

  it('has exactly two stored statuses, and no released/discharged state', () => {
    for (const status of ['released', 'discharged', 'expired', 'consumed']) {
      const result = validateEnterpriseCollateralizationMandate(mandate({ status: status as 'active' }));
      assert.equal(result.valid, false, `'${status}' must not be a representable mandate status`);
      assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'INVALID_STATUS'));
    }
  });

  it('round-trips deterministically through serialize/deserialize', () => {
    const original = mandate({
      terms: terms({
        constraints: constraints({
          maximumSecuredAmount: { minorUnits: 500, currency: 'unit-alpha' },
          permittedRegistries: ['r2', 'r1'],
          permittedJurisdictions: ['j1'],
          requiredPriorityRank: 2,
          exclusive: true,
          releaseEvidenceRequired: true,
        }),
        securedObligationKind: 'credit-facility',
      }),
      approvalRefs: ['approval-2', 'approval-1'],
      obligationRefs: ['obligation-ref-1'],
      evidenceRefs: ['evidence-1'],
      auditRefs: ['audit-1'],
      evaluationRef: 'evaluation-1',
      issuerRef: 'issuer-1',
    });

    const serialized = serializeEnterpriseCollateralizationMandate(original);
    const restored = deserializeEnterpriseCollateralizationMandate(serialized);

    assert.ok(enterpriseCollateralizationMandateEquals(original, restored));
    assert.deepEqual(serializeEnterpriseCollateralizationMandate(restored), serialized, 'serialization must be stable across a round trip');
    assert.deepEqual(serialized.terms.constraints.permittedRegistries, ['r1', 'r2'], 'label lists serialize in a deterministic order');
  });
});

describe('request contract', () => {
  it('cannot express "collateralize the asset" — rights must be named', () => {
    const result = validateEnterpriseCollateralizationRequest({
      schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
      id: 'request-1',
      capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      asset: { kind: 'asset', id: 'building-a' },
      requestedBy: 'actor-steward',
      terms: terms({ rights: [] }),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'correlation-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'EMPTY_RIGHTS'));
  });

  it('requires the secured obligation and the secured party to be named', () => {
    for (const [field, code] of [
      ['securedObligationRef', 'MISSING_SECURED_OBLIGATION_REF'],
      ['securedPartyRef', 'MISSING_SECURED_PARTY_REF'],
    ] as const) {
      const incomplete = { ...terms() } as Record<string, unknown>;
      delete incomplete[field];
      const result = validateEnterpriseCollateralizationRequest({
        schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
        id: 'request-1',
        capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
        asset: { kind: 'asset', id: 'building-a' },
        requestedBy: 'actor-steward',
        terms: incomplete,
        requestedAt: '2026-01-01T00:00:00.000Z',
        correlationId: 'correlation-1',
      });
      assert.equal(result.valid, false);
      assert.ok(result.valid === false && result.errors.some((issue) => issue.code === code));
    }
  });

  it('requires an explicit answer on whether it may be exercised more than once', () => {
    const bare = { ...constraints() } as Record<string, unknown>;
    delete bare.additionalCollateralizationAllowed;
    const result = validateEnterpriseCollateralizationRequest({
      schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
      id: 'request-1',
      capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      asset: { kind: 'asset', id: 'building-a' },
      requestedBy: 'actor-steward',
      terms: { ...terms(), constraints: bare },
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'correlation-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'MISSING_ADDITIONAL_COLLATERALIZATION_ALLOWED'));
  });

  it('round-trips deterministically', () => {
    const request: EnterpriseCollateralizationRequest = {
      schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
      id: 'request-1',
      capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      asset: { kind: 'asset', id: 'building-a', tenantId: 'org-a', attributes: { b: '2', a: '1' } },
      requestedBy: 'actor-steward',
      terms: terms(),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'correlation-1',
      requestedExpiresAt: '2026-07-01T00:00:00.000Z',
      justification: 'facility drawdown',
      evidenceRefs: ['evidence-2', 'evidence-1'],
    };
    const serialized = serializeEnterpriseCollateralizationRequest(request);
    const restored = deserializeEnterpriseCollateralizationRequest(serialized);
    assert.deepEqual(serializeEnterpriseCollateralizationRequest(restored), serialized);
    assert.deepEqual(Object.keys(serialized.asset.attributes ?? {}), ['a', 'b'], 'attributes serialize in a deterministic order');
  });
});

describe('execution evidence contract', () => {
  const evidence: EnterpriseCollateralizationExecutionEvidence = {
    schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
    id: 'execution-1',
    mandateRef: 'collateralization-mandate-1',
    executorRef: 'provider-c',
    executedAt: '2026-02-01T00:00:00.000Z',
    securedObligationRef: 'obligation-001',
    securedPartyRef: 'party-lender-b',
    committedScope: { kind: 'proportional', basisPoints: 2000 },
    rights: [...RIGHTS],
    correlationId: 'correlation-1',
    securedAmount: { minorUnits: 1000, currency: 'unit-alpha' },
    externalSystem: 'platform-c',
    externalRegistry: 'registry-alpha',
    externalAgreementReference: 'agreement-1',
    externalFilingReference: 'filing-1',
    jurisdiction: 'jurisdiction-a',
    priorityRank: 1,
  };

  it('records which obligation and which party the arrangement served', () => {
    assert.equal(validateEnterpriseCollateralizationExecutionEvidence(evidence).valid, true);
    for (const field of ['securedObligationRef', 'securedPartyRef'] as const) {
      const incomplete = { ...evidence } as Record<string, unknown>;
      delete incomplete[field];
      assert.equal(validateEnterpriseCollateralizationExecutionEvidence(incomplete).valid, false);
    }
  });

  it('round-trips deterministically', () => {
    const serialized = serializeEnterpriseCollateralizationExecutionEvidence(evidence);
    assert.deepEqual(serialized.rights, [...RIGHTS].sort());
    assert.deepEqual(serialized.securedAmount, { minorUnits: 1000, currency: 'unit-alpha' });
  });
});

describe('release evidence contract', () => {
  const release: EnterpriseCollateralizationReleaseEvidence = {
    schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
    id: 'release-1',
    mandateRef: 'collateralization-mandate-1',
    executionRef: 'execution-1',
    reportedBy: 'provider-c',
    releasedAt: '2026-03-01T00:00:00.000Z',
    releaseType: ENTERPRISE_COLLATERAL_RELEASE_TYPES.DISCHARGED,
    correlationId: 'correlation-1',
    externalReleaseReference: 'discharge-1',
  };

  it('always references the specific arrangement it ends', () => {
    assert.equal(validateEnterpriseCollateralizationReleaseEvidence(release).valid, true);
    const unanchored = { ...release } as Record<string, unknown>;
    delete unanchored.executionRef;
    const result = validateEnterpriseCollateralizationReleaseEvidence(unanchored);
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'MISSING_EXECUTION_REF'));
  });

  it('records only the reported category, and refuses an unrecognized one', () => {
    for (const type of Object.values(ENTERPRISE_COLLATERAL_RELEASE_TYPES)) {
      assert.equal(validateEnterpriseCollateralizationReleaseEvidence({ ...release, releaseType: type }).valid, true);
    }
    const result = validateEnterpriseCollateralizationReleaseEvidence({ ...release, releaseType: 'foreclosed' });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'INVALID_RELEASE_TYPE'));
  });

  it('round-trips deterministically', () => {
    const restored = deserializeEnterpriseCollateralizationReleaseEvidence({ ...release });
    assert.deepEqual(restored, release);
  });
});
