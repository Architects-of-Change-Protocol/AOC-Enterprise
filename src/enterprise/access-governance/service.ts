import { validateEnterpriseAccessGrant, ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION } from '@aoc-enterprise/access-grant';
import { validateEnterpriseGrantRevocation, ENTERPRISE_GRANT_REVOCATION_REASONS, ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION } from '@aoc-enterprise/grant-revocation';
import type { EnterpriseGrantRevocationReason } from '@aoc-enterprise/grant-revocation';
import type { PinataProviderClient } from '@aoc-enterprise/pinata-adapter';
import { PINATA_PROVIDER_SYSTEM, executePinataProviderTranslation } from '@aoc-enterprise/pinata-adapter';
import { ENTERPRISE_PROVIDER_CAPABILITIES } from '@aoc-enterprise/provider-adapter';
import { ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS, ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION } from '@aoc-enterprise/provider-translation';

import { AccessGovernanceError } from './errors.js';
import { assertActive } from './lifecycle.js';
import { requireStrictUtcTimestamp } from './access-grant-store.js';
import type { AccessGrantStore } from './access-grant-store.js';
import { determineAndExecutePinataEnforcement, unknownProviderEnforcement } from './pinata-revocation-enforcement.js';
import type {
  AccessGovernanceContext,
  AccessGrantProviderEnforcementResult,
  AccessGrantRecord,
  AccessGrantResource,
  RevokeOutcome,
} from './contracts.js';

const REVOCATION_REASONS: readonly string[] = Object.values(ENTERPRISE_GRANT_REVOCATION_REASONS);

export interface AccessGrantServiceDependencies {
  readonly store: AccessGrantStore;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
  /** Real (or fake, in tests) Pinata client. Absent means "no live provider configured" — enforcement against Pinata-targeted grants then truthfully reports `providerActionResult: 'failed'`/`'skipped'`, never a faked success. */
  readonly pinataClient?: PinataProviderClient;
}

export interface IssueAccessGrantRequest {
  readonly id?: string;
  readonly resource: AccessGrantResource;
  readonly principalId: string;
  readonly decisionRef: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId?: string;
  readonly issuerRef?: string;
  readonly providerSystem?: string;
  /** The provider's content identifier (e.g. a Pinata CID) — see GAP-012 in `contracts.ts`. */
  readonly providerCid?: string;
  /** The provider's own internal file/record identifier — distinct from `providerCid`. */
  readonly providerFileId?: string;
}

export interface RevokeAccessGrantRequest {
  readonly grantId: string;
  readonly reason: EnterpriseGrantRevocationReason;
  /** Who/what requested this revocation — becomes `EnterpriseGrantRevocation.issuerRef`. */
  readonly requestedBy: string;
  readonly description?: string;
  readonly evidenceRefs?: readonly string[];
  readonly correlationId?: string;
  readonly revokedAt?: string;
}

export interface RequestProviderCredentialInput {
  readonly grantId: string;
  readonly requestedDurationSeconds: number;
  readonly correlationId?: string;
}

export interface ProviderCredential {
  readonly accessUrl: string;
  readonly expiresAt: string;
}

export interface AccessGrantService {
  issueGrant(context: AccessGovernanceContext, organizationId: string, request: IssueAccessGrantRequest): Promise<AccessGrantRecord>;
  getGrant(context: AccessGovernanceContext, grantId: string): Promise<AccessGrantRecord>;

  /**
   * The single authoritative revocation orchestration path (Slice 1).
   * Requires an already-authenticated/authorized `context` — this function
   * itself performs only tenant/trust-domain ownership validation (step 3
   * of the Slice 1 ordering); raw bearer-token authentication (step 1)
   * happens once, before this is ever called, in
   * `orchestration.ts`'s `revokeGrantRequest` (mirrors how
   * `../orchestration/evaluate-governance-request.ts` separates
   * `authenticateAndAuthorize` from the Governance Store write it guards).
   */
  revokeGrant(context: AccessGovernanceContext, request: RevokeAccessGrantRequest): Promise<RevokeOutcome>;

  /**
   * Requests a new, time-bounded provider credential (e.g. a Pinata signed
   * access link) under an existing grant. Denied outright
   * (`ACCESS_GRANT_NOT_ACTIVE`) for any grant that is not `'active'` —
   * this is the concrete mechanism behind "revocation MUST immediately stop
   * issuance of NEW URLs" (Slice 1 Test C).
   */
  requestProviderCredential(context: AccessGovernanceContext, input: RequestProviderCredentialInput): Promise<ProviderCredential>;
}

