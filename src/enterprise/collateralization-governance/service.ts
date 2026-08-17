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

import type { KernelEvaluationOptions, KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
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
   * committed scope are unchanged, and AOC asserts nothing about whether the
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
  const { store, kernel, governanceStore, enterpriseContext, now, nextId } = deps;

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

      const mandate = await store.issueMandate(context, {
        id: nextId('collateralization-mandate'),
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

      // Link the committed governance aggregate to the artifact it produced,
      // using the Governance Store's own reference surface rather than a
      // collateralization-specific side table. `external_artifact` is the
      // reference type the TokenizationMandate already uses for exactly this
      // relationship; see `docs/enterprise/AOC_COLLATERALIZE_ACTION.md`,
      // "Governance reference type", for why a dedicated
      // `authorization_artifact` type is recommended but deliberately not
      // introduced in this change.
      await governanceStore.appendReference(accessContext, {
        referenceId: nextId('collateralization-reference'),
        evaluationId: appended.evaluationId,
        referenceType: 'external_artifact',
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
      return store.revokeMandate(context, {
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
