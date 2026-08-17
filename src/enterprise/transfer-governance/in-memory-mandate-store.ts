import { validateEnterpriseTransferMandate } from '@aoc-enterprise/transfer-mandate';

import { TransferGovernanceError } from './errors.js';
import {
  assertNoTransferScopeEscalation,
  assertTransferExerciseAuthorized,
  assertTransferRevocable,
  nextTransferredScope,
  toCanonicalTransferMandate,
} from './lifecycle.js';
import {
  canAccessTransferOrganization,
  requireStrictUtcTransferTimestamp,
  requireTransferAccessToOrganization,
  requireTransferTenantScope,
  type TransferMandateStore,
} from './mandate-store.js';
import type {
  IssueTransferMandateInput,
  RecordTransferExecutionInput,
  RecordTransferLifecycleInput,
  RevokeTransferMandateInput,
  TransferExecutionRecord,
  TransferGovernanceContext,
  TransferLifecycleRecord,
  TransferMandateRecord,
  TransferMandateRevocationRecord,
  TransferMandateStoreHealth,
  TransferRevokeOutcome,
} from './contracts.js';

export const TRANSFER_MANDATE_STORE_SCHEMA_VERSION = 'aoc.transfer-mandate-store.schema.v1';

export interface CreateInMemoryTransferMandateStoreOptions {
  readonly now?: () => string;
}

/**
 * In-memory `TransferMandateStore` — mirrors `createInMemoryAccessGrantStore`
 * (`../access-governance/in-memory-access-grant-store.ts`),
 * `createInMemoryTokenizationMandateStore`,
 * `createInMemoryCollateralizationMandateStore` and
 * `createInMemoryLicenseMandateStore` in structure: synchronous "commit
 * sections" with no `await` between the read that decides an outcome and the
 * map mutation that records it, so no interleaving is possible even under
 * concurrent in-process callers.
 *
 * This is not a lesser implementation. It is the right provider for tests,
 * development and memory deployments, and it is held to *identical* domain
 * semantics as the SQLite store by the shared store-contract suite
 * (`src/enterprise/__tests__/transfer-mandate-store-contract.test.ts`), which
 * runs every behavioural assertion against both.
 */
