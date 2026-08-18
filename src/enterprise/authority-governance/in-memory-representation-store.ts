import type { GovernedRepresentativeAuthority } from '@aoc-enterprise/governed-authority';

import { AuthorityGovernanceError } from './errors.js';
import { requireAuthorityAccessToOrganization, requireStrictUtcAuthorityTimestamp } from './authority-store.js';
import {
  assertDistinctRepresentative,
  assertMayGrantRepresentation,
  assertMayRevokeRepresentation,
  assertRedelegationContained,
  assertRepresentationBasisShape,
  assertRepresentationIntegrity,
  assertRepresentationReplayMatches,
  assertRepresentativeScopeLimit,
  assertRepresentedActions,
  assertRepresentedRights,
  computeRepresentationDigest,
  delegationCorroborates,
  deriveRepresentationId,
  projectRepresentationInputForReplay,
} from './representation-lifecycle.js';
import type { GovernedRepresentationStore } from './representation-store.js';
import type {
  GovernedRepresentationDelegationPort,
  GrantRepresentativeAuthorityInput,
  GrantRepresentativeAuthorityOutcome,
} from './representation-contracts.js';
import type { AuthorityGovernanceContext, GovernedAuthorityResourceRef } from './contracts.js';

/** Bumped whenever the durable shape changes. The SQLite store refuses to open a database written under a different value; this constant is the single place both stores agree on it. */
export const GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION = 'aoc.governed-representation-store.schema.v1';

export interface CreateInMemoryGovernedRepresentationStoreOptions {
  readonly now?: () => string;
  /** Required only by deployments that ground representations in Authority Graph delegations. Absent, an `authority-graph-delegation` basis is refused rather than trusted. */
  readonly delegations?: GovernedRepresentationDelegationPort;
}

function bindingKey(tenantId: string, representativeRef: string, holderRef: string, resource: GovernedAuthorityResourceRef): string {
  return [tenantId, representativeRef, holderRef, resource.kind, resource.id].map((part) => `${part.length}:${part}`).join('|');
}

/**
 * In-memory `GovernedRepresentationStore`. The reference implementation of the
 * behavioural contract `sqlite-representation-store.ts` must match exactly —
 * identical validation, identical refusals, identical error codes, identical
 * digests — so one suite runs against both and a passing test double actually
 * proves something about the durable store.
 *
 * Not a cache and never a fallback for a failed durable store. A deployment
 * that silently degraded to this one would forget who may act for whom, which
 * fails *open* on exactly the question this layer exists to close.
 *
 * Every mutating method is a single synchronous critical section — every check
 * and every write with no `await` between them — mirroring what
 * better-sqlite3's synchronous transactions give the durable store, so a
 * concurrent redelegation cannot observe a parent that a concurrent revocation
 * is in the middle of withdrawing. The one deliberate exception is the
 * delegation-port lookup during validation, which is awaited *before* the
 * critical section begins.
 */
