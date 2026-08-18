import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthorityDecision } from '../domain/authority-decision.js';
import { createAuthorityGraphRuntime, type AuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext, type ManualAuthorityRuntimeClock } from '../runtime/authority-runtime-context.js';

/**
 * Derived authority must be traceable to a real source, through hops that each
 * actually changed hands, none of which gained an action, and every one of
 * which is still live at the instant of use.
 *
 * ## What was measured before this suite existed
 *
 * `DelegationService` refused every amplification at creation, and every one of
 * those refusals was worth exactly as much as the assumption that creation is
 * the only way a record reaches the store. It is not: `AuthorityGraphStore`
 * exposes `importGrant`/`importDelegation`, and a restore, a migration or a
 * second writer are equally routes around the service. Presented with records
 * that never passed the service, the evaluation path returned:
 *
 * ```
 * delegation naming a source that does not exist   authority_valid
 * delegation reached from itself (a cycle)         authority_valid
 * delegation whose delegator never held the source authority_valid
 * delegation carrying an action its source lacks   authority_valid
 * ```
 *
 * Resource expansion, revocation, suspension, expiry, depth and redelegability
 * were already refused at evaluation and are re-asserted below so a later
 * change cannot quietly move them into the first list.
 *
 * Every test here forges its records through `store.import*` on purpose. A
 * suite that only ever created records through `DelegationService` would prove
 * that the service validates, which was never in doubt, rather than that the
 * *evaluation* does, which is the security property.
 */

const NOW = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN = 'trust-domain-atlas';
const OTHER_TRUST_DOMAIN = 'trust-domain-beta';
const ASSET_A = 'asset:atlas-a';
const ASSET_B = 'asset:atlas-b';

const ROOT = 'actor-atlas-root';
const A = 'actor-a';
const B = 'actor-b';
const C = 'actor-c';
const D = 'actor-d';
const STRANGER = 'actor-stranger';

interface World {
  readonly runtime: AuthorityGraphRuntime;
  readonly clock: ManualAuthorityRuntimeClock;
  readonly rootGrantId: string;
}

/** Root issuer -> A, delegable `maxDelegationDepth` deep over TRANSFER and LICENSE on asset A. */
function world(options: { readonly maxDepth?: number; readonly grantExpiresAt?: string } = {}): World {
  const ctx = createAuthorityRuntimeContext(NOW);
  const runtime = createAuthorityGraphRuntime(ctx);
  runtime.registerRootIssuer(TRUST_DOMAIN, ROOT);
  const grant = runtime.issueAuthorityGrant({
    id: 'authority-grant-a',
    issuerActorId: ROOT,
    subjectActorId: A,
    trustDomainId: TRUST_DOMAIN,
    capability: 'asset.governance',
    actions: ['TRANSFER', 'LICENSE'],
    resourceScopes: [ASSET_A],
    canDelegate: true,
    maxDelegationDepth: options.maxDepth ?? 3,
    allowedDelegateActorTypes: ['human', 'agent', 'organization', 'system'],
    ...(options.grantExpiresAt !== undefined ? { expiresAt: options.grantExpiresAt } : {}),
  });
  return { runtime, clock: ctx.clock as ManualAuthorityRuntimeClock, rootGrantId: grant.id };
}

function delegate(
  runtime: AuthorityGraphRuntime,
  input: {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly source: string;
    readonly actions: readonly string[];
    readonly scopes?: readonly string[];
    readonly canRedelegate?: boolean;
    readonly expiresAt?: string;
  },
): string {
  const delegation = runtime.createDelegationGrant({
    id: input.id,
    delegatorActorId: input.from,
    delegateActorId: input.to,
    delegateActorType: 'agent',
    trustDomainId: TRUST_DOMAIN,
    sourceAuthorityGrantId: input.source,
    capability: 'asset.governance',
    actions: input.actions,
    resourceScopes: input.scopes ?? [ASSET_A],
    canRedelegate: input.canRedelegate ?? false,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  });
  return delegation.id;
}

