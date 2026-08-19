import { EncumbranceReleaseGovernanceError } from './errors.js';
import {
  canAccessEncumbranceReleaseOrganization,
  requireEncumbranceReleaseAccessToOrganization,
  requireEncumbranceReleaseTenantScope,
  requireStrictUtcEncumbranceReleaseTimestamp,
  type EncumbranceReleaseMandateStore,
} from './mandate-store.js';
import type {
  EncumbranceReleaseExecutionRecord,
  EncumbranceReleaseGovernanceContext,
  EncumbranceReleaseMandateRecord,
  EncumbranceReleaseMandateRevocationRecord,
  EncumbranceReleaseMandateStoreHealth,
  EncumbranceReleaseRevokeOutcome,
  IssueEncumbranceReleaseMandateInput,
  RecordEncumbranceReleaseExecutionInput,
  RevokeEncumbranceReleaseMandateInput,
} from './contracts.js';

export const ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION = 'aoc.encumbrance-release-mandate-store.schema.v1';

export interface CreateInMemoryEncumbranceReleaseMandateStoreOptions {
  readonly now?: () => string;
}

/**
 * In-memory `EncumbranceReleaseMandateStore` — the same structure as
 * `createInMemoryCollateralizationMandateStore` and its neighbours:
 * synchronous "commit sections" with no `await` between the read that decides
 * an outcome and the map mutation that records it, so no interleaving is
 * possible even under concurrent in-process callers.
 *
 * This is not a lesser implementation. It is the right provider for tests,
 * development and memory deployments, and it is held to *identical* domain
 * semantics as the SQLite store by the shared store-contract suite
 * (`src/enterprise/__tests__/encumbrance-release-mandate-store-contract.test.ts`),
 * which runs every behavioural assertion against both.
 */
