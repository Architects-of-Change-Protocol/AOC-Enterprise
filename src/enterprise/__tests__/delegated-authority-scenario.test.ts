import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { AOC_KERNEL_REASON_CODES } from '../../kernel/index.js';
import {
  ALICE,
  BOB,
  CAROL,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  ENTERPRISE_TRANSFER_CAPABILITY,
  GA_ASSET_SCOPE,
  GA_DELEGATE_ACTOR_ID,
  GA_DELEGATE_PASSPORT_ID,
  GA_DELEGATE_TOKEN_ID,
  GA_MANAGER_ACTOR_ID,
  GA_MANAGER_GRANT_ID,
  GA_SUBDELEGATE_ACTOR_ID,
  GA_SUBDELEGATE_PASSPORT_ID,
  GA_SUBDELEGATE_TOKEN_ID,
  GA_TENANT_A,
  GA_TRUST_DOMAIN_ID,
  GOVERNED_RIGHT_TYPES,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  collateralizationRequest,
  collateralizationTerms,
  conformingExecution,
  grantRepresentation,
  heldScope,
  licenseRequest,
  licenseTerms,
  seedPosition,
  tokenizationRequest,
  tokenizationTerms,
  transferRequest,
  transferTerms,
  upTo,
  type GovernedAuthorityWorld,
} from './governed-authority-support.js';

/**
 * The fourth authority question, measured end to end against the real runtimes.
 *
 * Soberanía Enterprise already answered three, and they remain separate below:
 *
 * ```
 * A  action authority        may this actor invoke this action on this resource?
 * B  holder authority        does this holder control this right, and enough of it?
 * C  representative authority may this requester exercise THAT holder's authority?
 * D  derived authority        through what bounded, still-live chain does the
 *                             requester possess A at all?
 * ```
 *
 * D is what this suite is about. An agent holds no `AuthorityGrant` of its own,
 * so every request it makes has to produce a delegation lineage that terminates
 * at a real grant, never broadened at any hop, with every ancestor live at the
 * instant of use — and then still satisfy B and C independently.
 *
 * Nothing here reaches into an action-specific code path. Every verdict below
 * is produced by the same `AocKernel` all four governed actions consult.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const OWNERSHIP = GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

const REPRESENTATION_MISSING = AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_MISSING;
const REPRESENTATION_SCOPE_EXCEEDED = AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_SCOPE_EXCEEDED;
const GOVERNED_SCOPE_EXCEEDED = AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_SCOPE_EXCEEDED;

const ALL_CAPABILITIES = [
  ENTERPRISE_TRANSFER_CAPABILITY,
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
];

/** A world in which the manager's grant is delegable, with Alice holding 7500 bp and Bob 2500 bp of the economic interest. */
async function delegableWorld(options: { readonly depth?: number } = {}): Promise<GovernedAuthorityWorld> {
  const world = buildGovernedAuthorityWorld({ withRepresentation: true, managerDelegationDepth: options.depth ?? 2 });
  await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 7_500 });
  await seedPosition(world, BOB, ECONOMIC, { kind: 'proportional', basisPoints: 2_500 });
  return world;
}

/** Manager -> agent, over the given capabilities. The delegation is the agent's only source of action authority. */
function delegateToAgent(
  world: GovernedAuthorityWorld,
  options: {
    readonly id?: string;
    readonly to?: string;
    readonly actions?: readonly string[];
    readonly resourceScopes?: readonly string[];
    readonly canRedelegate?: boolean;
    readonly expiresAt?: string;
  } = {},
): string {
  return world.authorityRuntime.createDelegationGrant({
    id: options.id ?? 'delegation-manager-to-agent',
    delegatorActorId: GA_MANAGER_ACTOR_ID,
    delegateActorId: options.to ?? GA_DELEGATE_ACTOR_ID,
    delegateActorType: 'agent',
    trustDomainId: GA_TRUST_DOMAIN_ID,
    sourceAuthorityGrantId: GA_MANAGER_GRANT_ID,
    capability: ENTERPRISE_TRANSFER_CAPABILITY,
    actions: options.actions ?? ALL_CAPABILITIES,
    resourceScopes: options.resourceScopes ?? [GA_ASSET_SCOPE],
    canRedelegate: options.canRedelegate ?? false,
    ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
  }).id;
}

