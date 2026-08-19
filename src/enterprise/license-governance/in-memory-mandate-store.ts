import { validateEnterpriseLicenseMandate } from '@aoc-enterprise/license-mandate';

import { LicenseGovernanceError } from './errors.js';
import { assertLicenseExerciseAuthorized, assertLicenseRevocable, assertNoLicensePermissionEscalation, toCanonicalLicenseMandate } from './lifecycle.js';
import {
  canAccessLicenseOrganization,
  requireLicenseAccessToOrganization,
  requireLicenseTenantScope,
  requireStrictUtcLicenseTimestamp,
  type LicenseMandateStore,
} from './mandate-store.js';
import type {
  IssueLicenseMandateInput,
  LicenseExecutionRecord,
  LicenseGovernanceContext,
  LicenseLifecycleRecord,
  LicenseMandateRecord,
  LicenseMandateRevocationRecord,
  LicenseMandateStoreHealth,
  LicenseRevokeOutcome,
  RecordLicenseExecutionInput,
  RecordLicenseLifecycleInput,
  RevokeLicenseMandateInput,
} from './contracts.js';

export const LICENSE_MANDATE_STORE_SCHEMA_VERSION = 'aoc.license-mandate-store.schema.v1';

export interface CreateInMemoryLicenseMandateStoreOptions {
  readonly now?: () => string;
}

/**
 * In-memory `LicenseMandateStore` — mirrors `createInMemoryAccessGrantStore`
 * (`../access-governance/in-memory-access-grant-store.ts`),
 * `createInMemoryTokenizationMandateStore` and
 * `createInMemoryCollateralizationMandateStore` in structure: synchronous
 * "commit sections" with no `await` between the read that decides an outcome
 * and the map mutation that records it, so no interleaving is possible even
 * under concurrent in-process callers.
 *
 * This is not a lesser implementation. It is the right provider for tests,
 * development and memory deployments, and it is held to *identical* domain
 * semantics as the SQLite store by the shared store-contract suite
 * (`src/enterprise/__tests__/license-mandate-store-contract.test.ts`), which
 * runs every behavioural assertion against both.
 */
