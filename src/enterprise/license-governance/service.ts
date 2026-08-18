import {
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_LICENSE_SCHEMA_VERSION,
  serializeEnterpriseLicenseRequest,
  validateEnterpriseLicenseRequest,
  type EnterpriseLicensableRightType,
  type EnterpriseLicenseExclusivity,
  type EnterpriseLicenseLifecycleType,
  type EnterpriseLicenseRequest,
  type EnterpriseLicenseRightsScope,
  type EnterpriseLicenseTerms,
  type EnterpriseLicensedUnits,
  type EnterpriseLicensedUseType,
} from '@aoc-enterprise/license-mandate';

import type { KernelEvaluationOptions, KernelEvaluationRequest, KernelEvaluationResult } from '../../kernel/index.js';
import type { GovernanceEnterpriseContext, GovernanceStoreAccessContext } from '../governance-store/contracts.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { isGovernanceStoreError } from '../governance-store/errors.js';
import { LicenseGovernanceError } from './errors.js';
import { requireLicenseAccessToOrganization, requireStrictUtcLicenseTimestamp, type LicenseMandateStore } from './mandate-store.js';
import type {
  LicenseEvidenceLineage,
  LicenseExecutionRecord,
  LicenseGovernanceContext,
  LicenseLifecycleRecord,
  LicenseMandateRecord,
  LicenseRequestOutcome,
  LicenseRevokeOutcome,
} from './contracts.js';

/**
 * The Kernel surface this module needs, named structurally so the module
 * depends on the canonical evaluation contract rather than on a concrete
 * class. `AocKernel` satisfies it as-is; nothing else in this repository
 * does, and no fake decision engine is provided or implied.
 */
export interface LicenseKernelPort {
  evaluate(request: KernelEvaluationRequest, options?: KernelEvaluationOptions): Promise<KernelEvaluationResult>;
}

export interface LicenseGovernanceServiceDependencies {
  readonly store: LicenseMandateStore;
  /** The real `AocKernel`. Every authority, policy, approval and obligation determination for `LICENSE` comes from here — this module has no policy engine of its own. */
  readonly kernel: LicenseKernelPort;
  /** The canonical Governance Store. Every `LICENSE` evaluation is committed here as one integrity-chained aggregate before any mandate exists. */
  readonly governanceStore: GovernanceStore;
  /** Live Enterprise context captured into every appended aggregate, supplied by the composition root — the same value `evaluateGovernanceRequest` passes. */
  readonly enterpriseContext: () => GovernanceEnterpriseContext;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
}

/** What a caller submits. The canonical `EnterpriseLicenseRequest` is built (and validated) from this by the service; callers never hand in a pre-built mandate. */
export interface SubmitLicenseRequestInput {
  readonly requestId?: string;
  readonly asset: { readonly kind: string; readonly id: string; readonly tenantId?: string };
  readonly requestedBy: string;
  /** The requester's trust domain, forwarded verbatim to the Kernel so Recognition Runtime and Authority Graph evaluate it in their own terms. */
  readonly trustDomainId: string;
  /** Present when the requester is acting on behalf of another actor (e.g. an agent acting for a human). Mirrors `ActorReference.principalId`. */
  readonly principalActorId?: string;
  readonly actorType?: string;
  readonly terms: EnterpriseLicenseTerms;
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
  /** The expiry the issued mandate will carry — AOC's authority window, never the external license's own term. Required: this module never invents an expiry, and `EnterpriseLicenseMandate` cannot represent an authorization without one. */
  readonly mandateExpiresAt: string;
  readonly issuerRef?: string;
  readonly obligationRefs?: readonly string[];
  readonly auditRefs?: readonly string[];
  /**
   * Whose governed authority this licence draws on, when it is not the
   * requester's own.
   *
   * `EnterpriseLicenseTerms` names a licensee — the party *receiving* the
   * permission — and deliberately never names the licensor's underlying
   * authority holder, which is established upstream. Absent therefore means
   * the requester must itself hold the rights the permission draws on. Naming
   * the licensee here would be exactly backwards: a licensee receives a
   * permission, it does not supply the authority.
   */
  readonly authorityHolderRef?: string;
}

