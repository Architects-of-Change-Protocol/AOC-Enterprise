import {
  ENTERPRISE_TRANSFER_CAPABILITY,
  ENTERPRISE_TRANSFER_SCHEMA_VERSION,
  serializeEnterpriseTransferRequest,
  validateEnterpriseTransferRequest,
  type EnterpriseTransferLifecycleType,
  type EnterpriseTransferRequest,
  type EnterpriseTransferScope,
  type EnterpriseTransferTerms,
  type EnterpriseTransferableRightType,
} from '@aoc-enterprise/transfer-mandate';

import type { GovernedAuthorityReservation, GovernedAuthorityTransition } from '@aoc-enterprise/governed-authority';

import type { KernelEvaluationOptions, KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import { governedActionCommitsAuthority } from '../authority-governance/index.js';
import type {
  AcquireGovernedAuthorityReservationInput,
  AcquireGovernedAuthorityReservationOutcome,
  ApplyGovernedAuthorityTransitionInput,
  ApplyGovernedAuthorityTransitionOutcome,
  AuthorityGovernanceContext,
  ReleaseGovernedAuthorityReservationInput,
} from '../authority-governance/index.js';
import type { GovernanceEnterpriseContext, GovernanceStoreAccessContext } from '../governance-store/contracts.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { isGovernanceStoreError } from '../governance-store/errors.js';
import { TransferGovernanceError } from './errors.js';
import { requireStrictUtcTransferTimestamp, requireTransferAccessToOrganization, type TransferMandateStore } from './mandate-store.js';
import type {
  TransferEvidenceLineage,
  TransferExecutionRecord,
  TransferGovernanceContext,
  TransferLifecycleRecord,
  TransferMandateRecord,
  TransferRequestOutcome,
  TransferRevokeOutcome,
} from './contracts.js';

/**
 * The Kernel surface this module needs, named structurally so the module
 * depends on the canonical evaluation contract rather than on a concrete
 * class. `AocKernel` satisfies it as-is; nothing else in this repository does,
 * and no fake decision engine is provided or implied.
 */
export interface TransferKernelPort {
  evaluate(request: KernelEvaluationRequest, options?: KernelEvaluationOptions): Promise<KernelEvaluationResult>;
}

/**
 * The Governed Authority Store surface this module needs, named structurally
 * so `TRANSFER` depends on the generic authority-transition primitive rather
 * than on a concrete store — and so nothing transfer-shaped leaks into the
 * authority layer. `GovernedAuthorityStore`
 * (`../authority-governance/authority-store.ts`) satisfies it as-is.
 *
 * Deliberately two methods and no more. There is no
 * `debitTransferor`/`creditTransferee` pair here, and no transfer-specific
 * mutation of balances anywhere in this module: a completed transfer records
 * the *same* generic transition a future authority-changing governed action
 * would, distinguished only by the capability its basis names.
 */
export interface TransferAuthorityPort {
  applyTransition(context: AuthorityGovernanceContext, input: ApplyGovernedAuthorityTransitionInput): Promise<ApplyGovernedAuthorityTransitionOutcome>;
  listTransitionsByExecutionRef(context: AuthorityGovernanceContext, tenantId: string, executionRef: string): Promise<readonly GovernedAuthorityTransition[]>;
  /** Commits a portion of the transferor's still-uncommitted authority to a mandate about to be issued. Atomic: the availability it decides on is the availability inside its own transaction, never one this module measured earlier. */
  acquireReservation(
    context: AuthorityGovernanceContext,
    input: AcquireGovernedAuthorityReservationInput,
  ): Promise<AcquireGovernedAuthorityReservationOutcome>;
  /** Ends a commitment without any authority having moved, returning the capacity. */
  releaseReservation(context: AuthorityGovernanceContext, input: ReleaseGovernedAuthorityReservationInput): Promise<GovernedAuthorityReservation>;
  listReservationsByMandateRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    sourceMandateRef: string,
  ): Promise<readonly GovernedAuthorityReservation[]>;
}

export interface TransferGovernanceServiceDependencies {
  readonly store: TransferMandateStore;
  /** The real `AocKernel`. Every authority, policy, approval and obligation determination for `TRANSFER` comes from here — this module has no policy engine of its own. */
  readonly kernel: TransferKernelPort;
  /** The canonical Governance Store. Every `TRANSFER` evaluation is committed here as one integrity-chained aggregate before any mandate exists. */
  readonly governanceStore: GovernanceStore;
  /** Live Enterprise context captured into every appended aggregate, supplied by the composition root — the same value `evaluateGovernanceRequest` passes. */
  readonly enterpriseContext: () => GovernanceEnterpriseContext;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  /**
   * Optional Governed Authority Store. Omitted, this module behaves exactly as
   * it did before right-scoped authority existed: evidence is recorded and no
   * authority moves.
   *
   * Present, an accepted execution also commits the generic authority
   * transition that debits the transferor and credits the transferee. It is
   * optional rather than required because a deployment that has not enrolled
   * its resources in governed authority has nothing for a transition to move,
   * and requiring the store would make every such deployment fail on its first
   * execution.
   */
  readonly authorityStore?: TransferAuthorityPort;
}

