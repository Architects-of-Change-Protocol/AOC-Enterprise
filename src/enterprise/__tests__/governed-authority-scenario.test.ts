import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALICE,
  BOB,
  CAROL,
  FULL_INTEREST,
  GA_ASSET,
  GA_TENANT_A,
  GOVERNED_RIGHT_TYPES,
  QUARTER_INTEREST,
  TENANT_CONTEXT,
  USAGE_ONLY_HOLDER,
  buildGovernedAuthorityWorld,
  collateralizationRequest,
  collateralizationTerms,
  conformingExecution,
  heldScope,
  licenseRequest,
  licenseTerms,
  seedPosition,
  tokenizationRequest,
  tokenizationTerms,
  transferRequest,
  transferTerms,
  type GovernedAuthorityWorld,
} from './governed-authority-support.js';

/**
 * The reference scenario this foundation exists to make true, run end to end
 * against the real runtimes.
 *
 * ```
 * Alice controls 100% of the economic interest
 *   -> TRANSFER 25% to Bob
 *   -> external execution accepted
 *   -> authority transition committed
 *
 * Alice controls 75%      Bob controls 25%
 * Bob may govern <= 25%   Bob may not govern > 25%
 * Alice may govern <= 75% Alice may not govern > 75%
 *
 * and authority over one right never substitutes for authority over another.
 * ```
 *
 * Every denial below is produced by the same `AocKernel` and the same generic
 * resolver every governed action consults. Nothing in these tests reaches into
 * a transfer-specific code path, and nothing asserts on an authority balance
 * without also asserting on what the balance lets the holder *do* — a ledger
 * that governs nothing would satisfy half of these and none of the point.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const OWNERSHIP = GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

/** Runs the reference transfer to completion: mandate issued, movement effected, evidence accepted, authority moved. */
async function completeReferenceTransfer(world: GovernedAuthorityWorld, requestId = 'transfer-reference'): Promise<void> {
  const outcome = await world.transfer.requestTransfer(
    TENANT_CONTEXT,
    GA_TENANT_A,
    transferRequest(requestId, transferTerms(ALICE, BOB, [ECONOMIC], QUARTER_INTEREST)),
  );
  assert.equal(outcome.status, 'allowed', 'the reference transfer must be authorized before anything can be measured about its effect');
  assert.ok(outcome.mandate !== undefined);
  await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(outcome.mandate.id, ALICE, BOB, [ECONOMIC], QUARTER_INTEREST));
}

describe('Governed authority — the mandatory Alice to Bob reference scenario', () => {
  it('moves 25% from Alice to Bob on accepted execution, conserving the total', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 10_000 });
    assert.equal(await heldScope(world, BOB, ECONOMIC), null, 'Bob starts holding nothing at all, not a zero position');

    await completeReferenceTransfer(world);

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 });
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 2_500 });
  });

  it('does not move authority when the mandate is merely issued — permission that is never exercised moves nothing', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-authorized-only', transferTerms(ALICE, BOB, [ECONOMIC], QUARTER_INTEREST)),
    );
    assert.equal(outcome.status, 'allowed');
    assert.ok(outcome.mandate !== undefined);

    // This is the transition-trigger decision, measured. A TransferMandate is
    // AOC's authority to move a right, not the movement.
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 10_000 });
    assert.equal(await heldScope(world, BOB, ECONOMIC), null);
  });

  it('RECIPIENT: Bob may now govern up to what he received, through a different governed action', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await completeReferenceTransfer(world);

    // LICENSE, not TRANSFER: the authority Bob gained is consulted by the
    // generic resolver every action shares, and nothing about it is
    // transfer-shaped.
    const within = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('license-bob-within', BOB, licenseTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 })),
    );
    assert.equal(within.status, 'allowed', 'Bob may license 2000 bp of the 2500 bp he received');
  });

  it('RECIPIENT: Bob may not govern more than he received', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await completeReferenceTransfer(world);

    const beyond = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-bob-beyond', transferTerms(BOB, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 3_000 })),
    );
    assert.equal(beyond.status, 'denied');
    assert.ok(beyond.reasonCodes.includes('AUTHORITY_GOVERNED_SCOPE_EXCEEDED'));
    assert.equal(beyond.mandate, undefined);
  });

  it('SOURCE: Alice may no longer govern the portion she transferred away', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await completeReferenceTransfer(world);

    const beyond = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-alice-beyond', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 8_000 })),
    );
    assert.equal(beyond.status, 'denied', 'a completed transfer now genuinely reduces what the transferor may authorize');
    assert.ok(beyond.reasonCodes.includes('AUTHORITY_GOVERNED_SCOPE_EXCEEDED'));

    const within = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-alice-within', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 7_500 })),
    );
    assert.equal(within.status, 'allowed', 'and exactly what remains is still hers to authorize');
  });

  it('the whole scenario survives a restart of the authority state', async () => {
    // The in-memory store is re-read through a *freshly built world* sharing
    // only the store instance — the durable equivalent is
    // `governed-authority-store-contract.test.ts`, which reopens a real SQLite
    // file. What this asserts is that nothing about the recognized balances
    // lives in the services, the Kernel or the resolver.
    const first = buildGovernedAuthorityWorld();
    await seedPosition(first, ALICE, ECONOMIC, FULL_INTEREST);
    await completeReferenceTransfer(first);

    const second = buildGovernedAuthorityWorld({ authorityStore: first.authorityStore, idSeed: 1_000 });
    assert.deepEqual(await heldScope(second, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 });
    assert.deepEqual(await heldScope(second, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 2_500 });

    const beyond = await second.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-after-restart', transferTerms(BOB, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 3_000 })),
    );
    assert.equal(beyond.status, 'denied');
  });
});

