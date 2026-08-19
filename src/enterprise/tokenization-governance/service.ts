import {
  ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  serializeEnterpriseTokenizationRequest,
  validateEnterpriseTokenizationRequest,
  type EnterpriseTokenizationRequest,
  type EnterpriseTokenizationScope,
  type EnterpriseTokenizationTerms,
  type EnterpriseTokenizedRightType,
} from '@aoc-enterprise/tokenization-mandate';

import type { KernelEvaluationOptions, KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import type { GovernanceEnterpriseContext, GovernanceStoreAccessContext } from '../governance-store/contracts.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { isGovernanceStoreError } from '../governance-store/errors.js';
import { TokenizationGovernanceError } from './errors.js';
import { requireStrictUtcTokenizationTimestamp, requireTokenizationAccessToOrganization, type TokenizationMandateStore } from './mandate-store.js';
import type {
  TokenizationEvidenceLineage,
  TokenizationExecutionRecord,
  TokenizationGovernanceContext,
  TokenizationMandateRecord,
  TokenizationRequestOutcome,
  TokenizationRevokeOutcome,
} from './contracts.js';

/**
 * The Kernel surface this module needs, named structurally so the module
 * depends on the canonical evaluation contract rather than on a concrete
 * class. `AocKernel` satisfies it as-is; nothing else in this repository
 * does, and no fake decision engine is provided or implied.
 */
export interface TokenizationKernelPort {
  evaluate(request: KernelEvaluationRequest, options?: KernelEvaluationOptions): Promise<KernelEvaluationResult>;
}

export interface TokenizationGovernanceServiceDependencies {
  readonly store: TokenizationMandateStore;
  /** The real `AocKernel`. Every authority, policy, approval and obligation determination for `TOKENIZE` comes from here — this module has no policy engine of its own. */
  readonly kernel: TokenizationKernelPort;
  /** The canonical Governance Store. Every `TOKENIZE` evaluation is committed here as one integrity-chained aggregate before any mandate exists. */
  readonly governanceStore: GovernanceStore;
  /** Live Enterprise context captured into every appended aggregate, supplied by the composition root — the same value `evaluateGovernanceRequest` passes. */
  readonly enterpriseContext: () => GovernanceEnterpriseContext;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
}

/** What a caller submits. The canonical `EnterpriseTokenizationRequest` is built (and validated) from this by the service; callers never hand in a pre-built mandate. */
export interface SubmitTokenizationRequestInput {
  readonly requestId?: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  readonly requestedBy: string;
  /** The requester's trust domain, forwarded verbatim to the Kernel so Recognition Runtime and Authority Graph evaluate it in their own terms. */
  readonly trustDomainId: string;
  /** Present when the requester is acting on behalf of another actor (e.g. an agent acting for a human). Mirrors `ActorReference.principalId`. */
  readonly principalActorId?: string;
  readonly actorType?: string;
  readonly terms: EnterpriseTokenizationTerms;
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
  /** The expiry the issued mandate will carry. Required: this module never invents an expiry, and `EnterpriseTokenizationMandate` cannot represent an authorization without one. */
  readonly mandateExpiresAt: string;
  readonly issuerRef?: string;
  readonly obligationRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
  /**
   * Whose governed authority this tokenization draws on, when it is not the
   * requester's own.
   *
   * `EnterpriseTokenizationTerms` names no holder — the asset's authority
   * holder is established upstream and never appears in the terms — so absent
   * means the requester must itself hold the rights being represented. A
   * deployment whose administrator submits on a holder's behalf names that
   * holder here, and the Authority Graph still has to authorize the
   * administrator separately: neither check substitutes for the other.
   */
  readonly authorityHolderRef?: string;
}

export interface RecordTokenizationExecutionRequest {
  readonly executionId?: string;
  readonly mandateId: string;
  readonly executorRef: string;
  readonly executedAt: string;
  readonly issuedScope: EnterpriseTokenizationScope;
  readonly rights: readonly EnterpriseTokenizedRightType[];
  readonly correlationId?: string;
  readonly issuedUnits?: number;
  readonly externalSystem?: string;
  readonly externalNetwork?: string;
  readonly externalTokenStandard?: string;
  readonly externalContractReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeTokenizationMandateRequest {
  readonly mandateId: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly revokedAt?: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly correlationId?: string;
}

export interface TokenizationGovernanceService {
  /**
   * Routes one `TOKENIZE` request through the canonical governance
   * lifecycle: validate -> `AocKernel.evaluate()` (authority, policy,
   * approvals, obligations, evidence) -> one atomic Governance Store
   * aggregate append -> issue a mandate if, and only if, the decision
   * allowed it.
   */
  requestTokenization(
    context: TokenizationGovernanceContext,
    organizationId: string,
    input: SubmitTokenizationRequestInput,
  ): Promise<TokenizationRequestOutcome>;

  getMandate(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationMandateRecord>;

  /** Records that an external system performed an issuance under a mandate. Authorization is re-checked against the mandate; nothing is minted here. */
  recordExecution(
    context: TokenizationGovernanceContext,
    input: RecordTokenizationExecutionRequest,
  ): Promise<{ readonly mandate: TokenizationMandateRecord; readonly execution: TokenizationExecutionRecord }>;

  listExecutions(context: TokenizationGovernanceContext, mandateId: string): Promise<readonly TokenizationExecutionRecord[]>;

  /** Withdraws authority for further issuance. Already-recorded execution evidence is preserved immutably. */
  revokeMandate(context: TokenizationGovernanceContext, input: RevokeTokenizationMandateRequest): Promise<TokenizationRevokeOutcome>;

  /** Assembles the complete governance chain behind a mandate from references already stored — never a second audit log. */
  getEvidenceLineage(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationEvidenceLineage>;
}

/** Default resource scope for a `TOKENIZE` request: the same `kind:id` form Enterprise already uses for a resource identifier (see `legacyResourceIdentifier` in `@aoc-enterprise/scoped-access`). */
function defaultResourceScope(asset: { readonly kind: string; readonly id: string }): string {
  return `${asset.kind}:${asset.id}`;
}

/**
 * A tenant may only tokenize its own assets. When an asset carries a
 * `tenantId`, it must be the acting organization's; a caller can never reach
 * across the tenancy boundary by naming another tenant's asset. This is
 * checked before the Kernel is ever consulted, so a cross-tenant attempt
 * never even produces a governance evaluation to point at.
 */
function assertAssetBelongsToOrganization(asset: { readonly tenantId?: string }, organizationId: string): void {
  if (asset.tenantId !== undefined && asset.tenantId !== organizationId) {
    throw new TokenizationGovernanceError(
      'TOKENIZATION_ASSET_TENANT_MISMATCH',
      `This asset is governed by tenant '${asset.tenantId}'; organization '${organizationId}' cannot request tokenization authority over it.`,
      { assetTenantId: asset.tenantId, organizationId },
    );
  }
}

export function createTokenizationGovernanceService(deps: TokenizationGovernanceServiceDependencies): TokenizationGovernanceService {
  const { store, kernel, governanceStore, enterpriseContext, now, nextId } = deps;

  function buildCanonicalRequest(input: SubmitTokenizationRequestInput, requestId: string, correlationId: string): EnterpriseTokenizationRequest {
    const candidate = {
      schemaVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
      id: requestId,
      capability: ENTERPRISE_TOKENIZE_CAPABILITY,
      asset: input.asset,
      requestedBy: input.requestedBy,
      terms: input.terms,
      requestedAt: input.requestedAt ?? now(),
      correlationId,
      ...(input.requestedExpiresAt !== undefined ? { requestedExpiresAt: input.requestedExpiresAt } : {}),
      ...(input.justification !== undefined ? { justification: input.justification } : {}),
      ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
    };

    const validation = validateEnterpriseTokenizationRequest(candidate);
    if (!validation.valid) {
      throw new TokenizationGovernanceError(
        'TOKENIZATION_VALIDATION_ERROR',
        `Tokenization request failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
        { issues: validation.errors },
      );
    }
    return candidate;
  }

  /**
   * Adapts a canonical tokenization request onto the generalized
   * `KernelEvaluationRequest` every other capability already uses. The
   * capability travels as `action.capability` (matched by Authority Graph and
   * Recognition Runtime against their own grants/tokens), and the full,
   * serialized authorization terms travel as `action.parameters` so the
   * policy layer can see exactly what is being asked for. No tokenization-
   * specific decision path is introduced anywhere.
   */
  function toKernelRequest(
    request: EnterpriseTokenizationRequest,
    input: SubmitTokenizationRequestInput,
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
        type: ENTERPRISE_TOKENIZE_CAPABILITY,
        capability: ENTERPRISE_TOKENIZE_CAPABILITY,
        resourceScope: input.resourceScope ?? defaultResourceScope(request.asset),
        sideEffectType: 'external_api_call',
        riskLevel: 'critical',
        parameters: { ...serializeEnterpriseTokenizationRequest(request) },
        // The governed rights this request engages, declared as typed
        // vocabulary rather than left inside `parameters` where no authority
        // check could reach them. `TOKENIZE`'s scope is required and is an
        // issuance ceiling, so it is forwarded verbatim: an actor may only
        // represent externally as much of a right as it is recognized as
        // controlling.
        governedRights: request.terms.rights,
        governedRightsScope: request.terms.scope,
        ...(input.authorityHolderRef !== undefined ? { governedAuthorityHolderRef: input.authorityHolderRef } : {}),
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
    async requestTokenization(context, organizationId, input) {
      requireTokenizationAccessToOrganization(context, organizationId);
      assertAssetBelongsToOrganization(input.asset, organizationId);

      const receivedAt = now();
      const requestId = input.requestId ?? nextId('tokenization-request');
      const correlationId = input.correlationId ?? nextId('tokenization-correlation');
      const request = buildCanonicalRequest(input, requestId, correlationId);
      const mandateExpiresAt = requireStrictUtcTokenizationTimestamp(input.mandateExpiresAt, 'mandateExpiresAt');

      const kernelRequest = toKernelRequest(request, input, organizationId);

      let result: KernelEvaluationResult;
      try {
        result = await kernel.evaluate(kernelRequest);
      } catch (error) {
        throw new TokenizationGovernanceError('TOKENIZATION_EVALUATION_FAILED', 'The Kernel could not complete evaluation of this TOKENIZE request.', {
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
        // A conflict is a distinct, caller-actionable fact -- the same
        // request identity was already governed under a different payload --
        // not an infrastructure failure. Surfacing them alike would tell a
        // caller to retry something that must not be retried unchanged.
        if (isGovernanceStoreError(error) && error.code === 'GOVERNANCE_IDEMPOTENCY_CONFLICT') {
          throw new TokenizationGovernanceError(
            'TOKENIZATION_REQUEST_CONFLICT',
            `Tokenization request '${request.id}' was already governed under a different payload; a request id must identify exactly one TOKENIZE request.`,
            { requestId: request.id },
          );
        }
        throw new TokenizationGovernanceError('TOKENIZATION_PERSISTENCE_FAILED', 'The TOKENIZE evaluation could not be durably recorded; no mandate was issued.', {
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
        id: nextId('tokenization-mandate'),
        organizationId,
        assetKind: request.asset.kind,
        assetId: request.asset.id,
        // The mandate's terms are the request's terms, copied verbatim. There
        // is no caller-supplied override, so `20%` cannot become `100%`
        // between request and mandate; the store re-asserts containment
        // anyway (`assertNoScopeEscalation`).
        terms: request.terms,
        requestedTerms: request.terms,
        requestRef: request.id,
        requestedBy: request.requestedBy,
        decisionRef: result.decisionId,
        evaluationRef: appended.evaluationId,
        effectiveFrom: requireStrictUtcTokenizationTimestamp(result.evaluatedAt, 'result.evaluatedAt'),
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
      // tokenization-specific side table.
      //
      // `authorization_artifact`, not `external_artifact`: the
      // TokenizationMandate is produced and owned by Soberanía Enterprise as the
      // durable record of an authorization this enforcement just granted.
      // External token issuance is a different thing entirely and is recorded
      // separately as `execution_record` in `recordExecution` below.
      //
      // This classifies; it does not authorize. Reaching this line already
      // required a persisted allowed Kernel decision and an issued, persisted
      // mandate — see `docs/enterprise/AOC_TOKENIZE_ACTION.md`.
      await governanceStore.appendReference(accessContext, {
        referenceId: nextId('tokenization-reference'),
        evaluationId: appended.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: mandate.id,
        externalVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
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
        id: input.executionId ?? nextId('tokenization-execution'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executorRef: input.executorRef,
        executedAt: input.executedAt,
        issuedScope: input.issuedScope,
        rights: input.rights,
        correlationId: input.correlationId ?? nextId('tokenization-execution-correlation'),
        ...(input.issuedUnits !== undefined ? { issuedUnits: input.issuedUnits } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalNetwork !== undefined ? { externalNetwork: input.externalNetwork } : {}),
        ...(input.externalTokenStandard !== undefined ? { externalTokenStandard: input.externalTokenStandard } : {}),
        ...(input.externalContractReference !== undefined ? { externalContractReference: input.externalContractReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
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
            referenceId: nextId('tokenization-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: recorded.execution.id,
            externalVersion: ENTERPRISE_TOKENIZATION_SCHEMA_VERSION,
            createdAt: now(),
          },
        );
      }

      return recorded;
    },

    async listExecutions(context, mandateId) {
      return store.listExecutions(context, mandateId);
    },

    async revokeMandate(context, input) {
      const mandate = await store.getMandate(context, input.mandateId);
      return store.revokeMandate(context, {
        revocationId: nextId('tokenization-revocation'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt: input.revokedAt ?? now(),
        reason: input.reason,
        issuerRef: input.requestedBy,
        correlationId: input.correlationId ?? nextId('tokenization-revocation-correlation'),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });
    },

    async getEvidenceLineage(context, mandateId) {
      const mandate = await store.getMandate(context, mandateId);
      const executions = await store.listExecutions(context, mandateId);
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
        decisionRef: mandate.decisionRef,
        approvalRefs: mandate.approvalRefs ?? [],
        obligationRefs: mandate.obligationRefs ?? [],
        evidenceRefs: mandate.evidenceRefs ?? [],
        auditRefs: mandate.auditRefs ?? [],
        executionRefs: executions.map((execution) => execution.id),
        ...(mandate.evaluationRef !== undefined ? { evaluationRef: mandate.evaluationRef } : {}),
        ...(revocation !== null ? { revocationRef: revocation.id } : {}),
      };
    },
  };
}