/** The request context of an agent rather than the manager, so the request actually travels the delegated path. */
function asAgent(actorId = GA_DELEGATE_ACTOR_ID, passportId = GA_DELEGATE_PASSPORT_ID, capabilityTokenId = GA_DELEGATE_TOKEN_ID): Record<string, unknown> {
  return { requestedBy: actorId, context: { passportId, capabilityTokenId } };
}

/** Alice -> agent, over the economic interest, up to `ceiling` bp of TRANSFER by default. */
async function representAlice(
  world: GovernedAuthorityWorld,
  options: { readonly to?: string; readonly ceiling?: number; readonly rights?: readonly GovernedRightType[]; readonly actions?: readonly string[]; readonly holder?: string } = {},
): Promise<string> {
  const representation = await grantRepresentation(world, options.to ?? GA_DELEGATE_ACTOR_ID, options.holder ?? ALICE, options.rights ?? [ECONOMIC], {
    scopeLimit: upTo(options.ceiling ?? 5_000),
    actions: options.actions ?? ALL_CAPABILITIES,
  });
  return representation.id;
}

function transferOf(basisPoints: number, from = ALICE, to = CAROL) {
  return transferTerms(from, to, [ECONOMIC], { kind: 'proportional', basisPoints });
}

// ---------------------------------------------------------------------------
// 1. The mandatory scenario: a derived capability, exercised for a holder.
// ---------------------------------------------------------------------------

describe('Derived authority — the mandatory TRANSFER scenario', () => {
  it('1. an agent with a live delegation, a valid representation and a solvent holder may proceed', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);

    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('d-1', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'allowed');
  });

  it('2. execution debits the holder, and credits neither the delegate nor anyone in between', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);

    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('d-2', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'allowed');
    await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(outcome.mandate!.id, ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 }),
    );

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 6_000 });
    assert.deepEqual(await heldScope(world, CAROL, ECONOMIC), { kind: 'proportional', basisPoints: 1_500 });
    assert.equal(await heldScope(world, GA_DELEGATE_ACTOR_ID, ECONOMIC), null, 'the delegate acquired nothing');
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null, 'nor did the intermediate representative');
  });

  it('3. creating the delegation and the representation moves no authority at all', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);

    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 }, 'Alice was not debited by being represented');
    assert.equal(await heldScope(world, GA_DELEGATE_ACTOR_ID, ECONOMIC), null);
    assert.equal(await heldScope(world, GA_MANAGER_ACTOR_ID, ECONOMIC), null);
  });
});

// ---------------------------------------------------------------------------
// 2. The four proofs are independent. Each row knocks out exactly one.
// ---------------------------------------------------------------------------

