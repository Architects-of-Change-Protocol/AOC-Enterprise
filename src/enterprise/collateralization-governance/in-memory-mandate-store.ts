import { validateEnterpriseCollateralizationMandate } from '@aoc-enterprise/collateralization-mandate';

import { CollateralizationGovernanceError } from './errors.js';
import {
  assertCollateralExerciseAuthorized,
  assertCollateralizationRevocable,
  assertNoCollateralScopeEscalation,
  nextCommittedCollateralScope,
  toCanonicalCollateralizationMandate,
} from './lifecycle.js';
import {
  canAccessCollateralizationOrganization,
  requireCollateralizationAccessToOrganization,
  requireCollateralizationTenantScope,
  requireStrictUtcCollateralizationTimestamp,
  type CollateralizationMandateStore,
} from './mandate-store.js';
import type {
  CollateralizationExecutionRecord,
  CollateralizationGovernanceContext,
  CollateralizationMandateRecord,
  CollateralizationMandateRevocationRecord,
  CollateralizationMandateStoreHealth,
  CollateralizationReleaseRecord,
  CollateralizationRevokeOutcome,
  IssueCollateralizationMandateInput,
  RecordCollateralizationExecutionInput,
  RecordCollateralizationReleaseInput,
  RevokeCollateralizationMandateInput,
} from './contracts.js';

export const COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION = 'aoc.collateralization-mandate-store.schema.v1';

export interface CreateInMemoryCollateralizationMandateStoreOptions {
  readonly now?: () => string;
}

/**
 * In-memory `CollateralizationMandateStore` — mirrors
 * `createInMemoryAccessGrantStore` (`../access-governance/in-memory-access-grant-store.ts`)
 * and `createInMemoryTokenizationMandateStore` in structure: synchronous
 * "commit sections" with no `await` between the read that decides an outcome
 * and the map mutation that records it, so no interleaving is possible even
 * under concurrent in-process callers.
 *
 * This is not a lesser implementation. It is the right provider for tests,
 * development and memory deployments, and it is held to *identical* domain
 * semantics as the SQLite store by the shared store-contract suite
 * (`src/enterprise/__tests__/collateralization-mandate-store-contract.test.ts`),
 * which runs every behavioural assertion against both.
 */