export function createInMemoryEncumbranceReleaseMandateStore(
  options: CreateInMemoryEncumbranceReleaseMandateStoreOptions = {},
): EncumbranceReleaseMandateStore {
  const now = options.now ?? (() => new Date().toISOString());

  const mandates = new Map<string, EncumbranceReleaseMandateRecord>();
  /** `requestRef -> mandateId`. One release request authorizes at most one mandate, so a replayed request can never accumulate authorization. */
  const mandateIdByRequestRef = new Map<string, string>();
  const executions = new Map<string, EncumbranceReleaseExecutionRecord[]>();
  const executionIds = new Set<string>();
  const revocations = new Map<string, EncumbranceReleaseMandateRevocationRecord>();
  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_STORE_UNAVAILABLE',
        'The Encumbrance Release Mandate Store has been closed.',
      );
    }
  }

  function requireMandate(mandateId: string): EncumbranceReleaseMandateRecord {
    const mandate = mandates.get(mandateId);
    if (mandate === undefined) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_MANDATE_NOT_FOUND',
        `No encumbrance release mandate for mandateId '${mandateId}'.`,
        { mandateId },
      );
    }
    return mandate;
  }

  /** Tenant-scoped read: a caller that may not see the record is told it is out of scope, never handed it. */
  function requireVisibleMandate(
    context: EncumbranceReleaseGovernanceContext,
    mandateId: string,
  ): EncumbranceReleaseMandateRecord {
    requireEncumbranceReleaseTenantScope(context);
    const mandate = requireMandate(mandateId);
    if (!canAccessEncumbranceReleaseOrganization(context, mandate.organizationId)) {
      throw new EncumbranceReleaseGovernanceError(
        'ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access encumbrance release governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  function findActiveMandateForEncumbrance(organizationId: string, encumbranceRef: string): EncumbranceReleaseMandateRecord | null {
    for (const mandate of mandates.values()) {
      if (mandate.organizationId !== organizationId) continue;
      if (mandate.encumbranceRef !== encumbranceRef) continue;
      if (mandate.status !== 'active') continue;
      return mandate;
    }
    return null;
  }

  return {
    providerKind: 'memory',

    async issueMandate(context, input): Promise<EncumbranceReleaseMandateRecord> {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcEncumbranceReleaseTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcEncumbranceReleaseTimestamp(input.expiresAt, 'expiresAt');
      if (Date.parse(expiresAt) <= Date.parse(effectiveFrom)) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_VALIDATION_ERROR',
          'An encumbrance release mandate must expire after it becomes effective; an authorization with no live window authorizes nothing.',
          { effectiveFrom, expiresAt },
        );
      }

      if (mandates.has(input.id)) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_EXISTS',
          `An encumbrance release mandate with id '${input.id}' already exists.`,
          { mandateId: input.id },
        );
      }
      const existingForRequest = mandateIdByRequestRef.get(input.requestRef);
      if (existingForRequest !== undefined) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_EXISTS',
          `Encumbrance release request '${input.requestRef}' has already been authorized by mandate '${existingForRequest}'; replaying it must not create additional release authority.`,
          { requestRef: input.requestRef, mandateId: existingForRequest },
        );
      }

      // At most one live authorization per constraint. Two governance chains
      // each believing they own one discharge is a fact a caller has to see,
      // not a race for whichever executes first to win.
      const live = findActiveMandateForEncumbrance(input.organizationId, input.encumbranceRef);
      if (live !== null) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_ACTIVE',
          `Governed authority encumbrance '${input.encumbranceRef}' already has a live release authorization ('${live.id}'); revoke it before issuing another.`,
          { encumbranceRef: input.encumbranceRef, mandateId: live.id },
        );
      }

      const record: EncumbranceReleaseMandateRecord = {
        id: input.id,
        organizationId: input.organizationId,
        status: 'active',
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        encumbranceRef: input.encumbranceRef,
        requestRef: input.requestRef,
        requestedBy: input.requestedBy,
        decisionRef: input.decisionRef,
        effectiveFrom,
        expiresAt,
        correlationId: input.correlationId,
        createdAt: now(),
        ...(input.resourceTenantId !== undefined ? { resourceTenantId: input.resourceTenantId } : {}),
        ...(input.evaluationRef !== undefined ? { evaluationRef: input.evaluationRef } : {}),
        ...(input.issuerRef !== undefined ? { issuerRef: input.issuerRef } : {}),
        ...(input.approvalRefs !== undefined ? { approvalRefs: [...input.approvalRefs] } : {}),
        ...(input.obligationRefs !== undefined ? { obligationRefs: [...input.obligationRefs] } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
        ...(input.auditRefs !== undefined ? { auditRefs: [...input.auditRefs] } : {}),
      };

      mandates.set(record.id, record);
      mandateIdByRequestRef.set(record.requestRef, record.id);
      executions.set(record.id, []);
      return record;
    },

    async getMandate(context, mandateId) {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context, requestRef) {
      assertOpen();
      const mandateId = mandateIdByRequestRef.get(requestRef);
      if (mandateId === undefined) return null;
      return requireVisibleMandate(context, mandateId);
    },

    async getActiveMandateForEncumbrance(context, organizationId, encumbranceRef) {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, organizationId);
      return findActiveMandateForEncumbrance(organizationId, encumbranceRef);
    },

    async recordExecution(context, input: RecordEncumbranceReleaseExecutionInput) {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, input.organizationId);

      const attemptedAt = requireStrictUtcEncumbranceReleaseTimestamp(input.attemptedAt, 'attemptedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION',
          `Encumbrance release mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      if (executionIds.has(input.id)) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_EXECUTION_ALREADY_RECORDED',
          `Encumbrance release execution '${input.id}' has already been recorded; replaying it would record the same attempt twice.`,
          { executionId: input.id },
        );
      }

      // The evidence must be about the constraint the mandate authorizes.
      // An attempt aimed anywhere else is not this mandate's evidence.
      if (input.encumbranceRef !== mandate.encumbranceRef) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_TARGET_MISMATCH',
          `Encumbrance release mandate '${mandate.id}' authorizes the discharge of '${mandate.encumbranceRef}'; evidence naming '${input.encumbranceRef}' does not belong to it.`,
          { mandateId: mandate.id, mandateEncumbranceRef: mandate.encumbranceRef, evidenceEncumbranceRef: input.encumbranceRef },
        );
      }

      const recorded = executions.get(mandate.id) ?? [];
      // Ordered exactly as the SQLite store orders it — status first, then the
      // belt-and-braces scan — so a caller sees one code for one situation
      // whichever provider it is composed against. A confirmed release always
      // moves the mandate to `'executed'`, so in practice the first check is
      // what fires; the second exists for a stored state where it somehow did
      // not.
      if (input.outcome === 'confirmed_success' && mandate.status !== 'active') {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
          `Encumbrance release mandate '${mandate.id}' is '${mandate.status}'; a confirmed release cannot be recorded against an authorization that is no longer live.`,
          { mandateId: mandate.id, status: mandate.status },
        );
      }
      if (input.outcome === 'confirmed_success' && recorded.some((execution) => execution.outcome === 'confirmed_success')) {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_EXECUTION_ALREADY_RECORDED',
          `Encumbrance release mandate '${mandate.id}' already carries a confirmed release; it authorizes exactly one discharge.`,
          { mandateId: mandate.id },
        );
      }

      const execution: EncumbranceReleaseExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        encumbranceRef: input.encumbranceRef,
        outcome: input.outcome,
        providerSystem: input.providerSystem,
        attemptedAt,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.confirmedAt !== undefined
          ? { confirmedAt: requireStrictUtcEncumbranceReleaseTimestamp(input.confirmedAt, 'confirmedAt') }
          : {}),
        ...(input.providerReleaseReference !== undefined ? { providerReleaseReference: input.providerReleaseReference } : {}),
        ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      };

      // The commit section: append the evidence and, for a confirmed success,
      // spend the grant together. Nothing awaits in between, so no other
      // in-process caller can observe an executed release under a still-active
      // mandate.
      executionIds.add(execution.id);
      executions.set(mandate.id, [...recorded, execution]);

      let next = mandate;
      if (execution.outcome === 'confirmed_success') {
        next = { ...mandate, status: 'executed', executionRef: execution.id };
        mandates.set(next.id, next);
      }
      return { mandate: next, execution };
    },

    async listExecutions(context, mandateId) {
      assertOpen();
      const mandate = requireVisibleMandate(context, mandateId);
      return [...(executions.get(mandate.id) ?? [])];
    },

    async getConfirmedExecution(context, mandateId) {
      assertOpen();
      const mandate = requireVisibleMandate(context, mandateId);
      return (executions.get(mandate.id) ?? []).find((execution) => execution.outcome === 'confirmed_success') ?? null;
    },

    async revokeMandate(context, input: RevokeEncumbranceReleaseMandateInput): Promise<EncumbranceReleaseRevokeOutcome> {
      assertOpen();
      requireEncumbranceReleaseAccessToOrganization(context, input.organizationId);
      const revokedAt = requireStrictUtcEncumbranceReleaseTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      if (mandate.status !== 'active') {
        throw new EncumbranceReleaseGovernanceError(
          'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE',
          `Encumbrance release mandate '${mandate.id}' is '${mandate.status}'; only a live authorization can be withdrawn, and withdrawing a spent one would suggest the discharge could be undone.`,
          { mandateId: mandate.id, status: mandate.status },
        );
      }

      const revocation: EncumbranceReleaseMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      const next: EncumbranceReleaseMandateRecord = { ...mandate, status: 'revoked' };
      mandates.set(next.id, next);
      revocations.set(next.id, revocation);
      return { mandate: next, revocation };
    },

    async getRevocation(context, mandateId) {
      assertOpen();
      const mandate = requireVisibleMandate(context, mandateId);
      return revocations.get(mandate.id) ?? null;
    },

    async health(): Promise<EncumbranceReleaseMandateStoreHealth> {
      let activeMandateCount = 0;
      for (const mandate of mandates.values()) if (mandate.status === 'active') activeMandateCount += 1;
      return {
        providerKind: 'memory',
        available: !closed,
        schemaVersion: ENCUMBRANCE_RELEASE_MANDATE_STORE_SCHEMA_VERSION,
        mandateCount: mandates.size,
        executionCount: executionIds.size,
        activeMandateCount,
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
