import {
  ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  serializeEnterpriseCollateralizationRequest,
  validateEnterpriseCollateralizationRequest,
  type EnterpriseCollateralReleaseType,
  type EnterpriseCollateralizableRightType,
  type EnterpriseCollateralizationRequest,
  type EnterpriseCollateralizationScope,
  type EnterpriseCollateralizationTerms,
  type EnterpriseSecuredAmount,
} from '@aoc-enterprise/collateralization-mandate';

import type { GovernedAuthorityEncumbrance, GovernedAuthorityReservation } from '@aoc-enterprise/governed-authority';

import type { KernelEvaluationOptions, KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import { governedActionCommitsAuthority, governedActionEncumbersAuthority } from '../authority-governance/index.js';
import type {
  AcquireGovernedAuthorityReservationInput,
  AcquireGovernedAuthorityReservationOutcome,
  AuthorityGovernanceContext,
  RecordGovernedAuthorityEncumbranceInput,
  RecordGovernedAuthorityEncumbranceOutcome,
  ReleaseGovernedAuthorityReservationInput,
} from '../authority-governance/index.js';
import type { GovernanceEnterpriseContext, GovernanceStoreAccessContext } from '../governance-store/contracts.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { isGovernanceStoreError } from '../governance-store/errors.js';
import { CollateralizationGovernanceError } from './errors.js';
import {
  requireCollateralizationAccessToOrganization,
  requireStrictUtcCollateralizationTimestamp,
  type CollateralizationMandateStore,
} from './mandate-store.js';
import type {
  CollateralizationEvidenceLineage,
  CollateralizationExecutionRecord,
  CollateralizationGovernanceContext,
  CollateralizationMandateRecord,
  CollateralizationReleaseRecord,
  CollateralizationRequestOutcome,
  CollateralizationRevokeOutcome,
} from './contracts.js';

/**
 * The Kernel surface this module needs, named structurally so the module
 * depends on the canonical evaluation contract rather than on a concrete
 * class. `AocKernel` satisfies it as-is; nothing else in this repository
 * does, and no fake decision engine is provided or implied.
 */
export interface CollateralizationKernelPort {
  evaluate(request: KernelEvaluationRequest, options?: KernelEvaluationOptions): Promise<KernelEvaluationResult>;
}

/**
 * The Governed Authority Store surface this module needs, named structurally so
 * `COLLATERALIZE` depends on the generic commitment and constraint primitives
 * rather than on a concrete store — and so nothing collateral-shaped leaks into
 * the authority layer. `GovernedAuthorityStore`
 * (`../authority-governance/authority-store.ts`) satisfies it as-is.
 *
 * Note what is deliberately *not* here. There is no `debit`, no `credit` and no
 * `applyTransition`: a collateralization moves no authority, and the absence of
 * any means to move one is what makes that unmissable. There is no
 * `releaseEncumbrance` either — releasing a persistent constraint requires a
 * privileged system context, which this module never holds, so it is an
 * operator act rather than something a governed request could reach.
 */
export interface CollateralizationAuthorityPort {
  /** Commits a portion of the holder's still-uncommitted authority to a mandate about to be issued. Atomic: the capacity it decides on is the capacity inside its own transaction, never one this module measured earlier. */
  acquireReservation(
    context: AuthorityGovernanceContext,
    input: AcquireGovernedAuthorityReservationInput,
  ): Promise<AcquireGovernedAuthorityReservationOutcome>;
  /** Ends a commitment without anything having been committed downstream, returning the capacity. Used when the authorization never came into existence, or was withdrawn before it was exercised. */
  releaseReservation(context: AuthorityGovernanceContext, input: ReleaseGovernedAuthorityReservationInput): Promise<GovernedAuthorityReservation>;
  listReservationsByMandateRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    sourceMandateRef: string,
  ): Promise<readonly GovernedAuthorityReservation[]>;
  /** Turns a confirmed execution's commitment into a persistent constraint, and terminalizes the commitment, in one durable step. */
  recordEncumbrance(
    context: AuthorityGovernanceContext,
    input: RecordGovernedAuthorityEncumbranceInput,
  ): Promise<RecordGovernedAuthorityEncumbranceOutcome>;
  listEncumbrancesByMandateRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    sourceMandateRef: string,
  ): Promise<readonly GovernedAuthorityEncumbrance[]>;
}

