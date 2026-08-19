import type { GovernedAuthorityEncumbrance } from '@aoc-enterprise/governed-authority';
import { serializeGovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import type { KernelDecisionStatus, KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import type { AuthorityGovernanceContext, GovernedAuthorityResourceRef, ReleaseGovernedAuthorityEncumbranceInput } from '../authority-governance/index.js';
import type { GovernanceEnterpriseContext, GovernanceStoreAccessContext } from '../governance-store/contracts.js';
import { isGovernanceStoreError } from '../governance-store/errors.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import {
  ENTERPRISE_ENCUMBRANCE_RELEASE_SCHEMA_VERSION,
  ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY,
  type EncumbranceReleaseEvidenceLineage,
  type EncumbranceReleaseExecutionRecord,
  type EncumbranceReleaseGovernanceContext,
  type EncumbranceReleaseMandateRecord,
  type EncumbranceReleaseResourceRef,
  type EncumbranceReleaseRevokeOutcome,
} from './contracts.js';
import { EncumbranceReleaseGovernanceError } from './errors.js';
import type { EncumbranceReleaseExecutionOutcome, EncumbranceReleaseExecutorPort } from './executor-port.js';
import {
  assertEncumbranceActive,
  assertEncumbranceMatchesTarget,
  assertEncumbranceReleaseMandateExecutable,
  deriveEncumbranceReleaseIdempotencyKey,
  encumbranceReleaseResourceScope,
  requireEncumbranceReleaseRef,
} from './lifecycle.js';
import {
  requireEncumbranceReleaseAccessToOrganization,
  requireStrictUtcEncumbranceReleaseTimestamp,
  type EncumbranceReleaseMandateStore,
} from './mandate-store.js';

/**
 * The Kernel surface this module needs, named structurally so the module
 * depends on the canonical evaluation contract rather than on a concrete
 * class. `AocKernel` satisfies it as-is; nothing else in this repository does,
 * and no fake decision engine is provided or implied.
 */
export interface EncumbranceReleaseKernelPort {
  evaluate(request: KernelEvaluationRequest): Promise<KernelEvaluationResult>;
}

/**
 * The narrow slice of the Governed Authority Store this module reaches.
 *
 * Three methods, and the narrowness is the security boundary rather than
 * tidiness. This module can read a constraint, terminalize one on a typed
 * basis, and ask which constraint a release execution already terminalized. It
 * cannot bootstrap authority, move it, commit it or encumber it — so no bug
 * here can turn a release into an issuance.
 */
export interface EncumbranceReleaseAuthorityPort {
  getEncumbrance(
    context: AuthorityGovernanceContext,
    tenantId: string,
    encumbranceId: string,
  ): Promise<GovernedAuthorityEncumbrance | null>;
  getEncumbranceByReleaseExecutionRef(
    context: AuthorityGovernanceContext,
    tenantId: string,
    releaseExecutionRef: string,
  ): Promise<GovernedAuthorityEncumbrance | null>;
  releaseEncumbrance(
    context: AuthorityGovernanceContext,
    input: ReleaseGovernedAuthorityEncumbranceInput,
  ): Promise<GovernedAuthorityEncumbrance>;
}

export interface EncumbranceReleaseGovernanceServiceDependencies {
  readonly store: EncumbranceReleaseMandateStore;
  readonly kernel: EncumbranceReleaseKernelPort;
  readonly governanceStore: GovernanceStore;
  readonly enterpriseContext: () => GovernanceEnterpriseContext;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  /**
   * The authority state this action governs. Required, unlike the four
   * existing actions' optional authority ports: a release that cannot read the
   * constraint it is discharging, or cannot terminalize it, has no governed
   * effect at all, and a service that quietly did nothing would be worse than
   * one that refuses to be composed.
   */
  readonly authorityStore: EncumbranceReleaseAuthorityPort;
  /**
   * What actually performs the external release. Required, and the whole
   * reason a caller cannot self-assert a discharge — see `executor-port.ts`.
   */
  readonly executor: EncumbranceReleaseExecutorPort;
}

/** What a release request is asked for. Note the absence of holder, right, scope, source action and source execution: all are read from the canonical constraint. */
export interface SubmitEncumbranceReleaseRequestInput {
  readonly requestId?: string;
  /** The governed resource whose authority the target constraint stands over. Checked against the constraint, never coerced to it. */
  readonly resource: EncumbranceReleaseResourceRef;
  /** The one persistent constraint to discharge. */
  readonly encumbranceRef: string;
  readonly requestedBy: string;
  readonly trustDomainId: string;
  readonly principalActorId?: string;
  readonly actorType?: string;
  readonly resourceScope?: string;
  readonly requestedAt?: string;
  readonly correlationId?: string;
  readonly justification?: string;
  readonly evidenceRefs?: readonly string[];
  readonly context?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
  readonly mandateExpiresAt: string;
  readonly issuerRef?: string;
  readonly obligationRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
}

export interface EncumbranceReleaseRequestOutcome {
  readonly status: KernelDecisionStatus;
  readonly requestId: string;
  readonly decisionId: string;
  readonly evaluationId: string;
  readonly reasonCodes: readonly string[];
  readonly summary: string;
  readonly mandate?: EncumbranceReleaseMandateRecord;
}

export interface ExecuteEncumbranceReleaseRequest {
  readonly mandateId: string;
  readonly executionId?: string;
  readonly attemptedAt?: string;
  readonly correlationId?: string;
}

export interface EncumbranceReleaseExecutionOutcomeResult {
  readonly mandate: EncumbranceReleaseMandateRecord;
  readonly execution: EncumbranceReleaseExecutionRecord;
  /** The constraint as it now stands. `'released'` only when a trusted executor confirmed the discharge; `'active'` in every other case, including an unknown outcome. */
  readonly encumbrance: GovernedAuthorityEncumbrance;
  /** `true` when this call performed the terminalization, `false` when it found it already done. Lets a caller tell "released now" from "already released" without comparing capacity. */
  readonly terminalized: boolean;
}

export interface RevokeEncumbranceReleaseMandateRequest {
  readonly mandateId: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly revokedAt?: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly correlationId?: string;
}

/**
 * The `RELEASE_ENCUMBRANCE` governed action: the production path by which an
 * ACTIVE persistent authority constraint may stop constraining.
 *
 * ## The chain, and why every link is separate
 *
 * ```
 * ACTIVE ENCUMBRANCE
 *     -> release request                (requestEncumbranceRelease)
 *     -> action authority / derived authority / policy / approvals / obligations   (AocKernel)
 *     -> release mandate                (still ACTIVE; capacity unchanged)
 *     -> trusted executor invocation    (executeEncumbranceRelease)
 *     -> confirmed release evidence     (durable, before anything is terminalized)
 *     -> encumbrance RELEASED           (GovernedAuthorityStore, governed-execution basis)
 *     -> capacity restored              (derived, never incremented)
 * ```
 *
 * Collapsing any two of those is the failure this module exists to prevent, and
 * the most tempting collapse is the last but one: *"someone said the collateral
 * was released"* becoming *"capacity is free"*. AOC never makes that inference.
 * A mandate is an authorization, not an effect; an executor's confirmation is
 * an observation this deployment trusts because it made the call itself, not
 * because a caller supplied it.
 *
 * ## Who may release
 *
 * Whoever holds recognized `release-encumbrance` action authority over the
 * resource, directly or through a still-live delegation lineage — and nobody
 * else. In particular:
 *
 * - **The encumbered holder does not qualify by being the holder.** A party who
 *   could discharge her own constraint by asking would make the constraint
 *   worth nothing. She may of course be *granted* release authority, and then
 *   she qualifies because of the grant.
 * - **The secured party does not qualify by being named on the
 *   collateralization.** `securedPartyRef` records who benefited; the
 *   `COLLATERALIZE` contract defines it as "who benefits", and nothing in it
 *   makes it a control principal.
 * - **The original requester and executor do not qualify by history.** Neither
 *   holds a perpetual privilege from having once been involved.
 *
 * This is deliberately Action Authority *alone*, with no bespoke
 * release-controller relation added to the encumbrance. The Authority Graph
 * already expresses "X may invoke this action on this resource, through this
 * lineage, in this trust domain, until this moment"; a second, encumbrance-local
 * authority universe would have to re-answer revocation, expiry, delegation
 * depth and trust-domain containment, and would answer them differently the
 * first time the two drifted.
 *
 * ## Why no governed right is declared
 *
 * A release draws on nothing of the holder's. It ends a constraint rather than
 * exercising a fraction of a right, so the request declares no
 * `governedRights`, the Kernel's governed-authority check is correctly
 * `not_performed`, and no `GovernedAuthorityReservation` is acquired. Declaring
 * a right here would have asserted that discharging a constraint consumes the
 * authority it was holding, which is the opposite of what happens.
 *
 * That is also why holder-bound representative authority does not apply: there
 * is no holder's authority being exercised for a representative to be bound to.
 * A deployment that later introduces a distinct release-authority *principal*
 * would revisit that; today the requester acts on its own recognized authority.
 */
export interface EncumbranceReleaseGovernanceService {
  /**
   * Routes one `RELEASE_ENCUMBRANCE` request through the canonical governance
   * lifecycle: validate -> load the canonical constraint -> `AocKernel.evaluate()`
   * (authority, delegation lineage, policy, approvals, obligations, evidence)
   * -> one atomic Governance Store aggregate append -> issue a mandate if, and
   * only if, the decision allowed it.
   *
   * **Nothing is released here.** The constraint is still `'active'` when this
   * returns, whatever it returns, and the holder's capacity is exactly what it
   * was.
   */
  requestEncumbranceRelease(
    context: EncumbranceReleaseGovernanceContext,
    organizationId: string,
    input: SubmitEncumbranceReleaseRequestInput,
  ): Promise<EncumbranceReleaseRequestOutcome>;

  getMandate(context: EncumbranceReleaseGovernanceContext, mandateId: string): Promise<EncumbranceReleaseMandateRecord>;

  /**
   * Spends a release authorization: calls the trusted executor, records what it
   * reported, and terminalizes the constraint if — and only if — the executor
   * confirmed the release.
   *
   * A confirmed failure, an indeterminate outcome and an unreachable executor
   * all leave the constraint `'active'`. Only `'confirmed_success'` reaches the
   * authority store, and it reaches it as a typed `'governed-execution'` basis
   * naming this mandate and this execution.
   */
  executeEncumbranceRelease(
    context: EncumbranceReleaseGovernanceContext,
    input: ExecuteEncumbranceReleaseRequest,
  ): Promise<EncumbranceReleaseExecutionOutcomeResult>;

  listExecutions(
    context: EncumbranceReleaseGovernanceContext,
    mandateId: string,
  ): Promise<readonly EncumbranceReleaseExecutionRecord[]>;

  /**
   * Finishes a terminalization that a crash interrupted between the durable
   * release evidence and the authority store.
   *
   * Deterministic and idempotent: it acts only where a confirmed successful
   * execution already exists and the constraint it discharged is still
   * `'active'`, and it does exactly what the original call would have done.
   * Safe to run at any time, including when there is nothing to do.
   *
   * This is a *recovery* path, not a second release path: it invokes no
   * executor and can create no evidence. Until it runs, the constraint simply
   * stays standing — capacity blocked rather than falsely freed.
   */
  recoverEncumbranceRelease(
    context: EncumbranceReleaseGovernanceContext,
    mandateId: string,
  ): Promise<EncumbranceReleaseExecutionOutcomeResult | null>;

  /** Withdraws a release authorization before it is spent. Nothing external is released, and the constraint stays exactly as it was — revocation is emphatically not discharge. */
  revokeMandate(
    context: EncumbranceReleaseGovernanceContext,
    input: RevokeEncumbranceReleaseMandateRequest,
  ): Promise<EncumbranceReleaseRevokeOutcome>;

  /** Assembles the complete governance chain behind a release from references already stored — never a second audit log. */
  getEvidenceLineage(
    context: EncumbranceReleaseGovernanceContext,
    mandateId: string,
  ): Promise<EncumbranceReleaseEvidenceLineage>;
}

export function createEncumbranceReleaseGovernanceService(
  deps: EncumbranceReleaseGovernanceServiceDependencies,
): EncumbranceReleaseGovernanceService {
  const { store, kernel, governanceStore, enterpriseContext, now, nextId, authorityStore, executor } = deps;

  function toAuthorityContext(context: EncumbranceReleaseGovernanceContext): AuthorityGovernanceContext {
    return {
      system: context.system,
      ...(context.organizationId !== undefined ? { organizationId: context.organizationId } : {}),
      ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
    };
  }

  function toResourceRef(resource: EncumbranceReleaseResourceRef): GovernedAuthorityResourceRef {
    return { kind: resource.kind, id: resource.id };
  }

  /**
   * A tenant may only release constraints over its own resources. When a
   * resource carries a `tenantId`, it must be the acting organization's; a
   * caller can never reach across the tenancy boundary by naming another
   * tenant's resource. Checked before the Kernel is ever consulted, so a
   * cross-tenant attempt never even produces a governance evaluation to point
   * at.
   */
  function assertResourceBelongsToOrganization(resource: EncumbranceReleaseResourceRef, organizationId: string): void {
    if (resource.tenantId !== undefined && resource.tenantId !== organizationId) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_RESOURCE_TENANT_MISMATCH',
        `This resource is governed by tenant '${resource.tenantId}'; organization '${organizationId}' cannot request the release of constraints over it.`,
        { resourceTenantId: resource.tenantId, organizationId },
      );
    }
  }

  /**
   * Loads the canonical constraint, and refuses everything that is not it.
   *
   * The single most important read in this module. Everything the release
   * lifecycle needs about *what* is being discharged comes from here — holder,
   * right, scope, source action, source mandate, source execution — and nothing
   * comes from the caller. A caller that could supply those could choose which
   * constraint a release "really" meant; a caller that can only name one has to
   * name the one it is authorized to discharge.
   *
   * A cross-tenant identifier reads as absent from the authority store rather
   * than as a refusal, so this surfaces as `TARGET_NOT_FOUND` and no
   * information about another tenant's identifiers leaks.
   */
  async function loadTargetEncumbrance(
    context: EncumbranceReleaseGovernanceContext,
    organizationId: string,
    encumbranceRef: string,
    resource: EncumbranceReleaseResourceRef,
  ): Promise<GovernedAuthorityEncumbrance> {
    const encumbrance = await authorityStore.getEncumbrance(toAuthorityContext(context), organizationId, encumbranceRef);
    if (encumbrance === null) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_TARGET_NOT_FOUND',
        `No governed authority encumbrance '${encumbranceRef}' exists in organization '${organizationId}'.`,
        { encumbranceRef, organizationId },
      );
    }
    assertEncumbranceMatchesTarget(encumbrance, { organizationId, resource });
    return encumbrance;
  }

  /**
   * Adapts a release request onto the generalized `KernelEvaluationRequest`
   * every other governed action already uses. The action identifier travels as
   * `action.capability` (matched by Authority Graph and Recognition Runtime
   * against their own grants and tokens), and the target constraint's canonical
   * facts travel as `action.parameters` so the policy layer can see exactly
   * what would be discharged — whose authority, how much of it, and which
   * arrangement created it. No release-specific decision path is introduced
   * anywhere.
   *
   * Those parameters are read from the *stored* constraint, never from the
   * submission. A policy that turns on "how much would this free?" must be
   * shown the real quantity, and a caller able to supply it could show a policy
   * a smaller one.
   *
   * `governedRights` and `governedRightsScope` are deliberately absent. A
   * release exercises no fraction of the holder's right, so declaring one would
   * assert a consumption that does not happen — and would make the Kernel run a
   * coverage check whose answer is irrelevant to whether a constraint may end.
   */
  function toKernelRequest(
    input: SubmitEncumbranceReleaseRequestInput,
    requestId: string,
    correlationId: string,
    requestedAt: string,
    encumbrance: GovernedAuthorityEncumbrance,
    organizationId: string,
  ): KernelEvaluationRequest {
    return {
      requestId,
      actor: {
        id: input.requestedBy,
        trustDomainId: input.trustDomainId,
        ...(input.principalActorId !== undefined ? { principalId: input.principalActorId } : {}),
        ...(input.actorType !== undefined ? { type: input.actorType } : {}),
      },
      action: {
        type: ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY,
        capability: ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY,
        resourceScope: input.resourceScope ?? encumbranceReleaseResourceScope(input.resource),
        sideEffectType: 'external_api_call',
        riskLevel: 'critical',
        parameters: {
          schemaVersion: ENTERPRISE_ENCUMBRANCE_RELEASE_SCHEMA_VERSION,
          capability: ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY,
          requestId,
          requestedBy: input.requestedBy,
          resource: { kind: input.resource.kind, id: input.resource.id },
          encumbranceRef: encumbrance.id,
          // Canonical facts about the constraint, so policy sees the real one.
          encumberedHolderRef: encumbrance.holderRef,
          governedRight: encumbrance.governedRight,
          encumberedScope: serializeGovernedRightsScope(encumbrance.scope),
          sourceAction: encumbrance.sourceAction,
          sourceMandateRef: encumbrance.sourceMandateRef,
          sourceExecutionRef: encumbrance.sourceExecutionRef,
          encumbranceStatus: encumbrance.status,
          effectiveFrom: encumbrance.effectiveFrom,
          requestedAt,
          ...(input.justification !== undefined ? { justification: input.justification } : {}),
        },
        ...(input.evidenceRefs !== undefined ? { evidenceIds: input.evidenceRefs } : {}),
      },
      target: { id: input.resource.id, type: input.resource.kind },
      organization: { id: organizationId },
      requestedAt,
      correlationId,
      ...(input.context !== undefined ? { context: input.context } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    };
  }

  /**
   * Terminalizes the constraint on the strength of a confirmed execution, and
   * nothing else.
   *
   * The typed basis is constructed here and only here, from artifacts this
   * service produced: the mandate it issued and the execution it recorded from
   * a port invocation it made. There is no parameter through which a caller
   * could influence it, and the authority store re-checks that the action named
   * is classified as releasing and that this execution has not already
   * discharged some other constraint.
   */
  async function terminalize(
    context: EncumbranceReleaseGovernanceContext,
    mandate: EncumbranceReleaseMandateRecord,
    execution: EncumbranceReleaseExecutionRecord,
  ): Promise<GovernedAuthorityEncumbrance> {
    return authorityStore.releaseEncumbrance(toAuthorityContext(context), {
      tenantId: mandate.organizationId,
      encumbranceId: mandate.encumbranceRef,
      basis: {
        kind: 'governed-execution',
        action: ENTERPRISE_RELEASE_ENCUMBRANCE_CAPABILITY,
        mandateRef: mandate.id,
        executionRef: execution.id,
      },
      releasedAt: execution.confirmedAt ?? execution.attemptedAt,
    });
  }

  return {
    async requestEncumbranceRelease(context, organizationId, input) {
      requireEncumbranceReleaseAccessToOrganization(context, organizationId);
      assertResourceBelongsToOrganization(input.resource, organizationId);

      const encumbranceRef = requireEncumbranceReleaseRef(input.encumbranceRef, 'encumbranceRef');
      requireEncumbranceReleaseRef(input.requestedBy, 'requestedBy');
      requireEncumbranceReleaseRef(input.trustDomainId, 'trustDomainId');
      requireEncumbranceReleaseRef(input.resource?.kind, 'resource.kind');
      requireEncumbranceReleaseRef(input.resource?.id, 'resource.id');

      const receivedAt = now();
      const requestId = input.requestId ?? nextId('encumbrance-release-request');
      const correlationId = input.correlationId ?? nextId('encumbrance-release-correlation');
      const requestedAt = requireStrictUtcEncumbranceReleaseTimestamp(input.requestedAt ?? receivedAt, 'requestedAt');
      const mandateExpiresAt = requireStrictUtcEncumbranceReleaseTimestamp(input.mandateExpiresAt, 'mandateExpiresAt');

      // The target is loaded, and its correspondence checked, *before* any
      // governance evaluation exists. A request naming a constraint in another
      // tenant, over another resource, or one that is already discharged never
      // produces a decision to point at — and a policy that would have allowed
      // it never gets the chance to.
      const encumbrance = await loadTargetEncumbrance(context, organizationId, encumbranceRef, input.resource);
      assertEncumbranceActive(encumbrance);

      const kernelRequest = toKernelRequest(input, requestId, correlationId, requestedAt, encumbrance, organizationId);

      let result: KernelEvaluationResult;
      try {
        result = await kernel.evaluate(kernelRequest);
      } catch (error) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_EVALUATION_FAILED',
          'The Kernel could not complete evaluation of this RELEASE_ENCUMBRANCE request.',
          { cause: error instanceof Error ? error.message : String(error) },
        );
      }

      // Persistence invariant, identical to the four existing actions: no
      // governed outcome is claimed that could not be durably proven. The
      // aggregate is committed before any mandate can exist.
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
        if (isGovernanceStoreError(error) && error.code === 'GOVERNANCE_IDEMPOTENCY_CONFLICT') {
          throw new EncumbranceReleaseGovernanceError(
            'ENCUMBRANCE_RELEASE_REQUEST_CONFLICT',
            `Encumbrance release request '${requestId}' was already governed under a different payload; a request id must identify exactly one RELEASE_ENCUMBRANCE request.`,
            { requestId },
          );
        }
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_PERSISTENCE_FAILED',
          'The RELEASE_ENCUMBRANCE evaluation could not be durably recorded; no mandate was issued.',
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

      // Only an `allowed` decision authorizes anything. `approval_required` is
      // explicitly not authorization — an outstanding approval means the
      // governance chain is incomplete, and an incomplete chain never produces
      // a mandate, so the constraint stays exactly as it was.
      if (result.status !== 'allowed') return outcomeBase;

      // The Governance Store deduplicated this against an already-committed
      // aggregate: the request was already governed once. Return whatever
      // authorization that original evaluation produced — replaying a request
      // must never accumulate a second release mandate.
      if (appended.idempotentReplay) {
        const existing = await store.getMandateByRequestRef(context, requestId);
        return existing === null ? outcomeBase : { ...outcomeBase, mandate: existing };
      }

      const approvalRefs = [result.approval.proofId, result.approval.decisionId, result.approval.requestId].filter(
        (value): value is string => value !== undefined,
      );

      // No capacity gate here, deliberately, and this is the one place a
      // reviewer coming from `COLLATERALIZE` should expect one and not find it.
      // That action acquires a `GovernedAuthorityReservation` at exactly this
      // point, because issuing it commits a finite quantity of the holder's
      // authority that a competing authorization must not also be promised. A
      // release commits nothing: it *ends* a commitment. There is no finite
      // resource for two release mandates to race over, so acquiring a
      // reservation would constrain authority in order to free it — and the
      // store refuses a second *live* release mandate over one constraint on
      // its own, which is the only concurrency question this action has.
      const mandate = await store.issueMandate(context, {
        id: nextId('encumbrance-release-mandate'),
        organizationId,
        resourceKind: input.resource.kind,
        resourceId: input.resource.id,
        encumbranceRef: encumbrance.id,
        requestRef: requestId,
        requestedBy: input.requestedBy,
        decisionRef: result.decisionId,
        evaluationRef: appended.evaluationId,
        effectiveFrom: requireStrictUtcEncumbranceReleaseTimestamp(result.evaluatedAt, 'result.evaluatedAt'),
        expiresAt: mandateExpiresAt,
        correlationId,
        ...(input.resource.tenantId !== undefined ? { resourceTenantId: input.resource.tenantId } : {}),
        ...(input.issuerRef !== undefined ? { issuerRef: input.issuerRef } : {}),
        ...(approvalRefs.length > 0 ? { approvalRefs } : {}),
        ...(input.obligationRefs !== undefined ? { obligationRefs: input.obligationRefs } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
        ...(input.auditRefs !== undefined ? { auditRefs: input.auditRefs } : {}),
      });

      // Link the committed governance aggregate to the artifact it produced,
      // using the Governance Store's own reference surface rather than a
      // release-specific side table. `authorization_artifact` is the reference
      // type every other mandate uses for exactly this relationship.
      await governanceStore.appendReference(accessContext, {
        referenceId: nextId('encumbrance-release-reference'),
        evaluationId: appended.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: mandate.id,
        externalVersion: ENTERPRISE_ENCUMBRANCE_RELEASE_SCHEMA_VERSION,
        createdAt: now(),
      });

      return { ...outcomeBase, mandate };
    },

    async getMandate(context, mandateId) {
      return store.getMandate(context, mandateId);
    },

    async executeEncumbranceRelease(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      const attemptedAt = requireStrictUtcEncumbranceReleaseTimestamp(input.attemptedAt ?? now(), 'attemptedAt');
      const correlationId = input.correlationId ?? mandate.correlationId;

      // A mandate that is already spent may still be *replayed*: a caller
      // retrying after a crash between the durable evidence and the
      // terminalization must be able to finish the job rather than being told
      // the grant is gone. That path invokes no executor and creates no
      // evidence — it only completes what a confirmed execution already
      // justified.
      if (mandate.status === 'executed') {
        const confirmed = await store.getConfirmedExecution(context, mandate.id);
        if (confirmed !== null) return finishConfirmedRelease(context, mandate, confirmed);
      }

      // Revoked, spent-without-evidence, not yet effective, or expired: the
      // executor is never called. An authorization that is not live must not
      // produce an external release that AOC then has to decide what to do
      // with, and expiry is emphatically not discharge.
      assertEncumbranceReleaseMandateExecutable(mandate, attemptedAt);

      const encumbrance = await loadTargetEncumbrance(context, mandate.organizationId, mandate.encumbranceRef, {
        kind: mandate.resourceKind,
        id: mandate.resourceId,
      });
      assertEncumbranceActive(encumbrance);

      const executionId = input.executionId ?? nextId('encumbrance-release-execution');

      // The trusted boundary. Whatever comes back, it comes back from a call
      // this service made — there is no parameter by which a caller could hand
      // in an outcome, and `outcome` is never constructed here except from what
      // the port returned or from this module's own refusal to believe it.
      let outcome: EncumbranceReleaseExecutionOutcome;
      try {
        outcome = await executor.executeRelease({
          mandateId: mandate.id,
          organizationId: mandate.organizationId,
          encumbranceRef: mandate.encumbranceRef,
          resource: { kind: mandate.resourceKind, id: mandate.resourceId },
          governedRight: encumbrance.governedRight,
          encumberedScope: serializeGovernedRightsScope(encumbrance.scope),
          sourceAction: encumbrance.sourceAction,
          sourceMandateRef: encumbrance.sourceMandateRef,
          sourceExecutionRef: encumbrance.sourceExecutionRef,
          idempotencyKey: deriveEncumbranceReleaseIdempotencyKey(mandate),
          attemptedAt,
          correlationId,
        });
      } catch (error) {
        // A call that threw may still have reached the provider, so the outcome
        // is *unknown* rather than failed. Recorded as such, and safe to retry
        // under the same idempotency key. The constraint stays standing.
        outcome = {
          kind: 'indeterminate',
          reason: error instanceof Error ? `executor_error: ${error.message}` : 'executor_error',
        };
      }

      // A confirmation about some other constraint is not a confirmation about
      // this one. Downgraded to a definitive failure rather than trusted:
      // believing it would discharge a constraint on the strength of an answer
      // to a different question.
      if (outcome.kind === 'confirmed_success' && outcome.encumbranceRef !== mandate.encumbranceRef) {
        const recordedMismatch = await store.recordExecution(context, {
          id: executionId,
          mandateId: mandate.id,
          organizationId: mandate.organizationId,
          encumbranceRef: mandate.encumbranceRef,
          outcome: 'confirmed_failure',
          providerSystem: executor.providerSystem,
          attemptedAt,
          failureCode: 'executor_target_mismatch',
          failureReason: `The executor reported a release of '${outcome.encumbranceRef}', not of '${mandate.encumbranceRef}'.`,
          correlationId,
        });
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_EXECUTOR_TARGET_MISMATCH',
          `The configured release executor confirmed a release of '${outcome.encumbranceRef}' while it was asked about '${mandate.encumbranceRef}'; refusing to terminalize a constraint on the strength of an answer to a different question.`,
          {
            mandateId: mandate.id,
            expectedEncumbranceRef: mandate.encumbranceRef,
            reportedEncumbranceRef: outcome.encumbranceRef,
            executionId: recordedMismatch.execution.id,
          },
        );
      }

      // The crash boundary, and it is ordered the conservative way on purpose.
      //
      // The evidence is durable *before* anything is terminalized. A crash
      // between the two leaves a confirmed release recorded and the constraint
      // still `'active'` — capacity blocked rather than falsely freed — and
      // `recoverEncumbranceRelease` finishes it idempotently. The other
      // ordering would free capacity for a discharge whose evidence might never
      // land, which is the exact failure this whole phase exists to prevent.
      const recorded = await store.recordExecution(context, {
        id: executionId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        encumbranceRef: mandate.encumbranceRef,
        outcome: outcome.kind,
        providerSystem: executor.providerSystem,
        attemptedAt,
        correlationId,
        ...(outcome.kind === 'confirmed_success' ? { confirmedAt: requireStrictUtcEncumbranceReleaseTimestamp(outcome.confirmedAt, 'confirmedAt') } : {}),
        ...(outcome.kind === 'confirmed_success' && outcome.providerReleaseReference !== undefined
          ? { providerReleaseReference: outcome.providerReleaseReference }
          : {}),
        ...(outcome.kind === 'confirmed_failure' ? { failureCode: outcome.failureCode } : {}),
        ...(outcome.kind === 'confirmed_failure' && outcome.failureReason !== undefined ? { failureReason: outcome.failureReason } : {}),
        ...(outcome.kind === 'indeterminate' ? { failureCode: 'indeterminate', failureReason: outcome.reason } : {}),
      });

      // Correlate the executor evidence back to the governance aggregate that
      // authorized it, so a reviewer can answer "was the execution consistent
      // with the authorization?" from the canonical record alone.
      if (mandate.evaluationRef !== undefined) {
        await governanceStore.appendReference(
          {
            system: context.system,
            organizationId: mandate.organizationId,
            ...(context.actorId !== undefined ? { actorId: context.actorId } : {}),
          },
          {
            referenceId: nextId('encumbrance-release-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: recorded.execution.id,
            externalVersion: ENTERPRISE_ENCUMBRANCE_RELEASE_SCHEMA_VERSION,
            createdAt: now(),
          },
        );
      }

      if (recorded.execution.outcome !== 'confirmed_success') {
        // Confirmed failure and unknown alike: the constraint stands. The
        // read is deliberate rather than assumed — the caller is told what the
        // constraint *is*, not what this module believes it left it as.
        const unchanged = await loadTargetEncumbrance(context, mandate.organizationId, mandate.encumbranceRef, {
          kind: mandate.resourceKind,
          id: mandate.resourceId,
        });
        return { mandate: recorded.mandate, execution: recorded.execution, encumbrance: unchanged, terminalized: false };
      }

      const released = await terminalize(context, recorded.mandate, recorded.execution);
      return { mandate: recorded.mandate, execution: recorded.execution, encumbrance: released, terminalized: true };
    },

    async listExecutions(context, mandateId) {
      return store.listExecutions(context, mandateId);
    },

    async recoverEncumbranceRelease(context, mandateId) {
      const mandate = await store.getMandate(context, mandateId);
      const confirmed = await store.getConfirmedExecution(context, mandate.id);
      // Nothing confirmed, nothing to finish. A mandate whose executor failed
      // or answered unknown is not a crash to recover — it is a release that
      // did not happen, and the constraint correctly still stands.
      if (confirmed === null) return null;
      return finishConfirmedRelease(context, mandate, confirmed);
    },

    async revokeMandate(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      // Revocation withdraws the authorization and touches nothing else. The
      // constraint is not released, not weakened and not re-dated: an
      // authorization AOC withdraws says nothing about an arrangement that
      // still exists externally.
      return store.revokeMandate(context, {
        revocationId: nextId('encumbrance-release-revocation'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt: input.revokedAt ?? now(),
        reason: input.reason,
        issuerRef: input.requestedBy,
        correlationId: input.correlationId ?? nextId('encumbrance-release-revocation-correlation'),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });
    },

    async getEvidenceLineage(context, mandateId) {
      const mandate = await store.getMandate(context, mandateId);
      const executions = await store.listExecutions(context, mandate.id);
      const revocation = await store.getRevocation(context, mandate.id);
      const encumbrance = await authorityStore.getEncumbrance(toAuthorityContext(context), mandate.organizationId, mandate.encumbranceRef);
      const confirmed = executions.find((execution) => execution.outcome === 'confirmed_success');

      return {
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        resource: {
          kind: mandate.resourceKind,
          id: mandate.resourceId,
          ...(mandate.resourceTenantId !== undefined ? { tenantId: mandate.resourceTenantId } : {}),
        },
        encumbranceRef: mandate.encumbranceRef,
        requestRef: mandate.requestRef,
        requestedBy: mandate.requestedBy,
        decisionRef: mandate.decisionRef,
        approvalRefs: mandate.approvalRefs ?? [],
        obligationRefs: mandate.obligationRefs ?? [],
        evidenceRefs: mandate.evidenceRefs ?? [],
        auditRefs: mandate.auditRefs ?? [],
        executionRefs: executions.map((execution) => execution.id),
        ...(mandate.evaluationRef !== undefined ? { evaluationRef: mandate.evaluationRef } : {}),
        ...(revocation !== null ? { revocationRef: revocation.id } : {}),
        ...(confirmed !== undefined ? { releaseExecutionRef: confirmed.id } : {}),
        ...(encumbrance !== null ? { encumbrance } : {}),
      };
    },
  };

  /**
   * Completes — or observes as already complete — the terminalization a
   * confirmed execution justifies.
   *
   * Shared by the replay path and the recovery path so both do exactly the same
   * thing, and idempotent by construction: the authority store returns an
   * already-released constraint unchanged when the grounds match, and refuses a
   * *different* execution's grounds. `terminalized` reports which of the two
   * happened without anyone having to compare capacity.
   */
  async function finishConfirmedRelease(
    context: EncumbranceReleaseGovernanceContext,
    mandate: EncumbranceReleaseMandateRecord,
    confirmed: EncumbranceReleaseExecutionRecord,
  ): Promise<EncumbranceReleaseExecutionOutcomeResult> {
    const current = await authorityStore.getEncumbrance(toAuthorityContext(context), mandate.organizationId, mandate.encumbranceRef);
    if (current === null) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_TARGET_NOT_FOUND',
        `No governed authority encumbrance '${mandate.encumbranceRef}' exists in organization '${mandate.organizationId}'; refusing to report a release of a constraint that cannot be read.`,
        { encumbranceRef: mandate.encumbranceRef, organizationId: mandate.organizationId },
      );
    }
    if (current.status === 'released') {
      return { mandate, execution: confirmed, encumbrance: current, terminalized: false };
    }
    const released = await terminalize(context, mandate, confirmed);
    return { mandate, execution: confirmed, encumbrance: released, terminalized: true };
  }
}
