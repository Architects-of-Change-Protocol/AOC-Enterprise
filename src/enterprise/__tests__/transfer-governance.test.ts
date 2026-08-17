import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ENTERPRISE_TRANSFERABLE_RIGHT_TYPES, validateEnterpriseTransferRequest } from '@aoc-enterprise/transfer-mandate';

import { isTransferGovernanceError } from '../transfer-governance/errors.js';
import {
  OTHER_REGISTRY,
  OTHER_TRANSFEREE_REF,
  OTHER_TRANSFEROR_REF,
  OTHER_TRANSFER_EXECUTOR_REF,
  PERMITTED_REGISTRY,
  TRANSFEREE_REF,
  TRANSFEROR_REF,
  TRANSFER_ASSET,
  TRANSFER_DESK_ACTOR_ID,
  TRANSFER_DESK_PASSPORT_ID,
  TRANSFER_DESK_TOKEN_ID,
  TRANSFER_EXECUTOR_REF,
  TRANSFER_OTHER_ASSET,
  TRANSFER_OUTSIDER_ACTOR_ID,
  TRANSFER_TENANT_A,
  TRANSFER_TENANT_B,
  TRANSFER_TENANT_B_ASSET,
  TRANSFER_TRUST_DOMAIN_ID,
  buildConformingTransferExecution,
  buildTransferManagerRequest,
  buildTransferWorld,
  directTransferTerms,
  ownershipTransferTerms,
  quarterInterestTransferTerms,
  trancheTransferTerms,
  unitizedTransferTerms,
} from './transfer-support.js';

const TENANT_CONTEXT = { system: false, organizationId: TRANSFER_TENANT_A, actorId: 'actor-test' } as const;
const OTHER_TENANT_CONTEXT = { system: false, organizationId: TRANSFER_TENANT_B, actorId: 'actor-other' } as const;

/** Fails the test if `fn` resolves, or if it rejects with anything other than the expected `TransferGovernanceError` code. */
async function assertTransferError(fn: () => Promise<unknown>, code: string, refusalCode?: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert.ok(isTransferGovernanceError(error), `expected a TransferGovernanceError, received ${String(error)}`);
    assert.equal(error.code, code);
    if (refusalCode !== undefined) {
      assert.equal((error.details as { refusalCode?: string } | undefined)?.refusalCode, refusalCode);
    }
    return;
  }
  assert.fail(`expected ${code} to be thrown`);
}

describe('TRANSFER — contract validation', () => {
  it('rejects a request whose capability is any other governed action', () => {
    const result = validateEnterpriseTransferRequest({
      schemaVersion: '1.0.0',
      id: 'req-1',
      capability: 'license',
      asset: TRANSFER_ASSET,
      requestedBy: 'actor-x',
      terms: quarterInterestTransferTerms(),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'CAPABILITY_MISMATCH'));
  });

  it('requires a scope — a transfer that does not say how much moves is ambiguous, not merely under-specified', () => {
    const { scope: _scope, ...withoutScope } = quarterInterestTransferTerms();
    const result = validateEnterpriseTransferRequest({
      schemaVersion: '1.0.0',
      id: 'req-1',
      capability: 'transfer',
      asset: TRANSFER_ASSET,
      requestedBy: 'actor-x',
      terms: withoutScope,
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'MISSING_SCOPE'));
  });

  it('rejects a transferor that is also the transferee — a right moved to its own holder has not moved', () => {
    const result = validateEnterpriseTransferRequest({
      schemaVersion: '1.0.0',
      id: 'req-1',
      capability: 'transfer',
      asset: TRANSFER_ASSET,
      requestedBy: 'actor-x',
      terms: quarterInterestTransferTerms({ transfereeRef: TRANSFEROR_REF }),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'TRANSFEROR_IS_TRANSFEREE'));
  });

  it('rejects binding the transferee as executor of its own acquisition', () => {
    const result = validateEnterpriseTransferRequest({
      schemaVersion: '1.0.0',
      id: 'req-1',
      capability: 'transfer',
      asset: TRANSFER_ASSET,
      requestedBy: 'actor-x',
      terms: quarterInterestTransferTerms({ executorRef: TRANSFEREE_REF }),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'EXECUTOR_IS_TRANSFEREE'));
  });

  it('requires both partialTransferAllowed and onwardTransferAllowed — neither has a safe default', () => {
    const result = validateEnterpriseTransferRequest({
      schemaVersion: '1.0.0',
      id: 'req-1',
      capability: 'transfer',
      asset: TRANSFER_ASSET,
      requestedBy: 'actor-x',
      terms: { ...quarterInterestTransferTerms(), constraints: {} },
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
    });
    assert.equal(result.valid, false);
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'MISSING_PARTIAL_TRANSFER_ALLOWED'));
    assert.ok(result.valid === false && result.errors.some((issue) => issue.code === 'MISSING_ONWARD_TRANSFER_ALLOWED'));
  });

  it('accepts the canonical reference authorization', () => {
    const result = validateEnterpriseTransferRequest({
      schemaVersion: '1.0.0',
      id: 'req-1',
      capability: 'transfer',
      asset: TRANSFER_ASSET,
      requestedBy: 'actor-x',
      terms: quarterInterestTransferTerms(),
      requestedAt: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
    });
    assert.equal(result.valid, true);
  });
});