describe('Governed authority — authority over one right never substitutes for another', () => {
  it('RIGHT MISMATCH: a holder of the usage right cannot transfer the ownership interest', async () => {
    const world = buildGovernedAuthorityWorld();
    // 100% of the usage right, and nothing else. Before this foundation, a
    // bare asset grant authorized moving *any* right of the asset, and even a
    // hierarchical `…:usage-right` scope string was never checked against the
    // right actually being moved.
    await seedPosition(world, USAGE_ONLY_HOLDER, USAGE, FULL_INTEREST);

    const mismatched = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-right-mismatch', transferTerms(USAGE_ONLY_HOLDER, BOB, [OWNERSHIP], QUARTER_INTEREST)),
    );

    assert.equal(mismatched.status, 'denied');
    assert.ok(mismatched.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
    assert.equal(mismatched.mandate, undefined);
  });

  it('and the same holder may still exercise the right it actually holds', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, USAGE_ONLY_HOLDER, USAGE, FULL_INTEREST);

    const matched = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-right-match', transferTerms(USAGE_ONLY_HOLDER, BOB, [USAGE], QUARTER_INTEREST)),
    );
    assert.equal(matched.status, 'allowed', 'the check is right-scoped, not a blanket refusal');
  });

  it('TOKENIZE: a holder of the usage right cannot represent the ownership interest externally', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, USAGE_ONLY_HOLDER, USAGE, FULL_INTEREST);

    const outcome = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('tokenize-right-mismatch', USAGE_ONLY_HOLDER, tokenizationTerms([OWNERSHIP], QUARTER_INTEREST)),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
  });

  it('an action naming two rights needs authority over both — partial coverage is not coverage', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    // Deliberately no revenue-right position for Alice.

    const outcome = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest(
        'collateralize-two-rights',
        ALICE,
        collateralizationTerms([ECONOMIC, GOVERNED_RIGHT_TYPES.REVENUE_RIGHT], QUARTER_INTEREST),
      ),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
  });
});

describe('Governed authority — scope containment is enforced before any action-specific rule', () => {
  it('SCOPE MISMATCH: COLLATERALIZE beyond the held scope is denied', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, QUARTER_INTEREST);

    const outcome = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('collateralize-beyond', ALICE, collateralizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 5_000 })),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes('AUTHORITY_GOVERNED_SCOPE_EXCEEDED'));
  });

  it('and within the held scope it proceeds', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, QUARTER_INTEREST);

    const outcome = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('collateralize-within', ALICE, collateralizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 })),
    );
    assert.equal(outcome.status, 'allowed');
  });

  it('a committed collateralization does not itself reduce the underlying authority', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('collateralize-encumber', ALICE, collateralizationTerms([ECONOMIC], QUARTER_INTEREST)),
    );

    // Encumbering a right is not moving it. Whether an encumbrance should also
    // reduce transferable capacity is a policy question about encumbrance
    // semantics, and this foundation deliberately does not answer it — see
    // `docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`, "Authority is
    // not action-specific capacity".
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 10_000 });
  });

  it('an unquantified LICENSE needs live authority over the right, and absence of a scope is never read as the whole of it', async () => {
    const world = buildGovernedAuthorityWorld();
    // One basis point, and no more. If an absent rights scope were treated as
    // 100%, this licence would be denied; if it were ignored entirely, a
    // holder of nothing could licence. Neither is what LICENSE means.
    await seedPosition(world, ALICE, USAGE, { kind: 'proportional', basisPoints: 1 });

    const unquantified = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('license-unquantified', ALICE, licenseTerms([USAGE])),
    );
    assert.equal(unquantified.status, 'allowed', 'a permission that is not fractionally expressed draws on the right, not on a quantity of it');

    const byNonHolder = await world.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('license-unquantified-nonholder', BOB, licenseTerms([USAGE])),
    );
    assert.equal(byNonHolder.status, 'denied', 'but a party holding none of the right cannot license it either');
    assert.ok(byNonHolder.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
  });
});