describe('Derived authority — four proofs, none of which substitutes for another', () => {
  it('4. A yes, D yes, C yes, B yes -> may proceed', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-1', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'allowed');
  });

  it('5. D no (no delegation at all) -> DENY, however good the other three are', async () => {
    const world = await delegableWorld();
    await representAlice(world);
    // Alice is solvent, the representation is valid, the agent is recognized
    // and passported. It holds no delegation, so it has no action authority.
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-2', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'denied');
  });

  it('6. C no (no representation) -> DENY, however good the delegation is', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-3', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(REPRESENTATION_MISSING));
  });

  it('7. B no (holder cannot cover it) -> DENY, however good the delegation and representation are', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world, { ceiling: 9_000 });
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-4', transferOf(8_500), asAgent()));
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(GOVERNED_SCOPE_EXCEEDED));
  });

  it('8. a delegation cannot rescue an action-authority denial', async () => {
    const world = await delegableWorld();
    // The delegation covers LICENSE only, so TRANSFER has no chain behind it.
    delegateToAgent(world, { actions: [ENTERPRISE_LICENSE_CAPABILITY] });
    await representAlice(world);
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-5', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'denied');
  });

  it('9. a delegation cannot fabricate holder authority', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true, managerDelegationDepth: 2 });
    // The resource is enrolled -- Bob holds some of it -- but Alice, the holder
    // this request names, holds none. A perfect delegation and a perfect
    // representation cannot conjure the underlying right.
    await seedPosition(world, BOB, ECONOMIC, { kind: 'proportional', basisPoints: 2_500 });
    delegateToAgent(world);
    await representAlice(world);
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-6', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'denied');
  });

  it('9b. a resource this deployment holds no authority state for keeps its prior behaviour', async () => {
    // The compatibility boundary the two preceding layers already established,
    // re-asserted here because derived authority does not move it: enrolment in
    // right-scoped authority is what turns the holder identity
    // security-sensitive, and an unenrolled resource behaves as it did before
    // any of these three layers existed. Recorded so a later change that
    // silently enrolled everything would fail here rather than in production.
    const world = buildGovernedAuthorityWorld({ withRepresentation: true, managerDelegationDepth: 2 });
    delegateToAgent(world);
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-6b', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'allowed');
    assert.deepEqual(outcome.reasonCodes, ['ACTION_ALLOWED'], 'and it passed on the action alone, exactly as before this phase');
  });

  it('10. a delegated capability does not carry the right to represent anyone', async () => {
    const world = await delegableWorld();
    // The delegation is over the *asset*, as broad as the manager's own grant.
    // It confers no ability to name a holder, which is the whole separation.
    delegateToAgent(world);
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-7', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(REPRESENTATION_MISSING));
  });

  it('11. a representation does not confer a delegated capability', async () => {
    const world = await delegableWorld();
    await representAlice(world);
    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('m-8', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'denied');
  });
});

// ---------------------------------------------------------------------------
// 3. The arbitrary-holder vulnerability stays closed through the delegated path.
// ---------------------------------------------------------------------------

describe('Derived authority — no holder laundering through a delegation', () => {
  it('12. an agent bound to Alice may not name Bob, however valid its delegation', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);

    const forAlice = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('h-1', transferOf(1_500, ALICE), asAgent()));
    const forBob = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('h-2', transferOf(1_500, BOB), asAgent()));

    assert.equal(forAlice.status, 'allowed');
    assert.equal(forBob.status, 'denied', 'this is the Phase 5.2 vulnerability, still closed on the delegated path');
    assert.ok(forBob.reasonCodes.includes(REPRESENTATION_MISSING));
  });

  it('13. it may name Bob once it separately and validly represents Bob', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);
    await representAlice(world, { holder: BOB });

    const forBob = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('h-3', transferOf(1_500, BOB), asAgent()));
    assert.equal(forBob.status, 'allowed');
  });

  it('14. representation over one right says nothing about another', async () => {
    const world = await delegableWorld();
    await seedPosition(world, ALICE, OWNERSHIP, { kind: 'proportional', basisPoints: 10_000 });
    delegateToAgent(world);
    await representAlice(world, { rights: [ECONOMIC] });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('h-4', transferTerms(ALICE, CAROL, [OWNERSHIP], { kind: 'proportional', basisPoints: 1_000 }), asAgent()),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(REPRESENTATION_MISSING));
  });
});

// ---------------------------------------------------------------------------
// 4. Ceilings, and which one binds.
// ---------------------------------------------------------------------------

describe('Derived authority — every layer narrows, none rescues', () => {
  it('15. the representative ceiling binds even when the holder has far more', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world, { ceiling: 2_000 });

    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('c-1', transferOf(3_000), asAgent()));
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(REPRESENTATION_SCOPE_EXCEEDED));
  });

  it('16. the holder’s current position binds even when the ceiling is far higher', async () => {
    const world = buildGovernedAuthorityWorld({ withRepresentation: true, managerDelegationDepth: 2 });
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 1_500 });
    delegateToAgent(world);
    await representAlice(world, { ceiling: 5_000 });

    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('c-2', transferOf(2_000), asAgent()));
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(GOVERNED_SCOPE_EXCEEDED));
  });

  it('17. the holder moving authority away afterwards lowers what the delegate may do, with nothing rewritten', async () => {
    const world = await delegableWorld();
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 2_500 }, { resource: { kind: 'asset', id: 'unused' } });
    delegateToAgent(world);
    await representAlice(world, { ceiling: 5_000 });

    // Alice moves 6000 of her 7500 out directly, leaving 1500.
    const direct = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('c-3', transferOf(6_000, ALICE, BOB), { requestedBy: ALICE, context: { passportId: 'passport-alice', capabilityTokenId: 'cap-alice-governed-actions' } }),
    );
    assert.equal(direct.status, 'allowed');
    await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(direct.mandate!.id, ALICE, BOB, [ECONOMIC], { kind: 'proportional', basisPoints: 6_000 }),
    );
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 1_500 });

    const tooMuch = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('c-4', transferOf(3_000), asAgent()));
    assert.equal(tooMuch.status, 'denied', 'the delegate’s reach fell with the holder’s position');
    const withinReach = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('c-5', transferOf(1_400), asAgent()));
    assert.equal(withinReach.status, 'allowed');
  });
});

