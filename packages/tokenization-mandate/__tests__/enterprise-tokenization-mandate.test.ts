import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTERPRISE_CAPABILITIES_DISTINCT_FROM_TOKENIZE,
  ENTERPRISE_TOKENIZATION_FULL_BASIS_POINTS,
  ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
  ENTERPRISE_TOKENIZED_RIGHT_TYPES,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  enterpriseTokenizationConstraintsWithin,
  enterpriseTokenizationScopeWithin,
  enterpriseTokenizationTermsWithin,
  isEnterpriseTokenizeCapability,
  type EnterpriseTokenizationTerms,
} from '../src/enterprise-tokenization-terms.js';
import {
  EnterpriseTokenizationRequestValidationError,
  deserializeEnterpriseTokenizationRequest,
  enterpriseTokenizationRequestEquals,
  enterpriseTokenizationRequestIdentityEquals,
  serializeEnterpriseTokenizationRequest,
  validateEnterpriseTokenizationRequest,
  type EnterpriseTokenizationRequest,
} from '../src/enterprise-tokenization-request.js';
import {
  EnterpriseTokenizationMandateValidationError,
  deserializeEnterpriseTokenizationMandate,
  enterpriseTokenizationMandateAuthorizes,
  enterpriseTokenizationMandateEquals,
  serializeEnterpriseTokenizationMandate,
  validateEnterpriseTokenizationMandate,
  type EnterpriseTokenizationAuthorizationResult,
  type EnterpriseTokenizationMandate,
  type EnterpriseTokenizationRefusalCode,
} from '../src/enterprise-tokenization-mandate.js';
import {
  deserializeEnterpriseTokenizationExecutionEvidence,
  enterpriseTokenizationExecutionEvidenceEquals,
  serializeEnterpriseTokenizationExecutionEvidence,
  validateEnterpriseTokenizationExecutionEvidence,
  type EnterpriseTokenizationExecutionEvidence,
} from '../src/enterprise-tokenization-execution.js';

/** The `node:assert/strict` shim this repository types against exposes only `throws(fn, message?)`, so typed-error assertions capture and inspect the thrown value directly. */
function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

const ECONOMIC = ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST;
const REVENUE = ENTERPRISE_TOKENIZED_RIGHT_TYPES.REVENUE_RIGHT;
const OWNERSHIP = ENTERPRISE_TOKENIZED_RIGHT_TYPES.OWNERSHIP_INTEREST;

