import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AOC_KERNEL_REASON_CODES } from '../../kernel/index.js';
import {
  ALICE,
  BOB,
  CAROL,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  ENTERPRISE_TRANSFER_CAPABILITY,
  FULL_INTEREST,
  GA_ALICE_PASSPORT_ID,
  GA_ALICE_TOKEN_ID,
  GA_ASSET,
  GA_MANAGER_ACTOR_ID,
  GA_TENANT_A,
  GA_UNAUTHORIZED_ACTOR_ID,
  GA_UNAUTHORIZED_PASSPORT_ID,
  GOVERNED_RIGHT_TYPES,
  TENANT_CONTEXT,
  UNBOUNDED,
  buildGovernedAuthorityWorld,
  collateralizationRequest,
  collateralizationTerms,
  conformingExecution,
  grantRepresentation,
  heldScope,
  licenseRequest,
  licenseTerms,
  representationStoreOf,
  revokeRepresentation,
  seedPosition,
  tokenizationRequest,
  tokenizationTerms,
  transferRequest,
  transferTerms,
  upTo,
  type GovernedAuthorityWorld,
} from './governed-authority-support.js';

/**
 * The vulnerability this layer exists to close, and the envelope that replaces
 * it, measured end to end against the real runtimes.
 *
 * ```
 * BEFORE   Admin X holds an asset-scoped grant and zero governed authority.
 *          X names Alice  -> allowed.
 *          X names Bob    -> allowed.
 *          X may pick whichever holder happens to have enough.
 *
 * AFTER    X names Alice, bound to Alice  -> allowed, within the envelope.
 *          X names Bob,   bound to Alice  -> DENIED.
 *          X's own governed authority throughout: none.
 * ```
 *
 * Every denial below is produced by the same `AocKernel` every governed action
 * consults. Nothing here reaches into an action-specific code path, and no
 * test asserts on a stored binding without also asserting on what that binding
 * lets the representative *do* — a table of relationships that governs nothing
 * would satisfy half of these and none of the point.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const OWNERSHIP = GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

const REPRESENTATION_MISSING = AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_MISSING;
const REPRESENTATION_SCOPE_EXCEEDED = AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_SCOPE_EXCEEDED;
const REPRESENTATION_EXPIRED = AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_EXPIRED;
const GOVERNED_SCOPE_EXCEEDED = AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_SCOPE_EXCEEDED;
const GOVERNED_RIGHT_MISSING = AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_RIGHT_MISSING;

/** The seeded starting world of the mandatory scenario: Alice 7500 bp, Bob 2500 bp, both of the economic interest. */
async function seedAliceAndBob(world: GovernedAuthorityWorld): Promise<void> {
  await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 7_500 });
  await seedPosition(world, BOB, ECONOMIC, { kind: 'proportional', basisPoints: 2_500 });
}

/** Reads the reason codes off any of the four actions' outcomes, which share this shape and nothing else. */
function reasons(outcome: { readonly reasonCodes: readonly string[] }): readonly string[] {
  return outcome.reasonCodes;
}

