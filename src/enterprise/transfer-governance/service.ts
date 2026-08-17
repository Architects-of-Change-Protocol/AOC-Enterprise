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

import type { KernelEvaluationOptions, KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
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
   * governed-right vocabulary, or this contract connects the two. AOC does not
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
  /** The expiry the issued mandate will carry — AOC's authority window to move rights. Required: this module never invents an expiry, and `EnterpriseTransferMandate` cannot represent an authorization without one. */
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
   * execution count and transferred scope are unchanged, and AOC asserts
   * nothing about whether the reported outcome genuinely occurred.
   */
  recordLifecycleEvent(context: TransferGovernanceContext, input: RecordTransferLifecycleRequest): Promise<TransferLifecycleRecord>;

  listLifecycleEvents(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferLifecycleRecord[]>;

  /** Withdraws authority to move further rights. Already-recorded execution and lifecycle evidence is preserved immutably, and no movement is reversed. */
  revokeMandate(context: TransferGovernanceContext, input: RevokeTransferMandateRequest): Promise<TransferRevokeOutcome>;

  /** Assembles the complete governance chain behind a mandate from references already stored — never a second audit log. */
  getEvidenceLineage(context: TransferGovernanceContext, mandateId: string): Promise<TransferEvidenceLineage>;
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
  const { store, kernel, governanceStore, enterpriseContext, now, nextId } = deps;

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
   * easy to start modelling one. AOC does not: it holds no amount anywhere in
   * this action, computes nothing, and a policy that needs consideration
   * expresses it as a *requirement that evidence be produced*
   * (`considerationEvidenceRequired`), never as a number AOC would then be
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

      const mandate = await store.issueMandate(context, {
        id: nextId('transfer-mandate'),
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

      // Link the committed governance aggregate to the artifact it produced,
      // using the Governance Store's own reference surface rather than a
      // transfer-specific side table.
      //
      // `authorization_artifact` is the reference type the TokenizationMandate,
      // CollateralizationMandate and LicenseMandate also use for exactly this
      // relationship: a mandate is produced and owned by AOC Enterprise,
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
        // anything. A reference is evidence classification, never authority —
        // and for this action that distinction carries more weight than for
        // any sibling, because the recipient of a completed transfer is
        // precisely the party a reader might wrongly assume has just acquired
        // standing. It has not. See
        // `docs/architecture/ADR-TRANSFER-ACTION.md`.
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
      return store.revokeMandate(context, {
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