/** Writes a delegation straight into the store, skipping every issuance rule -- the shape of a record that arrived by restore, migration or a second writer. */
function forge(
  runtime: AuthorityGraphRuntime,
  overrides: {
    readonly id: string;
    readonly delegatorActorId: string;
    readonly delegateActorId: string;
    readonly sourceAuthorityGrantId: string;
    readonly actions?: readonly string[];
    readonly resourceScopes?: readonly string[];
    readonly delegationDepth?: number;
    readonly canRedelegate?: boolean;
    readonly maxDelegationDepth?: number;
    readonly trustDomainId?: string;
  },
): string {
  const forged = runtime.store.importDelegation({
    id: overrides.id,
    delegatorActorId: overrides.delegatorActorId,
    delegateActorId: overrides.delegateActorId,
    principalActorId: overrides.delegatorActorId,
    trustDomainId: overrides.trustDomainId ?? TRUST_DOMAIN,
    sourceAuthorityGrantId: overrides.sourceAuthorityGrantId,
    capability: 'asset.governance',
    actions: overrides.actions ?? ['TRANSFER'],
    resourceScopes: overrides.resourceScopes ?? [ASSET_A],
    delegationDepth: overrides.delegationDepth ?? 1,
    canRedelegate: overrides.canRedelegate ?? false,
    maxDelegationDepth: overrides.maxDelegationDepth ?? 3,
    status: 'active',
    issuedAt: NOW,
  });
  return forged.id;
}

function verify(runtime: AuthorityGraphRuntime, actorId: string, action: string, resourceScope = ASSET_A, trustDomainId = TRUST_DOMAIN): AuthorityDecision {
  return runtime.verifyAuthority(runtime.buildAuthorityChainRequest({ actorId, trustDomainId, action, resourceScope }));
}

// ---------------------------------------------------------------------------
// 1. The happy path still works, and direct authority needs no self-delegation.
// ---------------------------------------------------------------------------

describe('Derived authority — legitimate chains', () => {
  it('1. a bounded one-hop delegation lets the delegate act', () => {
    const { runtime, rootGrantId } = world();
    delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'] });

    const decision = verify(runtime, B, 'TRANSFER');
    assert.equal(decision.valid, true);
    assert.equal(decision.reasonCode, 'AUTHORITY_CHAIN_VALID');
  });

  it('2. a narrower subdelegation two hops down is valid, and the chain names every hop', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER', 'LICENSE'], canRedelegate: true });
    delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'] });

    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, true);
    assert.deepEqual(
      decision.chain?.delegations.map((entry) => entry.id),
      ['d-c', 'd-b'],
    );
    assert.equal(decision.chain?.grants.at(-1)?.id, rootGrantId);
  });

  it('3. the holder of a direct grant needs no delegation to itself', () => {
    const { runtime } = world();
    const decision = verify(runtime, A, 'TRANSFER');
    assert.equal(decision.valid, true);
    assert.equal(decision.chain?.delegations.length, 0);
  });

  it('4. a delegate does not inherit an action the delegation did not name', () => {
    const { runtime, rootGrantId } = world();
    delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['LICENSE'] });

    assert.equal(verify(runtime, B, 'LICENSE').valid, true);
    assert.equal(verify(runtime, B, 'TRANSFER').valid, false);
  });
});

// ---------------------------------------------------------------------------
// 2. Rootedness. No orphan may stand on its own.
// ---------------------------------------------------------------------------

describe('Derived authority — every chain must terminate at a real grant', () => {
  it('5. a delegation whose source does not exist is refused at evaluation', () => {
    const { runtime } = world();
    forge(runtime, { id: 'd-orphan', delegatorActorId: STRANGER, delegateActorId: C, sourceAuthorityGrantId: 'authority-grant-that-never-existed' });

    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'DELEGATION_SOURCE_AUTHORITY_MISSING');
    assert.equal(decision.type, 'delegation_lineage_broken');
  });

  it('6. deleting an ancestor turns its descendant into an orphan, without rewriting the descendant', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'] });
    assert.equal(verify(runtime, C, 'TRANSFER').valid, true);

    // The child record is untouched throughout; only its ancestor goes away.
    runtime.store.importDelegation({ ...runtime.store.getDelegation(b)!, sourceAuthorityGrantId: 'gone' });

    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'DELEGATION_SOURCE_AUTHORITY_MISSING');
  });
});