// ---------------------------------------------------------------------------
// 1. The measured vulnerability, before and after.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — the arbitrary-holder vulnerability', () => {
  it('BEFORE: a delegated administrator holding nothing may name any holder that has enough', async () => {
    // The pre-hardening world, still reachable and still behaving exactly as it
    // did. This is the measurement the whole task rests on, kept executable so
    // the "after" below is a comparison rather than a claim.
    const world = buildGovernedAuthorityWorld();
    await seedAliceAndBob(world);

    const forAlice = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('before-alice', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 })),
    );
    const forBob = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('before-bob', transferTerms(BOB, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 })),
    );

    assert.equal(forAlice.status, 'allowed');
    assert.equal(forBob.status, 'allowed', 'the manager could substitute Bob for Alice freely, which is the hole');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'and it held no governed authority of its own while doing so');
  });

  it('AFTER: the same administrator, bound to Alice, may act for Alice', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedAliceAndBob(world);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('after-alice', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 })),
    );
    assert.equal(outcome.status, 'allowed');
  });

  it('AFTER: the same administrator may NOT act for Bob — this is the central acceptance test', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedAliceAndBob(world);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('after-bob', transferTerms(BOB, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 })),
    );

    assert.equal(outcome.status, 'denied');
    assert.ok(reasons(outcome).includes(REPRESENTATION_MISSING));
    // And emphatically not because Bob lacks the right: he holds 2500 bp, more
    // than the 1500 asked for. The denial is about *who may spend it*.
    assert.ok(!reasons(outcome).includes(GOVERNED_RIGHT_MISSING));
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 2_500 });
  });

  it('a binding to Alice is not a binding to anyone else, even where the manager is bound to both separately', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedAliceAndBob(world);
    await seedPosition(world, CAROL, USAGE, FULL_INTEREST);

    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, CAROL, [USAGE], { actions: [ENTERPRISE_LICENSE_CAPABILITY], scopeLimit: UNBOUNDED });

    // Two bindings, same representative, and they do not pool: the economic
    // ceiling does not travel to Carol and the usage right does not travel to
    // Alice.
    const aliceUsage = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('cross-alice-usage', ALICE, licenseTerms([USAGE])),
    );
    assert.equal(aliceUsage.status, 'denied', 'the Carol/usage binding must not license Alice');
    assert.ok(reasons(aliceUsage).includes(REPRESENTATION_MISSING));

    const carolEconomic = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('cross-carol-economic', transferTerms(CAROL, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 500 })),
    );
    assert.equal(carolEconomic.status, 'denied', 'the Alice/economic binding must not transfer for Carol');
  });
});

// ---------------------------------------------------------------------------
// 2. Each dimension of the envelope, varied one at a time.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — the envelope binds on every dimension', () => {
  it('right-bound: representation over the usage right does not reach the ownership interest', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, USAGE, FULL_INTEREST);
    await seedPosition(world, ALICE, OWNERSHIP, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [USAGE], {
      actions: [ENTERPRISE_TRANSFER_CAPABILITY, ENTERPRISE_LICENSE_CAPABILITY],
      scopeLimit: UNBOUNDED,
    });

    // Alice holds the ownership interest outright, so the *holder* proof is
    // satisfied. The representation proof is not, and that alone must deny.
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('right-mismatch', transferTerms(ALICE, BOB, [OWNERSHIP], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(reasons(outcome).includes(REPRESENTATION_MISSING));
    assert.ok(!reasons(outcome).includes(GOVERNED_RIGHT_MISSING), 'Alice does hold the ownership interest; the denial is about representation');
  });

  it('action-bound: representation for LICENSE does not authorize TRANSFER', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { actions: [ENTERPRISE_LICENSE_CAPABILITY], scopeLimit: UNBOUNDED });

    const licensed = await world.license.requestLicense(TENANT_CONTEXT, GA_TENANT_A, licenseRequest('action-license', ALICE, licenseTerms([ECONOMIC])));
    assert.equal(licensed.status, 'allowed', 'the action it was granted for');

    const transferred = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('action-transfer', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(transferred.status, 'denied', 'and not the one it was not');
    assert.ok(reasons(transferred).includes(REPRESENTATION_MISSING));
  });

  it('resource-bound: representation over Asset A does not reach Asset B', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    const assetB = { kind: 'asset', id: 'governed-asset-b' };
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST, { resource: assetB });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: UNBOUNDED });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('resource-mismatch', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }), {
        asset: { kind: assetB.kind, id: assetB.id, tenantId: GA_TENANT_A },
        resourceScope: `${GA_ASSET.kind}:${GA_ASSET.id}`,
      }),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(reasons(outcome).includes(REPRESENTATION_MISSING));
  });

  it('scope-bound: the representative ceiling denies what the holder could do itself', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 7_500 });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const within = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('ceiling-within', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 2_000 })),
    );
    assert.equal(within.status, 'allowed', 'exactly at the ceiling is within it');

    const over = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('ceiling-over', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 2_001 })),
    );
    assert.equal(over.status, 'denied', 'one basis point past it is not');
    assert.ok(reasons(over).includes(REPRESENTATION_SCOPE_EXCEEDED));
    // Alice holds 7500 and could have moved 2001 herself. The ceiling is the
    // representative's, not the holder's.
    assert.ok(!reasons(over).includes(GOVERNED_SCOPE_EXCEEDED));
  });

  it("holder-bound scope: the holder's current position denies what the ceiling would allow", async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 1_500 });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('holder-short', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 2_000 })),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(reasons(outcome).includes(GOVERNED_SCOPE_EXCEEDED), 'the holder is what fell short here, not the ceiling');
    assert.ok(!reasons(outcome).includes(REPRESENTATION_SCOPE_EXCEEDED));
  });

  it('an unbounded ceiling imposes no numeric limit of its own, and the holder still caps it', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 3_000 });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: UNBOUNDED });

    const within = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('unbounded-within', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 3_000 })),
    );
    assert.equal(within.status, 'allowed');

    const beyondHolder = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('unbounded-beyond', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 3_001 })),
    );
    assert.equal(beyondHolder.status, 'denied', 'unbounded is not "everything"; it is "no ceiling of my own"');
    assert.ok(reasons(beyondHolder).includes(GOVERNED_SCOPE_EXCEEDED));
  });
});