export function createInMemoryTransferMandateStore(options: CreateInMemoryTransferMandateStoreOptions = {}): TransferMandateStore {
  const now = options.now ?? (() => new Date().toISOString());

  const mandates = new Map<string, TransferMandateRecord>();
  /** `requestRef -> mandateId`. One transfer request authorizes at most one mandate, so a replayed request can never accumulate authorization. */
  const mandateIdByRequestRef = new Map<string, string>();
  const executions = new Map<string, TransferExecutionRecord[]>();
  const executionIds = new Set<string>();
  const lifecycleEvents = new Map<string, TransferLifecycleRecord[]>();
  const lifecycleIds = new Set<string>();
  const revocations = new Map<string, TransferMandateRevocationRecord>();
  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new TransferGovernanceError('TRANSFER_STORE_UNAVAILABLE', 'The Transfer Mandate Store has been closed.');
    }
  }

  function requireMandate(mandateId: string): TransferMandateRecord {
    const mandate = mandates.get(mandateId);
    if (mandate === undefined) {
      throw new TransferGovernanceError('TRANSFER_MANDATE_NOT_FOUND', `No transfer mandate for mandateId '${mandateId}'.`);
    }
    return mandate;
  }

  /** Tenant-scoped read: a caller that may not see the record is told it is out of scope, never handed it. */
  function requireVisibleMandate(context: TransferGovernanceContext, mandateId: string): TransferMandateRecord {
    requireTransferTenantScope(context);
    const mandate = requireMandate(mandateId);
    if (!canAccessTransferOrganization(context, mandate.organizationId)) {
      throw new TransferGovernanceError(
        'TRANSFER_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access transfer governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  return {
    providerKind: 'memory',

    async issueMandate(context: TransferGovernanceContext, input: IssueTransferMandateInput): Promise<TransferMandateRecord> {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcTransferTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcTransferTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow the portion that was requested; it may never
      // widen it, and it may never substitute a different transferor,
      // transferee or bound executor.
      assertNoTransferScopeEscalation(input.terms, input.requestedTerms);

      if (mandates.has(input.id)) {
        throw new TransferGovernanceError('TRANSFER_MANDATE_ALREADY_EXISTS', `A transfer mandate with id '${input.id}' already exists.`);
      }
      const existingForRequest = mandateIdByRequestRef.get(input.requestRef);
      if (existingForRequest !== undefined) {
        throw new TransferGovernanceError(
          'TRANSFER_MANDATE_ALREADY_EXISTS',
          `Transfer request '${input.requestRef}' has already been authorized by mandate '${existingForRequest}'; replaying it must not create additional transfer authority.`,
          { requestRef: input.requestRef, mandateId: existingForRequest },
        );
      }

      const record: TransferMandateRecord = {
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
      const validation = validateEnterpriseTransferMandate(toCanonicalTransferMandate(record));
      if (!validation.valid) {
        throw new TransferGovernanceError(
          'TRANSFER_VALIDATION_ERROR',
          `Transfer mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
          { issues: validation.errors },
        );
      }

      mandates.set(record.id, record);
      mandateIdByRequestRef.set(record.requestRef, record.id);
      executions.set(record.id, []);
      lifecycleEvents.set(record.id, []);
      return record;
    },

    async getMandate(context: TransferGovernanceContext, mandateId: string): Promise<TransferMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context: TransferGovernanceContext, requestRef: string): Promise<TransferMandateRecord | null> {
      assertOpen();
      const mandateId = mandateIdByRequestRef.get(requestRef);
      if (mandateId === undefined) return null;
      return requireVisibleMandate(context, mandateId);
    },

    async recordExecution(context: TransferGovernanceContext, input: RecordTransferExecutionInput) {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcTransferTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new TransferGovernanceError(
          'TRANSFER_ACCESS_SCOPE_VIOLATION',
          `Transfer mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never record a second
      // movement -- which for this action would also double-count the
      // cumulative transferred scope.
      if (executionIds.has(input.id)) {
        throw new TransferGovernanceError(
          'TRANSFER_EXECUTION_ALREADY_RECORDED',
          `Transfer execution '${input.id}' has already been recorded; replaying it would record the same movement twice.`,
        );
      }

      assertTransferExerciseAuthorized(mandate, {
        executedBy: input.executedBy,
        transferorRef: input.transferorRef,
        transfereeRef: input.transfereeRef,
        rights: input.rights,
        transferredScope: input.transferredScope,
        executedAt,
        ...(input.registry !== undefined ? { registry: input.registry } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalConsiderationReference !== undefined ? { externalConsiderationReference: input.externalConsiderationReference } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
      });

      const transferredScope = nextTransferredScope(mandate.transferredScope, input.transferredScope);
      if (transferredScope === null) {
        throw new TransferGovernanceError(
          'TRANSFER_EXECUTION_NOT_AUTHORIZED',
          'The reported movement is not commensurable with the portion already transferred under this mandate; refusing to record a total AOC could not justify.',
          { refusalCode: 'CUMULATIVE_SCOPE_EXCEEDS_MANDATE', mandateId: mandate.id },
        );
      }

      const execution: TransferExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executedBy: input.executedBy,
        executedAt,
        transferorRef: input.transferorRef,
        transfereeRef: input.transfereeRef,
        rights: [...input.rights],
        transferredScope: input.transferredScope,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.transferEffectiveAt !== undefined ? { transferEffectiveAt: input.transferEffectiveAt } : {}),
        ...(input.registry !== undefined ? { registry: input.registry } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalConsiderationReference !== undefined ? { externalConsiderationReference: input.externalConsiderationReference } : {}),
        ...(input.externalRegistrationReference !== undefined ? { externalRegistrationReference: input.externalRegistrationReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      const updated: TransferMandateRecord = {
        ...mandate,
        executionCount: mandate.executionCount + 1,
        transferredScope,
      };

      const log = executions.get(mandate.id);
      if (log === undefined) {
        throw new TransferGovernanceError(
          'TRANSFER_STORE_UNAVAILABLE',
          `The execution log for transfer mandate '${mandate.id}' is missing; refusing to record evidence that could not be read back.`,
        );
      }
      executionIds.add(execution.id);
      log.push(execution);
      mandates.set(updated.id, updated);
      return { mandate: updated, execution };
    },

    async listExecutions(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return [...(executions.get(mandateId) ?? [])];
    },

    async recordLifecycleEvent(context: TransferGovernanceContext, input: RecordTransferLifecycleInput): Promise<TransferLifecycleRecord> {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const occurredAt = requireStrictUtcTransferTimestamp(input.occurredAt, 'occurredAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new TransferGovernanceError(
          'TRANSFER_ACCESS_SCOPE_VIOLATION',
          `Transfer mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // A lifecycle report concerns one specific movement. Reporting one
      // against an execution this mandate never had would be an unanchored
      // claim about the external world.
      const log = executions.get(mandate.id) ?? [];
      if (!log.some((execution) => execution.id === input.executionId)) {
        throw new TransferGovernanceError(
          'TRANSFER_EXECUTION_NOT_FOUND',
          `No transfer execution '${input.executionId}' recorded under mandate '${mandate.id}'; a lifecycle report must reference a movement AOC has evidence of.`,
          { mandateId: mandate.id, executionId: input.executionId },
        );
      }

      if (lifecycleIds.has(input.id)) {
        throw new TransferGovernanceError(
          'TRANSFER_LIFECYCLE_ALREADY_RECORDED',
          `Transfer lifecycle event '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
        );
      }

      const event: TransferLifecycleRecord = {
        id: input.id,
        mandateId: mandate.id,
        executionId: input.executionId,
        organizationId: mandate.organizationId,
        reportedBy: input.reportedBy,
        occurredAt,
        lifecycleType: input.lifecycleType,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      const lifecycleLog = lifecycleEvents.get(mandate.id);
      if (lifecycleLog === undefined) {
        throw new TransferGovernanceError(
          'TRANSFER_STORE_UNAVAILABLE',
          `The lifecycle log for transfer mandate '${mandate.id}' is missing; refusing to record evidence that could not be read back.`,
        );
      }
      lifecycleIds.add(event.id);
      lifecycleLog.push(event);
      // Deliberately no change to `mandate.transferredScope`,
      // `mandate.executionCount` or `mandate.status`. A reported reversal in
      // particular restores nothing: AOC cannot verify that a movement was
      // undone, and decrementing the transferred total would manufacture
      // fresh capacity over a right already recorded as having left.
      return event;
    },

    async listLifecycleEvents(context: TransferGovernanceContext, mandateId: string): Promise<readonly TransferLifecycleRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return [...(lifecycleEvents.get(mandateId) ?? [])];
    },

    async revokeMandate(context: TransferGovernanceContext, input: RevokeTransferMandateInput): Promise<TransferRevokeOutcome> {
      assertOpen();
      requireTransferAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcTransferTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existing = revocations.get(mandate.id);
      if (existing !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: existing };
      }
      assertTransferRevocable(mandate.status);

      const revocation: TransferMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        // Immutable proof of how far the authorization had already been
        // exercised when authority was withdrawn. Revocation never deletes or
        // invalidates that evidence, and never claims that a movement was
        // reversed.
        executionsAtRevocation: mandate.executionCount,
        ...(mandate.transferredScope !== undefined ? { transferredScopeAtRevocation: mandate.transferredScope } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };
      const revoked: TransferMandateRecord = { ...mandate, status: 'revoked' };

      revocations.set(mandate.id, revocation);
      mandates.set(revoked.id, revoked);
      return { kind: 'revoked', mandate: revoked, revocation };
    },

    async getRevocation(context: TransferGovernanceContext, mandateId: string): Promise<TransferMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return revocations.get(mandateId) ?? null;
    },

    async health(): Promise<TransferMandateStoreHealth> {
      return {
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: TRANSFER_MANDATE_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