// ---------------------------------------------------------------------------
// 3. Lineage continuity and cycles.
// ---------------------------------------------------------------------------

describe('Derived authority — lineage continuity', () => {
  it('7. a hop issued by an actor that never held its source is refused', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    forge(runtime, { id: 'd-forged', delegatorActorId: STRANGER, delegateActorId: C, sourceAuthorityGrantId: b, delegationDepth: 2 });

    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'DELEGATOR_DOES_NOT_HOLD_SOURCE_AUTHORITY');
    assert.equal(decision.type, 'issuer_not_authorized');
  });

  it('8. a cycle is refused rather than walked, and terminates promptly', () => {
    const { runtime, rootGrantId } = world({ maxDepth: 6 });
    // A -> B -> C, then C's own delegation is made B's source, so following
    // sources from C never reaches a grant. Both hops keep their delegator/
    // delegate pairing, so the only remaining defect is the cycle itself.
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    const c = delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'], canRedelegate: true });
    const d = delegate(runtime, { id: 'd-d', from: C, to: D, source: c, actions: ['TRANSFER'], canRedelegate: true });
    runtime.store.importDelegation({ ...runtime.store.getDelegation(b)!, delegatorActorId: D, sourceAuthorityGrantId: d });

    const startedAt = Date.now();
    const decision = verify(runtime, D, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'DELEGATION_LINEAGE_CYCLE');
    assert.equal(decision.type, 'delegation_lineage_broken');
    assert.ok(Date.now() - startedAt < 1_000, 'a cycle must not be walked to a timeout');
  });
});

// ---------------------------------------------------------------------------
// 4. Non-amplification, one axis at a time.
// ---------------------------------------------------------------------------

describe('Derived authority — a child may narrow and never broaden', () => {
  it('9. action: a hop cannot carry an action its source lacks', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['LICENSE'], canRedelegate: true });
    forge(runtime, { id: 'd-c', delegatorActorId: B, delegateActorId: C, sourceAuthorityGrantId: b, actions: ['TRANSFER'], delegationDepth: 2 });

    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'DELEGATION_ACTION_EXCEEDS_PARENT');
    assert.equal(decision.type, 'scope_expansion_detected');
  });

  it('10. action: creation refuses the same expansion', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['LICENSE'], canRedelegate: true });
    assert.throws(() => delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'] }));
  });

  it('11. resource: a hop cannot carry a resource its source lacks', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    forge(runtime, { id: 'd-c', delegatorActorId: B, delegateActorId: C, sourceAuthorityGrantId: b, resourceScopes: [ASSET_B], delegationDepth: 2 });

    const decision = verify(runtime, C, 'TRANSFER', ASSET_B);
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'DELEGATION_SCOPE_EXCEEDS_PARENT');
  });

  it('12. redelegation: a hop cannot be created beneath a parent that forbids it, nor forged past one', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: false });
    assert.throws(() => delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'] }));

    forge(runtime, { id: 'd-c', delegatorActorId: B, delegateActorId: C, sourceAuthorityGrantId: b, delegationDepth: 2, canRedelegate: true, maxDelegationDepth: 99 });
    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'REDELEGATION_NOT_PERMITTED');
  });

  it('13. depth: a hop past the source grant’s ceiling is refused', () => {
    const { runtime, rootGrantId } = world({ maxDepth: 1 });
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    // Depth 1 is the ceiling, so `canRedelegate` was forced false at creation.
    assert.equal(runtime.store.getDelegation(b)?.canRedelegate, false);

    forge(runtime, { id: 'd-c', delegatorActorId: B, delegateActorId: C, sourceAuthorityGrantId: b, delegationDepth: 2, maxDelegationDepth: 1 });
    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'DELEGATION_DEPTH_EXCEEDED');
  });

  it('14. trust domain: a hop cannot move authority into another domain', () => {
    const { runtime, rootGrantId } = world();
    // The root issuer is registered in the *target* domain too, so the denial
    // below is attributable to the domain crossing itself rather than to the
    // second domain simply not recognizing the issuer.
    runtime.registerRootIssuer(OTHER_TRUST_DOMAIN, ROOT);
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    forge(runtime, {
      id: 'd-c',
      delegatorActorId: B,
      delegateActorId: C,
      sourceAuthorityGrantId: b,
      delegationDepth: 2,
      trustDomainId: OTHER_TRUST_DOMAIN,
    });

    const decision = verify(runtime, C, 'TRANSFER', ASSET_A, OTHER_TRUST_DOMAIN);
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'AUTHORITY_CROSSES_TRUST_DOMAIN');
  });
});