describe('Governed authority — the delegated administrator never becomes the holder', () => {
  it('the manager that submits every request holds nothing, and cannot transfer on its own account', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    // The manager's Authority Graph grant is unchanged and still authorizes it
    // to *act*. What it cannot do is name itself as the party the rights leave.
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-manager-self', transferTerms('actor-rights-manager', BOB, [ECONOMIC], QUARTER_INTEREST)),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
  });

  it('and acting for Alice, it may authorize exactly what Alice holds and no more', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, QUARTER_INTEREST);

    const within = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-for-alice-within', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 2_000 })),
    );
    assert.equal(within.status, 'allowed');

    const beyond = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-for-alice-beyond', transferTerms(ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 9_000 })),
    );
    assert.equal(beyond.status, 'denied');
  });
});

describe('Governed authority — before and after, on the exact scenario TRANSFER measured', () => {
  it('BEFORE: without the authority store, a completed transfer still leaves the recipient with nothing and the transferor undiminished', async () => {
    // The pre-foundation behaviour, still reachable and still exactly what
    // `transfer-authority-transition.test.ts` recorded. Kept as a live
    // comparison rather than a remembered one.
    const world = buildGovernedAuthorityWorld({ withoutGovernedAuthority: true, withoutTransferAuthorityTransition: true });
    await completeReferenceTransfer(world);

    assert.equal(await heldScope(world, ALICE, ECONOMIC), null, 'no authority state exists to have been reduced');
    assert.equal(await heldScope(world, BOB, ECONOMIC), null, 'and none to have been created');

    const second = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-second-before', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 10_000 })),
    );
    assert.equal(second.status, 'allowed', 'the full interest can be authorized again immediately after 25% of it has already moved');
  });

  it('AFTER: the same sequence is refused, because the transferor is now recognized as holding less', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await completeReferenceTransfer(world);

    const second = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-second-after', transferTerms(ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 10_000 })),
    );
    assert.equal(second.status, 'denied');
    assert.ok(second.reasonCodes.includes('AUTHORITY_GOVERNED_SCOPE_EXCEEDED'));
  });

  it('several transfers compose into several recipients without any batch primitive', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);

    await completeReferenceTransfer(world, 'transfer-to-bob');

    const toCarol = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-to-carol', transferTerms(ALICE, CAROL, [ECONOMIC], QUARTER_INTEREST)),
    );
    assert.ok(toCarol.mandate !== undefined);
    await world.transfer.recordExecution(TENANT_CONTEXT, conformingExecution(toCarol.mandate.id, ALICE, CAROL, [ECONOMIC], QUARTER_INTEREST));

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 5_000 });
    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 2_500 });
    assert.deepEqual(await heldScope(world, CAROL, ECONOMIC), { kind: 'proportional', basisPoints: 2_500 });
  });

  it('a recipient that already holds some of the right ends up with the sum, in one position', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, ECONOMIC, FULL_INTEREST);
    await seedPosition(world, BOB, ECONOMIC, { kind: 'proportional', basisPoints: 1_000 });

    await completeReferenceTransfer(world);

    assert.deepEqual(await heldScope(world, BOB, ECONOMIC), { kind: 'proportional', basisPoints: 3_500 });
    const positions = await world.authorityStore.listPositionsForHolder({ system: true }, GA_TENANT_A, BOB, { kind: GA_ASSET.kind, id: GA_ASSET.id });
    assert.equal(positions.length, 1, 'one right of one resource held by one actor is exactly one position, never two lots');
  });
});