/** What a caller submits. The canonical `EnterpriseTransferRequest` is built (and validated) from this by the service; callers never hand in a pre-built mandate. */
export interface SubmitTransferRequestInput {
  readonly requestId?: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  /** Who is asking. Deliberately never used to populate `terms.transferorRef`: a delegated administrator is not the holder. */
  readonly requestedBy: string;
  /** The requester's trust domain, forwarded verbatim to the Kernel so Recognition Runtime and Authority Graph evaluate it in their own terms. */
  readonly trustDomainId: string;
  /** Present when the requester is acting on behalf of another actor (e.g. an agent acting for a human). Mirrors `ActorReference.principalId`. */
  readonly principalActorId?: string;
  readonly actorType?: string;
  readonly terms: EnterpriseTransferTerms;
  /**
   * The resource scope the Kernel's authority/policy chain evaluates against.
   * Defaults to `'<kind>:<id>'` of the asset — that is, **asset-scoped**.
   *
   * A deployment may pass a narrower, hierarchical scope such as
   * `'asset:work-a:ownership-interest'`, and the existing
   * `DelegationScopePolicy` will contain it correctly, because that policy
   * matches `requested === granted || requested.startsWith(granted + ':')`.
   * But note precisely what that is and is not: it is a *string* convention
   * that a deployment may adopt, and nothing in the Authority Graph, the
   * governed-right vocabulary, or this contract connects the two. Soberanía does not
   * check that a scope suffix names a real governed right, and an actor
   * granted the bare asset scope holds authority over every right of it. See
   * `docs/architecture/ADR-TRANSFER-ACTION.md`, "Authority-source right vs
   * action-target right", and
   * `src/enterprise/__tests__/transfer-authority-transition.test.ts`.
   */
  readonly resourceScope?: string;
  readonly requestedAt?: string;
  readonly correlationId?: string;
  readonly requestedExpiresAt?: string;
  readonly justification?: string;
  readonly evidenceRefs?: readonly string[];
  /** Free-form context forwarded to the Kernel unchanged (passport id, capability token id, evidence...). Never interpreted here. */
  readonly context?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
  /** The expiry the issued mandate will carry — Soberanía's authority window to move rights. Required: this module never invents an expiry, and `EnterpriseTransferMandate` cannot represent an authorization without one. */
  readonly mandateExpiresAt: string;
  readonly issuerRef?: string;
  readonly obligationRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
}

