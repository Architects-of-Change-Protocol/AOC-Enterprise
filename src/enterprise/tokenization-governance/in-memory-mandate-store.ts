import { validateEnterpriseTokenizationMandate } from '@aoc-enterprise/tokenization-mandate';

import { TokenizationGovernanceError } from './errors.js';
import { assertExerciseAuthorized, assertNoScopeEscalation, assertRevocable, toCanonicalMandate } from './lifecycle.js';
import {
  canAccessTokenizationOrganization,
  requireStrictUtcTokenizationTimestamp,
  requireTokenizationAccessToOrganization,
  requireTokenizationTenantScope,
  type TokenizationMandateStore,
} from './mandate-store.js';
import type {
  IssueTokenizationMandateInput,
  RecordTokenizationExecutionInput,
  RevokeTokenizationMandateInput,
  TokenizationExecutionRecord,
  TokenizationGovernanceContext,
  TokenizationMandateRecord,
  TokenizationMandateRevocationRecord,
  TokenizationMandateStoreHealth,
  TokenizationRevokeOutcome,
} from './contracts.js';

export const TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION = 'aoc.tokenization-mandate-store.schema.v1';

export interface CreateInMemoryTokenizationMandateStoreOptions {
  readonly now?: () => string;
}

/**
 * In-memory `TokenizationMandateStore` — mirrors
 * `createInMemoryAccessGrantStore` (`../access-governance/in-memory-access-grant-store.ts`)
 * in structure: synchronous "commit sections" with no `await` between the
 * read that decides an outcome and the map mutation that records it, so no
 * interleaving is possible even under concurrent in-process callers.
 *
 * A SQLite implementation is deliberately not part of this change (see
 * `docs/enterprise/AOC_TOKENIZE_CAPABILITY.md`, "Deferred work"): the store
 * port above is the seam it would slot into, exactly as
 * `createSqliteAccessGrantStore` slots into `AccessGrantStore`.
 */