export function createInMemoryCollateralizationMandateStore(
  options: CreateInMemoryCollateralizationMandateStoreOptions = {},
): CollateralizationMandateStore {
  const now = options.now ?? (() => new Date().toISOString());

  const mandates = new Map<string, CollateralizationMandateRecord>();
  /** `requestRef -> mandateId`. One collateralization request authorizes at most one mandate, so a replayed request can never accumulate authorization. */
  const mandateIdByRequestRef = new Map<string, string>();
  const executions = new Map<string, CollateralizationExecutionRecord[]>();
  const executionIds = new Set<string>();
  const releases = new Map<string, CollateralizationReleaseRecord[]>();
  const releaseIds = new Set<string>();
  const revocations = new Map<string, CollateralizationMandateRevocationRecord>();
  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new CollateralizationGovernanceError('COLLATERALIZATION_STORE_UNAVAILABLE', 'The Collateralization Mandate Store has been closed.');
    }
  }

  function requireMandate(mandateId: string): CollateralizationMandateRecord {
    const mandate = mandates.get(mandateId);
    if (mandate === undefined) {
      throw new CollateralizationGovernanceError(
        'COLLATERALIZATION_MANDATE_NOT_FOUND',
        `No collateralization mandate for mandateId '${mandateId}'.`,
      );
    }
    return mandate;
  }

  /** Tenant-scoped read: a caller that may not see the record is told it is out of scope, never handed it. */
  function requireVisibleMandate(context: CollateralizationGovernanceContext, mandateId: string): CollateralizationMandateRecord {
    requireCollateralizationTenantScope(context);
    const mandate = requireMandate(mandateId);
    if (!canAccessCollateralizationOrganization(context, mandate.organizationId)) {
      throw new CollateralizationGovernanceError(
        'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access collateralization governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  return {
    providerKind: 'memory',

    async issueMandate(
      context: CollateralizationGovernanceContext,
      input: IssueCollateralizationMandateInput,
    ): Promise<CollateralizationMandateRecord> {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcCollateralizationTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcCollateralizationTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow what was requested; it may never widen it, and
      // it may never substitute a different obligation, party or executor.
      assertNoCollateralScopeEscalation(input.terms, input.requestedTerms);

      if (mandates.has(input.id)) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_MANDATE_ALREADY_EXISTS',
          `A collateralization mandate with id '${input.id}' already exists.`,
        );
      }
      const existingForRequest = mandateIdByRequestRef.get(input.requestRef);
      if (existingForRequest !== undefined) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_MANDATE_ALREADY_EXISTS',
          `Collateralization request '${input.requestRef}' has already been authorized by mandate '${existingForRequest}'; replaying it must not create additional collateralization authority.`,
          { requestRef: input.requestRef, mandateId: existingForRequest },
        );
      }

      const record: CollateralizationMandateRecord = {
        id: input.id,
        organizationId: input.organizationId,
        status: 'active',
        assetKind: input.assetKind,
        assetId: input.assetId,
        terms: input.terms,
        requestRef: input.requestRef,
        requestedBy: input.requestedBy,
        decisionRef: input.decisionRef,
        effectiveFrom,
        expiresAt,
        correlationId: input.correlationId,
        executionCount: 0,
        createdAt: now(),
        ...(input.assetTenantId !== undefined ? { assetTenantId: input.assetTenantId } : {}),
        ...(input.evaluationRef !== undefined ? { evaluationRef: input.evaluationRef } : {}),
        ...(input.issuerRef !== undefined ? { issuerRef: input.issuerRef } : {}),
        ...(input.approvalRefs !== undefined ? { approvalRefs: [...input.approvalRefs] } : {}),
        ...(input.obligationRefs !== undefined ? { obligationRefs: [...input.obligationRefs] } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
        ...(input.auditRefs !== undefined ? { auditRefs: [...input.auditRefs] } : {}),
      };

      // The durable row must project back onto a valid canonical mandate --
      // the frozen contract is the authority on what a mandate may be, and a
      // row that cannot round-trip through it is never committed.
      const validation = validateEnterpriseCollateralizationMandate(toCanonicalCollateralizationMandate(record));
      if (!validation.valid) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_VALIDATION_ERROR',
          `Collateralization mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
          { issues: validation.errors },
        );
      }

      mandates.set(record.id, record);
      mandateIdByRequestRef.set(record.requestRef, record.id);
      executions.set(record.id, []);
      releases.set(record.id, []);
      return record;
    },

    async getMandate(context: CollateralizationGovernanceContext, mandateId: string): Promise<CollateralizationMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(
      context: CollateralizationGovernanceContext,
      requestRef: string,
    ): Promise<CollateralizationMandateRecord | null> {
      assertOpen();
      const mandateId = mandateIdByRequestRef.get(requestRef);
      if (mandateId === undefined) return null;
      return requireVisibleMandate(context, mandateId);
    },

    async recordExecution(context: CollateralizationGovernanceContext, input: RecordCollateralizationExecutionInput) {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcCollateralizationTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION',
          `Collateralization mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never commit its scope a
      // second time.
      if (executionIds.has(input.id)) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EXECUTION_ALREADY_RECORDED',
          `Collateralization execution '${input.id}' has already been recorded; replaying it would commit its scope twice.`,
        );
      }

      assertCollateralExerciseAuthorized(mandate, {
        executorRef: input.executorRef,
        securedObligationRef: input.securedObligationRef,
        securedPartyRef: input.securedPartyRef,
        rights: input.rights,
        committedScope: input.committedScope,
        executedAt,
        ...(input.securedAmount !== undefined ? { securedAmount: input.securedAmount } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.priorityRank !== undefined ? { priorityRank: input.priorityRank } : {}),
      });

      const committedScope = nextCommittedCollateralScope(mandate.committedScope, input.committedScope);
      if (committedScope === null) {
        // Unreachable through the authorization check above, which refuses
        // incommensurable scopes. Kept as a fail-closed guard so a future
        // second write path cannot silently drop committed scope.
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED',
          `The proposed commitment is not commensurable with the scope already committed under collateralization mandate '${mandate.id}'.`,
          { refusalCode: 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE', mandateId: mandate.id },
        );
      }

      const execution: CollateralizationExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executorRef: input.executorRef,
        executedAt,
        securedObligationRef: input.securedObligationRef,
        securedPartyRef: input.securedPartyRef,
        committedScope: input.committedScope,
        rights: [...input.rights],
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.securedAmount !== undefined ? { securedAmount: input.securedAmount } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalFilingReference !== undefined ? { externalFilingReference: input.externalFilingReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.priorityRank !== undefined ? { priorityRank: input.priorityRank } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      const updated: CollateralizationMandateRecord = {
        ...mandate,
        committedScope,
        executionCount: mandate.executionCount + 1,
      };

      const log = executions.get(mandate.id);
      if (log === undefined) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_STORE_UNAVAILABLE',
          `The execution log for collateralization mandate '${mandate.id}' is missing; refusing to record evidence that could not be read back.`,
        );
      }
      executionIds.add(execution.id);
      log.push(execution);
      mandates.set(updated.id, updated);
      return { mandate: updated, execution };
    },

    async listExecutions(
      context: CollateralizationGovernanceContext,
      mandateId: string,
    ): Promise<readonly CollateralizationExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return [...(executions.get(mandateId) ?? [])];
    },

    async recordRelease(
      context: CollateralizationGovernanceContext,
      input: RecordCollateralizationReleaseInput,
    ): Promise<CollateralizationReleaseRecord> {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const releasedAt = requireStrictUtcCollateralizationTimestamp(input.releasedAt, 'releasedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION',
          `Collateralization mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // A release ends one specific recorded arrangement. Reporting one
      // against an execution this mandate never had would be an unanchored
      // claim about the external world.
      const log = executions.get(mandate.id) ?? [];
      if (!log.some((execution) => execution.id === input.executionId)) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_EXECUTION_NOT_FOUND',
          `No collateralization execution '${input.executionId}' recorded under mandate '${mandate.id}'; a release must reference an arrangement Soberanía has evidence of.`,
          { mandateId: mandate.id, executionId: input.executionId },
        );
      }

      if (releaseIds.has(input.id)) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_RELEASE_ALREADY_RECORDED',
          `Collateralization release '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
        );
      }

      const release: CollateralizationReleaseRecord = {
        id: input.id,
        mandateId: mandate.id,
        executionId: input.executionId,
        organizationId: mandate.organizationId,
        reportedBy: input.reportedBy,
        releasedAt,
        releaseType: input.releaseType,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalRegistry !== undefined ? { externalRegistry: input.externalRegistry } : {}),
        ...(input.externalReleaseReference !== undefined ? { externalReleaseReference: input.externalReleaseReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      const releaseLog = releases.get(mandate.id);
      if (releaseLog === undefined) {
        throw new CollateralizationGovernanceError(
          'COLLATERALIZATION_STORE_UNAVAILABLE',
          `The release log for collateralization mandate '${mandate.id}' is missing; refusing to record evidence that could not be read back.`,
        );
      }
      releaseIds.add(release.id);
      releaseLog.push(release);
      // Deliberately no change to `mandate.committedScope` or `mandate.status`:
      // a reported release is an observation about an external arrangement,
      // never a governance state transition and never fresh headroom.
      return release;
    },

    async listReleases(
      context: CollateralizationGovernanceContext,
      mandateId: string,
    ): Promise<readonly CollateralizationReleaseRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return [...(releases.get(mandateId) ?? [])];
    },

    async revokeMandate(
      context: CollateralizationGovernanceContext,
      input: RevokeCollateralizationMandateInput,
    ): Promise<CollateralizationRevokeOutcome> {
      assertOpen();
      requireCollateralizationAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcCollateralizationTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existing = revocations.get(mandate.id);
      if (existing !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: existing };
      }
      assertCollateralizationRevocable(mandate.status);

      const revocation: CollateralizationMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        // Immutable proof of how far the authorization had already been
        // exercised when authority was withdrawn. Revocation never deletes or
        // invalidates that evidence, and never claims that an external
        // security interest was released.
        executionsAtRevocation: mandate.executionCount,
        ...(mandate.committedScope !== undefined ? { committedScopeAtRevocation: mandate.committedScope } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };
      const revoked: CollateralizationMandateRecord = { ...mandate, status: 'revoked' };

      revocations.set(mandate.id, revocation);
      mandates.set(revoked.id, revoked);
      return { kind: 'revoked', mandate: revoked, revocation };
    },

    async getRevocation(
      context: CollateralizationGovernanceContext,
      mandateId: string,
    ): Promise<CollateralizationMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return revocations.get(mandateId) ?? null;
    },

    async health(): Promise<CollateralizationMandateStoreHealth> {
      return {
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: COLLATERALIZATION_MANDATE_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