export interface RecordLicenseExecutionRequest {
  readonly executionId?: string;
  readonly mandateId: string;
  readonly executedBy: string;
  readonly executedAt: string;
  readonly licenseeRef: string;
  readonly rights: readonly EnterpriseLicensableRightType[];
  readonly grantedUses: readonly EnterpriseLicensedUseType[];
  readonly exclusivity: EnterpriseLicenseExclusivity;
  readonly correlationId?: string;
  readonly rightsScope?: EnterpriseLicenseRightsScope;
  readonly contexts?: Readonly<Record<string, readonly string[]>>;
  readonly licenseEffectiveAt?: string;
  readonly licenseExpiresAt?: string;
  readonly licensedUnits?: EnterpriseLicensedUnits;
  readonly externalSystem?: string;
  readonly externalAgreementReference?: string;
  readonly externalAcceptanceReference?: string;
  readonly externalTransactionReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RecordLicenseLifecycleRequest {
  readonly lifecycleId?: string;
  readonly mandateId: string;
  readonly executionId: string;
  readonly reportedBy: string;
  readonly occurredAt: string;
  readonly lifecycleType: EnterpriseLicenseLifecycleType;
  readonly correlationId?: string;
  readonly externalSystem?: string;
  readonly externalReference?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface RevokeLicenseMandateRequest {
  readonly mandateId: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly revokedAt?: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly correlationId?: string;
}

export interface LicenseGovernanceService {
  /**
   * Routes one `LICENSE` request through the canonical governance lifecycle:
   * validate -> `AocKernel.evaluate()` (authority, policy, approvals,
   * obligations, evidence) -> one atomic Governance Store aggregate append ->
   * issue a mandate if, and only if, the decision allowed it.
   */
  requestLicense(context: LicenseGovernanceContext, organizationId: string, input: SubmitLicenseRequestInput): Promise<LicenseRequestOutcome>;

  getMandate(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseMandateRecord>;

  /** Records that an external system granted a license under a mandate. Authorization is re-checked against the mandate; no agreement is drafted or concluded here. */
  recordExecution(
    context: LicenseGovernanceContext,
    input: RecordLicenseExecutionRequest,
  ): Promise<{ readonly mandate: LicenseMandateRecord; readonly execution: LicenseExecutionRecord }>;

  listExecutions(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseExecutionRecord[]>;

  /**
   * Records that an external system reported a previously-granted license as
   * expired, terminated, cancelled, surrendered or superseded. Observation
   * only: no authority is evaluated, no decision is produced, the mandate's
   * status and execution count are unchanged, and AOC asserts nothing about
   * whether the license genuinely ended.
   */
  recordLifecycleEvent(context: LicenseGovernanceContext, input: RecordLicenseLifecycleRequest): Promise<LicenseLifecycleRecord>;

  listLifecycleEvents(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseLifecycleRecord[]>;

  /** Withdraws authority for further licensing. Already-recorded execution and lifecycle evidence is preserved immutably, and no external license is terminated. */
  revokeMandate(context: LicenseGovernanceContext, input: RevokeLicenseMandateRequest): Promise<LicenseRevokeOutcome>;

  /** Assembles the complete governance chain behind a mandate from references already stored — never a second audit log. */
  getEvidenceLineage(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseEvidenceLineage>;
}

/** Default resource scope for a `LICENSE` request: the same `kind:id` form Enterprise already uses for a resource identifier (see `legacyResourceIdentifier` in `@aoc-enterprise/scoped-access`). */
function defaultResourceScope(asset: { readonly kind: string; readonly id: string }): string {
  return `${asset.kind}:${asset.id}`;
}

/**
 * A tenant may only license its own assets. When an asset carries a
 * `tenantId`, it must be the acting organization's; a caller can never reach
 * across the tenancy boundary by naming another tenant's asset. This is
 * checked before the Kernel is ever consulted, so a cross-tenant attempt never
 * even produces a governance evaluation to point at.
 */
function assertAssetBelongsToOrganization(asset: { readonly tenantId?: string }, organizationId: string): void {
  if (asset.tenantId !== undefined && asset.tenantId !== organizationId) {
    throw new LicenseGovernanceError(
      'LICENSE_ASSET_TENANT_MISMATCH',
      `This asset is governed by tenant '${asset.tenantId}'; organization '${organizationId}' cannot request licensing authority over it.`,
      { assetTenantId: asset.tenantId, organizationId },
    );
  }
}

export function createLicenseGovernanceService(deps: LicenseGovernanceServiceDependencies): LicenseGovernanceService {
  const { store, kernel, governanceStore, enterpriseContext, now, nextId } = deps;

  function buildCanonicalRequest(input: SubmitLicenseRequestInput, requestId: string, correlationId: string): EnterpriseLicenseRequest {
    const candidate = {
      schemaVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
      id: requestId,
      capability: ENTERPRISE_LICENSE_CAPABILITY,
      asset: input.asset,
      requestedBy: input.requestedBy,
      terms: input.terms,
      requestedAt: input.requestedAt ?? now(),
      correlationId,
      ...(input.requestedExpiresAt !== undefined ? { requestedExpiresAt: input.requestedExpiresAt } : {}),
      ...(input.justification !== undefined ? { justification: input.justification } : {}),
      ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
    };

    const validation = validateEnterpriseLicenseRequest(candidate);
    if (!validation.valid) {
      throw new LicenseGovernanceError(
        'LICENSE_VALIDATION_ERROR',
        `License request failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
        { issues: validation.errors },
      );
    }
    return candidate;
  }

  /**
   * Adapts a canonical license request onto the generalized
   * `KernelEvaluationRequest` every other governed action already uses. The
   * action identifier travels as `action.capability` (matched by Authority
   * Graph and Recognition Runtime against their own grants/tokens), and the
   * full, serialized authorization terms travel as `action.parameters` so the
   * policy layer can see exactly what is being asked for -- including which
   * uses, which operating context, and how exclusively. No license-specific
   * decision path is introduced anywhere.
   *
   * `counterpartyId` is populated from `licenseeRef` because that is precisely
   * what the existing Domain Policy Pack preflight means by a counterparty,
   * and a deployment's policy may legitimately turn on who the licensee is.
   * `amount`/`currency` are deliberately not populated at all: a license has
   * no transaction value in this contract, AOC computes no royalty or fee, and
   * inventing one for a transaction-amount policy input would misrepresent the
   * action.
   *
   * Because the policy layer receives the serialized terms, a deployment that
   * needs "an existing exclusive license blocks a conflicting request" can
   * express it as policy over prior mandates and evidence. This module
   * hard-codes no such rule -- exclusivity is recorded and compared, never
   * enforced as universal law.
   */
  function toKernelRequest(request: EnterpriseLicenseRequest, input: SubmitLicenseRequestInput, organizationId: string): KernelEvaluationRequest {
    return {
      requestId: request.id,
      actor: {
        id: request.requestedBy,
        trustDomainId: input.trustDomainId,
        ...(input.principalActorId !== undefined ? { principalId: input.principalActorId } : {}),
        ...(input.actorType !== undefined ? { type: input.actorType } : {}),
      },
      action: {
        type: ENTERPRISE_LICENSE_CAPABILITY,
        capability: ENTERPRISE_LICENSE_CAPABILITY,
        resourceScope: input.resourceScope ?? defaultResourceScope(request.asset),
        sideEffectType: 'external_api_call',
        riskLevel: 'critical',
        parameters: { ...serializeEnterpriseLicenseRequest(request) },
        // The governed rights this permission draws on, declared as typed
        // vocabulary.
        //
        // `rightsScope` is forwarded *only when the terms carry one*, and its
        // absence is preserved rather than defaulted. This is the one place
        // across the four actions where that matters most: `LICENSE` treats an
        // absent rights scope as "not fractionally expressed" — emphatically
        // not 100% — and substituting a full scope here would silently require
        // whole-right authority for every unquantified permission, while
        // substituting a zero one would require none. Neither is what the
        // licence contract means. The resolver's own rule for an absent scope
        // is "the holder must hold some live authority over this right, and
        // this asserts nothing about how much".
        //
        // Note also what is *not* forwarded: the permission scope. A licence's
        // `permittedUses`, exclusivity and term describe what the licensee may
        // do, and are a different quantity from how much of the right the
        // licensor holds. Conflating them would make a narrow permission
        // demand broad authority, or the reverse.
        governedRights: request.terms.rights,
        ...(request.terms.rightsScope !== undefined ? { governedRightsScope: request.terms.rightsScope } : {}),
        ...(input.authorityHolderRef !== undefined ? { governedAuthorityHolderRef: input.authorityHolderRef } : {}),
        counterpartyId: request.terms.licenseeRef,
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
    async requestLicense(context, organizationId, input) {
      requireLicenseAccessToOrganization(context, organizationId);
      assertAssetBelongsToOrganization(input.asset, organizationId);

      const receivedAt = now();
      const requestId = input.requestId ?? nextId('license-request');
      const correlationId = input.correlationId ?? nextId('license-correlation');
      const request = buildCanonicalRequest(input, requestId, correlationId);
      const mandateExpiresAt = requireStrictUtcLicenseTimestamp(input.mandateExpiresAt, 'mandateExpiresAt');

      const kernelRequest = toKernelRequest(request, input, organizationId);

      let result: KernelEvaluationResult;
      try {
        result = await kernel.evaluate(kernelRequest);
      } catch (error) {
        throw new LicenseGovernanceError('LICENSE_EVALUATION_FAILED', 'The Kernel could not complete evaluation of this LICENSE request.', {
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
          throw new LicenseGovernanceError(
            'LICENSE_REQUEST_CONFLICT',
            `License request '${request.id}' was already governed under a different payload; a request id must identify exactly one LICENSE request.`,
            { requestId: request.id },
          );
        }
        throw new LicenseGovernanceError('LICENSE_PERSISTENCE_FAILED', 'The LICENSE evaluation could not be durably recorded; no mandate was issued.', {
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
      // must never accumulate a second mandate.
      if (appended.idempotentReplay) {
        const existing = await store.getMandateByRequestRef(context, request.id);
        return existing === null ? outcomeBase : { ...outcomeBase, mandate: existing };
      }

      const approvalRefs = [result.approval.proofId, result.approval.decisionId, result.approval.requestId].filter(
        (value): value is string => value !== undefined,
      );

      const mandate = await store.issueMandate(context, {
        id: nextId('license-mandate'),
        organizationId,
        assetKind: request.asset.kind,
        assetId: request.asset.id,
        // The mandate's terms are the request's terms, copied verbatim. There
        // is no caller-supplied override, so `display` cannot become
        // `distribute` and Company B cannot become Company C between request
        // and mandate; the store re-asserts containment anyway
        // (`assertNoLicensePermissionEscalation`).
        terms: request.terms,
        requestedTerms: request.terms,
        requestRef: request.id,
        requestedBy: request.requestedBy,
        decisionRef: result.decisionId,
        evaluationRef: appended.evaluationId,
        effectiveFrom: requireStrictUtcLicenseTimestamp(result.evaluatedAt, 'result.evaluatedAt'),
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
      // license-specific side table.
      //
      // `authorization_artifact` is the reference type the TokenizationMandate
      // and CollateralizationMandate also use for exactly this relationship: a
      // mandate is produced and owned by AOC Enterprise, recording an
      // authorization this enforcement granted. The external license and its
      // reported end are separate observations, recorded as `execution_record`
      // below.
      //
      // The Store computes this reference's sequence, integrity version, chain
      // link and digest inside its own append transaction; nothing here can
      // choose a chain position or present a digest the Store did not compute.
      //
      // This classifies; it does not authorize. Reaching this line already
      // required a persisted allowed Kernel decision and an issued, persisted
      // mandate — see `docs/enterprise/AOC_LICENSE_ACTION.md`.
      await governanceStore.appendReference(accessContext, {
        referenceId: nextId('license-reference'),
        evaluationId: appended.evaluationId,
        referenceType: 'authorization_artifact',
        externalId: mandate.id,
        externalVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
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
        id: input.executionId ?? nextId('license-execution'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executedBy: input.executedBy,
        executedAt: input.executedAt,
        licenseeRef: input.licenseeRef,
        rights: input.rights,
        grantedUses: input.grantedUses,
        exclusivity: input.exclusivity,
        correlationId: input.correlationId ?? nextId('license-execution-correlation'),
        ...(input.rightsScope !== undefined ? { rightsScope: input.rightsScope } : {}),
        ...(input.contexts !== undefined ? { contexts: input.contexts } : {}),
        ...(input.licenseEffectiveAt !== undefined ? { licenseEffectiveAt: input.licenseEffectiveAt } : {}),
        ...(input.licenseExpiresAt !== undefined ? { licenseExpiresAt: input.licenseExpiresAt } : {}),
        ...(input.licensedUnits !== undefined ? { licensedUnits: input.licensedUnits } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      if (mandate.evaluationRef !== undefined) {
        // External execution evidence is correlated back to the governance
        // aggregate that authorized it, so a reviewer can answer "was the
        // license consistent with the authorization?" from the canonical
        // record alone.
        await governanceStore.appendReference(
          { system: context.system, organizationId: mandate.organizationId, ...(context.actorId !== undefined ? { actorId: context.actorId } : {}) },
          {
            referenceId: nextId('license-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: recorded.execution.id,
            externalVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
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
        id: input.lifecycleId ?? nextId('license-lifecycle'),
        mandateId: mandate.id,
        executionId: input.executionId,
        organizationId: mandate.organizationId,
        reportedBy: input.reportedBy,
        occurredAt: input.occurredAt,
        lifecycleType: input.lifecycleType,
        correlationId: input.correlationId ?? nextId('license-lifecycle-correlation'),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      });

      if (mandate.evaluationRef !== undefined) {
        // A reported end is recorded as one more `execution_record` reference
        // against the same aggregate: it is an observation about the external
        // license's life, correlated to the authorization that permitted it,
        // and never a governance decision of its own.
        await governanceStore.appendReference(
          { system: context.system, organizationId: mandate.organizationId, ...(context.actorId !== undefined ? { actorId: context.actorId } : {}) },
          {
            referenceId: nextId('license-reference'),
            evaluationId: mandate.evaluationRef,
            referenceType: 'execution_record',
            externalId: event.id,
            externalVersion: ENTERPRISE_LICENSE_SCHEMA_VERSION,
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
        revocationId: nextId('license-revocation'),
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt: input.revokedAt ?? now(),
        reason: input.reason,
        issuerRef: input.requestedBy,
        correlationId: input.correlationId ?? nextId('license-revocation-correlation'),
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
        // Lifted out of `terms` deliberately: "who received it, what were they
        // allowed to do, what were they forbidden, how exclusively, where, for
        // how long, and who could execute it" are the questions a licensing
        // reviewer asks first, and a lineage should answer them without making
        // the caller reach into the terms object.
        licenseeRef: terms.licenseeRef,
        permittedUses: terms.permittedUses,
        prohibitedUses: terms.constraints.prohibitedUses ?? [],
        exclusivity: terms.exclusivity,
        decisionRef: mandate.decisionRef,
        approvalRefs: mandate.approvalRefs ?? [],
        obligationRefs: mandate.obligationRefs ?? [],
        evidenceRefs: mandate.evidenceRefs ?? [],
        auditRefs: mandate.auditRefs ?? [],
        executionRefs: executions.map((execution) => execution.id),
        lifecycleRefs: lifecycleEvents.map((event) => event.id),
        executionCount: mandate.executionCount,
        ...(terms.executorRef !== undefined ? { executorRef: terms.executorRef } : {}),
        ...(terms.rightsScope !== undefined ? { rightsScope: terms.rightsScope } : {}),
        ...(terms.constraints.permittedContexts !== undefined ? { permittedContexts: terms.constraints.permittedContexts } : {}),
        ...(terms.constraints.maximumLicenseTermEndsAt !== undefined ? { maximumLicenseTermEndsAt: terms.constraints.maximumLicenseTermEndsAt } : {}),
        ...(mandate.evaluationRef !== undefined ? { evaluationRef: mandate.evaluationRef } : {}),
        ...(revocation !== null ? { revocationRef: revocation.id } : {}),
      };
    },
  };
}