export function createInMemoryTokenizationMandateStore(
  options: CreateInMemoryTokenizationMandateStoreOptions = {},
): TokenizationMandateStore {
  const now = options.now ?? (() => new Date().toISOString());

  const mandates = new Map<string, TokenizationMandateRecord>();
  /** `requestRef -> mandateId`. One tokenization request authorizes at most one mandate, so a replayed request can never accumulate authorization. */
  const mandateIdByRequestRef = new Map<string, string>();
  const executions = new Map<string, TokenizationExecutionRecord[]>();
  const executionIds = new Set<string>();
  const revocations = new Map<string, TokenizationMandateRevocationRecord>();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new TokenizationGovernanceError('TOKENIZATION_STORE_UNAVAILABLE', 'The Tokenization Mandate Store has been closed.');
  }

  function requireMandate(mandateId: string): TokenizationMandateRecord {
    const mandate = mandates.get(mandateId);
    if (mandate === undefined) {
      throw new TokenizationGovernanceError('TOKENIZATION_MANDATE_NOT_FOUND', `No tokenization mandate for mandateId '${mandateId}'.`);
    }
    return mandate;
  }

  /** Tenant-scoped read: a caller that may not see the record is told it is out of scope, never handed it. */
  function requireVisibleMandate(context: TokenizationGovernanceContext, mandateId: string): TokenizationMandateRecord {
    requireTokenizationTenantScope(context);
    const mandate = requireMandate(mandateId);
    if (!canAccessTokenizationOrganization(context, mandate.organizationId)) {
      throw new TokenizationGovernanceError(
        'TOKENIZATION_ACCESS_SCOPE_VIOLATION',
        `The caller is not authorized to access tokenization governance data for organization '${mandate.organizationId}'.`,
      );
    }
    return mandate;
  }

  return {
    providerKind: 'memory',

    async issueMandate(context: TokenizationGovernanceContext, input: IssueTokenizationMandateInput): Promise<TokenizationMandateRecord> {
      assertOpen();
      requireTokenizationAccessToOrganization(context, input.organizationId);

      const effectiveFrom = requireStrictUtcTokenizationTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcTokenizationTimestamp(input.expiresAt, 'expiresAt');

      // A mandate may narrow what was requested; it may never widen it.
      assertNoScopeEscalation(input.terms, input.requestedTerms);

      if (mandates.has(input.id)) {
        throw new TokenizationGovernanceError('TOKENIZATION_MANDATE_ALREADY_EXISTS', `A tokenization mandate with id '${input.id}' already exists.`);
      }
      const existingForRequest = mandateIdByRequestRef.get(input.requestRef);
      if (existingForRequest !== undefined) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_MANDATE_ALREADY_EXISTS',
          `Tokenization request '${input.requestRef}' has already been authorized by mandate '${existingForRequest}'; replaying it must not create additional issuance authorization.`,
          { requestRef: input.requestRef, mandateId: existingForRequest },
        );
      }

      const record: TokenizationMandateRecord = {
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
        issuedUnits: 0,
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
      const validation = validateEnterpriseTokenizationMandate(toCanonicalMandate(record));
      if (!validation.valid) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_VALIDATION_ERROR',
          `Tokenization mandate candidate failed canonical validation: ${validation.errors.map((issue) => issue.code).join(', ')}`,
          { issues: validation.errors },
        );
      }

      mandates.set(record.id, record);
      mandateIdByRequestRef.set(record.requestRef, record.id);
      executions.set(record.id, []);
      return record;
    },

    async getMandate(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationMandateRecord> {
      assertOpen();
      return requireVisibleMandate(context, mandateId);
    },

    async getMandateByRequestRef(context: TokenizationGovernanceContext, requestRef: string): Promise<TokenizationMandateRecord | null> {
      assertOpen();
      const mandateId = mandateIdByRequestRef.get(requestRef);
      if (mandateId === undefined) return null;
      return requireVisibleMandate(context, mandateId);
    },

    async recordExecution(context: TokenizationGovernanceContext, input: RecordTokenizationExecutionInput) {
      assertOpen();
      requireTokenizationAccessToOrganization(context, input.organizationId);

      const executedAt = requireStrictUtcTokenizationTimestamp(input.executedAt, 'executedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);
      if (mandate.organizationId !== input.organizationId) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_ACCESS_SCOPE_VIOLATION',
          `Tokenization mandate '${mandate.id}' belongs to organization '${mandate.organizationId}', not '${input.organizationId}'.`,
        );
      }

      // Replay of an already-recorded execution must never create additional
      // issuance headroom by being counted twice.
      if (executionIds.has(input.id)) {
        throw new TokenizationGovernanceError(
          'TOKENIZATION_EXECUTION_ALREADY_RECORDED',
          `Tokenization execution '${input.id}' has already been recorded; replaying it would double-count issued units.`,
        );
      }

      assertExerciseAuthorized(mandate, {
        executorRef: input.executorRef,
        rights: input.rights,
        issuedScope: input.issuedScope,
        executedAt,
        ...(input.issuedUnits !== undefined ? { issuedUnits: input.issuedUnits } : {}),
      });

      const execution: TokenizationExecutionRecord = {
        id: input.id,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        executorRef: input.executorRef,
        executedAt,
        issuedScope: input.issuedScope,
        rights: [...input.rights],
        correlationId: input.correlationId,
        recordedAt: now(),
        ...(input.issuedUnits !== undefined ? { issuedUnits: input.issuedUnits } : {}),
        ...(input.externalSystem !== undefined ? { externalSystem: input.externalSystem } : {}),
        ...(input.externalNetwork !== undefined ? { externalNetwork: input.externalNetwork } : {}),
        ...(input.externalTokenStandard !== undefined ? { externalTokenStandard: input.externalTokenStandard } : {}),
        ...(input.externalContractReference !== undefined ? { externalContractReference: input.externalContractReference } : {}),
        ...(input.externalTransactionReference !== undefined ? { externalTransactionReference: input.externalTransactionReference } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };

      const updated: TokenizationMandateRecord = {
        ...mandate,
        issuedUnits: mandate.issuedUnits + (input.issuedUnits ?? 0),
        executionCount: mandate.executionCount + 1,
      };

      const log = executions.get(mandate.id);
      if (log === undefined) {
        throw new TokenizationGovernanceError('TOKENIZATION_STORE_UNAVAILABLE', `The execution log for tokenization mandate '${mandate.id}' is missing; refusing to record evidence that could not be read back.`);
      }
      executionIds.add(execution.id);
      log.push(execution);
      mandates.set(updated.id, updated);
      return { mandate: updated, execution };
    },

    async listExecutions(context: TokenizationGovernanceContext, mandateId: string): Promise<readonly TokenizationExecutionRecord[]> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return [...(executions.get(mandateId) ?? [])];
    },

    async revokeMandate(context: TokenizationGovernanceContext, input: RevokeTokenizationMandateInput): Promise<TokenizationRevokeOutcome> {
      assertOpen();
      requireTokenizationAccessToOrganization(context, input.organizationId);

      const revokedAt = requireStrictUtcTokenizationTimestamp(input.revokedAt, 'revokedAt');
      const mandate = requireVisibleMandate(context, input.mandateId);

      const existing = revocations.get(mandate.id);
      if (existing !== undefined) {
        return { kind: 'already-revoked', mandate, revocation: existing };
      }
      assertRevocable(mandate.status);

      const revocation: TokenizationMandateRevocationRecord = {
        id: input.revocationId,
        mandateId: mandate.id,
        organizationId: mandate.organizationId,
        revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        // Immutable proof that the authorization had already been exercised
        // this many times when authority was withdrawn. Revocation never
        // deletes or invalidates that evidence.
        executionsAtRevocation: mandate.executionCount,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: [...input.evidenceRefs] } : {}),
      };
      const revoked: TokenizationMandateRecord = { ...mandate, status: 'revoked' };

      revocations.set(mandate.id, revocation);
      mandates.set(revoked.id, revoked);
      return { kind: 'revoked', mandate: revoked, revocation };
    },

    async getRevocation(context: TokenizationGovernanceContext, mandateId: string): Promise<TokenizationMandateRevocationRecord | null> {
      assertOpen();
      requireVisibleMandate(context, mandateId);
      return revocations.get(mandateId) ?? null;
    },

    async health(): Promise<TokenizationMandateStoreHealth> {
      return {
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: TOKENIZATION_MANDATE_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}