describe('TRANSFER — governed action through the real Kernel', () => {
  it('issues a mandate for an authorized requester, and the mandate records the holder rather than the requester', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());

    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate !== undefined);
    assert.equal(outcome.mandate.status, 'active');
    // The single most important non-conflation in this action: the party that
    // asked is not the party whose right moves.
    assert.notEqual(outcome.mandate.requestedBy, outcome.mandate.terms.transferorRef);
    assert.equal(outcome.mandate.terms.transferorRef, TRANSFEROR_REF);
    assert.equal(outcome.mandate.terms.transfereeRef, TRANSFEREE_REF);
    assert.deepEqual(outcome.mandate.terms.scope, { kind: 'proportional', basisPoints: 2500 });
    assert.equal(outcome.mandate.executionCount, 0);
    assert.equal(outcome.mandate.transferredScope, undefined);
    assert.ok(outcome.decisionId.length > 0);
    assert.ok(outcome.evaluationId.length > 0);
  });

  it('denies an unrecognized requester and issues no mandate', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({ requestedBy: TRANSFER_OUTSIDER_ACTOR_ID, context: {} }),
    );

    assert.notEqual(outcome.status, 'allowed');
    assert.equal(outcome.mandate, undefined);
  });

  it('produces approval_required for the delegated desk, and no mandate before the approval exists', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({
        requestedBy: TRANSFER_DESK_ACTOR_ID,
        context: { passportId: TRANSFER_DESK_PASSPORT_ID, capabilityTokenId: TRANSFER_DESK_TOKEN_ID },
      }),
    );

    assert.equal(outcome.status, 'approval_required');
    assert.equal(outcome.mandate, undefined, 'an outstanding approval is not authorization');
  });

  it('denies a request over an asset the requester holds no authority for', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ asset: TRANSFER_OTHER_ASSET }));

    assert.notEqual(outcome.status, 'allowed');
    assert.equal(outcome.mandate, undefined);
  });

  it('refuses a cross-tenant asset before the Kernel is ever consulted', async () => {
    const { service } = buildTransferWorld();
    await assertTransferError(
      () => service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ asset: TRANSFER_TENANT_B_ASSET })),
      'TRANSFER_ASSET_TENANT_MISMATCH',
    );
  });

  it('persists the evaluation and classifies the mandate as an authorization_artifact', async () => {
    const { service, governanceStore } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);

    const record = await governanceStore.getByEvaluationId(TENANT_CONTEXT, outcome.evaluationId);
    assert.ok(record !== null);
    const authorizationRefs = record.references.filter((reference) => reference.referenceType === 'authorization_artifact');
    assert.equal(authorizationRefs.length, 1);
    assert.equal(authorizationRefs[0]?.externalId, outcome.mandate.id);
    assert.equal(
      record.references.filter((reference) => reference.referenceType === 'execution_record').length,
      0,
      'a mandate is what AOC authorized, never evidence that someone else acted',
    );
  });
});