// ---------------------------------------------------------------------------
// 5. Lineage liveness, observed through a real governed request.
// ---------------------------------------------------------------------------

describe('Derived authority — revoking a link stops the request', () => {
  it('18. revoking the delegation denies the next request, with no other record touched', async () => {
    const world = await delegableWorld();
    const delegationId = delegateToAgent(world);
    await representAlice(world);
    assert.equal((await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('r-1', transferOf(1_000), asAgent()))).status, 'allowed');

    world.authorityRuntime.revokeDelegationGrant(delegationId, GA_MANAGER_ACTOR_ID, 'phase-5-3-scenario');

    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('r-2', transferOf(1_000), asAgent()));
    assert.equal(outcome.status, 'denied');
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 7_500 }, 'and nothing moved');
  });

  it('19. revoking the manager’s own grant disables the agent below it', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);
    assert.equal((await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('r-3', transferOf(1_000), asAgent()))).status, 'allowed');

    world.authorityRuntime.store.updateGrantStatus(GA_MANAGER_GRANT_ID, 'revoked');

    assert.equal((await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('r-4', transferOf(1_000), asAgent()))).status, 'denied');
  });

  it('20. a mandate already issued survives a later revocation — it is its own authorization artifact', async () => {
    const world = await delegableWorld();
    const delegationId = delegateToAgent(world);
    await representAlice(world);

    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('r-5', transferOf(1_500), asAgent()));
    assert.equal(outcome.status, 'allowed');

    world.authorityRuntime.revokeDelegationGrant(delegationId, GA_MANAGER_ACTOR_ID, 'phase-5-3-scenario');

    // Recording the execution of an already-issued mandate does not re-ask the
    // authority question, exactly as it does not for a revoked representation.
    // The revocation stops *new* requests; it does not reach backwards into an
    // authorization Soberanía already issued. Asserted rather than assumed, because
    // this is the temporal boundary an integrator has to know about.
    const executed = await world.transfer.recordExecution(
      TENANT_CONTEXT,
      conformingExecution(outcome.mandate!.id, ALICE, CAROL, [ECONOMIC], { kind: 'proportional', basisPoints: 1_500 }),
    );
    assert.ok(executed);
    assert.deepEqual(await heldScope(world, ALICE, ECONOMIC), { kind: 'proportional', basisPoints: 6_000 });

    const afterwards = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('r-6', transferOf(500), asAgent()));
    assert.equal(afterwards.status, 'denied', 'while a new request is refused');
  });
});

// ---------------------------------------------------------------------------
// 6. Subdelegation, agent to agent.
// ---------------------------------------------------------------------------