export interface CollateralizationGovernanceServiceDependencies {
  readonly store: CollateralizationMandateStore;
  /** The real `AocKernel`. Every authority, policy, approval and obligation determination for `COLLATERALIZE` comes from here — this module has no policy engine of its own. */
  readonly kernel: CollateralizationKernelPort;
  /** The canonical Governance Store. Every `COLLATERALIZE` evaluation is committed here as one integrity-chained aggregate before any mandate exists. */
  readonly governanceStore: GovernanceStore;
  /** Live Enterprise context captured into every appended aggregate, supplied by the composition root — the same value `evaluateGovernanceRequest` passes. */
  readonly enterpriseContext: () => GovernanceEnterpriseContext;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  /**
   * Optional Governed Authority Store. Omitted, this module behaves exactly as
   * it did before persistent constraints existed: evidence is recorded, and
   * nothing stops two independent mandates each committing the same authority.
   *
   * Present, issuing a mandate first commits the holder's capacity, and a
   * recorded execution converts that commitment into a persistent constraint
   * that outlives the mandate — so a later, independent mandate sees it. It is
   * optional rather than required because a deployment that has not enrolled
   * its resources in governed authority has no capacity for a commitment to
   * stand against, and requiring the store would make every such deployment
   * fail on its first request.
   */
  readonly authorityStore?: CollateralizationAuthorityPort;
}

/** What a caller submits. The canonical `EnterpriseCollateralizationRequest` is built (and validated) from this by the service; callers never hand in a pre-built mandate. */
export interface SubmitCollateralizationRequestInput {
  readonly requestId?: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  readonly requestedBy: string;
  /** The requester's trust domain, forwarded verbatim to the Kernel so Recognition Runtime and Authority Graph evaluate it in their own terms. */
  readonly trustDomainId: string;
  /** Present when the requester is acting on behalf of another actor (e.g. an agent acting for a human). Mirrors `ActorReference.principalId`. */
  readonly principalActorId?: string;
  readonly actorType?: string;
  readonly terms: EnterpriseCollateralizationTerms;
  /** The resource scope the Kernel's authority/policy chain evaluates against. Defaults to `'<kind>:<id>'` of the asset. */
  readonly resourceScope?: string;
  readonly requestedAt?: string;
  readonly correlationId?: string;
  readonly requestedExpiresAt?: string;
  readonly justification?: string;
  readonly evidenceRefs?: readonly string[];
  /** Free-form context forwarded to the Kernel unchanged (passport id, capability token id, evidence...). Never interpreted here. */
  readonly context?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
  /** The expiry the issued mandate will carry. Required: this module never invents an expiry, and `EnterpriseCollateralizationMandate` cannot represent an authorization without one. */
  readonly mandateExpiresAt: string;
  readonly issuerRef?: string;
  readonly obligationRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
  /**
   * Whose governed authority this collateralization draws on, when it is not
   * the requester's own.
   *
   * `EnterpriseCollateralizationTerms` names a secured party but no holder of
   * the rights being encumbered, so absent means the requester must itself
   * hold them. A deployment whose administrator submits on a holder's behalf
   * names that holder here; the Authority Graph still has to authorize the
   * administrator separately.
   */
  readonly authorityHolderRef?: string;
}

export interface RecordCollateralizationExecutionRequest {
  readonly executionId?: string;
  readonly mandateId: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly securedObligationRef: string;
  readonly securedPartyRef: string;
  readonly committedScope: EnterpriseCollateralizationScope;
  readonly rights: readonly EnterpriseCollateralizableRightType[];
  readonly correlationId?: string;
  readonly securedAmount?: EnterpriseSecuredAmount;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  readonly externalAgreementReference?: string;
  readonly externalFilingReference?: string;
  readonly externalTransactionReference?: string;
  readonly jurisdiction?: string;
  readonly priorityRank?: number;
  readonly evidenceRefs?: readonly string[];
}

export interface RecordCollateralizationReleaseRequest {
  readonly releaseId?: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly reportedBy: string;
  readonly releasedAt: string;
  readonly releaseType: EnterpriseCollateralReleaseType;
  readonly correlationId?: string;
  readonly externalSystem?: string;
  readonly externalRegistry?: string;
  readonly externalReleaseReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeCollateralizationMandateRequest {
  readonly mandateId: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly revokedAt?: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly correlationId?: string;
}

export interface CollateralizationGovernanceService {
  /**
   * Routes one `COLLATERALIZE` request through the canonical governance
   * lifecycle: validate -> `AocKernel.evaluate()` (authority, policy,
   * approvals, obligations, evidence) -> one atomic Governance Store
   * aggregate append -> issue a mandate if, and only if, the decision
   * allowed it.
   */
  requestCollateralization(
    context: CollateralizationGovernanceContext,
    organizationId: string,
    input: SubmitCollateralizationRequestInput,
  ): Promise<CollateralizationRequestOutcome>;