describe('TRANSFER — execution containment', () => {
  async function issued(termsOverride?: ReturnType<typeof quarterInterestTransferTerms>) {
    const world = buildTransferWorld();
    const outcome = await world.service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest(termsOverride === undefined ? {} : { terms: termsOverride }),
    );
    assert.ok(outcome.mandate !== undefined);
    return { ...world, mandate: outcome.mandate, evaluationId: outcome.evaluationId };
  }

  it('records a conforming movement and advances both the count and the transferred total', async () => {
    const { service, mandate } = await issued();
    const { mandate: updated, execution } = await service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id));

    assert.equal(updated.executionCount, 1);
    assert.deepEqual(updated.transferredScope, { kind: 'proportional', basisPoints: 2500 });
    assert.equal(execution.transfereeRef, TRANSFEREE_REF);
    assert.equal(execution.transferorRef, TRANSFEROR_REF);
  });

  it('denies a movement delivering to a different recipient — there is no substitution disposition', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { transfereeRef: OTHER_TRANSFEREE_REF })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'TRANSFEREE_NOT_AUTHORIZED',
    );
  });

  it('denies a movement out of a different holder', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { transferorRef: OTHER_TRANSFEROR_REF })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'TRANSFEROR_NOT_AUTHORIZED',
    );
  });

  it('denies a movement effected by a party other than the bound executor', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { executedBy: OTHER_TRANSFER_EXECUTOR_REF })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'EXECUTOR_NOT_AUTHORIZED',
    );
  });

  it('accepts any performer when the authorization binds no executor', async () => {
    const { service, mandate } = await issued(directTransferTerms());
    const { execution } = await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(mandate.id, {
        executedBy: TRANSFEROR_REF,
        registry: undefined,
        externalAgreementReference: undefined,
        externalAcceptanceReference: undefined,
      }),
    );
    assert.equal(execution.executedBy, TRANSFEROR_REF, 'an unbound executor is observed, never checked');
  });

  it('denies a movement larger than the authorized portion — 25% authorized, 100% attempted', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(mandate.id, { transferredScope: { kind: 'proportional', basisPoints: 10_000 } }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'SCOPE_EXCEEDS_MANDATE',
    );
  });

  it('denies a movement carrying a right the mandate never authorized', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(mandate.id, {
            rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST],
          }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'RIGHTS_NOT_AUTHORIZED',
    );
  });

  it('refuses to compare a unit count against a proportional share rather than coercing between them', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(mandate.id, { transferredScope: { kind: 'unitized', units: 1, unitDenomination: 'participation-unit' } }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'SCOPE_EXCEEDS_MANDATE',
    );
  });

  it('denies a movement through a registry outside the permitted list, and one that reports no registry at all', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { registry: OTHER_REGISTRY })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'REGISTRY_NOT_PERMITTED',
    );
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { registry: undefined })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'REGISTRY_NOT_PERMITTED',
    );
  });

  it('denies a movement that reports no recipient acceptance when the authorization required one', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { externalAcceptanceReference: undefined })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'RECIPIENT_ACCEPTANCE_REQUIRED',
    );
  });

  it('denies a movement that reports no consideration evidence when the authorization required it, and never learns an amount', async () => {
    const base = quarterInterestTransferTerms();
    const { service, mandate } = await issued({ ...base, constraints: { ...base.constraints, considerationEvidenceRequired: true } });
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id)),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'CONSIDERATION_EVIDENCE_REQUIRED',
    );

    const { execution } = await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(mandate.id, { externalConsiderationReference: 'consideration-2026-0001' }),
    );
    assert.equal(execution.externalConsiderationReference, 'consideration-2026-0001');
    assert.ok(!('amount' in execution) && !('currency' in execution), 'AOC holds no monetary quantity for a transfer');
  });

  it('denies a movement that reports no agreement reference when the authorization required one', async () => {
    const { service, mandate } = await issued();
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { externalAgreementReference: undefined })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'EXTERNAL_AGREEMENT_REFERENCE_REQUIRED',
    );
  });

  it('correlates recorded execution evidence back to the authorizing aggregate as an execution_record', async () => {
    const { service, governanceStore, mandate, evaluationId } = await issued();
    const { execution } = await service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id));

    const record = await governanceStore.getByEvaluationId(TENANT_CONTEXT, evaluationId);
    assert.ok(record !== null);
    const executionRefs = record.references.filter((reference) => reference.referenceType === 'execution_record');
    assert.equal(executionRefs.length, 1);
    assert.equal(executionRefs[0]?.externalId, execution.id);
  });
});

