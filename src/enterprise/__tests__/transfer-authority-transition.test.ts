import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ENTERPRISE_TRANSFERABLE_RIGHT_TYPES } from '@aoc-enterprise/transfer-mandate';

import {
  PERMITTED_REGISTRY,
  TRANSFEREE_REF,
  TRANSFEROR_REF,
  TRANSFER_ASSET,
  TRANSFER_ASSET_SCOPE,
  TRANSFER_MANAGER_ACTOR_ID,
  TRANSFER_TENANT_A,
  TRANSFER_TRUST_DOMAIN_ID,
  buildConformingTransferExecution,
  buildTransferManagerRequest,
  buildTransferWorld,
} from './transfer-support.js';

/**
 * The two architectural questions `TRANSFER` exists to answer, measured
 * against the real runtimes rather than asserted from design intent.
 *
 * Both are deliberately written as *measurements*. Each one could have gone
 * either way before it was run, and neither result was implemented into
 * existence: nothing in the transfer implementation writes to the Authority
 * Graph, and nothing in it teaches the Authority Graph about governed rights.
 * What these tests record is what the existing architecture actually does when
 * a transfer completes.
 *
 * ```
 * 1. Post-transfer authority
 *    After a fully-evidenced transfer of a right to Party B, does AOC
 *    consider Party B authorized to do anything with it?
 *
 * 2. Authority-source right vs action-target right
 *    Can the Authority Graph express "authorized over Right X" as distinct
 *    from "authorized over Asset A"?
 * ```
 *
 * The findings are recorded in
 * `docs/architecture/ADR-TRANSFER-ACTION.md` and
 * `docs/architecture/ADR-ENTERPRISE-ENFORCEMENT-VOCABULARY.md`.
 *
 * ## Both findings have since been resolved, and this suite is unchanged
 *
 * A generic governed-authority foundation now exists
 * (`docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`): a completed
 * transfer moves recognized authority, and an action's target right is checked
 * against what its holder actually controls.
 *
 * Nothing below was rewritten to reflect that, and nothing below is stale.
 * `buildTransferWorld` builds a world with **no governed authority state at
 * all** — no positions, no resolver wired into the Kernel — which is precisely
 * the *unenrolled* case the compatibility policy preserves byte-for-byte. What
 * these tests measured about that case is still exactly true of it, and their
 * continuing to pass is itself the evidence that existing deployments were not
 * broken.
 *
 * The resolved behaviour is measured separately, against a world that *has*
 * enrolled its resource, in `governed-authority-scenario.test.ts` — including
 * the same before/after comparison run side by side.
 */

const TENANT_CONTEXT = { system: false, organizationId: TRANSFER_TENANT_A, actorId: 'actor-test' } as const;

// ---------------------------------------------------------------------------
// Finding 1 — post-transfer authority.
// ---------------------------------------------------------------------------

