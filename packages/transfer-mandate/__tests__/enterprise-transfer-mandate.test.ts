import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ENTERPRISE_ACTIONS_DISTINCT_FROM_TRANSFER,
  ENTERPRISE_TRANSFERABLE_RIGHT_TYPES,
  ENTERPRISE_TRANSFER_CAPABILITY,
  ENTERPRISE_TRANSFER_FULL_BASIS_POINTS,
  ENTERPRISE_TRANSFER_LIFECYCLE_TYPES,
  ENTERPRISE_TRANSFER_SCHEMA_VERSION,
  deserializeEnterpriseTransferExecutionEvidence,
  deserializeEnterpriseTransferLifecycleEvidence,
  deserializeEnterpriseTransferMandate,
  deserializeEnterpriseTransferRequest,
  enterpriseTransferMandateAuthorizes,
  enterpriseTransferMandateEquals,
  enterpriseTransferScopeSum,
  enterpriseTransferScopeWithin,
  enterpriseTransferTermsEquals,
  enterpriseTransferTermsWithin,
  isEnterpriseTransferCapability,
  serializeEnterpriseTransferExecutionEvidence,
  serializeEnterpriseTransferLifecycleEvidence,
  serializeEnterpriseTransferMandate,
  serializeEnterpriseTransferRequest,
  serializeEnterpriseTransferTerms,
  validateEnterpriseTransferExecutionEvidence,
  validateEnterpriseTransferLifecycleEvidence,
  validateEnterpriseTransferMandate,
  validateEnterpriseTransferRequest,
} from '../src/index.js';
import type {
  EnterpriseTransferExecutionEvidence,
  EnterpriseTransferLifecycleEvidence,
  EnterpriseTransferMandate,
  EnterpriseTransferRequest,
  EnterpriseTransferTerms,
} from '../src/index.js';

const ASSET = { kind: 'asset', id: 'digital-asset-a', tenantId: 'org-a' } as const;

function terms(overrides: Partial<EnterpriseTransferTerms> = {}): EnterpriseTransferTerms {
  return {
    rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
    transferorRef: 'party-a',
    transfereeRef: 'party-b',
    scope: { kind: 'proportional', basisPoints: 2500 },
    executorRef: 'provider-c',
    constraints: {
      partialTransferAllowed: false,
      onwardTransferAllowed: 'prohibited',
      recipientAcceptanceRequired: true,
      permittedRegistries: ['registry-alpha'],
    },
    ...overrides,
  };
}