function makeTerms(overrides: Partial<EnterpriseTokenizationTerms> = {}): EnterpriseTokenizationTerms {
  return {
    rights: [ECONOMIC, REVENUE],
    scope: { kind: 'proportional', basisPoints: 2000 },
    executorRef: 'provider-x',
    constraints: {
      maximumIssuedUnits: 1_000_000,
      permittedNetworks: ['network-alpha'],
      permittedTokenStandards: ['standard-registry-v1'],
      permittedJurisdictions: ['jurisdiction-a'],
      transferRestricted: true,
      additionalIssuanceAllowed: false,
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<EnterpriseTokenizationRequest> = {}): EnterpriseTokenizationRequest {
  return {
    schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
    id: 'tokenization-request-1',
    capability: ENTERPRISE_TOKENIZE_CAPABILITY,
    asset: { kind: 'asset', id: 'building-a', tenantId: 'tenant-a' },
    requestedBy: 'actor-steward',
    terms: makeTerms(),
    requestedAt: '2026-01-01T00:00:00.000Z',
    correlationId: 'correlation-request-1',
    requestedExpiresAt: '2026-07-01T00:00:00.000Z',
    justification: 'Board resolution 2026-04.',
    evidenceRefs: ['evidence-2', 'evidence-1'],
    ...overrides,
  };
}

function makeMandate(overrides: Partial<EnterpriseTokenizationMandate> = {}): EnterpriseTokenizationMandate {
  return {
    schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
    id: 'tokenization-mandate-1',
    status: 'active',
    asset: { kind: 'asset', id: 'building-a', tenantId: 'tenant-a' },
    terms: makeTerms(),
    requestRef: 'tokenization-request-1',
    requestedBy: 'actor-steward',
    decisionRef: 'decision-1',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'correlation-mandate-1',
    evaluationRef: 'evaluation-1',
    issuerRef: 'enterprise-host-1',
    approvalRefs: ['approval-1'],
    obligationRefs: ['obligation-1'],
    evidenceRefs: ['evidence-1'],
    auditRefs: ['audit-1'],
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<EnterpriseTokenizationExecutionEvidence> = {}): EnterpriseTokenizationExecutionEvidence {
  return {
    schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
    id: 'tokenization-execution-1',
    mandateRef: 'tokenization-mandate-1',
    executorRef: 'provider-x',
    executedAt: '2026-02-01T00:00:00.000Z',
    issuedScope: { kind: 'proportional', basisPoints: 2000 },
    rights: [ECONOMIC, REVENUE],
    correlationId: 'correlation-execution-1',
    issuedUnits: 500_000,
    externalSystem: 'provider-x',
    externalNetwork: 'network-alpha',
    externalTokenStandard: 'standard-registry-v1',
    externalContractReference: 'external-contract-1',
    externalTransactionReference: 'external-tx-1',
    evidenceRefs: ['evidence-9'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Capability distinctness
// ---------------------------------------------------------------------------

describe('TOKENIZE capability identity', () => {
  it('is exactly one capability name and matches nothing else', () => {
    assert.equal(ENTERPRISE_TOKENIZE_CAPABILITY, 'tokenize');
    assert.equal(isEnterpriseTokenizeCapability('tokenize'), true);
    assert.equal(isEnterpriseTokenizeCapability('tokenize.partial'), false);
    assert.equal(isEnterpriseTokenizeCapability('TOKENIZE'), false);
  });

  it('is distinct from every neighbouring governed action, protocolization included', () => {
    for (const other of ENTERPRISE_CAPABILITIES_DISTINCT_FROM_TOKENIZE) {
      assert.notEqual(other, ENTERPRISE_TOKENIZE_CAPABILITY);
      assert.equal(isEnterpriseTokenizeCapability(other), false);
    }
    assert.ok(ENTERPRISE_CAPABILITIES_DISTINCT_FROM_TOKENIZE.includes('protocolize'));
  });

  it('rejects a request that carries any other capability', () => {
    const result = validateEnterpriseTokenizationRequest({ ...makeRequest(), capability: 'protocolize' });
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((issue) => issue.code === 'CAPABILITY_MISMATCH'));
  });
});

// ---------------------------------------------------------------------------
// Scope semantics
// ---------------------------------------------------------------------------

describe('tokenization scope', () => {
  it('expresses shares in exact integer basis points', () => {
    assert.equal(ENTERPRISE_TOKENIZATION_FULL_BASIS_POINTS, 10_000);
    const twentyPercent = { kind: 'proportional', basisPoints: 2000 } as const;
    const whole = { kind: 'proportional', basisPoints: ENTERPRISE_TOKENIZATION_FULL_BASIS_POINTS } as const;
    assert.equal(enterpriseTokenizationScopeWithin(twentyPercent, whole), true);
    assert.equal(enterpriseTokenizationScopeWithin(whole, twentyPercent), false);
  });

  it('rejects a fractional or out-of-range share', () => {
    for (const basisPoints of [0, -1, 10_001, 20.5]) {
      const result = validateEnterpriseTokenizationRequest({ ...makeRequest(), terms: makeTerms({ scope: { kind: 'proportional', basisPoints } }) });
      assert.equal(result.valid, false, `basisPoints ${basisPoints} must be rejected`);
    }
  });

  it('never compares a proportional share against a unit count', () => {
    const proportional = { kind: 'proportional', basisPoints: 2000 } as const;
    const unitized = { kind: 'unitized', units: 2000, unitDenomination: 'entitlement-unit' } as const;
    assert.equal(enterpriseTokenizationScopeWithin(proportional, unitized), false);
    assert.equal(enterpriseTokenizationScopeWithin(unitized, proportional), false);
  });

  it('never treats units of one denomination as units of another', () => {
    const a = { kind: 'unitized', units: 100, unitDenomination: 'square-metre' } as const;
    const b = { kind: 'unitized', units: 500, unitDenomination: 'entitlement-unit' } as const;
    assert.equal(enterpriseTokenizationScopeWithin(a, b), false);
    assert.equal(enterpriseTokenizationScopeWithin(a, { kind: 'unitized', units: 500, unitDenomination: 'square-metre' }), true);
  });
});

// ---------------------------------------------------------------------------
// Terms containment (escalation prevention)
// ---------------------------------------------------------------------------

describe('tokenization terms containment', () => {
  it('accepts terms that narrow what was requested', () => {
    const requested = makeTerms();
    const narrowed = makeTerms({ rights: [ECONOMIC], scope: { kind: 'proportional', basisPoints: 500 } });
    assert.equal(enterpriseTokenizationTermsWithin(narrowed, requested), true);
  });

  it('rejects a widened share, an added right, or a substituted executor', () => {
    const requested = makeTerms();
    assert.equal(enterpriseTokenizationTermsWithin(makeTerms({ scope: { kind: 'proportional', basisPoints: 10_000 } }), requested), false);
    assert.equal(enterpriseTokenizationTermsWithin(makeTerms({ rights: [ECONOMIC, REVENUE, OWNERSHIP] }), requested), false);
    assert.equal(enterpriseTokenizationTermsWithin(makeTerms({ executorRef: 'provider-y' }), requested), false);
  });

  it('rejects constraints that loosen a declared limit', () => {
    const outer = makeTerms().constraints;
    const { maximumIssuedUnits: _max, ...withoutCeiling } = outer;
    const { permittedNetworks: _networks, ...withoutNetworks } = outer;
    assert.equal(enterpriseTokenizationConstraintsWithin({ ...outer, maximumIssuedUnits: 2_000_000 }, outer), false);
    assert.equal(enterpriseTokenizationConstraintsWithin(withoutCeiling, outer), false);
    assert.equal(enterpriseTokenizationConstraintsWithin({ ...outer, permittedNetworks: ['network-beta'] }, outer), false);
    assert.equal(enterpriseTokenizationConstraintsWithin(withoutNetworks, outer), false);
    assert.equal(enterpriseTokenizationConstraintsWithin({ ...outer, transferRestricted: false }, outer), false);
    assert.equal(enterpriseTokenizationConstraintsWithin({ ...outer, additionalIssuanceAllowed: true }, outer), false);
  });

  it('treats an absent outer allow-list as declaring no restriction', () => {
    const outer = { additionalIssuanceAllowed: true } as const;
    assert.equal(enterpriseTokenizationConstraintsWithin({ permittedNetworks: ['network-beta'], additionalIssuanceAllowed: true }, outer), true);
    assert.equal(enterpriseTokenizationConstraintsWithin({ additionalIssuanceAllowed: false }, outer), true);
  });
});

// ---------------------------------------------------------------------------
// Request contract
// ---------------------------------------------------------------------------

describe('EnterpriseTokenizationRequest', () => {
  it('validates a complete and a minimal request', () => {
    assert.equal(validateEnterpriseTokenizationRequest(makeRequest()).valid, true);
    const minimal: EnterpriseTokenizationRequest = {
      schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
      id: 'tokenization-request-min',
      capability: ENTERPRISE_TOKENIZE_CAPABILITY,
      asset: { kind: 'asset', id: 'artwork-7' },
      requestedBy: 'actor-owner',
      terms: { rights: [ECONOMIC], scope: { kind: 'unitized', units: 10, unitDenomination: 'entitlement-unit' }, executorRef: 'provider-y', constraints: { additionalIssuanceAllowed: true } },
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'correlation-min',
    };
    assert.equal(validateEnterpriseTokenizationRequest(minimal).valid, true);
  });

  it('rejects a request that names no rights, duplicates a right, or omits the issuance decision', () => {
    for (const [terms, expected] of [
      [makeTerms({ rights: [] }), 'EMPTY_RIGHTS'],
      [makeTerms({ rights: [ECONOMIC, ECONOMIC] }), 'DUPLICATE_RIGHTS'],
    ] as const) {
      const result = validateEnterpriseTokenizationRequest({ ...makeRequest(), terms });
      assert.equal(result.valid, false);
      assert.ok(!result.valid && result.errors.some((issue) => issue.code === expected));
    }

    const noDecision = validateEnterpriseTokenizationRequest({
      ...makeRequest(),
      terms: { ...makeTerms(), constraints: { maximumIssuedUnits: 10 } },
    });
    assert.equal(noDecision.valid, false);
    assert.ok(!noDecision.valid && noDecision.errors.some((issue) => issue.code === 'MISSING_ADDITIONAL_ISSUANCE_ALLOWED'));
  });

  it('round-trips through serialization deterministically', () => {
    const request = makeRequest();
    const serialized = serializeEnterpriseTokenizationRequest(request);
    assert.deepEqual(serialized.evidenceRefs, ['evidence-1', 'evidence-2']);
    assert.deepEqual(JSON.parse(JSON.stringify(serialized)), JSON.parse(JSON.stringify(serializeEnterpriseTokenizationRequest(deserializeEnterpriseTokenizationRequest(serialized)))));
    assert.equal(enterpriseTokenizationRequestEquals(request, deserializeEnterpriseTokenizationRequest(serialized)), true);
  });

  it('throws a typed error carrying every issue when deserializing invalid input', () => {
    const error = captureThrown(() => deserializeEnterpriseTokenizationRequest({ schemaVersion: '9.9.9' }));
    if (!(error instanceof EnterpriseTokenizationRequestValidationError)) throw new Error(`expected a validation error, received ${String(error)}`);
    assert.ok(error.issues.length > 1, 'the error must carry every issue, not just the first');
  });

  it('distinguishes identity from full equality', () => {
    const a = makeRequest();
    const b = makeRequest({ justification: 'A corrected justification recorded later.' });
    assert.equal(enterpriseTokenizationRequestIdentityEquals(a, b), true);
    assert.equal(enterpriseTokenizationRequestEquals(a, b), false);
  });
});

// ---------------------------------------------------------------------------
// Mandate contract
// ---------------------------------------------------------------------------

describe('EnterpriseTokenizationMandate', () => {
  it('validates a complete mandate and round-trips deterministically', () => {
    const mandate = makeMandate();
    assert.equal(validateEnterpriseTokenizationMandate(mandate).valid, true);
    const restored = deserializeEnterpriseTokenizationMandate(serializeEnterpriseTokenizationMandate(mandate));
    assert.equal(enterpriseTokenizationMandateEquals(mandate, restored), true);
  });

  it('requires a decision reference — a mandate cannot exist without the decision that produced it', () => {
    const { decisionRef: _decisionRef, ...withoutDecision } = makeMandate();
    const result = validateEnterpriseTokenizationMandate(withoutDecision);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((issue) => issue.code === 'MISSING_DECISION_REF'));
  });

  it('requires an expiry strictly after its effective instant', () => {
    const result = validateEnterpriseTokenizationMandate(makeMandate({ expiresAt: '2026-01-01T00:00:00.000Z' }));
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((issue) => issue.code === 'EXPIRY_NOT_AFTER_EFFECTIVE_FROM'));
  });

  it('admits only the two-state issuance lifecycle', () => {
    for (const status of ['expired', 'consumed', 'superseded', 'pending']) {
      const result = validateEnterpriseTokenizationMandate({ ...makeMandate(), status });
      assert.equal(result.valid, false, `'${status}' must not be a stored mandate status`);
    }
    assert.equal(validateEnterpriseTokenizationMandate(makeMandate({ status: 'revoked' })).valid, true);
    const error = captureThrown(() => deserializeEnterpriseTokenizationMandate({ ...serializeEnterpriseTokenizationMandate(makeMandate()), status: 'expired' }));
    assert.ok(error instanceof EnterpriseTokenizationMandateValidationError);
  });

  it('authorizes an exercise that stays inside every dimension of the mandate', () => {
    const result = enterpriseTokenizationMandateAuthorizes(makeMandate(), {
      executorRef: 'provider-x',
      rights: [ECONOMIC],
      scope: { kind: 'proportional', basisPoints: 1000 },
      at: '2026-02-01T00:00:00.000Z',
      issuingUnits: 400_000,
    });
    assert.deepEqual(result, { authorized: true });
  });

  it('derives every state the status vocabulary deliberately omits', () => {
    const mandate = makeMandate();
    const base = { executorRef: 'provider-x', rights: [ECONOMIC], scope: { kind: 'proportional', basisPoints: 1000 } } as const;

    const refusals: readonly (readonly [EnterpriseTokenizationRefusalCode, EnterpriseTokenizationAuthorizationResult])[] = [
      ['MANDATE_REVOKED', enterpriseTokenizationMandateAuthorizes(makeMandate({ status: 'revoked' }), { ...base, at: '2026-02-01T00:00:00.000Z' })],
      ['MANDATE_NOT_YET_EFFECTIVE', enterpriseTokenizationMandateAuthorizes(mandate, { ...base, at: '2025-12-01T00:00:00.000Z' })],
      ['MANDATE_EXPIRED', enterpriseTokenizationMandateAuthorizes(mandate, { ...base, at: '2027-01-01T00:00:00.000Z' })],
      ['EXECUTOR_NOT_AUTHORIZED', enterpriseTokenizationMandateAuthorizes(mandate, { ...base, executorRef: 'provider-y', at: '2026-02-01T00:00:00.000Z' })],
      ['RIGHTS_NOT_AUTHORIZED', enterpriseTokenizationMandateAuthorizes(mandate, { ...base, rights: [OWNERSHIP], at: '2026-02-01T00:00:00.000Z' })],
      ['SCOPE_EXCEEDS_MANDATE', enterpriseTokenizationMandateAuthorizes(mandate, { ...base, scope: { kind: 'proportional', basisPoints: 9000 }, at: '2026-02-01T00:00:00.000Z' })],
      ['ADDITIONAL_ISSUANCE_PROHIBITED', enterpriseTokenizationMandateAuthorizes(mandate, { ...base, at: '2026-02-01T00:00:00.000Z', priorExecutionCount: 1 })],
      [
        'MAXIMUM_ISSUANCE_EXCEEDED',
        enterpriseTokenizationMandateAuthorizes(mandate, { ...base, at: '2026-02-01T00:00:00.000Z', alreadyIssuedUnits: 900_000, issuingUnits: 200_000 }),
      ],
    ];

    for (const [expected, result] of refusals) {
      if (result.authorized) throw new Error(`expected ${expected} to be refused`);
      assert.equal(result.code, expected);
    }
  });

  it('refuses an unreadable exercise instant rather than comparing against NaN', () => {
    const result = enterpriseTokenizationMandateAuthorizes(makeMandate(), {
      executorRef: 'provider-x',
      rights: [ECONOMIC],
      scope: { kind: 'proportional', basisPoints: 1000 },
      at: 'not-a-timestamp',
    });
    if (result.authorized) throw new Error('an unreadable instant must never authorize an exercise');
    assert.equal(result.code, 'INVALID_EXERCISE_INSTANT');
  });

  it('permits a second issuance when the mandate allows additional issuance', () => {
    const mandate = makeMandate({ terms: makeTerms({ constraints: { ...makeTerms().constraints, additionalIssuanceAllowed: true } }) });
    const result = enterpriseTokenizationMandateAuthorizes(mandate, {
      executorRef: 'provider-x',
      rights: [ECONOMIC],
      scope: { kind: 'proportional', basisPoints: 1000 },
      at: '2026-02-01T00:00:00.000Z',
      priorExecutionCount: 3,
    });
    assert.equal(result.authorized, true);
  });
});

// ---------------------------------------------------------------------------
// Execution evidence contract
// ---------------------------------------------------------------------------

describe('EnterpriseTokenizationExecutionEvidence', () => {
  it('validates a complete record and round-trips deterministically', () => {
    const evidence = makeEvidence();
    assert.equal(validateEnterpriseTokenizationExecutionEvidence(evidence).valid, true);
    const restored = deserializeEnterpriseTokenizationExecutionEvidence(serializeEnterpriseTokenizationExecutionEvidence(evidence));
    assert.equal(enterpriseTokenizationExecutionEvidenceEquals(evidence, restored), true);
  });

  it('validates a record from an external system that reports no chain-shaped identifiers at all', () => {
    const evidence: EnterpriseTokenizationExecutionEvidence = {
      schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
      id: 'tokenization-execution-2',
      mandateRef: 'tokenization-mandate-1',
      executorRef: 'transfer-agent-1',
      executedAt: '2026-02-01T00:00:00.000Z',
      issuedScope: { kind: 'unitized', units: 40, unitDenomination: 'entitlement-unit' },
      rights: [ECONOMIC],
      correlationId: 'correlation-execution-2',
    };
    assert.equal(validateEnterpriseTokenizationExecutionEvidence(evidence).valid, true);
  });

  it('requires a mandate reference so no issuance evidence can float free of its authorization', () => {
    const { mandateRef: _mandateRef, ...withoutMandate } = makeEvidence();
    const result = validateEnterpriseTokenizationExecutionEvidence(withoutMandate);
    assert.equal(result.valid, false);
    assert.ok(!result.valid && result.errors.some((issue) => issue.code === 'MISSING_MANDATE_REF'));
  });

  it('rejects a non-positive or fractional issued unit count', () => {
    for (const issuedUnits of [0, -5, 1.5]) {
      const result = validateEnterpriseTokenizationExecutionEvidence({ ...makeEvidence(), issuedUnits });
      assert.equal(result.valid, false, `issuedUnits ${issuedUnits} must be rejected`);
    }
  });
});
