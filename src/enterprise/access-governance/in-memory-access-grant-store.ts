import { AccessGovernanceError } from './errors.js';
import {
  canAccessAccessGrantOrganization,
  requireAccessGrantAccessToOrganization,
  requireAccessGrantTenantScope,
  type AccessGrantStore,
} from './access-grant-store.js';
import { createPendingEnforcementResult } from './contracts.js';
import type {
  AccessGovernanceContext,
  AccessGrantRecord,
  AccessGrantRevocationRecord,
  AccessGrantStoreHealth,
  BeginRevocationInput,
  FinalizeRevocationEnforcementInput,
  IssueAccessGrantInput,
  RecordProviderCredentialIssuanceInput,
  RevokeOutcome,
} from './contracts.js';

export const ACCESS_GRANT_STORE_SCHEMA_VERSION = 'aoc.access-grant-store.schema.v1';

export interface CreateInMemoryAccessGrantStoreOptions {
  readonly now?: () => string;
}

function laterExpiry(a: string | undefined, b: string): string {
  if (a === undefined) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * In-memory `AccessGrantStore` — mirrors `createInMemoryPassportStore`
 * (`../passport/in-memory-passport-store.ts`) in structure: synchronous
 * "commit sections" with no `await` between the read that decides an
 * outcome and the map mutation that records it, so no interleaving is
 * possible even under concurrent in-process callers. Useful for tests and
 * for `AOC_ENTERPRISE_PERSISTENCE_PROVIDER=memory` deployments; never
 * durable across a process restart — see `createSqliteAccessGrantStore` for
 * that.
 */
export function createInMemoryAccessGrantStore(options: CreateInMemoryAccessGrantStoreOptions = {}): AccessGrantStore {
  const now = options.now ?? (() => new Date().toISOString());

  const grants = new Map<string, AccessGrantRecord>();
  const revocations = new Map<string, AccessGrantRevocationRecord>();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new AccessGovernanceError('ACCESS_GRANT_STORE_UNAVAILABLE', 'The Access Grant Store has been closed.');
  }

  function requireGrant(grantId: string): AccessGrantRecord {
    const grant = grants.get(grantId);
    if (grant === undefined) {
      throw new AccessGovernanceError('ACCESS_GRANT_NOT_FOUND', `No Access Grant for grantId '${grantId}'.`);
    }
    return grant;
  }

  return {
    providerKind: 'memory',

    async issueGrant(context: AccessGovernanceContext, input: IssueAccessGrantInput): Promise<AccessGrantRecord> {
      assertOpen();
      requireAccessGrantAccessToOrganization(context, input.organizationId);

      if (grants.has(input.id)) {
        throw new AccessGovernanceError('ACCESS_GRANT_ALREADY_EXISTS', `An Access Grant with id '${input.id}' already exists.`);
      }

      const record: AccessGrantRecord = {
        id: input.id,
        organizationId: input.organizationId,
        status: 'active',
        resource: input.resource,
        principalId: input.principalId,
        decisionRef: input.decisionRef,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        correlationId: input.correlationId,
        createdAt: now(),
        ...(input.issuerRef !== undefined ? { issuerRef: input.issuerRef } : {}),
        ...(input.providerSystem !== undefined ? { providerSystem: input.providerSystem } : {}),
        ...(input.providerCid !== undefined ? { providerCid: input.providerCid } : {}),
        ...(input.providerFileId !== undefined ? { providerFileId: input.providerFileId } : {}),
      };
      grants.set(record.id, record);
      return record;
    },

    async getGrant(context: AccessGovernanceContext, grantId: string): Promise<AccessGrantRecord> {
      assertOpen();
      const grant = requireGrant(grantId);
      requireAccessGrantAccessToOrganization(context, grant.organizationId);
      return grant;
    },

    async beginRevocation(context: AccessGovernanceContext, input: BeginRevocationInput): Promise<RevokeOutcome> {
      assertOpen();
      const grant = requireGrant(input.grantId);
      requireAccessGrantAccessToOrganization(context, grant.organizationId);
      if (grant.organizationId !== input.organizationId) {
        throw new AccessGovernanceError('ACCESS_GRANT_ACCESS_SCOPE_VIOLATION', `Revocation organizationId '${input.organizationId}' does not match grant '${grant.id}' organization '${grant.organizationId}'.`);
      }

      const existingRevocation = revocations.get(grant.id);
      if (existingRevocation !== undefined) {
        return { kind: 'already-revoked', grant, revocation: existingRevocation };
      }

      const revocation: AccessGrantRevocationRecord = {
        id: input.revocationId,
        grantId: grant.id,
        organizationId: grant.organizationId,
        revokedAt: input.revokedAt,
        reason: input.reason,
        issuerRef: input.issuerRef,
        correlationId: input.correlationId,
        enforcement: createPendingEnforcementResult(input.revokedAt),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      };
      const revokedGrant: AccessGrantRecord = { ...grant, status: 'revoked' };

      // Synchronous commit section: both maps update with no `await`
      // between them, so no interleaving caller can observe a grant marked
      // 'revoked' without its paired revocation record, or vice versa. No
      // provider has been contacted yet — future issuance is already
      // blocked (`lifecycle.ts`'s `assertActive` reads `grants.get(...).status`).
      grants.set(grant.id, revokedGrant);
      revocations.set(grant.id, revocation);

      return { kind: 'revoked', grant: revokedGrant, revocation };
    },

    async finalizeRevocationEnforcement(context: AccessGovernanceContext, input: FinalizeRevocationEnforcementInput): Promise<AccessGrantRevocationRecord> {
      assertOpen();
      const grant = requireGrant(input.grantId);
      requireAccessGrantAccessToOrganization(context, grant.organizationId);
      if (grant.organizationId !== input.organizationId) {
        throw new AccessGovernanceError('ACCESS_GRANT_ACCESS_SCOPE_VIOLATION', `Enforcement organizationId '${input.organizationId}' does not match grant '${grant.id}' organization '${grant.organizationId}'.`);
      }
      const existing = revocations.get(grant.id);
      if (existing === undefined) {
        throw new AccessGovernanceError('ACCESS_GRANT_NOT_FOUND', `No revocation is in progress for grant '${grant.id}'; call beginRevocation first.`);
      }
      const updated: AccessGrantRevocationRecord = { ...existing, enforcement: input.enforcement };
      revocations.set(grant.id, updated);
      return updated;
    },

    async getRevocation(context: AccessGovernanceContext, grantId: string): Promise<AccessGrantRevocationRecord | null> {
      assertOpen();
      const grant = requireGrant(grantId);
      requireAccessGrantAccessToOrganization(context, grant.organizationId);
      return revocations.get(grantId) ?? null;
    },

    async recordProviderCredentialIssuance(context: AccessGovernanceContext, input: RecordProviderCredentialIssuanceInput): Promise<AccessGrantRecord> {
      assertOpen();
      const grant = requireGrant(input.grantId);
      requireAccessGrantAccessToOrganization(context, grant.organizationId);
      if (grant.organizationId !== input.organizationId) {
        throw new AccessGovernanceError('ACCESS_GRANT_ACCESS_SCOPE_VIOLATION', `Credential-issuance organizationId '${input.organizationId}' does not match grant '${grant.id}' organization '${grant.organizationId}'.`);
      }

      const updated: AccessGrantRecord = {
        ...grant,
        latestOutstandingCredentialExpiresAt: laterExpiry(grant.latestOutstandingCredentialExpiresAt, input.expiresAt),
      };
      grants.set(grant.id, updated);
      return updated;
    },

    async health(): Promise<AccessGrantStoreHealth> {
      return {
        status: closed ? 'unhealthy' : 'healthy',
        readable: !closed,
        writable: !closed,
        schemaVersion: ACCESS_GRANT_STORE_SCHEMA_VERSION,
        checkedAt: now(),
      };
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}

// Re-exported so callers that only import the in-memory module (e.g. tests)
// still have the tenant helpers available without a second import.
export { canAccessAccessGrantOrganization, requireAccessGrantTenantScope };