function mandate(overrides: Partial<EnterpriseTransferMandate> = {}): EnterpriseTransferMandate {
  return {
    schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
    id: 'transfer-mandate-1',
    status: 'active',
    asset: ASSET,
    terms: terms(),
    requestRef: 'transfer-request-1',
    requestedBy: 'actor-manager',
    decisionRef: 'decision-1',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

function attempt(overrides: Record<string, unknown> = {}) {
  const merged: Record<string, unknown> = {
    executedBy: 'provider-c',
    transferorRef: 'party-a',
    transfereeRef: 'party-b',
    rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
    scope: { kind: 'proportional', basisPoints: 2500 },
    at: '2026-02-01T00:00:00.000Z',
    registry: 'registry-alpha',
    hasRecipientAcceptance: true,
    ...overrides,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as unknown as Parameters<typeof enterpriseTransferMandateAuthorizes>[1];
}

describe('TRANSFER vocabulary', () => {
  it('names TRANSFER as a distinct governed action and never matches a prefix', () => {
    assert.equal(ENTERPRISE_TRANSFER_CAPABILITY, 'transfer');
    assert.equal(isEnterpriseTransferCapability('transfer'), true);
    assert.equal(isEnterpriseTransferCapability('transfer.partial'), false);
    assert.equal(isEnterpriseTransferCapability('TRANSFER'), false);
    for (const other of ['license', 'tokenize', 'collateralize', 'protocolize', 'access']) {
      assert.ok(ENTERPRISE_ACTIONS_DISTINCT_FROM_TRANSFER.includes(other as never), `${other} must be recorded as a different action`);
    }
  });

  it('carries the same five governed-right categories as the sibling actions', () => {
    assert.deepEqual(Object.values(ENTERPRISE_TRANSFERABLE_RIGHT_TYPES).sort(), [
      'contractual-claim',
      'economic-interest',
      'ownership-interest',
      'revenue-right',
      'usage-right',
    ]);
  });

  it('names no reversal action of its own', () => {
    for (const deferred of ['reverse-transfer', 'rescind-transfer', 'return']) {
      assert.ok(ENTERPRISE_ACTIONS_DISTINCT_FROM_TRANSFER.includes(deferred as never));
    }
  });
});

describe('TRANSFER scope arithmetic', () => {
  it('uses exact integers, never floating point', () => {
    assert.equal(ENTERPRISE_TRANSFER_FULL_BASIS_POINTS, 10_000);
    const sum = enterpriseTransferScopeSum({ kind: 'proportional', basisPoints: 1000 }, { kind: 'proportional', basisPoints: 1500 });
    assert.deepEqual(sum, { kind: 'proportional', basisPoints: 2500 });
  });

  it('refuses to sum or compare incommensurable scopes rather than coercing them', () => {
    assert.equal(enterpriseTransferScopeSum({ kind: 'proportional', basisPoints: 1000 }, { kind: 'unitized', units: 1, unitDenomination: 'u' }), null);
    assert.equal(
      enterpriseTransferScopeSum({ kind: 'unitized', units: 1, unitDenomination: 'seat' }, { kind: 'unitized', units: 1, unitDenomination: 'unit' }),
      null,
    );
    assert.equal(enterpriseTransferScopeWithin({ kind: 'unitized', units: 1, unitDenomination: 'u' }, { kind: 'proportional', basisPoints: 10_000 }), false);
    assert.equal(
      enterpriseTransferScopeWithin({ kind: 'unitized', units: 1, unitDenomination: 'seat' }, { kind: 'unitized', units: 10, unitDenomination: 'unit' }),
      false,
    );
  });
});

describe('TRANSFER terms containment', () => {
  it('permits narrowing the portion and refuses widening it', () => {
    const outer = terms();
    assert.equal(enterpriseTransferTermsWithin({ ...outer, scope: { kind: 'proportional', basisPoints: 1000 } }, outer), true);
    assert.equal(enterpriseTransferTermsWithin({ ...outer, scope: { kind: 'proportional', basisPoints: 5000 } }, outer), false);
  });

  it('refuses to substitute either party or the bound executor, in either direction', () => {
    const outer = terms();
    assert.equal(enterpriseTransferTermsWithin({ ...outer, transferorRef: 'party-x' }, outer), false);
    assert.equal(enterpriseTransferTermsWithin({ ...outer, transfereeRef: 'party-x' }, outer), false);
    assert.equal(enterpriseTransferTermsWithin({ ...outer, executorRef: 'provider-x' }, outer), false);
  });

  it('refuses to loosen a constraint, and permits tightening one', () => {
    const outer = terms();
    assert.equal(
      enterpriseTransferTermsWithin({ ...outer, constraints: { ...outer.constraints, partialTransferAllowed: true } }, outer),
      false,
      'a mandate may not permit partiality the request did not',
    );
    assert.equal(
      enterpriseTransferTermsWithin({ ...outer, constraints: { ...outer.constraints, onwardTransferAllowed: 'permitted' } }, outer),
      false,
    );
    assert.equal(
      enterpriseTransferTermsWithin({ ...outer, constraints: { ...outer.constraints, recipientAcceptanceRequired: false } }, outer),
      false,
      'a mandate may demand more evidence than was requested, never less',
    );
    assert.equal(
      enterpriseTransferTermsWithin({ ...outer, constraints: { ...outer.constraints, considerationEvidenceRequired: true } }, outer),
      true,
    );
  });
});

describe('TRANSFER mandate authorization', () => {
  it('authorizes a conforming movement', () => {
    assert.deepEqual(enterpriseTransferMandateAuthorizes(mandate(), attempt()), { authorized: true });
  });

  it('refuses a revoked, not-yet-effective, expired or unreadable-instant exercise', () => {
    assert.equal(enterpriseTransferMandateAuthorizes(mandate({ status: 'revoked' }), attempt()).authorized, false);
    const early = enterpriseTransferMandateAuthorizes(mandate(), attempt({ at: '2025-01-01T00:00:00.000Z' }));
    assert.equal(early.authorized === false && early.code, 'MANDATE_NOT_YET_EFFECTIVE');
    const late = enterpriseTransferMandateAuthorizes(mandate(), attempt({ at: '2027-01-01T00:00:00.000Z' }));
    assert.equal(late.authorized === false && late.code, 'MANDATE_EXPIRED');
    // An unreadable instant must be refused rather than compared: every window
    // check would silently evaluate false against NaN and let it through.
    const unreadable = enterpriseTransferMandateAuthorizes(mandate(), attempt({ at: 'not-a-time' }));
    assert.equal(unreadable.authorized === false && unreadable.code, 'INVALID_EXERCISE_INSTANT');
  });

  it('binds the transferor, the transferee and any bound executor', () => {
    const wrongSource = enterpriseTransferMandateAuthorizes(mandate(), attempt({ transferorRef: 'party-x' }));
    assert.equal(wrongSource.authorized === false && wrongSource.code, 'TRANSFEROR_NOT_AUTHORIZED');
    const wrongRecipient = enterpriseTransferMandateAuthorizes(mandate(), attempt({ transfereeRef: 'party-x' }));
    assert.equal(wrongRecipient.authorized === false && wrongRecipient.code, 'TRANSFEREE_NOT_AUTHORIZED');
    const wrongExecutor = enterpriseTransferMandateAuthorizes(mandate(), attempt({ executedBy: 'provider-x' }));
    assert.equal(wrongExecutor.authorized === false && wrongExecutor.code, 'EXECUTOR_NOT_AUTHORIZED');
  });

  it('observes rather than checks the performer when no executor was bound', () => {
    const { executorRef: _executorRef, ...unbound } = terms();
    const result = enterpriseTransferMandateAuthorizes(mandate({ terms: unbound }), attempt({ executedBy: 'anyone-at-all' }));
    assert.equal(result.authorized, true);
  });

  it('refuses a smaller movement, and a repeat one, when partial transfer is prohibited', () => {
    const small = enterpriseTransferMandateAuthorizes(mandate(), attempt({ scope: { kind: 'proportional', basisPoints: 1000 } }));
    assert.equal(small.authorized === false && small.code, 'PARTIAL_TRANSFER_PROHIBITED');
    const repeat = enterpriseTransferMandateAuthorizes(mandate(), attempt({ priorExecutionCount: 1 }));
    assert.equal(repeat.authorized === false && repeat.code, 'PARTIAL_TRANSFER_PROHIBITED');
  });

  it('permits tranches and enforces conservation when partial transfer is allowed', () => {
    const partial = mandate({ terms: terms({ constraints: { ...terms().constraints, partialTransferAllowed: true } }) });
    assert.equal(enterpriseTransferMandateAuthorizes(partial, attempt({ scope: { kind: 'proportional', basisPoints: 1000 } })).authorized, true);

    const overspent = enterpriseTransferMandateAuthorizes(
      partial,
      attempt({ scope: { kind: 'proportional', basisPoints: 1000 }, alreadyTransferredScope: { kind: 'proportional', basisPoints: 2000 } }),
    );
    assert.equal(overspent.authorized === false && overspent.code, 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE');
  });

  it('refuses an unreported or disallowed registry, and each missing required evidence reference', () => {
    const noRegistry = enterpriseTransferMandateAuthorizes(mandate(), attempt({ registry: undefined }));
    assert.equal(noRegistry.authorized === false && noRegistry.code, 'REGISTRY_NOT_PERMITTED');
    const wrongRegistry = enterpriseTransferMandateAuthorizes(mandate(), attempt({ registry: 'registry-beta' }));
    assert.equal(wrongRegistry.authorized === false && wrongRegistry.code, 'REGISTRY_NOT_PERMITTED');

    const noAcceptance = enterpriseTransferMandateAuthorizes(mandate(), attempt({ hasRecipientAcceptance: false }));
    assert.equal(noAcceptance.authorized === false && noAcceptance.code, 'RECIPIENT_ACCEPTANCE_REQUIRED');

    const needsConsideration = mandate({ terms: terms({ constraints: { ...terms().constraints, considerationEvidenceRequired: true } }) });
    const noConsideration = enterpriseTransferMandateAuthorizes(needsConsideration, attempt());
    assert.equal(noConsideration.authorized === false && noConsideration.code, 'CONSIDERATION_EVIDENCE_REQUIRED');

    const needsAgreement = mandate({ terms: terms({ constraints: { ...terms().constraints, externalAgreementReferenceRequired: true } }) });
    const noAgreement = enterpriseTransferMandateAuthorizes(needsAgreement, attempt());
    assert.equal(noAgreement.authorized === false && noAgreement.code, 'EXTERNAL_AGREEMENT_REFERENCE_REQUIRED');
  });

  it('reports an identity substitution as a substitution rather than a downstream fault', () => {
    // Wrong recipient *and* an over-large scope: the substitution must win, so
    // an operator is told what actually happened.
    const result = enterpriseTransferMandateAuthorizes(
      mandate(),
      attempt({ transfereeRef: 'party-x', scope: { kind: 'proportional', basisPoints: 10_000 } }),
    );
    assert.equal(result.authorized === false && result.code, 'TRANSFEREE_NOT_AUTHORIZED');
  });
});

describe('TRANSFER serialization round trips', () => {
  it('round-trips a request deterministically', () => {
    const request: EnterpriseTransferRequest = {
      schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
      id: 'transfer-request-1',
      capability: ENTERPRISE_TRANSFER_CAPABILITY,
      asset: ASSET,
      requestedBy: 'actor-manager',
      terms: terms(),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'correlation-1',
      evidenceRefs: ['evidence-b', 'evidence-a'],
    };
    assert.equal(validateEnterpriseTransferRequest(request).valid, true);
    const serialized = serializeEnterpriseTransferRequest(request);
    assert.deepEqual(serialized.evidenceRefs, ['evidence-a', 'evidence-b'], 'reference lists serialize in a stable order');
    const parsed = deserializeEnterpriseTransferRequest(JSON.parse(JSON.stringify(serialized)));
    assert.ok(enterpriseTransferTermsEquals(parsed.terms, request.terms));
    assert.equal(parsed.requestedBy, request.requestedBy);
  });

  it('round-trips a mandate deterministically', () => {
    const original = mandate({ approvalRefs: ['approval-b', 'approval-a'] });
    assert.equal(validateEnterpriseTransferMandate(original).valid, true);
    const parsed = deserializeEnterpriseTransferMandate(JSON.parse(JSON.stringify(serializeEnterpriseTransferMandate(original))));
    assert.equal(enterpriseTransferMandateEquals(parsed, { ...original, approvalRefs: ['approval-a', 'approval-b'] }), true);
  });

  it('serializes terms with a stable field and collection ordering', () => {
    const a = serializeEnterpriseTransferTerms(terms({ rights: ['usage-right', 'economic-interest'] }));
    const b = serializeEnterpriseTransferTerms(terms({ rights: ['economic-interest', 'usage-right'] }));
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'a canonical serialization must not depend on input ordering');
  });

  it('round-trips execution and lifecycle evidence', () => {
    const execution: EnterpriseTransferExecutionEvidence = {
      schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
      id: 'transfer-execution-1',
      mandateRef: 'transfer-mandate-1',
      executedBy: 'provider-c',
      executedAt: '2026-02-01T00:00:00.000Z',
      transferorRef: 'party-a',
      transfereeRef: 'party-b',
      rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
      transferredScope: { kind: 'proportional', basisPoints: 2500 },
      correlationId: 'correlation-1',
      registry: 'registry-alpha',
      externalConsiderationReference: 'consideration-1',
    };
    assert.equal(validateEnterpriseTransferExecutionEvidence(execution).valid, true);
    const parsedExecution = deserializeEnterpriseTransferExecutionEvidence(JSON.parse(JSON.stringify(serializeEnterpriseTransferExecutionEvidence(execution))));
    assert.deepEqual(parsedExecution.transferredScope, execution.transferredScope);
    assert.equal(parsedExecution.externalConsiderationReference, 'consideration-1');

    const lifecycle: EnterpriseTransferLifecycleEvidence = {
      schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
      id: 'transfer-lifecycle-1',
      mandateRef: 'transfer-mandate-1',
      executionRef: 'transfer-execution-1',
      reportedBy: 'registry-alpha',
      occurredAt: '2026-03-01T00:00:00.000Z',
      lifecycleType: ENTERPRISE_TRANSFER_LIFECYCLE_TYPES.REGISTERED,
      correlationId: 'correlation-1',
    };
    assert.equal(validateEnterpriseTransferLifecycleEvidence(lifecycle).valid, true);
    const parsedLifecycle = deserializeEnterpriseTransferLifecycleEvidence(JSON.parse(JSON.stringify(serializeEnterpriseTransferLifecycleEvidence(lifecycle))));
    assert.equal(parsedLifecycle.lifecycleType, 'registered');
  });

  it('rejects execution evidence that omits how much moved, or reports a movement to the same party', () => {
    const { transferredScope: _scope, ...withoutScope } = {
      schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
      id: 'e-1',
      mandateRef: 'm-1',
      executedBy: 'p',
      executedAt: '2026-02-01T00:00:00.000Z',
      transferorRef: 'party-a',
      transfereeRef: 'party-b',
      rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
      transferredScope: { kind: 'proportional', basisPoints: 2500 },
      correlationId: 'c-1',
    };
    const missing = validateEnterpriseTransferExecutionEvidence(withoutScope);
    assert.equal(missing.valid, false);
    assert.ok(missing.valid === false && missing.errors.some((issue) => issue.code === 'MISSING_TRANSFERRED_SCOPE'));

    const selfMove = validateEnterpriseTransferExecutionEvidence({ ...withoutScope, transferredScope: { kind: 'proportional', basisPoints: 2500 }, transfereeRef: 'party-a' });
    assert.equal(selfMove.valid, false);
    assert.ok(selfMove.valid === false && selfMove.errors.some((issue) => issue.code === 'TRANSFEROR_IS_TRANSFEREE'));
  });

  it('rejects a mandate whose expiry does not follow its effective instant', () => {
    const result = validateEnterpriseTransferMandate(mandate({ expiresAt: '2025-01-01T00:00:00.000Z' }));
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'EXPIRY_NOT_AFTER_EFFECTIVE_FROM'));
  });

  it('rejects a basis-point scope outside 1..10000, and a non-integer one', () => {
    for (const bad of [0, -1, 10_001, 25.5]) {
      const result = validateEnterpriseTransferMandate(mandate({ terms: terms({ scope: { kind: 'proportional', basisPoints: bad } }) }));
      assert.equal(result.valid, false, `${bad} basis points must be rejected`);
    }
  });
});