function candidateAccessGrant(grant: AccessGrantRecord) {
  return {
    schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
    id: grant.id,
    status: grant.status,
    resource: grant.resource,
    decisionRef: grant.decisionRef,
    principalId: grant.principalId,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    correlationId: grant.correlationId,
    ...(grant.issuerRef !== undefined ? { issuerRef: grant.issuerRef } : {}),
  };
}

export function createAccessGrantService(deps: AccessGrantServiceDependencies): AccessGrantService {
  const { store, now, nextId } = deps;

  return {
    async issueGrant(context, organizationId, request) {
      const id = request.id ?? nextId('access-grant');
      const correlationId = request.correlationId ?? nextId('access-grant-correlation');
      const issuedAt = requireStrictUtcTimestamp(request.issuedAt, 'issuedAt');
      const expiresAt = requireStrictUtcTimestamp(request.expiresAt, 'expiresAt');

      const candidate = {
        schemaVersion: ENTERPRISE_ACCESS_GRANT_SCHEMA_VERSION,
        id,
        status: 'active' as const,
        resource: request.resource,
        decisionRef: request.decisionRef,
        principalId: request.principalId,
        issuedAt,
        expiresAt,
        correlationId,
        ...(request.issuerRef !== undefined ? { issuerRef: request.issuerRef } : {}),
      };
      const validation = validateEnterpriseAccessGrant(candidate);
      if (!validation.valid) {
        throw new AccessGovernanceError(
          'ACCESS_GRANT_VALIDATION_ERROR',
          `Access Grant candidate failed canonical validation: ${validation.errors.map((e) => e.code).join(', ')}`,
          { issues: validation.errors },
        );
      }

      return store.issueGrant(context, {
        id,
        organizationId,
        resource: request.resource,
        principalId: request.principalId,
        decisionRef: request.decisionRef,
        issuedAt,
        expiresAt,
        correlationId,
        ...(request.issuerRef !== undefined ? { issuerRef: request.issuerRef } : {}),
        ...(request.providerSystem !== undefined ? { providerSystem: request.providerSystem } : {}),
        ...(request.providerCid !== undefined ? { providerCid: request.providerCid } : {}),
        ...(request.providerFileId !== undefined ? { providerFileId: request.providerFileId } : {}),
      });
    },

    async getGrant(context, grantId) {
      return store.getGrant(context, grantId);
    },

    async revokeGrant(context, request) {
      // Step 3 (tenant/trust-domain ownership) is enforced by `store.getGrant`
      // itself (`requireAccessGrantAccessToOrganization`) — a cross-tenant
      // caller never even learns whether the grant exists (Slice 1 Test F).
      const grant = await store.getGrant(context, request.grantId);

      if (!REVOCATION_REASONS.includes(request.reason)) {
        throw new AccessGovernanceError('ACCESS_GRANT_VALIDATION_ERROR', `reason must be one of: ${REVOCATION_REASONS.join(', ')}.`);
      }

      const revocationId = nextId('access-grant-revocation');
      const correlationId = request.correlationId ?? grant.correlationId;
      const revokedAt = requireStrictUtcTimestamp(request.revokedAt ?? now(), 'revokedAt');

      const revocationCandidate = {
        schemaVersion: ENTERPRISE_GRANT_REVOCATION_SCHEMA_VERSION,
        id: revocationId,
        grantRef: grant.id,
        revokedAt,
        reason: request.reason,
        issuerRef: request.requestedBy,
        correlationId,
        ...(request.description !== undefined ? { description: request.description } : {}),
        ...(request.evidenceRefs !== undefined ? { evidenceRefs: request.evidenceRefs } : {}),
      };
      const validation = validateEnterpriseGrantRevocation(revocationCandidate);
      if (!validation.valid) {
        throw new AccessGovernanceError(
          'ACCESS_GRANT_VALIDATION_ERROR',
          `Grant Revocation candidate failed canonical validation: ${validation.errors.map((e) => e.code).join(', ')}`,
          { issues: validation.errors },
        );
      }

      // Step 4/5: persist the governance fact of revocation FIRST. Once this
      // resolves, `requestProviderCredential` already denies (grant.status
      // is durably 'revoked') — no provider has been contacted yet.
      const begun = await store.beginRevocation(context, {
        revocationId,
        grantId: grant.id,
        organizationId: grant.organizationId,
        revokedAt,
        reason: request.reason,
        issuerRef: request.requestedBy,
        correlationId,
        ...(request.description !== undefined ? { description: request.description } : {}),
        ...(request.evidenceRefs !== undefined ? { evidenceRefs: request.evidenceRefs } : {}),
      });

      // Idempotent revoke: a grant already revoked (by this call or an
      // earlier one) never re-attempts provider enforcement — the original
      // determination stands (Slice 1: "idempotent revoke").
      if (begun.kind === 'already-revoked') {
        return begun;
      }

      // Steps 6/7/8: inspect provider enforcement capabilities and invoke
      // the appropriate adapter only when genuinely supported.
      let enforcement: AccessGrantProviderEnforcementResult;
      if (begun.grant.providerSystem === PINATA_PROVIDER_SYSTEM) {
        enforcement = await determineAndExecutePinataEnforcement({
          grant: begun.grant,
          reason: request.reason,
          revokedAt,
          correlationId,
          ...(deps.pinataClient !== undefined ? { client: deps.pinataClient } : {}),
          now,
        });
      } else if (begun.grant.providerSystem === undefined) {
        enforcement = unknownProviderEnforcement(revokedAt, now);
      } else {
        enforcement = {
          revocationRequestedAt: now(),
          providerSystem: begun.grant.providerSystem,
          providerActionResult: 'skipped',
          providerActionDetail: `No provider adapter for providerSystem '${begun.grant.providerSystem}' is wired into this Slice; no provider-side enforcement claim can be made.`,
          effectiveRevocationMode: 'unsupported',
          measured: false,
        };
      }

      // Step 9: persist the provider enforcement result.
      const revocation = await store.finalizeRevocationEnforcement(context, {
        grantId: grant.id,
        organizationId: grant.organizationId,
        enforcement,
      });

      return { kind: 'revoked', grant: begun.grant, revocation };
    },

    async requestProviderCredential(context, input) {
      const grant = await store.getGrant(context, input.grantId);
      assertActive(grant.status);

      if (grant.providerSystem !== PINATA_PROVIDER_SYSTEM) {
        throw new AccessGovernanceError('ACCESS_GRANT_PROVIDER_UNSUPPORTED', `No provider adapter for providerSystem '${String(grant.providerSystem)}' is wired into this Slice.`);
      }
      if (deps.pinataClient === undefined) {
        throw new AccessGovernanceError('ACCESS_GRANT_PROVIDER_UNSUPPORTED', 'No live Pinata client is configured.');
      }
      if (grant.providerCid === undefined) {
        throw new AccessGovernanceError('ACCESS_GRANT_VALIDATION_ERROR', `Grant '${grant.id}' has no recorded providerCid; a temporary access credential cannot be requested.`);
      }

      const translatedAt = now();
      const translation = {
        schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
        id: nextId('provider-translation'),
        providerSystem: PINATA_PROVIDER_SYSTEM,
        capability: ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS,
        executionIntent: ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_TEMPORARY_ACCESS,
        grantRef: grant.id,
        resource: { kind: grant.resource.kind, id: grant.providerCid },
        providerMetadata: { requestedDurationSeconds: input.requestedDurationSeconds },
        translatedAt,
        correlationId: input.correlationId ?? grant.correlationId,
      };

      const result = await executePinataProviderTranslation(translation, deps.pinataClient, { now });
      if (result.outcome === 'failed') {
        throw new AccessGovernanceError('ACCESS_GRANT_PROVIDER_UNSUPPORTED', `Pinata rejected the temporary-access request: ${result.message}`);
      }
      if (result.detail.kind !== 'temporary-access') {
        throw new AccessGovernanceError('ACCESS_GRANT_PROVIDER_UNSUPPORTED', `Unexpected Pinata execution detail kind '${result.detail.kind}' for a temporary-access request.`);
      }

      await store.recordProviderCredentialIssuance(context, {
        grantId: grant.id,
        organizationId: grant.organizationId,
        expiresAt: result.detail.expiresAt,
      });

      return { accessUrl: result.detail.accessUrl, expiresAt: result.detail.expiresAt };
    },
  };
}