  getMandate(context: CollateralizationGovernanceContext, mandateId: string): Promise<CollateralizationMandateRecord>;

  /** Records that an external system created a collateral arrangement under a mandate. Authorization is re-checked against the mandate; no security interest is created here. */
  recordExecution(
    context: CollateralizationGovernanceContext,
    input: RecordCollateralizationExecutionRequest,
  ): Promise<{ readonly mandate: CollateralizationMandateRecord; readonly execution: CollateralizationExecutionRecord }>;

  listExecutions(context: CollateralizationGovernanceContext, mandateId: string): Promise<readonly CollateralizationExecutionRecord[]>;

  /**
   * Records that an external system reported a previously-created arrangement
   * as released, discharged, satisfied or terminated. Observation only: no
   * authority is evaluated, no decision is produced, the mandate's status and
   * committed scope are unchanged, and Soberanía asserts nothing about whether the
   * encumbrance genuinely ended.
   */
  recordRelease(
    context: CollateralizationGovernanceContext,
    input: RecordCollateralizationReleaseRequest,
  ): Promise<CollateralizationReleaseRecord>;

  listReleases(context: CollateralizationGovernanceContext, mandateId: string): Promise<readonly CollateralizationReleaseRecord[]>;

  /** Withdraws authority for further collateralization. Already-recorded execution and release evidence is preserved immutably, and nothing external is released. */
  revokeMandate(
    context: CollateralizationGovernanceContext,
    input: RevokeCollateralizationMandateRequest,
  ): Promise<CollateralizationRevokeOutcome>;

