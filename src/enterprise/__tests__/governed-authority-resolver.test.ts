import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOVERNED_RIGHT_TYPES, type GovernedRightType, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';
import type { GovernedAuthorityProviderPort } from '@aoc-enterprise/governed-authority';

import { createInMemoryGovernedAuthorityStore } from '../authority-governance/in-memory-authority-store.js';
import { createGovernedAuthorityResolver, type UnenrolledResourcePolicy } from '../authority-governance/resolver.js';
import type { GovernedAuthorityStore } from '../authority-governance/authority-store.js';
import {
  ALICE,
  BOB,
  FULL_INTEREST,
  GA_ASSET,
  GA_MANAGER_ACTOR_ID,
  GA_MANAGER_PASSPORT_ID,
  GA_MANAGER_TOKEN_ID,
  GA_TENANT_A,
  GA_TRUST_DOMAIN_ID,
  QUARTER_INTEREST,
  TENANT_CONTEXT,
  buildGovernedAuthorityWorld,
  licenseRequest,
  licenseTerms,
  seedPosition,
  transferRequest,
  transferTerms,
} from './governed-authority-support.js';

/**
 * The resolver decides one thing — whether recognized governed authority
 * covers what an action is asking for — and everything it can answer is
 * enumerated here.
 *
 * The legacy-compatibility half of this suite is the part that matters most
 * for existing deployments. `AuthorityGrant` has never carried a governed-right
 * field, so every grant in every deployment today is what these tests call a
 * *legacy asset-scoped* grant, and the question "what may such a grant
 * authorize once right-scoped authority exists?" has no safe default answer —
 * only an explicit policy, tested.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

const ADMIN = { system: true, actorId: 'actor-admin' } as const;
const TENANT = 'org-a';
const ASSET = { kind: 'asset', id: 'asset-a' } as const;

function proportional(basisPoints: number): GovernedRightsScope {
  return { kind: 'proportional', basisPoints };
}

async function buildResolver(
  seed: (store: GovernedAuthorityStore) => Promise<void>,
  unenrolledResourcePolicy?: UnenrolledResourcePolicy,
): Promise<GovernedAuthorityProviderPort> {
  const store = createInMemoryGovernedAuthorityStore({ now: () => NOW });
  await seed(store);
  return createGovernedAuthorityResolver(store, { ...(unenrolledResourcePolicy !== undefined ? { unenrolledResourcePolicy } : {}) });
}

async function bootstrap(
  store: GovernedAuthorityStore,
  holderRef: string,
  scope: GovernedRightsScope,
  right: GovernedRightType = ECONOMIC,
  expiresAt?: string,
  effectiveFrom = NOW,
) {
  await store.bootstrapPosition(ADMIN, {
    tenantId: TENANT,
    holderRef,
    resource: ASSET,
    governedRight: right,
    scope,
    basis: { kind: 'administrative-bootstrap', assertedBy: 'actor-admin' },
    effectiveFrom,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  });
}

function query(holderRef: string, right: GovernedRightType = ECONOMIC, requestedScope?: GovernedRightsScope, at = NOW) {
  return {
    tenantId: TENANT,
    holderRef,
    resourceKind: ASSET.kind,
    resourceId: ASSET.id,
    governedRight: right,
    ...(requestedScope !== undefined ? { requestedScope } : {}),
    at,
  };
}

describe('Governed authority resolver — the six answers it can give', () => {
  it('covers a request inside a live position', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(10_000)));
    const coverage = await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(2_500)));
    assert.equal(coverage.outcome, 'covered');
  });

  it('covers a request for exactly the whole position, and refuses one basis point more', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(2_500)));
    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(2_500)))).outcome, 'covered');
    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(2_501)))).outcome, 'insufficient_scope');
  });

  it('reports no authority for a right the holder has no position in, even on a resource it holds another right of', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(10_000), USAGE));
    const coverage = await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(1)));
    assert.equal(coverage.outcome, 'no_right_authority');
  });

  it('reports no authority for an exhausted position — nothing left is not a scope shortfall', async () => {
    const store = createInMemoryGovernedAuthorityStore({ now: () => NOW });
    await bootstrap(store, ALICE, proportional(2_500));
    await store.applyTransition(ADMIN, {
      tenantId: TENANT,
      resource: ASSET,
      governedRights: [ECONOMIC],
      scope: proportional(2_500),
      fromHolderRef: ALICE,
      toHolderRef: BOB,
      basis: { kind: 'governed-execution', capability: 'transfer', executionRef: 'exec-all', mandateRef: 'mandate-all' },
      occurredAt: NOW,
    });
    const resolver = createGovernedAuthorityResolver(store);

    const coverage = await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(1)));
    assert.equal(coverage.outcome, 'no_right_authority');
  });

  it('refuses an incommensurable quantity rather than comparing it', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(10_000)));
    const coverage = await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, { kind: 'unitized', units: 1, unitDenomination: 'share' }));
    assert.equal(coverage.outcome, 'incompatible_scope');
  });

  it('refuses two unit denominations AOC holds no conversion between', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, { kind: 'unitized', units: 100, unitDenomination: 'share' }));
    assert.equal(
      (await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, { kind: 'unitized', units: 10, unitDenomination: 'token' }))).outcome,
      'incompatible_scope',
    );
    assert.equal(
      (await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, { kind: 'unitized', units: 10, unitDenomination: 'share' }))).outcome,
      'covered',
    );
  });

  it('does not cover a position outside its own effective window, in either direction', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(10_000), ECONOMIC, '2026-03-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'));

    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(1), NOW))).outcome, 'expired', 'before it begins');
    assert.equal(
      (await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(1), '2026-02-15T00:00:00.000Z'))).outcome,
      'covered',
      'while it runs',
    );
    assert.equal(
      (await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(1), '2026-04-01T00:00:00.000Z'))).outcome,
      'expired',
      'after it ends',
    );
  });

  it('treats an absent requested scope as "some live authority over this right", never as all of it', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(1)));

    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC))).outcome, 'covered', 'one basis point is enough for an unquantified draw');
    assert.equal((await resolver.resolveGovernedAuthority(query(BOB, ECONOMIC))).outcome, 'no_right_authority', 'but holding none of the right is not');
  });

  it('refuses a request for nothing rather than trivially covering it', async () => {
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(10_000)));
    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(0)))).outcome, 'insufficient_scope');
  });
});

describe('Governed authority resolver — legacy compatibility, stated as a policy rather than a default', () => {
  it("reports a resource nothing has been recorded against as not enrolled, which is every existing deployment's every resource", async () => {
    const resolver = await buildResolver(async () => undefined);
    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(2_500)))).outcome, 'resource_not_enrolled');
  });

  it('enforces strictly the moment a resource has any position at all — including for rights nobody was bootstrapped into', async () => {
    // The load-bearing property of per-resource enrolment. Enrolling the usage
    // right of an asset enrols the *asset*, so the ownership interest of that
    // same asset is now enforced too, and a holder with no position in it is
    // denied. Partial enrolment fails closed.
    const resolver = await buildResolver((store) => bootstrap(store, ALICE, proportional(10_000), USAGE));

    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, USAGE, proportional(2_500)))).outcome, 'covered');
    assert.equal(
      (await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(2_500)))).outcome,
      'no_right_authority',
      'the right nobody holds is denied, not deferred',
    );
  });

  it("under the 'deny' policy, an unenrolled resource is unreachable rather than deferred", async () => {
    const resolver = await buildResolver(async () => undefined, 'deny');
    assert.equal((await resolver.resolveGovernedAuthority(query(ALICE, ECONOMIC, proportional(2_500)))).outcome, 'no_right_authority');
  });

  it('keeps enrolment per resource, so enrolling one asset does not lock out another', async () => {
    const store = createInMemoryGovernedAuthorityStore({ now: () => NOW });
    await bootstrap(store, ALICE, proportional(10_000));
    const resolver = createGovernedAuthorityResolver(store);

    const other = await resolver.resolveGovernedAuthority({
      tenantId: TENANT,
      holderRef: ALICE,
      resourceKind: 'asset',
      resourceId: 'asset-untouched',
      governedRight: ECONOMIC,
      requestedScope: proportional(10_000),
      at: NOW,
    });
    assert.equal(other.outcome, 'resource_not_enrolled');
  });
});

describe('Governed authority — legacy authority end to end, through the real Kernel', () => {
  it('LEGACY ASSET-SCOPED: an existing bare-asset grant still authorizes every right of an unenrolled resource, exactly as before', async () => {
    // The manager's grant in this world carries `resourceScopes:
    // ['asset:governed-asset-a']` and no governed-right field — the only shape
    // `AuthorityGrant` has ever had. Nothing is enrolled, so behaviour is
    // byte-for-byte what it was before this foundation existed.
    const world = buildGovernedAuthorityWorld();

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-legacy-unenrolled', transferTerms(ALICE, BOB, [GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST], QUARTER_INTEREST)),
    );
    assert.equal(outcome.status, 'allowed');
    assert.equal(outcome.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'), false);
  });

  it('TYPED RIGHT-SCOPED: the same grant no longer reaches a right of an enrolled resource that the holder has no position in', async () => {
    const world = buildGovernedAuthorityWorld();
    // One position enrols the asset. The grant is unchanged.
    await seedPosition(world, ALICE, GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST, FULL_INTEREST);

    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-legacy-enrolled', transferTerms(ALICE, BOB, [GOVERNED_RIGHT_TYPES.OWNERSHIP_INTEREST], QUARTER_INTEREST)),
    );
    assert.equal(outcome.status, 'denied', 'no silent privilege escalation survives enrolment');
    assert.ok(outcome.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
  });

  it('the governed-authority check never rescues a request the existing chain already denied', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST, FULL_INTEREST);

    // An unrecognized requester, holding a perfectly good position in the name
    // it claims to act for. Recognition Runtime stops it, and the governed
    // authority layer — which can only narrow — cannot let it through.
    const outcome = await world.transfer.requestTransfer(
      TENANT_CONTEXT,
      GA_TENANT_A,
      transferRequest('transfer-unrecognized', transferTerms(ALICE, BOB, [GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST], QUARTER_INTEREST), {
        requestedBy: 'actor-nobody',
        context: {},
      }),
    );
    assert.notEqual(outcome.status, 'allowed');
  });

  it('reports per right what it checked, and whose authority it checked', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST, FULL_INTEREST);

    const result = await world.kernel.evaluate({
      requestId: 'kernel-direct-1',
      actor: { id: GA_MANAGER_ACTOR_ID, trustDomainId: GA_TRUST_DOMAIN_ID },
      action: {
        type: 'transfer',
        capability: 'transfer',
        resourceScope: `${GA_ASSET.kind}:${GA_ASSET.id}`,
        governedRights: [GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST],
        governedRightsScope: QUARTER_INTEREST,
        governedAuthorityHolderRef: ALICE,
      },
      target: { id: GA_ASSET.id, type: GA_ASSET.kind },
      organization: { id: GA_TENANT_A },
      requestedAt: '2026-01-01T00:00:00.000Z',
      // The same recognition context every governed action service forwards.
      // Without it the request is denied by Recognition Runtime long before
      // governed authority is consulted — which is itself the ordering these
      // tests rely on elsewhere.
      context: { passportId: GA_MANAGER_PASSPORT_ID, capabilityTokenId: GA_MANAGER_TOKEN_ID },
    });

    assert.equal(result.authority.governedAuthority?.performed, true);
    assert.equal(result.authority.governedAuthority?.enforced, true);
    assert.deepEqual(result.authority.governedAuthority?.rights, [
      { governedRight: GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST, holderRef: ALICE, outcome: 'covered', covered: true },
    ]);
  });

  it('asks nothing at all when an action declares no governed right', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST, FULL_INTEREST);

    const result = await world.kernel.evaluate({
      requestId: 'kernel-direct-2',
      actor: { id: GA_MANAGER_ACTOR_ID, trustDomainId: GA_TRUST_DOMAIN_ID },
      action: { type: 'transfer', capability: 'transfer', resourceScope: `${GA_ASSET.kind}:${GA_ASSET.id}` },
      target: { id: GA_ASSET.id, type: GA_ASSET.kind },
      organization: { id: GA_TENANT_A },
      requestedAt: '2026-01-01T00:00:00.000Z',
      // The same recognition context every governed action service forwards.
      // Without it the request is denied by Recognition Runtime long before
      // governed authority is consulted — which is itself the ordering these
      // tests rely on elsewhere.
      context: { passportId: GA_MANAGER_PASSPORT_ID, capabilityTokenId: GA_MANAGER_TOKEN_ID },
    });

    assert.equal(result.authority.governedAuthority, undefined);
  });

  it('fails closed when a request declares governed rights but names no organization to scope them to', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST, FULL_INTEREST);

    const result = await world.kernel.evaluate({
      requestId: 'kernel-direct-3',
      actor: { id: GA_MANAGER_ACTOR_ID, trustDomainId: GA_TRUST_DOMAIN_ID },
      action: {
        type: 'transfer',
        capability: 'transfer',
        resourceScope: `${GA_ASSET.kind}:${GA_ASSET.id}`,
        governedRights: [GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST],
        governedRightsScope: QUARTER_INTEREST,
        governedAuthorityHolderRef: ALICE,
      },
      target: { id: GA_ASSET.id, type: GA_ASSET.kind },
      requestedAt: '2026-01-01T00:00:00.000Z',
      // The same recognition context every governed action service forwards.
      // Without it the request is denied by Recognition Runtime long before
      // governed authority is consulted — which is itself the ordering these
      // tests rely on elsewhere.
      context: { passportId: GA_MANAGER_PASSPORT_ID, capabilityTokenId: GA_MANAGER_TOKEN_ID },
    });

    assert.equal(result.status, 'denied');
    assert.ok(result.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
  });

  it('fails closed when the authority store cannot be read — an unreadable store is not a holder of everything', async () => {
    const world = buildGovernedAuthorityWorld();
    await seedPosition(world, ALICE, GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST, FULL_INTEREST);

    // A provider that throws stands in for a store that is down, corrupted, or
    // otherwise unreadable at the moment a decision has to be made.
    const failing = buildGovernedAuthorityWorld({
      authorityStore: {
        ...world.authorityStore,
        getPosition: async () => {
          throw new Error('authority store unavailable');
        },
      },
    });

    const outcome = await failing.license.requestLicense(
      TENANT_CONTEXT,
      GA_TENANT_A,
      licenseRequest('license-store-down', ALICE, licenseTerms([GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST])),
    );
    assert.equal(outcome.status, 'denied');
    assert.ok(outcome.reasonCodes.includes('AUTHORITY_GOVERNED_RIGHT_MISSING'));
  });
});