describe('TRANSFER — partiality and conservation', () => {
  async function issued(terms: ReturnType<typeof quarterInterestTransferTerms>) {
    const world = buildTransferWorld();
    const outcome = await world.service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ terms }));
    assert.ok(outcome.mandate !== undefined);
    return { ...world, mandate: outcome.mandate };
  }

  it('refuses a *smaller* movement when partial transfer is prohibited — the asymmetry with a license ceiling', async () => {
    const { service, mandate } = await issued(quarterInterestTransferTerms());
    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(mandate.id, { transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'PARTIAL_TRANSFER_PROHIBITED',
    );
  });

  it('refuses a second movement when partial transfer is prohibited', async () => {
    const { service, mandate } = await issued(quarterInterestTransferTerms());
    await service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { executionId: 'exec-1' }));
    await assertTransferError(
      () => service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(mandate.id, { executionId: 'exec-2' })),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'PARTIAL_TRANSFER_PROHIBITED',
    );
  });

  it('permits tranches that sum to the authorized portion, and refuses the tranche that would exceed it', async () => {
    const { service, mandate } = await issued(trancheTransferTerms());

    const first = await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(mandate.id, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
    );
    assert.deepEqual(first.mandate.transferredScope, { kind: 'proportional', basisPoints: 1000 });

    const second = await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(mandate.id, { executionId: 'exec-2', transferredScope: { kind: 'proportional', basisPoints: 1500 } }),
    );
    assert.deepEqual(second.mandate.transferredScope, { kind: 'proportional', basisPoints: 2500 });

    // 10% + 15% has already moved the whole 25%. A further 1% is inside 25% on
    // its own, and must still be refused: what has left cannot leave again.
    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(mandate.id, { executionId: 'exec-3', transferredScope: { kind: 'proportional', basisPoints: 100 } }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'CUMULATIVE_SCOPE_EXCEEDS_MANDATE',
    );
  });

  it('accumulates unitized movements within a matching denomination', async () => {
    const { service, mandate } = await issued(unitizedTransferTerms());

    await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(mandate.id, {
        executionId: 'exec-1',
        transferredScope: { kind: 'unitized', units: 6, unitDenomination: 'participation-unit' },
      }),
    );
    const second = await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(mandate.id, {
        executionId: 'exec-2',
        transferredScope: { kind: 'unitized', units: 4, unitDenomination: 'participation-unit' },
      }),
    );
    assert.deepEqual(second.mandate.transferredScope, { kind: 'unitized', units: 10, unitDenomination: 'participation-unit' });

    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(mandate.id, {
            executionId: 'exec-3',
            transferredScope: { kind: 'unitized', units: 1, unitDenomination: 'participation-unit' },
          }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'CUMULATIVE_SCOPE_EXCEEDS_MANDATE',
    );
  });

  it('refuses a replayed execution id rather than double-counting the movement', async () => {
    const { service, mandate } = await issued(trancheTransferTerms());
    await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(mandate.id, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
    );
    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(mandate.id, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
        ),
      'TRANSFER_EXECUTION_ALREADY_RECORDED',
    );
    const mandateAfter = await service.getMandate(TENANT_CONTEXT, mandate.id);
    assert.equal(mandateAfter.executionCount, 1);
    assert.deepEqual(mandateAfter.transferredScope, { kind: 'proportional', basisPoints: 1000 });
  });
});