// ---------------------------------------------------------------------------
// 3. The direct-holder path.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — direct holders need none', () => {
  it('TRANSFER: a holder acting as itself needs no representation', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, GA_MANAGER_ACTOR_ID, ECONOMIC, FULL_INTEREST);

    // requestedBy and transferorRef are the same party. No binding exists, and
    // none should be needed: a holder does not delegate to itself.
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('direct-transfer', transferTerms(GA_MANAGER_ACTOR_ID, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 2_000 })),
    );
    assert.equal(outcome.status, 'allowed');
  });

  it('LICENSE: a holder acting as itself needs no representation', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, GA_MANAGER_ACTOR_ID, USAGE, FULL_INTEREST);

    const outcome = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('direct-license', GA_MANAGER_ACTOR_ID, licenseTerms([USAGE])),
    );
    assert.equal(outcome.status, 'allowed');
  });

  it('acting for someone else still requires representation even where the requester holds plenty of its own', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, GA_MANAGER_ACTOR_ID, ECONOMIC, FULL_INTEREST);
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST, { resource: { kind: 'asset', id: 'governed-asset-c' } });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('own-holdings-no-help', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }), {
        asset: { kind: 'asset', id: 'governed-asset-c', tenantId: GA_TENANT_A },
        resourceScope: `${GA_ASSET.kind}:${GA_ASSET.id}`,
      }),
    );
    assert.equal(outcome.status, 'denied', "holding a right of your own is not permission to spend someone else's");
    assert.ok(reasons(outcome).includes(REPRESENTATION_MISSING));
  });
});