export function createInMemoryLicenseMandateStore(options: CreateInMemoryLicenseMandateStoreOptions = {}): LicenseMandateStore {
  const now = options.now ?? (() => new Date().toISOString());

  const mandates = new Map<string, LicenseMandateRecord>();
  /** `requestRef -> mandateId`. One license request authorizes at most one mandate, so a replayed request can never accumulate authorization. */
  const mandateIdByRequestRef = new Map<string, string>();
  const executions = new Map<string, LicenseExecutionRecord[]>();
  const executionIds = new Set<string>();
  const lifecycleEvents = new Map<string, LicenseLifecycleRecord[]>();
  const lifecycleIds = new Set<string>();
  const revocations = new Map<string, LicenseMandateRevocationRecord>();
  let closed = false;

  function assertOpen(): void {
    if (closed) {
      throw new LicenseGovernanceError('LICENSE_STORE_UNAVAILABLE', 'The License Mandate Store has been closed.');
    }
  }

  function requireMandate(mandateId: string): LicenseMandateRecord {
    const mandate = mandates.get(mandateId);
    if (mandate === undefined) {
      throw new LicenseGovernanceError('LICENSE_MANDATE_NOT_FOUND', `No license mandate for mandateId '${mandateId}'.`);
    }
    return mandate;
  }

  /** Tenant-scoped read: a caller that may not see the record is told it is out of scope, never handed it. */
  function requireVisibleMandate(context: LicenseGovernanceContext, mandateId: string): LicenseMandateRecord {
    requireLicenseTenantScope(context);
    const mandate = requireMandate(mandateId);
    if (!canAccessLicenseOrganization(context, mandate.organizationId)) {
      throw new LicenseGovernanceError(
        'LICENSE_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access license governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  return {
    providerKind: 'memory',

    async issueMandate(context: LicenseGovernanceContext, input: IssueLicenseMandateInput): Promise<LicenseMandateRecord> {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcLicenseTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcLicenseTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow what was requested; it may never widen it, and
      // it may never substitute a different licensee or bound executor.
      assertNoLicensePermissionEscalation(input.terms, input.requestedTerms);

      if (mandates.has(input.id)) {
        throw new LicenseGovernanceError('LICENSE_MANDATE_ALREADY_EXISTS', `A license mandate with id '${input.id}' already exists.`);
      }
      const existingForRequest = mandateIdByRequestRef.get(input.requestRef);
      if (existingForRequest !== undefined) {
        throw new LicenseGovernanceError(
          'LICENSE_MANDATE_ALREADY_EXISTS',
          `License request '${input.requestRef}' has already been authorized by mandate '${existingForRequest}'; replaying it must not create additional licensing authority.`,
          { requestRef: input.requestRef, mandateId: existingForRequest },
        );
      }

      const record: LicenseMandateRecord = {
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
      const validation = validateEnterpriseLicenseMandate(toCanonicalLicenseMandate(record));
      if (!validation.valid) {
        throw new LicenseGovernanceError(
          'LICENSE_VALIDATION_ERROR',
          `License mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
          { issues: validation.errors },
        );
      }

      mandates.set(record.id, record);
      mandateIdByRequestRef.set(record.requestRef, record.id);
      executions.set(record.id, []);
      lifecycleEvents.set(record.id, []);
      return record;
    },

    async getMandate(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context: LicenseGovernanceContext, requestRef: string): Promise<LicenseMandateRecord | null> {
      assertOpen();
      const mandateId = mandateIdByRequestRef.get(requestRef);
      if (mandateId === undefined) return null;
      return requireVisibleMandate(context, mandateId);
    },

    async recordExecution(context: LicenseGovernanceContext, input: RecordLicenseExecutionInput) {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcLicenseTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new LicenseGovernanceError(
          'LICENSE_ACCESS_SCOPE_VIOLATION',
          `License mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never record a second
      // grant.
      if (executionIds.has(input.id)) {
        throw new LicenseGovernanceError(
          'LICENSE_EXECUTION_ALREADY_RECORDED',
          `License execution '${input.id}' has already been recorded; replaying it would record the same grant twice.`,
        );
      }

      assertLicenseExerciseAuthorized(mandate, {
        executedBy: input.executedBy,
        licenseeRef: input.licenseeRef,
        rights: input.rights,
        grantedUses: input.grantedUses,
        exclusivity: input.exclusivity,
        executedAt,
        ...(input.rightsScope !== undefined ? { rightsScope: input.rightsScope } : {}),
        ...(input.contexts !== undefined ? { contexts: input.contexts } : {}),
        ...(input.licenseExpiresAt !== undefined ? { licenseExpiresAt: input.licenseExpiresAt } : {}),
        ...(input.licensedUnits !== undefined ? { licensedUnits: input.licensedUnits } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
      });

      const execution: LicenseExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executedBy: input.executedBy,
        executedAt,
        licenseeRef: input.licenseeRef,
        rights: [...input.rights],
        grantedUses: [...input.grantedUses],
        exclusivity: input.exclusivity,
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.rightsScope !== undefined ? { rightsScope: input.rightsScope } : {}),
        ...(input.contexts !== undefined ? { contexts: input.contexts } : {}),
        ...(input.licenseEffectiveAt !== undefined ? { licenseEffectiveAt: input.licenseEffectiveAt } : {}),
        ...(input.licenseExpiresAt !== undefined ? { licenseExpiresAt: input.licenseExpiresAt } : {}),
        ...(input.licensedUnits !== undefined ? { licensedUnits: input.licensedUnits } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalAgreementReference !== undefined ? { externalAgreementReference: input.externalAgreementReference } : {}),
        ...(input.externalAcceptanceReference !== undefined ? { externalAcceptanceReference: input.externalAcceptanceReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      const updated: LicenseMandateRecord = { ...mandate, executionCount: mandate.executionCount + 1 };

      const log = executions.get(mandate.id);
      if (log === undefined) {
        throw new LicenseGovernanceError(
          'LICENSE_STORE_UNAVAILABLE',
          `The execution log for license mandate '${mandate.id}' is missing; refusing to record evidence that could not be read back.`,
        );
      }
      executionIds.add(execution.id);
      log.push(execution);
      mandates.set(updated.id, updated);
      return { mandate: updated, execution };
    },

    async listExecutions(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return [...(executions.get(mandateId) ?? [])];
    },

    async recordLifecycleEvent(context: LicenseGovernanceContext, input: RecordLicenseLifecycleInput): Promise<LicenseLifecycleRecord> {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const occurredAt = requireStrictUtcLicenseTimestamp(input.occurredAt, 'occurredAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new LicenseGovernanceError(
          'LICENSE_ACCESS_SCOPE_VIOLATION',
          `License mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // A lifecycle report ends one specific granted license. Reporting one
      // against an execution this mandate never had would be an unanchored
      // claim about the external world.
      const log = executions.get(mandate.id) ?? [];
      if (!log.some((execution) => execution.id === input.executionId)) {
        throw new LicenseGovernanceError(
          'LICENSE_EXECUTION_NOT_FOUND',
          `No license execution '${input.executionId}' recorded under mandate '${mandate.id}'; a lifecycle report must reference a license Soberanía has evidence of.`,
          { mandateId: mandate.id, executionId: input.executionId },
        );
      }

      if (lifecycleIds.has(input.id)) {
        throw new LicenseGovernanceError(
          'LICENSE_LIFECYCLE_ALREADY_RECORDED',
          `License lifecycle event '${input.id}' has already been recorded; replaying it would duplicate the evidence.`,
        );
      }

      const event: LicenseLifecycleRecord = {
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
        throw new LicenseGovernanceError(
          'LICENSE_STORE_UNAVAILABLE',
          `The lifecycle log for license mandate '${mandate.id}' is missing; refusing to record evidence that could not be read back.`,
        );
      }
      lifecycleIds.add(event.id);
      lifecycleLog.push(event);
      // Deliberately no change to `mandate.executionCount` or `mandate.status`:
      // a reported end is an observation about an external license, never a
      // governance state transition and never fresh licensing capacity.
      return event;
    },

    async listLifecycleEvents(context: LicenseGovernanceContext, mandateId: string): Promise<readonly LicenseLifecycleRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return [...(lifecycleEvents.get(mandateId) ?? [])];
    },

    async revokeMandate(context: LicenseGovernanceContext, input: RevokeLicenseMandateInput): Promise<LicenseRevokeOutcome> {
      assertOpen();
      requireLicenseAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcLicenseTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existing = revocations.get(mandate.id);
      if (existing !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: existing };
      }
      assertLicenseRevocable(mandate.status);

      const revocation: LicenseMandateRevocationRecord = {
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
        // license was terminated.
        executionsAtRevocation: mandate.executionCount,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };
      const revoked: LicenseMandateRecord = { ...mandate, status: 'revoked' };

      revocations.set(mandate.id, revocation);
      mandates.set(revoked.id, revoked);
      return { kind: 'revoked', mandate: revoked, revocation };
    },

    async getRevocation(context: LicenseGovernanceContext, mandateId: string): Promise<LicenseMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return revocations.get(mandateId) ?? null;
    },

    async health(): Promise<LicenseMandateStoreHealth> {
      return {
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: LICENSE_MANDATE_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