describe('TRANSFER — revocation and lifecycle evidence', () => {
  it('revocation withdraws future authority and preserves what had already moved', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ terms: trancheTransferTerms() }));
    assert.ok(outcome.mandate !== undefined);

    await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(outcome.mandate.id, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 1000 } }),
    );

    const revoked = await service.revokeMandate(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      reason: 'Authority withdrawn by the holder.',
      requestedBy: 'actor-portfolio-manager',
    });
    assert.equal(revoked.kind, 'revoked');
    assert.equal(revoked.revocation.executionsAtRevocation, 1);
    assert.deepEqual(revoked.revocation.transferredScopeAtRevocation, { kind: 'proportional', basisPoints: 1000 });

    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(outcome.mandate!.id, { executionId: 'exec-2', transferredScope: { kind: 'proportional', basisPoints: 100 } }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'MANDATE_REVOKED',
    );

    // Evidence of what already moved survives revocation untouched.
    const executions = await service.listExecutions(TENANT_CONTEXT, outcome.mandate.id);
    assert.equal(executions.length, 1);
  });

  it('revocation is idempotent', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);

    const first = await service.revokeMandate(TENANT_CONTEXT, { mandateId: outcome.mandate.id, reason: 'r', requestedBy: 'a' });
    const second = await service.revokeMandate(TENANT_CONTEXT, { mandateId: outcome.mandate.id, reason: 'r2', requestedBy: 'a' });
    assert.equal(first.kind, 'revoked');
    assert.equal(second.kind, 'already-revoked');
    assert.equal(second.revocation.id, first.revocation.id);
  });

  it('a reported reversal is observation only — it restores no transfer capacity', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ terms: trancheTransferTerms() }));
    assert.ok(outcome.mandate !== undefined);

    const { execution } = await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(outcome.mandate.id, { executionId: 'exec-1', transferredScope: { kind: 'proportional', basisPoints: 2500 } }),
    );

    const event = await service.recordLifecycleEvent(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      executionId: execution.id,
      reportedBy: TRANSFER_EXECUTOR_REF,
      occurredAt: '2026-03-01T00:00:00.000Z',
      lifecycleType: 'reversed',
      externalSystem: 'transfer-agent-c',
      externalReference: 'reversal-2026-0001',
    });
    assert.equal(event.lifecycleType, 'reversed');

    const mandateAfter = await service.getMandate(TENANT_CONTEXT, outcome.mandate.id);
    assert.equal(mandateAfter.status, 'active', 'a reported reversal is not a governance state transition');
    assert.equal(mandateAfter.executionCount, 1);
    assert.deepEqual(
      mandateAfter.transferredScope,
      { kind: 'proportional', basisPoints: 2500 },
      'AOC cannot verify a reversal and must not manufacture fresh transfer capacity from an unverified report',
    );

    // And the capacity really is gone: a further movement is still refused.
    await assertTransferError(
      () =>
        service.recordExecution(
          TENANT_CONTEXT,
          buildConformingTransferExecution(outcome.mandate!.id, { executionId: 'exec-2', transferredScope: { kind: 'proportional', basisPoints: 100 } }),
        ),
      'TRANSFER_EXECUTION_NOT_AUTHORIZED',
      'CUMULATIVE_SCOPE_EXCEEDS_MANDATE',
    );
  });

  it('refuses a lifecycle report against a movement this mandate has no evidence of', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);

    await assertTransferError(
      () =>
        service.recordLifecycleEvent(TENANT_CONTEXT, {
          mandateId: outcome.mandate!.id,
          executionId: 'exec-never-recorded',
          reportedBy: TRANSFER_EXECUTOR_REF,
          occurredAt: '2026-03-01T00:00:00.000Z',
          lifecycleType: 'registered',
        }),
      'TRANSFER_EXECUTION_NOT_FOUND',
    );
  });

  it('accepts a lifecycle report after revocation — reports arrive late, and refusing them would discard evidence', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);
    const { execution } = await service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(outcome.mandate.id));
    await service.revokeMandate(TENANT_CONTEXT, { mandateId: outcome.mandate.id, reason: 'r', requestedBy: 'a' });

    const event = await service.recordLifecycleEvent(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      executionId: execution.id,
      reportedBy: PERMITTED_REGISTRY,
      occurredAt: '2026-04-01T00:00:00.000Z',
      lifecycleType: 'registered',
    });
    assert.equal(event.lifecycleType, 'registered');
  });
});