// ---------------------------------------------------------------------------
// 4. The dual-proof matrix.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — the dual-proof matrix', () => {
  it('action authority NO + representation YES + holder YES -> DENIED (representation rescues nothing)', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(world, GA_UNAUTHORIZED_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: UNBOUNDED });

    // A recognized actor with a perfect representation and no capability token
    // and no authority grant. The existing chain stops it, and this layer —
    // which only ever narrows an already-viable outcome — never sees it.
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('matrix-no-action-authority', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }), {
        requestedBy: GA_UNAUTHORIZED_ACTOR_ID,
        context: { passportId: GA_UNAUTHORIZED_PASSPORT_ID },
      }),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(
      !reasons(outcome).includes(REPRESENTATION_MISSING) && !reasons(outcome).includes(GOVERNED_RIGHT_MISSING),
      'the denial belongs to the existing chain, and neither governed-authority layer relabels it',
    );
  });

  it('action authority YES + representation NO + holder YES -> DENIED', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('matrix-no-representation', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(outcome.status, 'denied');
    assert.deepEqual(reasons(outcome).slice(0, 1), [REPRESENTATION_MISSING]);
  });

  it('action authority YES + representation YES + holder NO -> DENIED', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    // Alice is enrolled on the resource through a *different* right, so the
    // resource is enrolled and the holder genuinely has no economic interest.
    await seedPosition(world, ALICE, USAGE, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: UNBOUNDED });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('matrix-no-holder', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(reasons(outcome).includes(GOVERNED_RIGHT_MISSING));
  });

  it('action authority YES + representation NO + holder NO -> DENIED, and both causes are reported', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, BOB, ECONOMIC, FULL_INTEREST);

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('matrix-neither', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(reasons(outcome).includes(REPRESENTATION_MISSING));
    assert.ok(reasons(outcome).includes(GOVERNED_RIGHT_MISSING));
    assert.equal(reasons(outcome)[0], REPRESENTATION_MISSING, 'the holder binding is the first thing an operator must fix');
  });

  it('all three YES -> may proceed', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('matrix-all-yes', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 })),
    );
    assert.equal(outcome.status, 'allowed');
  });
});

// ---------------------------------------------------------------------------
// 5. Representation does not conserve, credit or reserve anything.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — the representative never acquires the right', () => {
  it('granting and revoking a representation changes no position at all', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedAliceAndBob(world);

    const before = { alice: await heldScope(world, ALICE, ECONOMIC), bob: await heldScope(world, BOB, ECONOMIC) };
    const binding = await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), before.alice, "the holder's position is untouched by delegating");
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'and the representative is credited with nothing');

    await revokeRepresentation(world, binding.id);
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), before.alice);
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), before.bob);
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null);
  });

  it('TRANSFER executed by a representative debits the HOLDER and credits the recipient — never the representative', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedAliceAndBob(world);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('provenance', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 })),
    );
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(outcome.mandate.id, ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 }));

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 6_000 }, 'Alice lost 1500');
    assert.deepEqual(await heldScope(world, CAROL, ECONOMIC), { kind: 'proportional', basisPoints: 1_500 }, 'Carol gained 1500');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'the representative gained nothing');
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 2_500 }, 'and no bystander was touched');
  });

  it('the transition records Alice as the source, not the representative that submitted it', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedAliceAndBob(world);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('lineage', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.ok(outcome.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(outcome.mandate.id, ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }));

    const provenance = await world.authorityStore.getProvenance(
      { system: true, actorId: 'actor-administrator' },
      GA_TENANT_A,
      CAROL,
      { kind: GA_ASSET.kind, id: GA_ASSET.id },
      ECONOMIC,
    );
    const movement = provenance.transitions.find((transition) => transition.basis.kind === 'governed-execution');
    assert.ok(movement !== undefined);
    assert.equal(movement.fromActorRef, ALICE, "Alice's authority moved");
    assert.equal(movement.toActorRef, CAROL, 'Carol received it');
    assert.notEqual(movement.fromActorRef, GA_MANAGER_ACTOR_ID, 'the representative is never recorded as the source holder');
  });

  it('a ceiling is not a reservation: the holder may still move everything directly', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, GA_MANAGER_ACTOR_ID, ECONOMIC, FULL_INTEREST);
    // The manager holds 10 000 itself and separately appoints a representative
    // over 5 000 of it. Delegating must not fence off any part of the position.
    await grantRepresentation(world, 'actor-rights-manager-two', GA_MANAGER_ACTOR_ID, [ECONOMIC], { scopeLimit: upTo(5_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('no-reservation', transferTerms(GA_MANAGER_ACTOR_ID, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 8_000 })),
    );
    assert.equal(outcome.status, 'allowed', 'delegating 5000 to a representative reserves nothing');
  });
});

