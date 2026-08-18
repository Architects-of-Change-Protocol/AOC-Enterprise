import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOVERNED_RIGHT_TYPES } from '@aoc-enterprise/governed-authorization';

import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import {
  ALICE,
  BOB,
  CAROL,
  FULL_INTEREST,
  GA_ASSET,
  GA_TENANT_A,
  QUARTER_INTEREST,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  conformingExecution,
  heldScope,
  seedPosition,
  transferRequest,
  transferTerms,
  type GovernedAuthorityWorld,
} from './governed-authority-support.js';

/**
 * How `TRANSFER` consumes the generic authority-transition primitive: when a
 * transition happens, when it deliberately does not, what a replay does, and
 * what happens in the one window where two durable stores cannot share a
 * transaction.
 *
 * The integration is deliberately thin — the transfer service hands a recorded
 * movement to the store and the store conserves it — so most of what is worth
 * testing here is about *timing and evidence* rather than arithmetic, which
 * `governed-authority-store-contract.test.ts` covers on both backends.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const UNITS = { kind: 'unitized', units: 25, unitDenomination: 'participation-unit' } as const;

async function issueMandate(world: GovernedAuthorityWorld, requestId: string, terms = transferTerms(ALICE, BOB, [ECONOMIC], QUARTER_INTEREST)) {
  const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest(requestId, terms));
  assert.equal(outcome.status, 'allowed', `expected ${requestId} to be authorized`);
  assert.ok(outcome.mandate !== undefined);
  return outcome.mandate;
}

describe('TRANSFER integration — what causes a governed authority transition', () => {
  it('accepted external execution evidence, and nothing earlier', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    const mandate = await issueMandate(world, 'transfer-trigger');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), FULL_INTEREST, 'issuing the mandate moved nothing');

    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST));
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 });
  });

  it('a later lifecycle report changes nothing — an observation must not silently rewrite authority', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(world, 'transfer-lifecycle');
    const moved = await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST));

    for (const lifecycleType of ['registered', 'reversed'] as const) {
      await world.transfer.recordLifecycleEvent(TENANT_CONTEXT, {
        mandateId: mandate.id,
        executionId: moved.execution.id,
        reportedBy: 'registry-alpha',
        occurredAt: '2026-03-01T00:00:00.000Z',
        lifecycleType,
      });
    }

    // A reported reversal is precisely the case where an automatic inverse
    // transition would be tempting and wrong: reversing recognized authority
    // is a governance act needing its own basis, not an inference from
    // something an external system said. Deferred deliberately.
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 });
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), QUARTER_INTEREST);
  });

  it('revoking the mandate withdraws authority to move more, and reverses nothing already moved', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(world, 'transfer-revoke', transferTerms(ALICE, BOB, [ECONOMIC], QUARTER_INTEREST, { constraints: { partialTransferAllowed: true, onwardTransferAllowed: 'permitted', permittedRegistries: ['registry-alpha'] } }));
    await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }, { executionId: 'execution-partial' }),
    );

    await world.transfer.revokeMandate(TENANT_CONTEXT, { mandateId: mandate.id, reason: 'withdrawn', requestedBy: 'actor-rights-manager' });

    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 1_000 }, 'what already moved stays moved');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 9_000 });
  });

  it('records the movement in terms of what the evidence reported, not what the mandate permitted', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(
      world,
      'transfer-partial',
      transferTerms(ALICE, BOB, [ECONOMIC], QUARTER_INTEREST, {
        constraints: { partialTransferAllowed: true, onwardTransferAllowed: 'permitted', permittedRegistries: ['registry-alpha'] },
      }),
    );

    // Authorized 2500, moved 1000. Authority follows the movement.
    await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }),
    );

    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 1_000 });
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 9_000 });
  });

  it('conserves unitized rights end to end, and refuses an incompatible denomination', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'unitized', units: 100, unitDenomination: 'participation-unit' });

    const mandate = await issueMandate(world, 'transfer-units', transferTerms(ALICE, BOB, [ECONOMIC], UNITS));
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], UNITS));

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'unitized', units: 75, unitDenomination: 'participation-unit' });
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'unitized', units: 25, unitDenomination: 'participation-unit' });

    const wrongDenomination = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-wrong-units', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'unitized', units: 10, unitDenomination: 'token' })),
    );
    assert.equal(wrongDenomination.status, 'denied');
    assert.ok(wrongDenomination.reasonCodes.includes('AUTHORITY_GOVERNED_SCOPE_EXCEEDED'));
  });
});

describe('TRANSFER integration — replay and cross-store recovery', () => {
  it('a replayed execution is refused by the transfer store before it can reach the authority layer twice', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(world, 'transfer-replay');

    const execution = conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST, { executionId: 'execution-fixed' });
    await world.transfer.recordExecution(TENANT_CONTEXT, execution);
    await assert.rejects(() => world.transfer.recordExecution(TENANT_CONTEXT, execution));

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 });
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), QUARTER_INTEREST);
  });

  it('reconciliation is a no-op once every execution has already moved authority', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(world, 'transfer-reconcile-noop');
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST));

    assert.deepEqual(await world.transfer.reconcileAuthorityTransitions(TENANT_CONTEXT, mandate.id), []);
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 }, 'and moves nothing a second time');
  });

  it('reconciliation repairs the one window where the two stores can disagree', async () => {
    // The crash this simulates: execution evidence committed, process lost
    // before the authority transition could be. The ordering is chosen so this
    // is the survivable direction — authority is under-credited, never
    // credited without evidence — and the repair is deterministic because the
    // evidence that survived carries everything the transition needs.
    const world = buildGovernedAuthorityWorld({ withoutTransferAuthorityTransition: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(world, 'transfer-crash');
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST));

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), FULL_INTEREST, 'the transition is genuinely missing');
    assert.equal(await heldScope(world, BOB, ECONOMIC), null);

    // The recovered process comes back with its authority store wired, sharing
    // the same durable transfer evidence.
    const recovered = buildGovernedAuthorityWorld({
      authorityStore: world.authorityStore,
      transferStore: world.transferStore,
      governanceStore: world.governanceStore,
      idSeed: 1_000,
    });

    const repaired = await recovered.transfer.reconcileAuthorityTransitions(TENANT_CONTEXT, mandate.id);
    assert.equal(repaired.length, 1);
    assert.deepEqual(await heldScope(recovered, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 });
    assert.deepEqual(await heldScope(recovered, BOB, ECONOMIC), QUARTER_INTEREST);

    // And running it again does nothing, so a recovery procedure is safe to
    // re-run without knowing whether it already succeeded.
    assert.deepEqual(await recovered.transfer.reconcileAuthorityTransitions(TENANT_CONTEXT, mandate.id), []);
    assert.deepEqual(await heldScope(recovered, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 });
  });

  it('a failed transition still leaves the execution evidence recorded, and says so by throwing', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    // Two mandates for 6000 bp each against 10 000 — both authorized, because
    // issuing a mandate reserves nothing. The first movement completes; the
    // second cannot be conserved.
    const first = await issueMandate(world, 'transfer-evidence-1', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }));
    const second = await issueMandate(world, 'transfer-evidence-2', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }));
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(first.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }));

    await assert.rejects(
      () =>
        world.transfer.recordExecution(
          TENANT_CONTEXT,
          conformingExecution(second.id, ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }, { executionId: 'execution-uncoverable' }),
        ),
      (error: unknown) => isAuthorityGovernanceError(error) && error.code === 'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
    );

    // This is the honest consequence of two stores that cannot share a
    // transaction, stated rather than hidden: the external system really did
    // report a movement, that report is durable, and AOC refused to draw an
    // authority conclusion from it. A caller learns both facts — the evidence
    // is queryable, and the call threw.
    const executions = await world.transfer.listExecutions(TENANT_CONTEXT, second.id);
    assert.equal(executions.length, 1, 'the evidence of what was reported is not discarded');
    assert.equal(await heldScope(world, CAROL, ECONOMIC), null, 'and no authority was credited from it');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 4_000 });

    // Reconciliation does not paper over it either: the movement is still
    // unconservable, so the repair path fails the same way rather than
    // inventing authority to make the books balance.
    await assert.rejects(
      () => world.transfer.reconcileAuthorityTransitions(TENANT_CONTEXT, second.id),
      (error: unknown) => isAuthorityGovernanceError(error) && error.code === 'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
    );
  });
});

describe('TRANSFER integration — over-authorization, the risk that reservation would have removed', () => {
  it('two mandates may each be authorized against the same holdings; only the second execution is refused', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    // This is the residual risk of deferring reservation, measured rather than
    // asserted away. Issuing a mandate reserves nothing, so both of these are
    // authorized against the same 10 000 bp.
    const first = await issueMandate(world, 'transfer-over-1', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }));
    const second = await issueMandate(world, 'transfer-over-2', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }));

    await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(first.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }),
    );

    // Conservation still holds where it counts: the second movement cannot
    // complete, so no more authority leaves Alice than she ever had.
    await assert.rejects(
      () =>
        world.transfer.recordExecution(
          TENANT_CONTEXT,
          conformingExecution(second.id, ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }),
        ),
      (error: unknown) => isAuthorityGovernanceError(error) && error.code === 'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
    );

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 4_000 });
    assert.equal(await heldScope(world, CAROL, ECONOMIC), null);
  });

  it('but a mandate issued after a completed transfer already sees the reduced holdings', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    const first = await issueMandate(world, 'transfer-sequential-1', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }));
    await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(first.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }),
    );

    const second = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-sequential-2', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 })),
    );
    assert.equal(second.status, 'denied', 'the over-authorization window closes as soon as the first movement completes');
  });
});

describe('TRANSFER integration — auditability', () => {
  it('links a credited position back to the execution, mandate and decision that produced it', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(world, 'transfer-audit');
    const moved = await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST));

    const provenance = await world.authorityStore.getProvenance({ system: true }, GA_TENANT_A, BOB, { kind: GA_ASSET.kind, id: GA_ASSET.id }, ECONOMIC);
    assert.equal(provenance.transitions.length, 1);
    const basis = provenance.transitions[0]?.basis;
    assert.ok(basis?.kind === 'governed-execution');
    assert.equal(basis.capability, 'transfer');
    assert.equal(basis.executionRef, moved.execution.id);
    assert.equal(basis.mandateRef, mandate.id);
    assert.equal(basis.decisionRef, mandate.decisionRef);
    assert.equal(basis.evaluationRef, mandate.evaluationRef);
    assert.equal(provenance.transitions[0]?.fromActorRef, ALICE);
    assert.equal(provenance.transitions[0]?.toActorRef, BOB);
  });

  it('leaves the evidence lineage making no claim about who holds the right now', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const mandate = await issueMandate(world, 'transfer-lineage');
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST));

    // The lineage still answers "who was authorized to receive it" and "how
    // much moved" — and still does not answer "who holds it now". The holder
    // question now has an answer, but it lives in the authority store where a
    // reader can see what it is based on, not folded into transfer evidence
    // where it would look like something the movement itself established.
    const lineage = await world.transfer.getEvidenceLineage(TENANT_CONTEXT, mandate.id);
    assert.ok(!('currentHolder' in lineage));
    assert.ok(!('holderAfterTransfer' in lineage));
    assert.equal(lineage.transferorRef, ALICE);
    assert.equal(lineage.transfereeRef, BOB);
  });
});