  /** Assembles the complete governance chain behind a mandate from references already stored — never a second audit log. */
  getEvidenceLineage(context: CollateralizationGovernanceContext, mandateId: string): Promise<CollateralizationEvidenceLineage>;
}

/** Default resource scope for a `COLLATERALIZE` request: the same `kind:id` form Enterprise already uses for a resource identifier (see `legacyResourceIdentifier` in `@aoc-enterprise/scoped-access`). */
function defaultResourceScope(asset: { readonly kind: string; readonly id: string }): string {
  return `${asset.kind}:${asset.id}`;
}

/**
 * A tenant may only collateralize its own assets. When an asset carries a
 * `tenantId`, it must be the acting organization's; a caller can never reach
 * across the tenancy boundary by naming another tenant's asset. This is
 * checked before the Kernel is ever consulted, so a cross-tenant attempt
 * never even produces a governance evaluation to point at.
 */
function assertAssetBelongsToOrganization(asset: { readonly tenantId?: string }, organizationId: string): void {
  if (asset.tenantId !== undefined && asset.tenantId !== organizationId) {
    throw new CollateralizationGovernanceError(
      'COLLATERALIZATION_ASSET_TENANT_MISMATCH',
      `This asset is governed by tenant '${asset.tenantId}'; organization '${organizationId}' cannot request collateralization authority over it.`,
      { assetTenantId: asset.tenantId, organizationId },
    );
  }
}

export function createCollateralizationGovernanceService(
  deps: CollateralizationGovernanceServiceDependencies,
): CollateralizationGovernanceService {
  const { store, kernel, governanceStore, enterpriseContext, now, nextId, authorityStore } = deps;

  function toAuthorityContext(context: CollateralizationGovernanceContext): AuthorityGovernanceContext {
    return {
      system: context.system,
      ...(context.organizationId !== undefined ? { organizationId: context.organizationId } : {}),
      ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
    };
  }

  /**
   * Whose authority a request draws on.
   *
   * `EnterpriseCollateralizationTerms` names a secured party but no holder of
   * the rights being encumbered, so this mirrors exactly what the Kernel's own
   * governed-authority check ran against — `governedAuthorityHolderRef` when
   * the submission named one, the requester otherwise. Deriving it any other
   * way here would let the commitment stand against a different party from the
   * one whose authority was actually verified.
   */
  function holderOf(request: EnterpriseCollateralizationRequest, input: SubmitCollateralizationRequestInput): string {
    return input.authorityHolderRef ?? request.requestedBy;
  }

  /**
   * Commits the holder's authority to a mandate that is about to exist, one
   * reservation per governed right the terms name.
   *
   * ## Why the holder, and never the requester or the secured party
   *
   * The same reference the Kernel's coverage and holder-bound checks ran
   * against. A delegated administrator, a representative and a subdelegated
   * agent acting for the same holder all draw on that holder's one pool; none
   * of them acquires capacity of its own, and none gets a second pool by
   * coming through a different lineage. The secured party benefits from the
   * arrangement and holds nothing here at all.
   *
   * ## All-or-nothing across rights
   *
   * A collateralization naming two rights either commits both or commits
   * neither. The store cannot do this in one transaction across two rights'
   * capacity (they are independent questions with independent answers), so a
   * failure part-way through releases what was already acquired before
   * propagating. Leaving a partial commitment behind would deny capacity in a
   * right whose mandate never existed.
   */
  async function reserveCollateralAuthority(args: {
    readonly context: CollateralizationGovernanceContext;
    readonly organizationId: string;
    readonly request: EnterpriseCollateralizationRequest;
    readonly holderRef: string;
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
    // `action === 'COLLATERALIZE'` test scattered through the runtime.
    //
    // Asserted rather than branched on. If this ever became false — a rename of
    // the capability constant would be enough — every collateralization would
    // silently stop committing capacity, and the cross-mandate double
    // commitment this integration exists to close would reopen with nothing to
    // notice it. A loud failure is the only safe response to a classification
    // that disagrees with this call site.
    if (!governedActionCommitsAuthority(ENTERPRISE_COLLATERALIZE_CAPABILITY) || !governedActionEncumbersAuthority(ENTERPRISE_COLLATERALIZE_CAPABILITY)) {
      throw new CollateralizationGovernanceError(
        'COLLATERALIZATION_EVALUATION_FAILED',
        `'${ENTERPRISE_COLLATERALIZE_CAPABILITY}' is not classified as committing and persistently constraining governed authority, but a successful collateralization leaves the holder's authority encumbered; refusing to issue a mandate that would rely on uncommitted capacity.`,
        { capability: ENTERPRISE_COLLATERALIZE_CAPABILITY },
      );
    }

    const authorityContext = toAuthorityContext(args.context);
    const acquired: string[] = [];
    try {
      for (const governedRight of args.request.terms.rights) {
        const outcome = await authorityStore.acquireReservation(authorityContext, {
          tenantId: args.organizationId,
          holderRef: args.holderRef,
          resource: { kind: args.request.asset.kind, id: args.request.asset.id },
          governedRight,
          scope: args.request.terms.scope,
          action: ENTERPRISE_COLLATERALIZE_CAPABILITY,
          sourceRequestRef: args.request.id,
          sourceDecisionRef: args.decisionRef,
          sourceMandateRef: args.mandateId,
          effectiveFrom: args.effectiveFrom,
          // The mandate's own expiry, so a commitment never outlives the
          // authorization justifying it — and covers exactly the window in
          // which an external executor may still legitimately act. The
          // *constraint* the execution later leaves behind carries no expiry at
          // all, which is the whole distinction between the two records.
          expiresAt: args.expiresAt,
          // One commitment per right per mandate. The request reference alone
          // would collide across the rights of a multi-right collateralization.
          idempotencyKey: `${args.mandateId}:${governedRight}`,
          correlationId: args.request.correlationId,
        });
        // An unenrolled resource has no capacity to commit and no competing
        // commitment to prevent, so it proceeds exactly as it did before this
        // layer existed.
        if (outcome.outcome === 'reserved') acquired.push(outcome.reservation.id);
      }
    } catch (error) {
      await releaseCollateralReservations(args.context, args.organizationId, acquired).catch(() => undefined);
      throw error;
    }
    return acquired;
  }

  /** Returns committed capacity that no longer supports anything. Idempotent, and never touches a position: a release is not a credit. */
  async function releaseCollateralReservations(
    context: CollateralizationGovernanceContext,
    organizationId: string,
    reservationIds: readonly string[],
  ): Promise<void> {
    if (authorityStore === undefined || reservationIds.length === 0) return;
    const authorityContext = toAuthorityContext(context);
    for (const reservationId of reservationIds) {
      await authorityStore.releaseReservation(authorityContext, { tenantId: organizationId, reservationId, reason: 'authorization_ended' });
    }
  }

  /** Releases whatever of a mandate's commitments are still active, looking them up by the artifact rather than requiring a caller to have kept their identifiers. */
  async function releaseActiveReservationsForMandate(
    context: CollateralizationGovernanceContext,
    organizationId: string,
    mandateId: string,
  ): Promise<void> {
    if (authorityStore === undefined) return;
    const authorityContext = toAuthorityContext(context);
    const held = await authorityStore.listReservationsByMandateRef(authorityContext, organizationId, mandateId);
    for (const reservation of held) {
      if (reservation.status !== 'active') continue;
      await authorityStore.releaseReservation(authorityContext, { tenantId: organizationId, reservationId: reservation.id, reason: 'authorization_ended' });
    }
  }

  /**
   * Records the persistent constraint a completed collateralization leaves
   * behind, and hands this mandate's commitment over to it.
   *
   * Called only after the execution evidence is durably committed, and only
   * with the values the *evidence* carries — the rights and the scope an
   * external system reported, re-asserted against the mandate by the store
   * before it was written. Not the mandate's authorized terms: what constrains
   * authority is what was committed, not what was permitted to be.
   *
   * This is the whole of `COLLATERALIZE`'s authority integration. There is no
   * balance arithmetic here, no position lookup and no debit of any kind: the
   * generic primitive is handed a confirmed execution and constrains what it
   * committed, while the holder's underlying position is left exactly as it
   * was.
   */
  async function recordCollateralEncumbrance(
    context: CollateralizationGovernanceContext,
    mandate: CollateralizationMandateRecord,
    execution: CollateralizationExecutionRecord,
  ): Promise<void> {
    if (authorityStore === undefined) return;
    const authorityContext = toAuthorityContext(context);

    // Whose authority this constrains is read from the commitment the mandate
    // already holds, never re-derived here.
    //
    // `CollateralizationMandateRecord` records the requester but no holder —
    // `EnterpriseCollateralizationTerms` has no field for one — so guessing
    // `requestedBy` would constrain the wrong party's authority whenever a
    // delegated administrator or a representative submitted the request, which
    // is the ordinary case. The reservation is the durable record of the holder
    // whose capacity was actually committed and whose authority the Kernel
    // actually checked, so the constraint simply takes it over.
    //
    // No reservation means this mandate never passed a capacity gate — an
    // unenrolled resource, or a deployment that adopted the authority store
    // after the mandate was issued. Recording a constraint for it now would
    // constrain authority nothing ever checked, so nothing is recorded and the
    // execution evidence stands on its own, exactly as it did before this
    // integration existed.
    const commitments = await authorityStore.listReservationsByMandateRef(authorityContext, mandate.organizationId, mandate.id);
    if (commitments.length === 0) return;

    for (const governedRight of execution.rights) {
      const commitment = commitments.find((reservation) => reservation.governedRight === governedRight);
      if (commitment === undefined) continue;
      await authorityStore.recordEncumbrance(authorityContext, {
        tenantId: mandate.organizationId,
        holderRef: commitment.holderRef,
        resource: { kind: mandate.assetKind, id: mandate.assetId },
        governedRight,
        scope: execution.committedScope,
        sourceAction: ENTERPRISE_COLLATERALIZE_CAPABILITY,
        sourceMandateRef: mandate.id,
        // The idempotency key. One recorded execution constrains authority
        // once, however many times this is retried or replayed after a restart.
        sourceExecutionRef: execution.id,
        // The instant the arrangement took effect in the governed world, not
        // when Soberanía heard about it.
        effectiveFrom: execution.executedAt,
        // Hand this mandate's commitment over in the same commit section that
        // writes the constraint. The capacity is not "released" — it was spent,
        // and the constraint now accounts for it — so continuing to subtract
        // the reservation as well would count one commitment twice. Naming the
        // mandate rather than the reservation keeps this module free of
        // reservation identifiers it would otherwise have to thread through
        // execution evidence.
        consumesReservationsForMandateRef: mandate.id,
        correlationId: execution.correlationId,
      });
    }
  }


  function buildCanonicalRequest(
    input: SubmitCollateralizationRequestInput,
    requestId: string,
    correlationId: string,
  ): EnterpriseCollateralizationRequest {
    const candidate = {
      schemaVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
      id: requestId,
      capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
      asset: input.asset,
      requestedBy: input.requestedBy,
      terms: input.terms,
      requestedAt: input.requestedAt ?? now(),
      correlationId,
      ...(input.requestedExpiresAt !== undefined ? { requestedExpiresAt: input.requestedExpiresAt } : {}),
      ...(input.justification !== undefined ? { justification: input.justification } : {}),
      ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
    };

    const validation = validateEnterpriseCollateralizationRequest(candidate);
    if (!validation.valid) {
      throw new CollateralizationGovernanceError(
        'COLLATERALIZATION_VALIDATION_ERROR',
        `Collateralization request failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
        { issues: validation.errors },
      );
    }
    return candidate;
  }

  /**
   * Adapts a canonical collateralization request onto the generalized
   * `KernelEvaluationRequest` every other governed action already uses. The
   * action identifier travels as `action.capability` (matched by Authority
   * Graph and Recognition Runtime against their own grants/tokens), and the
   * full, serialized authorization terms travel as `action.parameters` so the
   * policy layer can see exactly what is being asked for -- including which
   * obligation is being secured and for whose benefit. No
   * collateralization-specific decision path is introduced anywhere.
   *
   * `counterpartyId` is populated from `securedPartyRef` because that is
   * precisely what the existing Domain Policy Pack preflight means by a
   * counterparty, and a deployment's policy may legitimately turn on who the
   * secured party is. `amount`/`currency` are deliberately *not* populated
   * from `maximumSecuredAmount`: that field is a declared ceiling on an
   * external obligation, not the value of this action, and feeding it to a
   * transaction-amount policy input would misrepresent it.
   */
  function toKernelRequest(
    request: EnterpriseCollateralizationRequest,
    input: SubmitCollateralizationRequestInput,
    organizationId: string,
  ): KernelEvaluationRequest {
    return {
      requestId: request.id,
      actor: {
        id: request.requestedBy,
        trustDomainId: input.trustDomainId,
        ...(input.principalActorId !== undefined ? { principalId: input.principalActorId } : {}),
        ...(input.actorType !== undefined ? { type: input.actorType } : {}),
      },
      action: {
        type: ENTERPRISE_COLLATERALIZE_CAPABILITY,
        capability: ENTERPRISE_COLLATERALIZE_CAPABILITY,
        resourceScope: input.resourceScope ?? defaultResourceScope(request.asset),
        sideEffectType: 'external_api_call',
        riskLevel: 'critical',
        parameters: { ...serializeEnterpriseCollateralizationRequest(request) },
        // The governed rights this request engages, declared as typed
        // vocabulary. `COLLATERALIZE`'s scope is required and *accumulates* —
        // encumbering a finite right twice exhausts it — but that accumulation
        // is a property of the mandate, not of the underlying authority.
        // What is checked here is only that the holder controls at least the
        // scope being committed; how much of it a prior encumbrance has
        // already tied up remains the mandate's own cumulative rule.
        governedRights: request.terms.rights,
        governedRightsScope: request.terms.scope,
        ...(input.authorityHolderRef !== undefined ? { governedAuthorityHolderRef: input.authorityHolderRef } : {}),
        counterpartyId: request.terms.securedPartyRef,
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
    async requestCollateralization(context, organizationId, input) {
      requireCollateralizationAccessToOrganization(context, organizationId);
      assertAssetBelongsToOrganization(input.asset, organizationId);

      const receivedAt = now();
      const requestId = input.requestId ?? nextId('collateralization-request');
      const correlationId = input.correlationId ?? nextId('collateralization-correlation');
      const request = buildCanonicalRequest(input, requestId, correlationId);
      const mandateExpiresAt = requireStrictUtcCollateralizationTimestamp(input.mandateExpiresAt, 'mandateExpiresAt');

      const kernelRequest = toKernelRequest(request, input, organizationId);

      let result: KernelEvaluationResult;
      try {
        result = await kernel.evaluate(kernelRequest);
      } catch (error) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EVALUATION_FAILED',
          'The Kernel could not complete evaluation of this COLLATERALIZE request.',
          { cause: error instanceof Error ? error.message : String(error) },
        );
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
        // A conflict is a distinct, caller-actionable fact -- the same
        // request identity was already governed under a different payload --
        // not an infrastructure failure. Surfacing them alike would tell a
        // caller to retry something that must not be retried unchanged.
        if (isGovernanceStoreError(error) && error.code === 'GOVERNANCE_IDEMPOTENCY_CONFLICT') {
          throw new CollateralizationGovernanceError(
            'COLLATERALIZATION_REQUEST_CONFLICT',
            `Collateralization request '${request.id}' was already governed under a different payload; a request id must identify exactly one COLLATERALIZE request.`,
            { requestId: request.id },
          );
        }
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_PERSISTENCE_FAILED',
          'The COLLATERALIZE evaluation could not be durably recorded; no mandate was issued.',
          { cause: error instanceof Error ? error.message : String(error) },
        );
      }

      const outcomeBase = {
        status: result.status,
        requestId: result.requestId,
        decisionId: result.decisionId,
        evaluationId: appended.evaluationId,
        reasonCodes: result.reasonCodes,
        summary: result.summary,
      } as const;

      // Only an `allowed` decision authorizes anything. `approval_required`
      // is explicitly not authorization -- an outstanding approval means the
      // governance chain is incomplete, and an incomplete chain never
      // produces a mandate.
      if (result.status !== 'allowed') return outcomeBase;

      // The Governance Store deduplicated this against an already-committed
      // aggregate: the request was already governed once. Return whatever
      // authorization that original evaluation produced -- replaying a
      // request must never accumulate a second mandate.
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
      // established that the authority it relies on is still *uncommitted and
      // unconstrained* — and the Kernel could not, because any capacity it
      // observed would already be stale by the time a mandate was written, and
      // because coverage answers "does the holder possess this?" rather than
      // "is enough of it still free?".
      //
      // So the last thing before the authorization artifact exists is an atomic
      // acquire against the holder's remaining capacity, which now nets off
      // both live commitments and the persistent constraints earlier
      // collateralizations left behind. It can only ever narrow: an ALLOW that
      // loses this race becomes a denial, and a DENY can never be rescued here,
      // because a denied request never reaches this line.
      //
      // The mandate's id is minted first so the reservation can name the
      // artifact it stands for. That ordering is what makes the compensation
      // below possible: a commitment acquired for an artifact with no name
      // could not be found again if issuing it then failed.
      // ---------------------------------------------------------------------
      const mandateId = nextId('collateralization-mandate');
      const reservationIds = await reserveCollateralAuthority({
        context,
        organizationId,
        request,
        holderRef: holderOf(request, input),
        mandateId,
        decisionRef: result.decisionId,
        effectiveFrom: requireStrictUtcCollateralizationTimestamp(result.evaluatedAt, 'result.evaluatedAt'),
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
        // is no caller-supplied override, so `20%` cannot become `100%` and
        // Obligation A cannot become Obligation B between request and
        // mandate; the store re-asserts containment anyway
        // (`assertNoCollateralScopeEscalation`).
        terms: request.terms,
        requestedTerms: request.terms,
        requestRef: request.id,
        requestedBy: request.requestedBy,
        decisionRef: result.decisionId,
        evaluationRef: appended.evaluationId,
        effectiveFrom: requireStrictUtcCollateralizationTimestamp(result.evaluatedAt, 'result.evaluatedAt'),
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
        await releaseCollateralReservations(context, organizationId, reservationIds).catch(() => undefined);
        throw error;
      }

      // Link the committed governance aggregate to the artifact it produced,
      // using the Governance Store's own reference surface rather than a
      // collateralization-specific side table.
      //
      // `authorization_artifact` is the reference type the TokenizationMandate
      // also uses for exactly this relationship: a mandate is produced and
      // owned by Soberanía Enterprise, recording an authorization this enforcement
      // granted. The external collateral arrangement and its release are
      // separate observations, recorded as `execution_record` below.
      //
      // This classifies; it does not authorize. Reaching this line already
      // required a persisted allowed Kernel decision and an issued, persisted
      // mandate — see `docs/enterprise/AOC_COLLATERALIZE_ACTION.md`.
      await governanceStore.appendReference(accessContext, {
        referenceId: nextId('collateralization-reference'),
        evaluationId: appended.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: mandate.id,
        externalVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
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
        id: input.executionId ?? nextId('collateralization-execution'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executorRef: input.executorRef,
        executedAt: input.executedAt,
        securedObligationRef: input.securedObligationRef,
        securedPartyRef: input.securedPartyRef,
        committedScope: input.committedScope,
        rights: input.rights,
        correlationId: input.correlationId ?? nextId('collateralization-execution-correlation'),
        ...(input.securedAmount !== undefined ? { securedAmount: input.securedAmount } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalFilingReference !== undefined ? { externalFilingReference: input.externalFilingReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.priorityRank !== undefined ? { priorityRank: input.priorityRank } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      // The handoff, ordered after the execution evidence is durably committed
      // and re-asserted against the mandate, and never before.
      //
      // That ordering is the safe one and the other is not. A constraint
      // recorded before the external arrangement is known to exist would
      // constrain authority for something that may never have happened; a
      // constraint recorded after evidence is committed can, at worst, be
      // missing after a crash — which leaves the *reservation* still active
      // over the same quantity. That state is conservative (the capacity stays
      // unavailable rather than becoming falsely free), self-describing, and
      // repaired idempotently by replaying this execution.
      await recordCollateralEncumbrance(context, recorded.mandate, recorded.execution);

      if (mandate.evaluationRef !== undefined) {
        // External execution evidence is correlated back to the governance
        // aggregate that authorized it, so a reviewer can answer "was the
        // execution consistent with the authorization?" from the canonical
        // record alone.
        await governanceStore.appendReference(
          { system: context.system, organizationId: mandate.organizationId, ...(context.actorId !== undefined ? { actorId: context.actorId } : {}) },
          {
            referenceId: nextId('collateralization-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: recorded.execution.id,
            externalVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
            createdAt: now(),
          },
        );
      }

      return recorded;
    },

    async listExecutions(context, mandateId) {
      return store.listExecutions(context, mandateId);
    },

    async recordRelease(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      const release = await store.recordRelease(context, {
        id: input.releaseId ?? nextId('collateralization-release'),
        mandateId: mandate.id,
        executionId: input.executionId,
        organizationId: mandate.organizationId,
        reportedBy: input.reportedBy,
        releasedAt: input.releasedAt,
        releaseType: input.releaseType,
        correlationId: input.correlationId ?? nextId('collateralization-release-correlation'),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.externalReleaseReference !== undefined ? { externalReleaseReference: input.externalReleaseReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      if (mandate.evaluationRef !== undefined) {
        // A reported release is recorded as one more `execution_record`
        // reference against the same aggregate: it is an observation about
        // the external arrangement's life, correlated to the authorization
        // that permitted it, and never a governance decision of its own.
        await governanceStore.appendReference(
          { system: context.system, organizationId: mandate.organizationId, ...(context.actorId !== undefined ? { actorId: context.actorId } : {}) },
          {
            referenceId: nextId('collateralization-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: release.id,
            externalVersion: ENTERPRISE_COLLATERALIZATION_SCHEMA_VERSION,
            createdAt: now(),
          },
        );
      }

      return release;
    },

    async listReleases(context, mandateId) {
      return store.listReleases(context, mandateId);
    },

    async revokeMandate(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      const outcome = await store.revokeMandate(context, {
        revocationId: nextId('collateralization-revocation'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt: input.revokedAt ?? now(),
        reason: input.reason,
        issuerRef: input.requestedBy,
        correlationId: input.correlationId ?? nextId('collateralization-revocation-correlation'),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      // Revoking withdraws the authority to collateralize further, so the
      // capacity this mandate was holding for an execution that will now never
      // happen is capacity nothing can any longer draw on, and continuing to
      // withhold it from the holder would be a penalty rather than an
      // accounting fact.
      //
      // Revocation is still emphatically not release, and this is precisely
      // where that distinction becomes operational rather than rhetorical.
      // Only a still-`'active'` commitment is returned. A commitment that
      // already became a persistent constraint is `'encumbered'`, which
      // `releaseReservation` refuses to reopen, and the constraint itself is
      // untouched — because an arrangement an external system already created
      // does not cease to exist when Soberanía withdraws permission to create more of
      // them.
      //
      // Ordered after the revocation is durably recorded, deliberately. The
      // other ordering would free capacity for a mandate that might still turn
      // out to be live.
      await releaseActiveReservationsForMandate(context, mandate.organizationId, mandate.id);
      return outcome;
    },

    async getEvidenceLineage(context, mandateId) {
      const mandate = await store.getMandate(context, mandateId);
      const executions = await store.listExecutions(context, mandateId);
      const releases = await store.listReleases(context, mandateId);
      const revocation = await store.getRevocation(context, mandateId);

      return {
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        asset: {
          kind: mandate.assetKind,
          id: mandate.assetId,
          ...(mandate.assetTenantId !== undefined ? { tenantId: mandate.assetTenantId } : {}),
        },
        terms: mandate.terms,
        requestRef: mandate.requestRef,
        requestedBy: mandate.requestedBy,
        // Lifted out of `terms` deliberately: "what obligation was secured,
        // for whom, executed by whom" are the three questions a collateral
        // reviewer asks first, and a lineage should answer them without
        // making the caller reach into the terms object.
        securedObligationRef: mandate.terms.securedObligationRef,
        securedPartyRef: mandate.terms.securedPartyRef,
        executorRef: mandate.terms.executorRef,
        decisionRef: mandate.decisionRef,
        approvalRefs: mandate.approvalRefs ?? [],
        obligationRefs: mandate.obligationRefs ?? [],
        evidenceRefs: mandate.evidenceRefs ?? [],
        auditRefs: mandate.auditRefs ?? [],
        executionRefs: executions.map((execution) => execution.id),
        releaseRefs: releases.map((release) => release.id),
        ...(mandate.committedScope !== undefined ? { committedScope: mandate.committedScope } : {}),
        ...(mandate.evaluationRef !== undefined ? { evaluationRef: mandate.evaluationRef } : {}),
        ...(revocation !== null ? { revocationRef: revocation.id } : {}),
      };
    },
  };
}