// ---------------------------------------------------------------------------
// 6. The ceiling floats over dynamically-resolved holder state.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — a ceiling over live holder state', () => {
  it("a holder's later direct transfer shrinks what the representative may exercise, with no record changed", async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const binding = await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });

    // Alice, acting for herself, moves 8000 away. Requester == holder, so no
    // representation is consulted for this step at all.
    const direct = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('holder-direct', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 8_000 }), {
        requestedBy: ALICE,
        context: { passportId: GA_ALICE_PASSPORT_ID, capabilityTokenId: GA_ALICE_TOKEN_ID },
      }),
    );
    assert.equal(direct.status, 'allowed');
    assert.ok(direct.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(direct.mandate.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 8_000 }));
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 2_000 });

    const stillSaysFiveThousand = await world.representationStore?.getRepresentativeAuthority(
      { system: true },
      GA_TENANT_A,
      binding.id,
    );
    assert.deepEqual(stillSaysFiveThousand?.scopeLimit, { kind: 'bounded', maximum: { kind: 'proportional', basisPoints: 5_000 } }, 'the record is untouched');

    const over = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('after-shrink-over', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 3_000 })),
    );
    assert.equal(over.status, 'denied', 'the ceiling still says 5000; the holder now has 2000, and the holder wins');
    assert.ok(reasons(over).includes(GOVERNED_SCOPE_EXCEEDED));

    const within = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('after-shrink-within', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 2_000 })),
    );
    assert.equal(within.status, 'allowed');
  });

  it('a holder who later gains authority lets the representative exercise more, up to the unchanged ceiling', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 2_000 });
    await seedPosition(world, BOB, ECONOMIC, { kind: 'proportional', basisPoints: 8_000 });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(5_000) });

    const tooMuch = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('before-gain', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 5_000 })),
    );
    assert.equal(tooMuch.status, 'denied', 'Alice only has 2000 so far');

    // A second, independent binding — for Bob, not Alice. The two do not pool,
    // and this one is used only to move authority *into* Alice's position.
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, BOB, [ECONOMIC], { scopeLimit: upTo(3_000) });
    const inbound = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('bob-to-alice', transferTerms(BOB, ALICE, [ECONOMIC], { kind: 'proportional', basisPoints: 3_000 })),
    );
    assert.equal(inbound.status, 'allowed');
    assert.ok(inbound.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(inbound.mandate.id, BOB, ALICE, [ECONOMIC], { kind: 'proportional', basisPoints: 3_000 }));
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 5_000 });

    const nowAllowed = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('after-gain', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 5_000 })),
    );
    assert.equal(nowAllowed.status, 'allowed', 'the representation is a ceiling, not a snapshot of holdings');
  });
});

// ---------------------------------------------------------------------------
// 7. Validity windows and revocation.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — validity and withdrawal', () => {
  it('denies before the representation takes effect, and after it ends', async () => {
    const notYet = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(notYet, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(notYet, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: UNBOUNDED, effectiveFrom: '2026-06-01T00:00:00.000Z' });

    const pending = await notYet.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('pending', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(pending.status, 'denied');
    assert.ok(reasons(pending).includes(REPRESENTATION_EXPIRED));

    const ended = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(ended, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(ended, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], {
      scopeLimit: UNBOUNDED,
      effectiveFrom: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-12-01T00:00:00.000Z',
    });
    const expired = await ended.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('expired', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(expired.status, 'denied');
    assert.ok(reasons(expired).includes(REPRESENTATION_EXPIRED));
    assert.deepEqual(await heldScope(ended, ALICE, ECONOMIC), FULL_INTEREST, "the holder's own authority is unaffected by an expired representation");
  });

  it('withdrawal stops future requests and touches nothing else', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedAliceAndBob(world);
    const binding = await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const before = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('pre-revoke', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(before.status, 'allowed');
    assert.ok(before.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(before.mandate.id, ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 }));

    await revokeRepresentation(world, binding.id);

    const after = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('post-revoke', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(after.status, 'denied');
    assert.ok(reasons(after).includes(REPRESENTATION_EXPIRED));

    // Everything the withdrawal must NOT reach.
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 6_500 }, "Alice's authority is intact, less what already moved");
    assert.deepEqual(await heldScope(world, CAROL, ECONOMIC), { kind: 'proportional', basisPoints: 1_000 }, 'the completed transition is not reversed');
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 2_500 }, "Bob's position is untouched");
  });

  it('a mandate already issued survives a later withdrawal, and still executes', async () => {
    // The temporal decision, asserted rather than assumed. Representation is
    // permission to cause AOC to *issue* an authorization; a TransferMandate is
    // an authorization AOC has already issued, with its own lifecycle. Nothing
    // in the existing Enterprise semantics revokes an issued mandate when the
    // authority behind its issuance later lapses, and inventing a cascade here
    // would have been a new governance act rather than an implementation of one.
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const binding = await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('mandate-then-revoke', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 })),
    );
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate !== undefined);

    await revokeRepresentation(world, binding.id);

    const execution = await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(outcome.mandate.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 }),
    );
    assert.ok(execution !== undefined);
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 1_500 }, 'the already-issued mandate remained executable');

    // And no *new* mandate may be issued.
    const blocked = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('after-revoke-new', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 500 })),
    );
    assert.equal(blocked.status, 'denied');
  });
});