export function createInMemoryGovernedRepresentationStore(
  options: CreateInMemoryGovernedRepresentationStoreOptions = {},
): GovernedRepresentationStore {
  const now = options.now ?? (() => new Date().toISOString());
  const delegations = options.delegations;

  const byId = new Map<string, GovernedRepresentativeAuthority>();
  const byBinding = new Map<string, string[]>();
  const byIdempotencyKey = new Map<string, string>();
  let ordinal = 0;

  function readById(tenantId: string, id: string): GovernedRepresentativeAuthority | null {
    const found = byId.get(id);
    if (found === undefined || found.tenantId !== tenantId) return null;
    return assertRepresentationIntegrity(found);
  }

  function seal(draft: Omit<GovernedRepresentativeAuthority, 'digest'>): GovernedRepresentativeAuthority {
    const sealed: GovernedRepresentativeAuthority = { ...draft, digest: computeRepresentationDigest(draft) };
    byId.set(sealed.id, sealed);
    return sealed;
  }

  return {
    providerKind: 'memory',

    async grantRepresentativeAuthority(
      context: AuthorityGovernanceContext,
      input: GrantRepresentativeAuthorityInput,
    ): Promise<GrantRepresentativeAuthorityOutcome> {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      assertRepresentationBasisShape(input.basis);

      // The parent is resolved first: a redelegation's holder and resource are
      // *copied* from it rather than taken from the input, which is what makes
      // holder laundering unrepresentable rather than merely refused.
      const parent =
        input.basis.kind === 'representative-redelegation' ? readById(input.tenantId, input.basis.parentRepresentativeAuthorityId) : null;
      if (input.basis.kind === 'representative-redelegation' && parent === null) {
        throw new AuthorityGovernanceError(
          'GOVERNED_REPRESENTATION_BASIS_INVALID',
          `Representation '${input.basis.parentRepresentativeAuthorityId}' does not exist in tenant '${input.tenantId}'.`,
        );
      }

      assertMayGrantRepresentation(context, input.basis, parent);

      const holderRef = parent?.holderRef ?? input.holderRef;
      const resource = parent === null ? input.resource : { kind: parent.resourceKind, id: parent.resourceId };
      if (holderRef === undefined || holderRef.length === 0) {
        throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_INVALID', 'A representation must name the holder whose authority it permits exercising.');
      }
      if (resource === undefined) {
        throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_INVALID', 'A representation must name the resource it applies to.');
      }

      assertDistinctRepresentative(holderRef, input.representativeRef);
      const governedRights = assertRepresentedRights(input.governedRights);
      const actions = assertRepresentedActions(input.actions);
      const scopeLimit = assertRepresentativeScopeLimit(input.scopeLimit);
      const effectiveFrom = requireStrictUtcAuthorityTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = input.expiresAt === undefined ? undefined : requireStrictUtcAuthorityTimestamp(input.expiresAt, 'expiresAt');

      if (input.basis.kind === 'authority-graph-delegation') {
        if (delegations === undefined) {
          throw new AuthorityGovernanceError(
            'GOVERNED_REPRESENTATION_BASIS_INVALID',
            "An 'authority-graph-delegation' basis requires a delegation lookup; a basis nothing can corroborate is not evidence.",
          );
        }
        const record = await delegations.getDelegationGrant(input.basis.delegationGrantId);
        if (!delegationCorroborates(record, { representativeRef: input.representativeRef, holderRef, trustDomainId: input.basis.trustDomainId })) {
          throw new AuthorityGovernanceError(
            'GOVERNED_REPRESENTATION_BASIS_INVALID',
            `Delegation grant '${input.basis.delegationGrantId}' does not corroborate that '${input.representativeRef}' may act for '${holderRef}': it must be active, in trust domain '${input.basis.trustDomainId}', delegated to the representative, and held for that principal.`,
            { delegationGrantId: input.basis.delegationGrantId },
          );
        }
      }

      if (parent !== null) {
        assertRedelegationContained(parent, {
          holderRef,
          resourceKind: resource.kind,
          resourceId: resource.id,
          governedRights,
          actions,
          scopeLimit,
          effectiveFrom,
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        });
      }

      const replayProjection = projectRepresentationInputForReplay({
        holderRef,
        representativeRef: input.representativeRef,
        resourceKind: resource.kind,
        resourceId: resource.id,
        governedRights,
        actions,
        scopeLimit,
        effectiveFrom,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });

      const idempotencyScope = input.idempotencyKey === undefined ? undefined : `${input.tenantId}::${input.idempotencyKey}`;
      if (idempotencyScope !== undefined) {
        const existingId = byIdempotencyKey.get(idempotencyScope);
        if (existingId !== undefined) {
          const existing = readById(input.tenantId, existingId);
          if (existing !== null) {
            assertRepresentationReplayMatches(existing, replayProjection);
            return { representation: existing, replayed: true };
          }
        }
      }

      ordinal += 1;
      const timestamp = now();
      const id =
        input.id ??
        deriveRepresentationId({
          tenantId: input.tenantId,
          holderRef,
          representativeRef: input.representativeRef,
          resourceKind: resource.kind,
          resourceId: resource.id,
          discriminator: input.idempotencyKey ?? `ordinal:${ordinal}`,
        });

      if (byId.has(id)) {
        throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_CONFLICT', `Representation '${id}' already exists.`, { representativeAuthorityId: id });
      }

      const representation = seal({
        id,
        tenantId: input.tenantId,
        holderRef,
        representativeRef: input.representativeRef,
        resourceKind: resource.kind,
        resourceId: resource.id,
        governedRights: [...governedRights],
        scopeLimit,
        actions: [...actions],
        effectiveFrom,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        canRedelegate: input.canRedelegate ?? false,
        delegationDepth: parent === null ? 0 : parent.delegationDepth + 1,
        ...(parent !== null ? { parentRepresentativeAuthorityId: parent.id } : {}),
        basis: input.basis,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      });

      const key = bindingKey(input.tenantId, representation.representativeRef, representation.holderRef, resource);
      byBinding.set(key, [...(byBinding.get(key) ?? []), representation.id]);
      if (idempotencyScope !== undefined) byIdempotencyKey.set(idempotencyScope, representation.id);

      return { representation, replayed: false };
    },

    async revokeRepresentativeAuthority(context, tenantId, representativeAuthorityId) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const existing = readById(tenantId, representativeAuthorityId);
      if (existing === null) {
        throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_NOT_FOUND', `Representation '${representativeAuthorityId}' does not exist in tenant '${tenantId}'.`);
      }
      const parent =
        existing.parentRepresentativeAuthorityId === undefined ? null : readById(tenantId, existing.parentRepresentativeAuthorityId);
      assertMayRevokeRepresentation(context, existing, parent);

      // Idempotent, and deliberately not a no-op that re-stamps: moving
      // `revokedAt` on a retry would rewrite *when* the withdrawal happened,
      // which is the one fact an audit of a revocation turns on.
      if (existing.revokedAt !== undefined) return existing;

      const timestamp = now();
      const { digest: _digest, ...rest } = existing;
      return seal({ ...rest, revokedAt: timestamp, updatedAt: timestamp });
    },

    async getRepresentativeAuthority(context, tenantId, representativeAuthorityId) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return readById(tenantId, representativeAuthorityId);
    },

    async listRepresentativeAuthorities(context, tenantId, representativeRef, holderRef, resource) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const ids = byBinding.get(bindingKey(tenantId, representativeRef, holderRef, resource)) ?? [];
      return ids
        .map((id) => readById(tenantId, id))
        .filter((record): record is GovernedRepresentativeAuthority => record !== null)
        .sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)));
    },

    async health() {
      return {
        providerKind: 'memory',
        available: true,
        schemaVersion: GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION,
        representationCount: byId.size,
      };
    },

    async close() {
      byId.clear();
      byBinding.clear();
      byIdempotencyKey.clear();
    },
  };
}