describe('Derived authority — subdelegation', () => {
  it('21. an agent may subdelegate to another agent within its own envelope', async () => {
    const world = await delegableWorld({ depth: 2 });
    const first = delegateToAgent(world, { canRedelegate: true });
    world.authorityRuntime.createDelegationGrant({
      id: 'delegation-agent-to-agent',
      delegatorActorId: GA_DELEGATE_ACTOR_ID,
      delegateActorId: GA_SUBDELEGATE_ACTOR_ID,
      delegateActorType: 'agent',
      trustDomainId: GA_TRUST_DOMAIN_ID,
      sourceAuthorityGrantId: first,
      capability: ENTERPRISE_TRANSFER_CAPABILITY,
      actions: [ENTERPRISE_TRANSFER_CAPABILITY],
      resourceScopes: [GA_ASSET_SCOPE],
    });
    await representAlice(world, { to: GA_SUBDELEGATE_ACTOR_ID });

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('s-1', transferOf(1_000), asAgent(GA_SUBDELEGATE_ACTOR_ID, GA_SUBDELEGATE_PASSPORT_ID, GA_SUBDELEGATE_TOKEN_ID)),
    );
    assert.equal(outcome.status, 'allowed');
  });

  it('22. revoking the middle hop denies the agent below it', async () => {
    const world = await delegableWorld({ depth: 2 });
    const first = delegateToAgent(world, { canRedelegate: true });
    world.authorityRuntime.createDelegationGrant({
      id: 'delegation-agent-to-agent',
      delegatorActorId: GA_DELEGATE_ACTOR_ID,
      delegateActorId: GA_SUBDELEGATE_ACTOR_ID,
      delegateActorType: 'agent',
      trustDomainId: GA_TRUST_DOMAIN_ID,
      sourceAuthorityGrantId: first,
      capability: ENTERPRISE_TRANSFER_CAPABILITY,
      actions: [ENTERPRISE_TRANSFER_CAPABILITY],
      resourceScopes: [GA_ASSET_SCOPE],
    });
    await representAlice(world, { to: GA_SUBDELEGATE_ACTOR_ID });
    world.authorityRuntime.revokeDelegationGrant(first, GA_DELEGATE_ACTOR_ID, 'phase-5-3-scenario');

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('s-2', transferOf(1_000), asAgent(GA_SUBDELEGATE_ACTOR_ID, GA_SUBDELEGATE_PASSPORT_ID, GA_SUBDELEGATE_TOKEN_ID)),
    );
    assert.equal(outcome.status, 'denied');
  });

  it('23. a subdelegation cannot be created past a parent that forbids redelegation', async () => {
    const world = await delegableWorld({ depth: 2 });
    const first = delegateToAgent(world, { canRedelegate: false });
    assert.throws(() =>
      world.authorityRuntime.createDelegationGrant({
        id: 'delegation-agent-to-agent',
        delegatorActorId: GA_DELEGATE_ACTOR_ID,
        delegateActorId: GA_SUBDELEGATE_ACTOR_ID,
        delegateActorType: 'agent',
        trustDomainId: GA_TRUST_DOMAIN_ID,
        sourceAuthorityGrantId: first,
        capability: ENTERPRISE_TRANSFER_CAPABILITY,
        actions: [ENTERPRISE_TRANSFER_CAPABILITY],
        resourceScopes: [GA_ASSET_SCOPE],
      }),
    );
  });

  it('24. a subdelegation cannot carry an action its parent lacks', async () => {
    const world = await delegableWorld({ depth: 2 });
    const first = delegateToAgent(world, { actions: [ENTERPRISE_LICENSE_CAPABILITY], canRedelegate: true });
    assert.throws(() =>
      world.authorityRuntime.createDelegationGrant({
        id: 'delegation-agent-to-agent',
        delegatorActorId: GA_DELEGATE_ACTOR_ID,
        delegateActorId: GA_SUBDELEGATE_ACTOR_ID,
        delegateActorType: 'agent',
        trustDomainId: GA_TRUST_DOMAIN_ID,
        sourceAuthorityGrantId: first,
        capability: ENTERPRISE_TRANSFER_CAPABILITY,
        actions: [ENTERPRISE_TRANSFER_CAPABILITY],
        resourceScopes: [GA_ASSET_SCOPE],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 7. The other three governed actions, on the same delegated path.
// ---------------------------------------------------------------------------

describe('Derived authority — the four governed actions behave alike', () => {
  it('25. LICENSE: a delegated agent bound to Alice may license her unfractionalized right', async () => {
    const world = await delegableWorld();
    await seedPosition(world, ALICE, USAGE, { kind: 'proportional', basisPoints: 10_000 });
    delegateToAgent(world);
    await representAlice(world, { rights: [USAGE] });

    const outcome = await world.license.requestLicense(TENANT_CONTEXT, GA_TENANT_A, licenseRequest('l-1', ALICE, licenseTerms([USAGE]), asAgent()));
    assert.equal(outcome.status, 'allowed');
  });

  it('26. LICENSE: an absent scope is still not read as the whole, and a wrong holder is still refused', async () => {
    const world = await delegableWorld();
    await seedPosition(world, ALICE, USAGE, { kind: 'proportional', basisPoints: 10_000 });
    await seedPosition(world, BOB, USAGE, { kind: 'proportional', basisPoints: 10_000 });
    delegateToAgent(world);
    await representAlice(world, { rights: [USAGE] });

    const outcome = await world.license.requestLicense(TENANT_CONTEXT, GA_TENANT_A, licenseRequest('l-2', BOB, licenseTerms([USAGE]), asAgent()));
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(REPRESENTATION_MISSING));
  });

  it('27. TOKENIZE: allowed for the represented holder, denied for another', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);

    const forAlice = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('t-1', ALICE, tokenizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 }), asAgent()),
    );
    const forBob = await world.tokenization.requestTokenization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      tokenizationRequest('t-2', BOB, tokenizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 }), asAgent()),
    );
    assert.equal(forAlice.status, 'allowed');
    assert.equal(forBob.status, 'denied');
  });

  it('28. TOKENIZE: revoking the delegation denies the next request', async () => {
    const world = await delegableWorld();
    const delegationId = delegateToAgent(world);
    await representAlice(world);
    assert.equal(
      (await world.tokenization.requestTokenization(TENANT_CONTEXT, GA_TENANT_A, tokenizationRequest('t-3', ALICE, tokenizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 }), asAgent()))).status,
      'allowed',
    );
    world.authorityRuntime.revokeDelegationGrant(delegationId, GA_MANAGER_ACTOR_ID, 'phase-5-3-scenario');
    assert.equal(
      (await world.tokenization.requestTokenization(TENANT_CONTEXT, GA_TENANT_A, tokenizationRequest('t-4', ALICE, tokenizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 }), asAgent()))).status,
      'denied',
    );
  });

  it('29. COLLATERALIZE: the secured party is not the holder, and neither is the delegate', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world);

    const outcome = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('k-1', ALICE, collateralizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 }), asAgent()),
    );
    assert.equal(outcome.status, 'allowed');
    assert.equal(await heldScope(world, GA_DELEGATE_ACTOR_ID, ECONOMIC), null);
  });

  it('30. COLLATERALIZE: over the representative ceiling is refused', async () => {
    const world = await delegableWorld();
    delegateToAgent(world);
    await representAlice(world, { ceiling: 1_000 });

    const outcome = await world.collateralization.requestCollateralization(
      TENANT_CONTEXT,
      GA_TENANT_A,
      collateralizationRequest('k-2', ALICE, collateralizationTerms([ECONOMIC], { kind: 'proportional', basisPoints: 2_000 }), asAgent()),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes(REPRESENTATION_SCOPE_EXCEEDED));
  });
});