// ---------------------------------------------------------------------------
// 8. The other three governed actions.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — every governed action, one mechanism', () => {
  it('LICENSE: three distinct identities stay distinct — holder, representative, licensee', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, USAGE, FULL_INTEREST);
    await seedPosition(world, BOB, USAGE, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [USAGE], { actions: [ENTERPRISE_LICENSE_CAPABILITY], scopeLimit: UNBOUNDED });

    const allowed = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('license-alice', ALICE, licenseTerms([USAGE], undefined, { licenseeRef: 'party-company-b' })),
    );
    assert.equal(allowed.status, 'allowed');
    assert.equal(allowed.mandate?.terms.licenseeRef, 'party-company-b', 'the licensee is neither the holder nor the representative');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, USAGE), null);

    const wrongHolder = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('license-bob', BOB, licenseTerms([USAGE], undefined, { licenseeRef: 'party-company-b' })),
    );
    assert.equal(wrongHolder.status, 'denied', 'switching the holder to Bob is denied even though Bob holds the usage right outright');
    assert.ok(reasons(wrongHolder).includes(REPRESENTATION_MISSING));
  });

  it('LICENSE: an absent rightsScope is covered by a bounded representation without being read as 100%', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    // Alice holds a single basis point. An unquantified licence is not a
    // quantity, so neither the ceiling nor the position is compared against a
    // manufactured fraction — the licence draws on a right she demonstrably
    // still has some live authority over.
    await seedPosition(world, ALICE, USAGE, { kind: 'proportional', basisPoints: 1 });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [USAGE], { actions: [ENTERPRISE_LICENSE_CAPABILITY], scopeLimit: upTo(100) });

    const unquantified = await world.license.requestLicense(TENANT_CONTEXT, GA_TENANT_A, licenseRequest('license-unquantified', ALICE, licenseTerms([USAGE])));
    assert.equal(unquantified.status, 'allowed');

    const quantifiedOverCeiling = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('license-quantified', ALICE, licenseTerms([USAGE], { kind: 'proportional', basisPoints: 500 })),
    );
    assert.equal(quantifiedOverCeiling.status, 'denied', 'and a licence that DOES express a quantity is compared against the ceiling');
    assert.ok(reasons(quantifiedOverCeiling).includes(REPRESENTATION_SCOPE_EXCEEDED));
  });

  it('TOKENIZE: correct holder allowed; wrong holder, wrong right, oversized scope and wrong action all denied', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await seedPosition(world, ALICE, OWNERSHIP, FULL_INTEREST);
    await seedPosition(world, BOB, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { actions: [ENTERPRISE_TOKENIZE_CAPABILITY], scopeLimit: upTo(3_000) });

    const ok = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('tok-ok', ALICE, tokenizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 3_000 })),
    );
    assert.equal(ok.status, 'allowed');

    const wrongHolder = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('tok-wrong-holder', BOB, tokenizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(wrongHolder.status, 'denied');
    assert.ok(reasons(wrongHolder).includes(REPRESENTATION_MISSING));

    const wrongRight = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('tok-wrong-right', ALICE, tokenizationTerms([OWNERSHIP], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(wrongRight.status, 'denied');
    assert.ok(reasons(wrongRight).includes(REPRESENTATION_MISSING));

    const tooLarge = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('tok-too-large', ALICE, tokenizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 3_001 })),
    );
    assert.equal(tooLarge.status, 'denied');
    assert.ok(reasons(tooLarge).includes(REPRESENTATION_SCOPE_EXCEEDED));

    const wrongAction = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('tok-wrong-action', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(wrongAction.status, 'denied', 'a TOKENIZE representation is not a TRANSFER one');
    assert.ok(reasons(wrongAction).includes(REPRESENTATION_MISSING));

    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null);
  });

  it('COLLATERALIZE: the secured party is a fourth role, distinct from holder and representative', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { actions: [ENTERPRISE_COLLATERALIZE_CAPABILITY], scopeLimit: upTo(4_000) });

    const ok = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('col-ok', ALICE, collateralizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 4_000 })),
    );
    assert.equal(ok.status, 'allowed');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'neither the representative nor the secured party gained a position');
    assert.equal(await heldScope(world, 'party-lender-b', ECONOMIC), null);

    const overCeiling = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('col-over', ALICE, collateralizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 4_001 })),
    );
    assert.equal(overCeiling.status, 'denied');
    assert.ok(reasons(overCeiling).includes(REPRESENTATION_SCOPE_EXCEEDED));
  });
});