// ---------------------------------------------------------------------------
// 5. Liveness, resolved dynamically at every use.
// ---------------------------------------------------------------------------

describe('Derived authority — ancestors are re-read at every use', () => {
  it('15. revoking a parent disables its descendant without the descendant being rewritten', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'] });
    assert.equal(verify(runtime, C, 'TRANSFER').valid, true);

    const childBefore = runtime.store.getDelegation('d-c');
    runtime.delegationService.revokeDelegationGrant(b);

    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'ANCESTOR_DELEGATION_GRANT_REVOKED');
    assert.deepEqual(runtime.store.getDelegation('d-c'), childBefore, 'the descendant record must not have been touched');
  });

  it('16. suspending a parent fails closed for new uses', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'] });
    runtime.delegationService.suspendDelegationGrant(b);

    assert.equal(verify(runtime, C, 'TRANSFER').valid, false);
  });

  it('17. revoking the root grant disables the whole subtree', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true });
    delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'] });
    runtime.store.updateGrantStatus(rootGrantId, 'revoked');

    assert.equal(verify(runtime, B, 'TRANSFER').valid, false);
    assert.equal(verify(runtime, C, 'TRANSFER').valid, false);
  });

  it('18. a child cannot outlive its parent, even though it recorded a later expiry', () => {
    const { runtime, clock, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'], canRedelegate: true, expiresAt: '2026-02-01T00:00:00.000Z' });
    delegate(runtime, { id: 'd-c', from: B, to: C, source: b, actions: ['TRANSFER'], expiresAt: '2027-01-01T00:00:00.000Z' });

    assert.equal(verify(runtime, C, 'TRANSFER').valid, true);
    clock.set('2026-03-01T00:00:00.000Z');
    const decision = verify(runtime, C, 'TRANSFER');
    assert.equal(decision.valid, false);
    assert.equal(decision.reasonCode, 'ANCESTOR_DELEGATION_GRANT_EXPIRED');
  });

  it('19. revoking one child leaves its sibling alone', () => {
    const { runtime, rootGrantId } = world();
    const b = delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'] });
    delegate(runtime, { id: 'd-d', from: A, to: D, source: rootGrantId, actions: ['TRANSFER'] });
    runtime.delegationService.revokeDelegationGrant(b);

    assert.equal(verify(runtime, B, 'TRANSFER').valid, false);
    assert.equal(verify(runtime, D, 'TRANSFER').valid, true);
  });

  it('20. branches do not pool their authority', () => {
    const { runtime, rootGrantId } = world();
    delegate(runtime, { id: 'd-b', from: A, to: B, source: rootGrantId, actions: ['TRANSFER'] });
    delegate(runtime, { id: 'd-d', from: A, to: D, source: rootGrantId, actions: ['LICENSE'] });

    assert.equal(verify(runtime, B, 'TRANSFER').valid, true);
    assert.equal(verify(runtime, B, 'LICENSE').valid, false);
    assert.equal(verify(runtime, D, 'LICENSE').valid, true);
    assert.equal(verify(runtime, D, 'TRANSFER').valid, false);
  });
});