// ---------------------------------------------------------------------------
// 8. Direct authority, unchanged.
// ---------------------------------------------------------------------------

describe('Derived authority — the direct path did not get harder', () => {
  it('31. a holder acting on its own authority needs neither delegation nor representation', async () => {
    const world = await delegableWorld();
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('p-1', transferOf(1_500, ALICE, BOB), { requestedBy: ALICE, context: { passportId: 'passport-alice', capabilityTokenId: 'cap-alice-governed-actions' } }),
    );
    assert.equal(outcome.status, 'allowed');
  });

  it('32. a deployment that never adopted delegation is unaffected', async () => {
    // No `managerDelegationDepth`, so the manager's grant keeps its legacy
    // `canDelegate: false` shape, and the manager's own requests behave exactly
    // as they did before this phase.
    const world = buildGovernedAuthorityWorld({ withRepresentation: true });
    await seedPosition(world, ALICE, ECONOMIC, { kind: 'proportional', basisPoints: 7_500 });
    await grantRepresentation(world, GA_MANAGER_ACTOR_ID, ALICE, [ECONOMIC], { scopeLimit: upTo(2_000) });

    const outcome = await world.transfer.requestTransfer(TENANT_CONTEXT, GA_TENANT_A, transferRequest('p-2', transferOf(1_500)));
    assert.equal(outcome.status, 'allowed');
  });
});