// ---------------------------------------------------------------------------
// 9. Legacy compatibility and enrolment.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — enrolment is what turns it on', () => {
  it('an unenrolled resource keeps its legacy behaviour, and enrolling it fails closed from then on', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });

    // Nothing recorded for the asset at all: not enrolled. The manager's
    // existing action authority decides alone, exactly as it did before either
    // governed-authority layer existed.
    const legacy = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('unenrolled', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(legacy.status, 'allowed');

    // Now enrol the resource — through a *different* right and a *different*
    // holder, so nothing about this bootstrap concerns the request above.
    await seedPosition(world, CAROL, USAGE, FULL_INTEREST);

    const enforced = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('enrolled', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(enforced.status, 'denied', 'the same request, same requester, same arbitrary holder — now refused');
    assert.ok(reasons(enforced).includes(REPRESENTATION_MISSING));
  });

  it('a deployment that has not configured the provider is unchanged', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedAliceAndBob(world);

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('no-provider', transferTerms(BOB, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(outcome.status, 'allowed');
  });
});

// ---------------------------------------------------------------------------
// 10. Mandate lineage.
// ---------------------------------------------------------------------------

describe('Holder-bound representation — audit lineage', () => {
  it('a decision reached through a representation records who acted, for whom, and on what binding', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    const binding = await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('lineage-facts', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 1_000 })),
    );
    assert.equal(outcome.status, 'allowed');

    // The mandate contract is deliberately unchanged: it already records
    // `requestedBy`, and the terms already name the holder, so the pair
    // "who acted" and "for whom" is reconstructible from what was already
    // stored. The binding that authorized it is reachable from the same two
    // values plus the resource, which is why no mandate field was added.
    assert.equal(outcome.mandate?.requestedBy, GA_MANAGER_ACTOR_ID);
    assert.equal(outcome.mandate?.terms.transferorRef, ALICE);

    const bindings = await representationStoreOf(world).listRepresentativeAuthorities(
      { system: true },
      GA_TENANT_A,
      outcome.mandate?.requestedBy ?? '',
      outcome.mandate?.terms.transferorRef ?? '',
      { kind: GA_ASSET.kind, id: GA_ASSET.id },
    );
    assert.deepEqual(bindings.map((entry) => entry.id), [binding.id], 'the decision is traceable back to exactly the binding that permitted it');
  });
});