export interface RecordTransferExecutionRequest {
  readonly executionId?: string;
  readonly mandateId: string;
  readonly executedBy: string;
  readonly executedAt: string;
  readonly transferorRef: string;
  readonly transfereeRef: string;
  readonly rights: readonly EnterpriseTransferableRightType[];
  readonly transferredScope: EnterpriseTransferScope;
  readonly correlationId?: string;
  readonly transferEffectiveAt?: string;
  readonly registry?: string;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  /** An opaque reference only. There is deliberately no amount field anywhere in this action. */
  readonly externalConsiderationReference?: string;
  readonly externalRegistrationReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RecordTransferLifecycleRequest {
  readonly lifecycleId?: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly reportedBy: string;
  readonly occurredAt: string;
  readonly lifecycleType: EnterpriseTransferLifecycleType;
  readonly correlationId?: string;
  readonly externalSystem?: string;
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeTransferMandateRequest {
  readonly mandateId: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly revokedAt?: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly correlationId?: string;
}

export interface TransferGovernanceService {
  /**
   * Routes one `TRANSFER` request through the canonical governance lifecycle:
   * validate -> `AocKernel.evaluate()` (authority, policy, approvals,
   * obligations, evidence) -> one atomic Governance Store aggregate append ->
   * issue a mandate if, and only if, the decision allowed it.
   */
  requestTransfer(context: TransferGovernanceContext, organizationId: string, input: SubmitTransferRequestInput): Promise<TransferRequestOutcome>;

  getMandate(context: TransferGovernanceContext, mandateId: string): Promise<TransferMandateRecord>;

  /** Records that an external system effected a movement under a mandate. Authorization is re-checked against the mandate; no right is moved and no registry is contacted here. */
  recordExecution(
    context: TransferGovernanceContext,
    input: RecordTransferExecutionRequest,
  ): Promise<{ readonly mandate: TransferMandateRecord; readonly execution: TransferExecutionRecord }>;

  listExecutions(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferExecutionRecord[]>;

  /**
   * Records that an external system reported a previously-effected movement as
   * registered, rejected, reversed, corrected or superseded. Observation only:
   * no authority is evaluated, no decision is produced, the mandate's status,
   * execution count and transferred scope are unchanged, and Soberanía asserts
   * nothing about whether the reported outcome genuinely occurred.
   */
  recordLifecycleEvent(context: TransferGovernanceContext, input: RecordTransferLifecycleRequest): Promise<TransferLifecycleRecord>;

  listLifecycleEvents(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferLifecycleRecord[]>;

  /** Withdraws authority to move further rights. Already-recorded execution and lifecycle evidence is preserved immutably, and no movement is reversed. */
  revokeMandate(context: TransferGovernanceContext, input: RevokeTransferMandateRequest): Promise<TransferRevokeOutcome>;

  /** Assembles the complete governance chain behind a mandate from references already stored — never a second audit log. */
  getEvidenceLineage(context: TransferGovernanceContext, mandateId: string): Promise<TransferEvidenceLineage>;

  /**
   * Re-drives any authority transition an already-recorded execution should
   * have produced but has not.
   *
   * The deterministic recovery path for the one cross-store window this module
   * has. Execution evidence and governed authority live in two independent
   * durable stores, so a crash between the two commits is possible, and the
   * ordering is chosen so that the survivable failure is the safe one:
   * evidence is committed first, and a missing transition means authority was
   * under-credited rather than credited without evidence. This method closes
   * that window on demand, and is safe to call at any time — every transition
   * it applies is idempotent on the execution reference, so calling it on a
   * fully-reconciled mandate does nothing at all.
   *
   * Returns the executions it had to repair, empty when there was nothing to
   * do. A no-op when no authority store is configured.
   */
  reconcileAuthorityTransitions(context: TransferGovernanceContext, mandateId: string): Promise<readonly string[]>;
}

/** Default resource scope for a `TRANSFER` request: the same `kind:id` form Enterprise already uses for a resource identifier (see `legacyResourceIdentifier` in `@aoc-enterprise/scoped-access`). Asset-scoped, deliberately and observably. */
function defaultResourceScope(asset: { readonly kind: string; readonly id: string }): string {
  return `${asset.kind}:${asset.id}`;
}

/**
 * A tenant may only transfer rights over its own assets. When an asset carries
 * a `tenantId`, it must be the acting organization's; a caller can never reach
 * across the tenancy boundary by naming another tenant's asset. This is checked
 * before the Kernel is ever consulted, so a cross-tenant attempt never even
 * produces a governance evaluation to point at.
 */
function assertAssetBelongsToOrganization(asset: { readonly tenantId?: string }, organizationId: string): void {
  if (asset.tenantId !== undefined && asset.tenantId !== organizationId) {
    throw new TransferGovernanceError(
      'TRANSFER_ASSET_TENANT_MISMATCH',
      `This asset is governed by tenant '${asset.tenantId}'; organization '${organizationId}' cannot request transfer authority over it.`,
      { assetTenantId: asset.tenantId, organizationId },
    );
  }
}

export function createTransferGovernanceService(deps: TransferGovernanceServiceDependencies): TransferGovernanceService {
  const { store, kernel, governanceStore, enterpriseContext, now, nextId, authorityStore } = deps;

  function toAuthorityContext(context: TransferGovernanceContext): AuthorityGovernanceContext {
    return {
      system: context.system,
      ...(context.organizationId !== undefined ? { organizationId: context.organizationId } : {}),
      ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
    };
  }

  /**
   * Commits the transferor's authority to a mandate that is about to exist, one
   * reservation per governed right the terms name.
   *
   * ## Why the transferor, and never the requester
   *
   * `terms.transferorRef` — the same reference the Kernel's holder-bound checks
   * ran against, and never `requestedBy`. A delegated administrator, a
   * representative and a subdelegated agent acting for the same holder all draw
   * on that holder's one pool; none of them acquires capacity of their own, and
   * none of them gets a second pool by coming through a different lineage.
   *
   * ## All-or-nothing across rights
   *
   * A transfer naming two rights either commits both or commits neither. The
   * store cannot do this in one transaction across two rights' availability
   * (they are independent questions with independent answers), so a failure
   * part-way through releases what was already acquired before propagating.
   * Leaving a partial commitment behind would deny capacity in a right whose
   * mandate never existed.
   */
  async function reserveTransferAuthority(args: {
    readonly context: TransferGovernanceContext;
    readonly organizationId: string;
    readonly request: EnterpriseTransferRequest;
    readonly mandateId: string;
    readonly decisionRef: string;
    readonly effectiveFrom: string;
    readonly expiresAt: string;
  }): Promise<readonly string[]> {
    // A deployment that has not adopted governed authority has no positions for
    // a commitment to stand against, and behaves exactly as it did before this
    // layer existed.
    if (authorityStore === undefined) return [];
    // The eligibility question, asked once and in one place, rather than as an
    // `action === 'TRANSFER'` test scattered through the runtime. `TRANSFER` is
    // the only governed action that debits a position, and therefore the only
    // one with finite capacity for a competing authorization to overpromise.
    //
    // Asserted rather than branched on. If this ever became false — a rename of
    // the capability constant would be enough — every transfer would silently
    // stop committing capacity and the double-commitment vulnerability would
    // reopen with nothing to notice it. A loud failure is the only safe
    // response to a classification that disagrees with this call site.
    if (!governedActionCommitsAuthority(ENTERPRISE_TRANSFER_CAPABILITY)) {
      throw new TransferGovernanceError(
        'TRANSFER_EVALUATION_FAILED',
        `'${ENTERPRISE_TRANSFER_CAPABILITY}' is not classified as committing governed authority, but TRANSFER debits a position; refusing to issue a mandate that would rely on uncommitted capacity.`,
        { capability: ENTERPRISE_TRANSFER_CAPABILITY },
      );
    }

    const authorityContext = toAuthorityContext(args.context);
    const acquired: string[] = [];
    try {
      for (const governedRight of args.request.terms.rights) {
        const outcome = await authorityStore.acquireReservation(authorityContext, {
          tenantId: args.organizationId,
          holderRef: args.request.terms.transferorRef,
          resource: { kind: args.request.asset.kind, id: args.request.asset.id },
          governedRight,
          scope: args.request.terms.scope,
          action: ENTERPRISE_TRANSFER_CAPABILITY,
          sourceRequestRef: args.request.id,
          sourceDecisionRef: args.decisionRef,
          sourceMandateRef: args.mandateId,
          effectiveFrom: args.effectiveFrom,
          // The mandate's own expiry, so a commitment never outlives the
          // authorization justifying it — and covers exactly the window in
          // which an external executor may still legitimately act.
          expiresAt: args.expiresAt,
          // One commitment per right per mandate. The request reference alone
          // would collide across the rights of a multi-right transfer.
          idempotencyKey: `${args.mandateId}:${governedRight}`,
          correlationId: args.request.correlationId,
        });
        // An unenrolled resource has no capacity to commit and no competing
        // commitment to prevent, so it proceeds exactly as it did before this
        // layer existed. The remaining rights are still asked, because
        // enrolment is a property of the resource and the answer will be the
        // same for all of them.
        if (outcome.outcome === 'reserved') acquired.push(outcome.reservation.id);
      }
    } catch (error) {
      await releaseTransferReservations(args.context, args.organizationId, acquired).catch(() => undefined);
      throw error;
    }
    return acquired;
  }

  /** Releases whatever of a mandate's commitments are still active, looking them up by the artifact rather than requiring a caller to have kept their identifiers. */
  async function releaseActiveReservationsForMandate(context: TransferGovernanceContext, organizationId: string, mandateId: string): Promise<void> {
    if (authorityStore === undefined) return;
    const authorityContext = toAuthorityContext(context);
    const held = await authorityStore.listReservationsByMandateRef(authorityContext, organizationId, mandateId);
    for (const reservation of held) {
      if (reservation.status !== 'active') continue;
      await authorityStore.releaseReservation(authorityContext, {
        tenantId: organizationId,
        reservationId: reservation.id,
        reason: 'authorization_ended',
      });
    }
  }

  /** Returns committed capacity that no longer supports anything. Idempotent, and never touches a position: a release is not a credit. */
  async function releaseTransferReservations(context: TransferGovernanceContext, organizationId: string, reservationIds: readonly string[]): Promise<void> {
    if (authorityStore === undefined || reservationIds.length === 0) return;
    const authorityContext = toAuthorityContext(context);
    for (const reservationId of reservationIds) {
      await authorityStore.releaseReservation(authorityContext, {
        tenantId: organizationId,
        reservationId,
        reason: 'authorization_ended',
      });
    }
  }

  /**
   * Commits the governed authority transition a completed movement implies.
   *
   * Called only after the execution evidence is durably committed, and only
   * with the values the *evidence* carries — the rights, quantity, source and
   * recipient an external system reported, re-asserted against the mandate by
   * the store before it was written. Not the mandate's authorized terms: what
   * moves authority is what moved, not what was permitted to.
   *
   * This is the whole of `TRANSFER`'s authority integration. There is no
   * balance arithmetic here, no position lookup, and no
   * transferor/transferee-specific write path: the generic primitive is handed
   * a movement and conserves it.
   */
  async function applyAuthorityTransition(
    context: TransferGovernanceContext,
    mandate: TransferMandateRecord,
    execution: TransferExecutionRecord,
  ): Promise<void> {
    if (authorityStore === undefined) return;
    await authorityStore.applyTransition(toAuthorityContext(context), {
      tenantId: mandate.organizationId,
      resource: { kind: mandate.assetKind, id: mandate.assetId },
      governedRights: execution.rights,
      scope: execution.transferredScope,
      fromHolderRef: execution.transferorRef,
      toHolderRef: execution.transfereeRef,
      basis: {
        kind: 'governed-execution',
        capability: ENTERPRISE_TRANSFER_CAPABILITY,
        // The idempotency key. One recorded movement moves authority once,
        // however many times this is retried or replayed after a restart.
        executionRef: execution.id,
        mandateRef: mandate.id,
        ...(mandate.decisionRef !== undefined ? { decisionRef: mandate.decisionRef } : {}),
        ...(mandate.evaluationRef !== undefined ? { evaluationRef: mandate.evaluationRef } : {}),
        ...(execution.evidenceRefs !== undefined ? { evidenceRefs: execution.evidenceRefs } : {}),
      },
      // The instant the movement took effect in the governed world, falling
      // back to when it was executed. Never `now()`: authority moved when the
      // right did, not when Soberanía heard about it.
      occurredAt: execution.transferEffectiveAt ?? execution.executedAt,
      correlationId: execution.correlationId,
      // Terminalize this mandate's reservation in the same commit section that
      // debits the transferor. The capacity is not "released" — it was spent,
      // and the position now reflects that — so continuing to subtract the
      // reservation would count the same quantity twice. Naming the mandate
      // rather than the reservation keeps this module free of reservation
      // identifiers it would otherwise have to thread through execution
      // evidence.
      consumesReservationsForMandateRef: mandate.id,
    });
  }

  function buildCanonicalRequest(input: SubmitTransferRequestInput, requestId: string, correlationId: string): EnterpriseTransferRequest {
    const candidate = {
      schemaVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
      id: requestId,
      capability: ENTERPRISE_TRANSFER_CAPABILITY,
      asset: input.asset,
      requestedBy: input.requestedBy,
      terms: input.terms,
      requestedAt: input.requestedAt ?? now(),
      correlationId,
      ...(input.requestedExpiresAt !== undefined ? { requestedExpiresAt: input.requestedExpiresAt } : {}),
      ...(input.justification !== undefined ? { justification: input.justification } : {}),
      ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
    };

    const validation = validateEnterpriseTransferRequest(candidate);
    if (!validation.valid) {
      throw new TransferGovernanceError(
        'TRANSFER_VALIDATION_ERROR',
        `Transfer request failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
        { issues: validation.errors },
      );
    }
    return candidate;
  }

  /**
   * Adapts a canonical transfer request onto the generalized
   * `KernelEvaluationRequest` every other governed action already uses. The
   * action identifier travels as `action.capability` (matched by Authority
   * Graph and Recognition Runtime against their own grants/tokens), and the
   * full, serialized authorization terms travel as `action.parameters` so the
   * policy layer can see exactly what is being asked for -- including whose
   * rights are moving, to whom, how much, and under what constraints. No
   * transfer-specific decision path is introduced anywhere.
   *
   * `counterpartyId` is populated from `transfereeRef` because that is
   * precisely what the existing Domain Policy Pack preflight means by a
   * counterparty: the party on the other side of the arrangement. A deployment
   * whose policy turns on *who is receiving the rights* -- a sanctions check, a
   * related-party rule, a jurisdiction restriction -- reads it there.
   *
   * `amount`/`currency` are deliberately not populated at all. A transfer
   * frequently has a price, and this is exactly the point at which it would be
   * easy to start modelling one. Soberanía does not: it holds no amount anywhere in
   * this action, computes nothing, and a policy that needs consideration
   * expresses it as a *requirement that evidence be produced*
   * (`considerationEvidenceRequired`), never as a number Soberanía would then be
   * implicitly claiming to know.
   *
   * Because the policy layer receives the serialized terms, a deployment that
   * needs "an ownership interest may only move with board approval", "no
   * transfer to an unverified recipient", or "usage rights are not assignable
   * here" can express each as policy. This module hard-codes no such rule --
   * transferability is evaluated, never assumed.
   */
  function toKernelRequest(request: EnterpriseTransferRequest, input: SubmitTransferRequestInput, organizationId: string): KernelEvaluationRequest {
    return {
      requestId: request.id,
      actor: {
        id: request.requestedBy,
        trustDomainId: input.trustDomainId,
        ...(input.principalActorId !== undefined ? { principalId: input.principalActorId } : {}),
        ...(input.actorType !== undefined ? { type: input.actorType } : {}),
      },
      action: {
        type: ENTERPRISE_TRANSFER_CAPABILITY,
        capability: ENTERPRISE_TRANSFER_CAPABILITY,
        resourceScope: input.resourceScope ?? defaultResourceScope(request.asset),
        sideEffectType: 'external_api_call',
        riskLevel: 'critical',
        parameters: { ...serializeEnterpriseTransferRequest(request) },
        // The governed rights this movement engages, declared as typed
        // vocabulary rather than left inside `parameters` where no authority
        // check could reach them. This is the field that closes the finding in
        // `../__tests__/transfer-authority-transition.test.ts`: an actor whose
        // recognized authority is over the usage right can no longer move the
        // ownership interest by naming a scope string that happens to contain.
        governedRights: request.terms.rights,
        governedRightsScope: request.terms.scope,
        // The holder is the *transferor*, never the requester, and this is not
        // a configuration choice. The rights leave the transferor, so the
        // transferor is the party that must be recognized as holding them; the
        // portfolio manager who submits the request is a delegated
        // administrator who holds nothing. The Authority Graph still decides
        // separately whether the manager may act at all — two independent
        // checks, neither substituting for the other, and a delegated actor
        // never acquires the holder's underlying right by acting for it.
        //
        // Deliberately not overridable from `SubmitTransferRequestInput`:
        // pointing this at anyone other than the party being debited would
        // check one party's authority while depleting another's.
        governedAuthorityHolderRef: request.terms.transferorRef,
        counterpartyId: request.terms.transfereeRef,
        ...(request.evidenceRefs !== undefined ? { evidenceIds: request.evidenceRefs } : {}),
      },
      target: { id: request.asset.id, type: request.asset.kind },
      organization: { id: organizationId },
      requestedAt: request.requestedAt,
      correlationId: request.correlationId,
      ...(input.context !== undefined ? { context: input.context } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    };
  }

  return {
    async requestTransfer(context, organizationId, input) {
      requireTransferAccessToOrganization(context, organizationId);
      assertAssetBelongsToOrganization(input.asset, organizationId);

      const receivedAt = now();
      const requestId = input.requestId ?? nextId('transfer-request');
      const correlationId = input.correlationId ?? nextId('transfer-correlation');
      const request = buildCanonicalRequest(input, requestId, correlationId);
      const mandateExpiresAt = requireStrictUtcTransferTimestamp(input.mandateExpiresAt, 'mandateExpiresAt');

      const kernelRequest = toKernelRequest(request, input, organizationId);

      let result: KernelEvaluationResult;
      try {
        result = await kernel.evaluate(kernelRequest);
      } catch (error) {
        throw new TransferGovernanceError('TRANSFER_EVALUATION_FAILED', 'The Kernel could not complete evaluation of this TRANSFER request.', {
          cause: error instanceof Error ? error.message : String(error),
        });
      }

      // Persistence invariant, identical to the generalized evaluation path
      // (`../orchestration/evaluate-governance-request.ts`): no governed
      // outcome is claimed that could not be durably proven. The aggregate is
      // committed before any mandate can exist.
      const accessContext: GovernanceStoreAccessContext = {
        system: context.system,
        organizationId,
        ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
      };
      let appended;
      try {
        appended = await governanceStore.appendEvaluation({
          request: kernelRequest,
          result,
          receivedAt,
          enterpriseContext: enterpriseContext(),
          events: [],
          accessContext,
        });
      } catch (error) {
        // A conflict is a distinct, caller-actionable fact -- the same request
        // identity was already governed under a different payload -- not an
        // infrastructure failure. Surfacing them alike would tell a caller to
        // retry something that must not be retried unchanged.
        if (isGovernanceStoreError(error) && error.code === 'GOVERNANCE_IDEMPOTENCY_CONFLICT') {
          throw new TransferGovernanceError(
            'TRANSFER_REQUEST_CONFLICT',
            `Transfer request '${request.id}' was already governed under a different payload; a request id must identify exactly one TRANSFER request.`,
            { requestId: request.id },
          );
        }
        throw new TransferGovernanceError('TRANSFER_PERSISTENCE_FAILED', 'The TRANSFER evaluation could not be durably recorded; no mandate was issued.', {
          cause: error instanceof Error ? error.message : String(error),
        });
      }

      const outcomeBase = {
        status: result.status,
        requestId: result.requestId,
        decisionId: result.decisionId,
        evaluationId: appended.evaluationId,
        reasonCodes: result.reasonCodes,
        summary: result.summary,
      } as const;

      // Only an `allowed` decision authorizes anything. `approval_required` is
      // explicitly not authorization -- an outstanding approval means the
      // governance chain is incomplete, and an incomplete chain never produces
      // a mandate.
      if (result.status !== 'allowed') return outcomeBase;

      // The Governance Store deduplicated this against an already-committed
      // aggregate: the request was already governed once. Return whatever
      // authorization that original evaluation produced -- replaying a request
      // must never accumulate a second mandate, which for a transfer would mean
      // authorizing the same portion of the same right to move twice.
      if (appended.idempotentReplay) {
        const existing = await store.getMandateByRequestRef(context, request.id);
        return existing === null ? outcomeBase : { ...outcomeBase, mandate: existing };
      }

      const approvalRefs = [result.approval.proofId, result.approval.decisionId, result.approval.requestId].filter(
        (value): value is string => value !== undefined,
      );

      // ---------------------------------------------------------------------
      // The commitment gate.
      //
      // Everything above this line established that the action is *permitted*:
      // recognition, action authority, delegated lineage, holder-bound
      // representation, the holder's underlying authority, policy, approvals
      // and obligations, all committed as one governance aggregate. None of it
      // established that the authority it relies on is still *uncommitted* —
      // and the Kernel could not, because any availability it observed would
      // already be stale by the time a mandate was written.
      //
      // So the last thing before the authorization artifact exists is an atomic
      // acquire against the transferor's remaining capacity. It can only ever
      // narrow: an ALLOW that loses this race becomes a denial, and a DENY can
      // never be rescued here, because a denied request never reaches this
      // line.
      //
      // The mandate's id is minted first so the reservation can name the
      // artifact it stands for. That ordering is what makes the compensation
      // below possible: a commitment acquired for an artifact with no name
      // could not be found again if issuing it then failed.
      // ---------------------------------------------------------------------
      const mandateId = nextId('transfer-mandate');
      const reservationIds = await reserveTransferAuthority({
        context,
        organizationId,
        request,
        mandateId,
        decisionRef: result.decisionId,
        effectiveFrom: requireStrictUtcTransferTimestamp(result.evaluatedAt, 'result.evaluatedAt'),
        expiresAt: mandateExpiresAt,
      });

      let mandate;
      try {
        mandate = await store.issueMandate(context, {
          id: mandateId,
          organizationId,
          assetKind: request.asset.kind,
          assetId: request.asset.id,
          // The mandate's terms are the request's terms, copied verbatim. There
          // is no caller-supplied override, so 25% cannot become 100% and
          // Company B cannot become Company C between request and mandate; the
          // store re-asserts containment anyway
          // (`assertNoTransferScopeEscalation`).
          terms: request.terms,
          requestedTerms: request.terms,
          requestRef: request.id,
          requestedBy: request.requestedBy,
          decisionRef: result.decisionId,
          evaluationRef: appended.evaluationId,
          effectiveFrom: requireStrictUtcTransferTimestamp(result.evaluatedAt, 'result.evaluatedAt'),
          expiresAt: mandateExpiresAt,
          correlationId: request.correlationId,
          ...(request.asset.tenantId !== undefined ? { assetTenantId: request.asset.tenantId } : {}),
          ...(input.issuerRef !== undefined ? { issuerRef: input.issuerRef } : {}),
          ...(approvalRefs.length > 0 ? { approvalRefs } : {}),
          ...(input.obligationRefs !== undefined ? { obligationRefs: input.obligationRefs } : {}),
          ...(request.evidenceRefs !== undefined ? { evidenceRefs: request.evidenceRefs } : {}),
          ...(input.auditRefs !== undefined ? { auditRefs: input.auditRefs } : {}),
        });
      } catch (error) {
        // Compensation. The capacity was committed and the artifact it was
        // committed for does not exist, so the commitment must not stand — a
        // permanently stranded reservation would deny the holder capacity for
        // an authorization nobody ever received.
        //
        // Deliberately best-effort, and deliberately not allowed to mask the
        // real failure: if the release itself fails, the reservation still
        // lapses on its own at `expiresAt` (never later than the mandate would
        // have), so the worst case is bounded and self-healing rather than
        // permanent. Losing the original error to a compensation error would be
        // strictly worse than that.
        await releaseTransferReservations(context, organizationId, reservationIds).catch(() => undefined);
        throw error;
      }

      // Link the committed governance aggregate to the artifact it produced,
      // using the Governance Store's own reference surface rather than a
      // transfer-specific side table.
      //
      // `authorization_artifact` is the reference type the TokenizationMandate,
      // CollateralizationMandate and LicenseMandate also use for exactly this
      // relationship: a mandate is produced and owned by Soberanía Enterprise,
      // recording an authorization this enforcement granted. The external
      // movement and anything later reported about it are separate
      // observations, recorded as `execution_record` below.
      //
      // The Store computes this reference's sequence, integrity version, chain
      // link and digest inside its own append transaction; nothing here can
      // choose a chain position or present a digest the Store did not compute.
      //
      // This classifies; it does not authorize. Reaching this line already
      // required a persisted allowed Kernel decision and an issued, persisted
      // mandate — see `docs/enterprise/AOC_TRANSFER_ACTION.md`.
      await governanceStore.appendReference(accessContext, {
        referenceId: nextId('transfer-reference'),
        evaluationId: appended.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: mandate.id,
        externalVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
        createdAt: now(),
      });

      return { ...outcomeBase, mandate };
    },

    async getMandate(context, mandateId) {
      return store.getMandate(context, mandateId);
    },

    async recordExecution(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      const recorded = await store.recordExecution(context, {
        id: input.executionId ?? nextId('transfer-execution'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executedBy: input.executedBy,
        executedAt: input.executedAt,
        transferorRef: input.transferorRef,
        transfereeRef: input.transfereeRef,
        rights: input.rights,
        transferredScope: input.transferredScope,
        correlationId: input.correlationId ?? nextId('transfer-execution-correlation'),
        ...(input.transferEffectiveAt !== undefined ? { transferEffectiveAt: input.transferEffectiveAt } : {}),
        ...(input.registry !== undefined ? { registry: input.registry } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalConsiderationReference !== undefined ? { externalConsiderationReference: input.externalConsiderationReference } : {}),
        ...(input.externalRegistrationReference !== undefined ? { externalRegistrationReference: input.externalRegistrationReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      if (mandate.evaluationRef !== undefined) {
        // External execution evidence is correlated back to the governance
        // aggregate that authorized it, so a reviewer can answer "was the
        // movement consistent with the authorization?" from the canonical
        // record alone.
        //
        // Note what this append does NOT do: it does not grant the transferee
        // anything. A reference is evidence classification, never authority,
        // and appending one authorizes nothing.
        //
        // The transferee *does* acquire recognized governed authority from a
        // completed transfer — but from the authority transition committed
        // below, on the evidence this reference classifies, and never from the
        // reference itself. Keeping those apart still matters for exactly the
        // reason it always did: a reader must be able to tell an evidence
        // classification from an authority consequence, especially for the one
        // action where the two arrive together. See
        // `docs/architecture/ADR-TRANSFER-ACTION.md` and
        // `docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`.
        await governanceStore.appendReference(
          { system: context.system, organizationId: mandate.organizationId, ...(context.actorId !== undefined ? { actorId: context.actorId } : {}) },
          {
            referenceId: nextId('transfer-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: recorded.execution.id,
            externalVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
            createdAt: now(),
          },
        );
      }

      // The authority transition, last and deliberately so.
      //
      // Two independent durable stores are involved and they cannot share a
      // transaction, so one of the two orderings has to be chosen with its
      // failure mode in mind. Evidence first means a crash in the window
      // leaves authority *under*-credited — the recipient has not yet gained
      // what it will gain — and the missing transition is recoverable from the
      // evidence that survived, deterministically, via
      // `reconcileAuthorityTransitions`. The other ordering would leave
      // authority credited with no evidence behind it, which nothing could
      // detect and nothing should be able to produce.
      //
      // A failure here therefore propagates rather than being swallowed: the
      // caller must learn that the movement was recorded and the authority
      // consequence was not.
      await applyAuthorityTransition(context, recorded.mandate, recorded.execution);

      return recorded;
    },

    async listExecutions(context, mandateId) {
      return store.listExecutions(context, mandateId);
    },

    async recordLifecycleEvent(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      const event = await store.recordLifecycleEvent(context, {
        id: input.lifecycleId ?? nextId('transfer-lifecycle'),
        mandateId: mandate.id,
        executionId: input.executionId,
        organizationId: mandate.organizationId,
        reportedBy: input.reportedBy,
        occurredAt: input.occurredAt,
        lifecycleType: input.lifecycleType,
        correlationId: input.correlationId ?? nextId('transfer-lifecycle-correlation'),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      if (mandate.evaluationRef !== undefined) {
        // A reported outcome is recorded as one more `execution_record`
        // reference against the same aggregate: it is an observation about the
        // movement's fate, correlated to the authorization that permitted it,
        // and never a governance decision of its own.
        await governanceStore.appendReference(
          { system: context.system, organizationId: mandate.organizationId, ...(context.actorId !== undefined ? { actorId: context.actorId } : {}) },
          {
            referenceId: nextId('transfer-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: event.id,
            externalVersion: ENTERPRISE_TRANSFER_SCHEMA_VERSION,
            createdAt: now(),
          },
        );
      }

      return event;
    },

    async listLifecycleEvents(context, mandateId) {
      return store.listLifecycleEvents(context, mandateId);
    },

    async revokeMandate(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      const outcome = await store.revokeMandate(context, {
        revocationId: nextId('transfer-revocation'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt: input.revokedAt ?? now(),
        reason: input.reason,
        issuerRef: input.requestedBy,
        correlationId: input.correlationId ?? nextId('transfer-revocation-correlation'),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      // Revoking withdraws the authority to move further rights, so the
      // capacity this mandate was holding is capacity nothing can any longer
      // draw on, and continuing to withhold it from the holder would be a
      // penalty rather than an accounting fact.
      //
      // Revocation is still emphatically not reversal: rights already moved
      // stay moved, their positions are untouched, and their reservations are
      // already `'consumed'` — which `releaseReservation` refuses to reopen, so
      // this cannot resurrect capacity that was genuinely spent. Only a
      // still-`'active'` commitment is released.
      //
      // Ordered after the revocation is durably recorded, deliberately. The
      // other ordering would free capacity for a mandate that might still turn
      // out to be live.
      await releaseActiveReservationsForMandate(context, mandate.organizationId, mandate.id);
      return outcome;
    },

    async reconcileAuthorityTransitions(context, mandateId) {
      if (authorityStore === undefined) return [];
      const mandate = await store.getMandate(context, mandateId);
      const executions = await store.listExecutions(context, mandateId);
      const authorityContext: AuthorityGovernanceContext = {
        system: context.system,
        ...(context.organizationId !== undefined ? { organizationId: context.organizationId } : {}),
        ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
      };
      const repaired: string[] = [];
      for (const execution of executions) {
        const existing = await authorityStore.listTransitionsByExecutionRef(authorityContext, mandate.organizationId, execution.id);
        if (existing.length > 0) continue;
        await applyAuthorityTransition(context, mandate, execution);
        repaired.push(execution.id);
      }
      return repaired;
    },

    async getEvidenceLineage(context, mandateId) {
      const mandate = await store.getMandate(context, mandateId);
      const executions = await store.listExecutions(context, mandateId);
      const lifecycleEvents = await store.listLifecycleEvents(context, mandateId);
      const revocation = await store.getRevocation(context, mandateId);
      const { terms } = mandate;

      return {
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        asset: {
          kind: mandate.assetKind,
          id: mandate.assetId,
          ...(mandate.assetTenantId !== undefined ? { tenantId: mandate.assetTenantId } : {}),
        },
        terms,
        requestRef: mandate.requestRef,
        requestedBy: mandate.requestedBy,
        // Lifted out of `terms` deliberately: "from whom, to whom, which
        // rights, how much was authorized, and how much has actually moved"
        // are the questions a transfer reviewer asks first, and a lineage
        // should answer them without making the caller reach into the terms
        // object. `requestedBy` and `transferorRef` are reported side by side
        // precisely so a reviewer can see when they differ.
        transferorRef: terms.transferorRef,
        transfereeRef: terms.transfereeRef,
        rights: terms.rights,
        authorizedScope: terms.scope,
        partialTransferAllowed: terms.constraints.partialTransferAllowed,
        decisionRef: mandate.decisionRef,
        approvalRefs: mandate.approvalRefs ?? [],
        obligationRefs: mandate.obligationRefs ?? [],
        evidenceRefs: mandate.evidenceRefs ?? [],
        auditRefs: mandate.auditRefs ?? [],
        executionRefs: executions.map((execution) => execution.id),
        lifecycleRefs: lifecycleEvents.map((event) => event.id),
        executionCount: mandate.executionCount,
        ...(mandate.transferredScope !== undefined ? { transferredScope: mandate.transferredScope } : {}),
        ...(terms.executorRef !== undefined ? { executorRef: terms.executorRef } : {}),
        ...(terms.constraints.permittedRegistries !== undefined ? { permittedRegistries: terms.constraints.permittedRegistries } : {}),
        ...(mandate.evaluationRef !== undefined ? { evaluationRef: mandate.evaluationRef } : {}),
        ...(revocation !== null ? { revocationRef: revocation.id } : {}),
      };
    },
  };
}