describe('TRANSFER — replay, tenancy and lineage', () => {
  it('replaying a request returns the original mandate and appends no second authorization reference', async () => {
    const { service, governanceStore } = buildTransferWorld();
    const submission = buildTransferManagerRequest({ requestId: 'transfer-request-fixed', correlationId: 'corr-fixed' });

    const first = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, submission);
    const second = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, submission);

    assert.ok(first.mandate !== undefined);
    assert.ok(second.mandate !== undefined);
    assert.equal(second.mandate.id, first.mandate.id, 'replaying a request must never authorize the same portion to move twice');
    assert.equal(second.evaluationId, first.evaluationId);

    const record = await governanceStore.getByEvaluationId(TENANT_CONTEXT, first.evaluationId);
    assert.ok(record !== null);
    assert.equal(record.references.filter((reference) => reference.referenceType === 'authorization_artifact').length, 1);
  });

  it('another tenant can neither read, revoke, execute against, nor inspect the lineage of a mandate', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);
    const mandateId = outcome.mandate.id;

    await assertTransferError(() => service.getMandate(OTHER_TENANT_CONTEXT, mandateId), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
    await assertTransferError(
      () => service.revokeMandate(OTHER_TENANT_CONTEXT, { mandateId, reason: 'r', requestedBy: 'a' }),
      'TRANSFER_ACCESS_SCOPE_VIOLATION',
    );
    await assertTransferError(
      () => service.recordExecution(OTHER_TENANT_CONTEXT, buildConformingTransferExecution(mandateId)),
      'TRANSFER_ACCESS_SCOPE_VIOLATION',
    );
    await assertTransferError(() => service.getEvidenceLineage(OTHER_TENANT_CONTEXT, mandateId), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
    await assertTransferError(() => service.listExecutions(OTHER_TENANT_CONTEXT, mandateId), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
    await assertTransferError(() => service.listLifecycleEvents(OTHER_TENANT_CONTEXT, mandateId), 'TRANSFER_ACCESS_SCOPE_VIOLATION');
  });

  it('reconstructs the full governance lineage from stored references alone', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);
    const { execution } = await service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(outcome.mandate.id));
    await service.recordLifecycleEvent(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      executionId: execution.id,
      reportedBy: PERMITTED_REGISTRY,
      occurredAt: '2026-03-01T00:00:00.000Z',
      lifecycleType: 'registered',
    });

    const lineage = await service.getEvidenceLineage(TENANT_CONTEXT, outcome.mandate.id);

    // Who authorized it, what moved, how much, from whom, to whom, under what
    // restrictions, who executed it, and whether it stayed in scope.
    assert.equal(lineage.decisionRef, outcome.decisionId);
    assert.equal(lineage.evaluationRef, outcome.evaluationId);
    assert.equal(lineage.transferorRef, TRANSFEROR_REF);
    assert.equal(lineage.transfereeRef, TRANSFEREE_REF);
    assert.deepEqual(lineage.rights, [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST]);
    assert.deepEqual(lineage.authorizedScope, { kind: 'proportional', basisPoints: 2500 });
    assert.deepEqual(lineage.transferredScope, { kind: 'proportional', basisPoints: 2500 });
    assert.equal(lineage.executorRef, TRANSFER_EXECUTOR_REF);
    assert.equal(lineage.partialTransferAllowed, false);
    assert.deepEqual(lineage.permittedRegistries, [PERMITTED_REGISTRY]);
    assert.equal(lineage.executionRefs.length, 1);
    assert.equal(lineage.lifecycleRefs.length, 1);
    assert.equal(lineage.revocationRef, undefined);
    // And the requester is visibly not the holder.
    assert.notEqual(lineage.requestedBy, lineage.transferorRef);
  });

  it('a mandate may narrow the requested portion but never widen it or substitute a party', async () => {
    const { mandateStore } = buildTransferWorld();
    const base = quarterInterestTransferTerms();

    await assertTransferError(
      () =>
        mandateStore.issueMandate(TENANT_CONTEXT, {
          id: 'mandate-x',
          organizationId: TRANSFER_TENANT_A,
          assetKind: TRANSFER_ASSET.kind,
          assetId: TRANSFER_ASSET.id,
          terms: { ...base, scope: { kind: 'proportional', basisPoints: 10_000 } },
          requestedTerms: base,
          requestRef: 'req-x',
          requestedBy: 'actor-x',
          decisionRef: 'dec-x',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-07-01T00:00:00.000Z',
          correlationId: 'corr-x',
        }),
      'TRANSFER_SCOPE_ESCALATION',
    );

    await assertTransferError(
      () =>
        mandateStore.issueMandate(TENANT_CONTEXT, {
          id: 'mandate-y',
          organizationId: TRANSFER_TENANT_A,
          assetKind: TRANSFER_ASSET.kind,
          assetId: TRANSFER_ASSET.id,
          terms: { ...base, transfereeRef: OTHER_TRANSFEREE_REF },
          requestedTerms: base,
          requestRef: 'req-y',
          requestedBy: 'actor-y',
          decisionRef: 'dec-y',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-07-01T00:00:00.000Z',
          correlationId: 'corr-y',
        }),
      'TRANSFER_SCOPE_ESCALATION',
    );
  });

  it('an ownership-interest transfer is expressible — the vocabulary is asset-side, and this is the action that acts on it', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest({ terms: ownershipTransferTerms() }));
    assert.ok(outcome.mandate !== undefined);
    assert.deepEqual(outcome.mandate.terms.rights, [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST]);

    const { execution } = await service.recordExecution(
      TENANT_CONTEXT,
      buildConformingTransferExecution(outcome.mandate.id, { rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST] }),
    );
    assert.deepEqual(execution.rights, [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST]);
  });

  it('a system caller sees every tenant, preserving the existing system-level semantics', async () => {
    const { service } = buildTransferWorld();
    const outcome = await service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);
    const seen = await service.getMandate({ system: true }, outcome.mandate.id);
    assert.equal(seen.id, outcome.mandate.id);
  });

  it('the transfer trust domain and asset scope are the ones the fixture wired, not defaults invented here', () => {
    assert.equal(TRANSFER_TRUST_DOMAIN_ID, 'trust-domain-meridian-holdings');
    assert.equal(TRANSFER_ASSET.tenantId, TRANSFER_TENANT_A);
  });
});