describe('TRANSFER — what AOC believes about the recipient after a completed transfer', () => {
  /** Runs the reference scenario to completion: mandate issued, movement effected and evidenced. */
  async function completedTransfer(worldOverrides: Parameters<typeof buildTransferWorld>[0] = {}) {
    const world = buildTransferWorld(worldOverrides);
    const outcome = await world.service.requestTransfer(TENANT_CONTEXT, TRANSFER_TENANT_A, buildTransferManagerRequest());
    assert.ok(outcome.mandate !== undefined);
    const moved = await world.service.recordExecution(TENANT_CONTEXT, buildConformingTransferExecution(outcome.mandate.id));
    await world.service.recordLifecycleEvent(TENANT_CONTEXT, {
      mandateId: outcome.mandate.id,
      executionId: moved.execution.id,
      reportedBy: PERMITTED_REGISTRY,
      occurredAt: '2026-03-01T00:00:00.000Z',
      lifecycleType: 'registered',
    });
    return { ...world, mandate: outcome.mandate, execution: moved.execution };
  }

  it('records that the movement occurred, in full, with the recipient named', async () => {
    const { service, mandate, execution } = await completedTransfer();

    // The premise of the question below: AOC really does hold complete,
    // integrity-sealed evidence that 25% of the economic interest moved from
    // Party A to Party B.
    assert.equal(execution.transfereeRef, TRANSFEREE_REF);
    assert.deepEqual(execution.transferredScope, { kind: 'proportional', basisPoints: 2500 });
    const lineage = await service.getEvidenceLineage(TENANT_CONTEXT, mandate.id);
    assert.deepEqual(lineage.transferredScope, { kind: 'proportional', basisPoints: 2500 });
    assert.equal(lineage.lifecycleRefs.length, 1);
  });

  it('FINDING: the recipient acquires no authority — a governed request by Party B over the same right is denied', async () => {
    const { service } = await completedTransfer();

    // Party B now holds the right, as far as every external system and AOC's
    // own evidence are concerned. It submits a TRANSFER of the right it just
    // received, onward to a third party.
    const onward = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({
        requestedBy: TRANSFEREE_REF,
        context: {},
        terms: {
          rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
          transferorRef: TRANSFEREE_REF,
          transfereeRef: 'party-company-e',
          scope: { kind: 'proportional', basisPoints: 1000 },
          constraints: { partialTransferAllowed: false, onwardTransferAllowed: 'prohibited' },
        },
      }),
    );

    // This is the finding. It is not a bug in the transfer implementation and
    // it is not a policy denial about onward transfer: Party B is simply not
    // an actor the Authority Graph knows anything about, because recording
    // transfer evidence does not create authority.
    assert.notEqual(onward.status, 'allowed');
    assert.equal(onward.mandate, undefined);
  });

  it('FINDING: the transferor retains its authority — AOC did not take anything away either', async () => {
    const { service } = await completedTransfer();

    // The symmetric half of the same finding, and the more consequential one
    // operationally. The manager's authority over the asset is untouched by
    // the completed transfer, so a *second* transfer of the same 25% is
    // authorized at the governance layer. Only the per-mandate conservation
    // rule stops the same portion moving twice, and that rule is scoped to one
    // mandate: nothing in AOC knows that Party A now holds 25% less.
    const second = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({ requestId: 'transfer-request-second', correlationId: 'corr-second' }),
    );

    assert.equal(second.status, 'allowed', 'a completed transfer does not reduce the transferor-side authority AOC holds');
    assert.ok(second.mandate !== undefined);
    assert.deepEqual(second.mandate.terms.scope, { kind: 'proportional', basisPoints: 2500 });
    assert.equal(second.mandate.transferredScope, undefined, 'the new mandate starts from a clean cumulative total');
  });

  it('CONTROL: an explicit administrative grant is what makes AOC recognize the recipient — and nothing in the transfer path performs it', async () => {
    // Identical scenario, except an administrator has separately issued Party B
    // its own recognition, passport, capability token and authority grant. This
    // is the *only* thing that changes the outcome, and no transfer code path
    // does it.
    const { service } = await completedTransfer({ grantTransfereeAuthority: true });

    const onward = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({
        requestedBy: TRANSFEREE_REF,
        requestId: 'transfer-request-onward',
        correlationId: 'corr-onward',
        context: { passportId: 'passport-transferee', capabilityTokenId: 'cap-transferee-transfer' },
        terms: {
          rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
          transferorRef: TRANSFEREE_REF,
          transfereeRef: 'party-company-e',
          scope: { kind: 'proportional', basisPoints: 1000 },
          constraints: { partialTransferAllowed: false, onwardTransferAllowed: 'prohibited' },
        },
      }),
    );

    assert.equal(onward.status, 'allowed', 'authority comes from an administrative grant, never from transfer evidence');
    assert.ok(onward.mandate !== undefined);
  });

  it('FINDING: no Enterprise surface exposes a post-transfer holder, and the lineage deliberately does not claim one', async () => {
    const { service, mandate } = await completedTransfer();
    const lineage = await service.getEvidenceLineage(TENANT_CONTEXT, mandate.id);

    // The lineage answers "who was authorized to receive it" and "how much
    // actually moved". It deliberately does not answer "who holds it now",
    // because AOC has no basis for that claim: it never verified the movement
    // and holds no ownership state to update.
    assert.ok(!('currentHolder' in lineage));
    assert.ok(!('holderAfterTransfer' in lineage));
    assert.equal(lineage.transferorRef, TRANSFEROR_REF, 'the lineage records the parties the authorization named, not a derived holder');
    assert.equal(lineage.transfereeRef, TRANSFEREE_REF);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 — authority-source right vs action-target right.
// ---------------------------------------------------------------------------

describe('TRANSFER — can the Authority Graph express authority over a right, or only over an asset?', () => {
  it('FINDING: authority is asset-scoped by default — a bare asset grant authorizes moving any right of it', async () => {
    const { service } = buildTransferWorld();

    // The manager holds `asset:digital-asset-a` and nothing narrower. It may
    // move the economic interest, the ownership interest, or any other right,
    // because the authority model has no field in which the difference could
    // be recorded.
    for (const right of [
      ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST,
      ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST,
      ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.USAGE_RIGHT,
    ]) {
      const outcome = await service.requestTransfer(
        TENANT_CONTEXT,
        TRANSFER_TENANT_A,
        buildTransferManagerRequest({
          requestId: `transfer-request-${right}`,
          correlationId: `corr-${right}`,
          terms: {
            rights: [right],
            transferorRef: TRANSFEROR_REF,
            transfereeRef: TRANSFEREE_REF,
            scope: { kind: 'proportional', basisPoints: 2500 },
            constraints: { partialTransferAllowed: false, onwardTransferAllowed: 'prohibited' },
          },
        }),
      );
      assert.equal(outcome.status, 'allowed', `an asset-scoped grant authorizes moving ${right}`);
    }
  });

  it('FINDING: right-scoping is achievable only as an untyped string convention over resourceScope', async () => {
    // The manager is granted a *narrower* hierarchical scope. The existing
    // `DelegationScopePolicy` contains it correctly, because it matches
    // `requested === granted || requested.startsWith(granted + ':')`.
    const rightScope = `${TRANSFER_ASSET_SCOPE}:usage-right`;
    const { service } = buildTransferWorld({ managerResourceScopes: [rightScope] });

    const withinScope = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({
        requestId: 'transfer-request-in-scope',
        correlationId: 'corr-in-scope',
        resourceScope: rightScope,
        terms: {
          rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.USAGE_RIGHT],
          transferorRef: TRANSFEROR_REF,
          transfereeRef: TRANSFEREE_REF,
          scope: { kind: 'proportional', basisPoints: 2500 },
          constraints: { partialTransferAllowed: false, onwardTransferAllowed: 'prohibited' },
        },
      }),
    );
    assert.equal(withinScope.status, 'allowed');

    // And an actor scoped to the usage right cannot reach the ownership
    // interest -- *provided the caller names the narrower scope*.
    const outsideScope = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({
        requestId: 'transfer-request-out-of-scope',
        correlationId: 'corr-out-of-scope',
        resourceScope: `${TRANSFER_ASSET_SCOPE}:ownership-interest`,
        terms: {
          rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST],
          transferorRef: TRANSFEROR_REF,
          transfereeRef: TRANSFEREE_REF,
          scope: { kind: 'proportional', basisPoints: 2500 },
          constraints: { partialTransferAllowed: false, onwardTransferAllowed: 'prohibited' },
        },
      }),
    );
    assert.notEqual(outsideScope.status, 'allowed', 'a hierarchical scope suffix does contain, when it is used');
  });

  it('FINDING: the convention is unenforced — nothing ties the scope string to the governed right actually being moved', async () => {
    const rightScope = `${TRANSFER_ASSET_SCOPE}:usage-right`;
    const { service } = buildTransferWorld({ managerResourceScopes: [rightScope] });

    // An actor whose authority names only the usage right asks to move the
    // *ownership interest*, while naming the usage-right scope. The Authority
    // Graph sees a scope it granted; the governed-right vocabulary is action
    // payload only and participates in no authority evaluation whatsoever.
    //
    // This is the load-bearing negative result. Right-scoped authority is not
    // *expressed* by the architecture -- it is at best *spelled* by a
    // deployment, and the spelling is never checked against the action's own
    // target right.
    const mismatched = await service.requestTransfer(
      TENANT_CONTEXT,
      TRANSFER_TENANT_A,
      buildTransferManagerRequest({
        requestId: 'transfer-request-mismatched',
        correlationId: 'corr-mismatched',
        resourceScope: rightScope,
        terms: {
          rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST],
          transferorRef: TRANSFEROR_REF,
          transfereeRef: TRANSFEREE_REF,
          scope: { kind: 'proportional', basisPoints: 2500 },
          constraints: { partialTransferAllowed: false, onwardTransferAllowed: 'prohibited' },
        },
      }),
    );

    assert.equal(
      mismatched.status,
      'allowed',
      'AUTHORITY MODEL IS SCOPE-STRING-BASED: an actor scoped to usage-right moved ownership-interest, because no contract connects the two',
    );
  });

  it('CONTEXT: the fixture wires exactly the trust domain and asset the findings above depend on', () => {
    assert.equal(TRANSFER_TRUST_DOMAIN_ID, 'trust-domain-meridian-holdings');
    assert.equal(TRANSFER_ASSET_SCOPE, 'asset:digital-asset-a');
    assert.equal(TRANSFER_ASSET.tenantId, TRANSFER_TENANT_A);
    assert.equal(TRANSFER_MANAGER_ACTOR_ID, 'actor-portfolio-manager');
  });
});
