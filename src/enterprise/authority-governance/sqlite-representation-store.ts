import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { GovernedRepresentativeAuthority, GovernedRepresentativeBasis, GovernedRepresentativeScopeLimit } from '@aoc-enterprise/governed-authority';
import { isGovernedRightType, type GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { AuthorityGovernanceError } from './errors.js';
import { requireAuthorityAccessToOrganization, requireStrictUtcAuthorityTimestamp } from './authority-store.js';
import { GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION } from './in-memory-representation-store.js';
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

export interface CreateSqliteGovernedRepresentationStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
  /** Required only by deployments grounding representations in Authority Graph delegations. Absent, such a basis is refused at creation and withdrawn at evaluation. */
  readonly delegations?: GovernedRepresentationDelegationPort;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.governed-representation-store.schema.v1`). One current-state
// table plus the version row — the same shape every other durable store in
// AOC Enterprise persists, and deliberately *not* an append-only log beside a
// projection: a representation is governance configuration rather than a
// history of movements, and there is nothing here to conserve.
//
// Durable invariants pushed down to the database, so they hold even against a
// second writer this process never sees:
//
//  - `UNIQUE (tenant_id, idempotency_key)` -> one grant per key per tenant. A
//    retried grant collides rather than creating a second binding, and the
//    constraint holds across processes where an in-memory replay map would
//    not. Nullable, and SQLite treats NULLs as distinct, so unkeyed grants
//    coexist freely while keyed ones cannot duplicate.
//  - `CHECK (holder_ref <> representative_ref)` -> a self-representation is
//    unrepresentable in the database, not merely refused by the code above it.
//    This is the invariant that keeps "X represents X" from ever becoming a
//    row somebody could point at.
//  - `CHECK (delegation_depth >= 0)` and the `parent_representation_id`
//    self-foreign-key -> a redelegation cannot outlive its parent's existence,
//    and `ON DELETE RESTRICT` means no parent can be removed out from under a
//    child. (Nothing deletes today; the constraint is what keeps that true.)
//  - `CHECK (scope_limit_kind IN ('bounded','unbounded'))` plus the paired
//    quantity columns -> a ceiling is one of exactly two shapes, and a
//    half-written ceiling is not a representable row.
//
// The lookup index is `(tenant_id, representative_ref, holder_ref,
// resource_kind, resource_id)` — the enforcement path's only query, and the
// reason the holder binding cannot be bypassed: the holder is part of the key
// rather than a field filtered afterwards.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS governed_representation_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS governed_representations (
    representation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    holder_ref TEXT NOT NULL,
    representative_ref TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    governed_rights_json TEXT NOT NULL,
    scope_limit_kind TEXT NOT NULL,
    scope_limit_scope_kind TEXT,
    scope_limit_basis_points INTEGER,
    scope_limit_units INTEGER,
    scope_limit_unit_denomination TEXT,
    actions_json TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    expires_at TEXT,
    can_redelegate INTEGER NOT NULL,
    delegation_depth INTEGER NOT NULL,
    parent_representation_id TEXT,
    basis_kind TEXT NOT NULL,
    basis_json TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    correlation_id TEXT,
    idempotency_key TEXT,
    representation_digest TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    UNIQUE (tenant_id, idempotency_key),
    CHECK (holder_ref <> representative_ref),
    CHECK (delegation_depth >= 0),
    CHECK (can_redelegate IN (0, 1)),
    CHECK (scope_limit_kind IN ('bounded', 'unbounded')),
    CHECK (scope_limit_basis_points IS NULL OR scope_limit_basis_points > 0),
    CHECK (scope_limit_units IS NULL OR scope_limit_units > 0),
    FOREIGN KEY (parent_representation_id) REFERENCES governed_representations(representation_id) ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS idx_governed_representations_binding
    ON governed_representations(tenant_id, representative_ref, holder_ref, resource_kind, resource_id);
`;

interface RepresentationRow {
  readonly representation_id: string;
  readonly tenant_id: string;
  readonly holder_ref: string;
  readonly representative_ref: string;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly governed_rights_json: string;
  readonly scope_limit_kind: string;
  readonly scope_limit_scope_kind: string | null;
  readonly scope_limit_basis_points: number | null;
  readonly scope_limit_units: number | null;
  readonly scope_limit_unit_denomination: string | null;
  readonly actions_json: string;
  readonly effective_from: string;
  readonly expires_at: string | null;
  readonly can_redelegate: number;
  readonly delegation_depth: number;
  readonly parent_representation_id: string | null;
  readonly basis_kind: string;
  readonly basis_json: string;
  readonly revoked_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly correlation_id: string | null;
  readonly representation_digest: string;
}

function corrupted(message: string, details?: Readonly<Record<string, unknown>>): AuthorityGovernanceError {
  return new AuthorityGovernanceError('GOVERNED_REPRESENTATION_RECORD_CORRUPTED', message, details);
}

/** Reads a stored string array back, failing closed on anything that is not a non-empty array of non-empty strings. A row AOC cannot read is never reconstructed into a recognized representation. */
function readStringArray(json: string, recordId: string, field: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw corrupted(`Stored governed representation '${recordId}' has an unreadable ${field} column.`, { representativeAuthorityId: recordId });
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw corrupted(`Stored governed representation '${recordId}' has a malformed ${field} column.`, { representativeAuthorityId: recordId });
  }
  return parsed as readonly string[];
}

function readGovernedRights(json: string, recordId: string): readonly GovernedRightType[] {
  const values = readStringArray(json, recordId, 'governed_rights_json');
  for (const value of values) {
    if (!isGovernedRightType(value)) {
      throw corrupted(`Stored governed representation '${recordId}' names an unknown governed right '${value}'.`, { representativeAuthorityId: recordId });
    }
  }
  return values as readonly GovernedRightType[];
}

function readScopeLimit(row: RepresentationRow): GovernedRepresentativeScopeLimit {
  if (row.scope_limit_kind === 'unbounded') return { kind: 'unbounded' };
  if (row.scope_limit_kind !== 'bounded') {
    throw corrupted(`Stored governed representation '${row.representation_id}' has an unknown scope limit kind '${row.scope_limit_kind}'.`, {
      representativeAuthorityId: row.representation_id,
    });
  }
  if (row.scope_limit_scope_kind === 'proportional') {
    if (row.scope_limit_basis_points === null || !Number.isSafeInteger(row.scope_limit_basis_points) || row.scope_limit_basis_points <= 0) {
      throw corrupted(`Stored governed representation '${row.representation_id}' has a malformed proportional ceiling.`, {
        representativeAuthorityId: row.representation_id,
      });
    }
    return { kind: 'bounded', maximum: { kind: 'proportional', basisPoints: row.scope_limit_basis_points } };
  }
  if (row.scope_limit_scope_kind === 'unitized') {
    if (
      row.scope_limit_units === null ||
      !Number.isSafeInteger(row.scope_limit_units) ||
      row.scope_limit_units <= 0 ||
      row.scope_limit_unit_denomination === null ||
      row.scope_limit_unit_denomination.length === 0
    ) {
      throw corrupted(`Stored governed representation '${row.representation_id}' has a malformed unitized ceiling.`, {
        representativeAuthorityId: row.representation_id,
      });
    }
    return { kind: 'bounded', maximum: { kind: 'unitized', units: row.scope_limit_units, unitDenomination: row.scope_limit_unit_denomination } };
  }
  throw corrupted(`Stored governed representation '${row.representation_id}' has an unknown ceiling scope kind.`, {
    representativeAuthorityId: row.representation_id,
  });
}

/** Projects a ceiling onto its five columns. Exactly one shape is populated; the rest stay NULL so a half-written ceiling is unrepresentable. */
function writeScopeLimitColumns(scopeLimit: GovernedRepresentativeScopeLimit): {
  scope_limit_kind: string;
  scope_limit_scope_kind: string | null;
  scope_limit_basis_points: number | null;
  scope_limit_units: number | null;
  scope_limit_unit_denomination: string | null;
} {
  if (scopeLimit.kind === 'unbounded') {
    return {
      scope_limit_kind: 'unbounded',
      scope_limit_scope_kind: null,
      scope_limit_basis_points: null,
      scope_limit_units: null,
      scope_limit_unit_denomination: null,
    };
  }
  return scopeLimit.maximum.kind === 'proportional'
    ? {
        scope_limit_kind: 'bounded',
        scope_limit_scope_kind: 'proportional',
        scope_limit_basis_points: scopeLimit.maximum.basisPoints,
        scope_limit_units: null,
        scope_limit_unit_denomination: null,
      }
    : {
        scope_limit_kind: 'bounded',
        scope_limit_scope_kind: 'unitized',
        scope_limit_basis_points: null,
        scope_limit_units: scopeLimit.maximum.units,
        scope_limit_unit_denomination: scopeLimit.maximum.unitDenomination,
      };
}

const KNOWN_BASIS_KINDS: ReadonlySet<string> = new Set([
  'administrative-bootstrap',
  'authority-graph-delegation',
  'recognized-external-representation',
  'representative-redelegation',
]);

function readBasis(row: RepresentationRow): GovernedRepresentativeBasis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.basis_json);
  } catch {
    throw corrupted(`Stored governed representation '${row.representation_id}' has an unreadable basis column.`, {
      representativeAuthorityId: row.representation_id,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw corrupted(`Stored governed representation '${row.representation_id}' has a malformed basis.`, { representativeAuthorityId: row.representation_id });
  }
  const basis = parsed as GovernedRepresentativeBasis;
  if (basis.kind !== row.basis_kind) {
    throw corrupted(`Stored governed representation '${row.representation_id}' disagrees with its own basis kind column.`, {
      representativeAuthorityId: row.representation_id,
    });
  }
  if (!KNOWN_BASIS_KINDS.has(basis.kind)) {
    throw corrupted(`Stored governed representation '${row.representation_id}' names an unknown basis kind.`, { representativeAuthorityId: row.representation_id });
  }
  return basis;
}

function toRepresentation(row: RepresentationRow): GovernedRepresentativeAuthority {
  return assertRepresentationIntegrity({
    id: row.representation_id,
    tenantId: row.tenant_id,
    holderRef: row.holder_ref,
    representativeRef: row.representative_ref,
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    governedRights: readGovernedRights(row.governed_rights_json, row.representation_id),
    scopeLimit: readScopeLimit(row),
    actions: readStringArray(row.actions_json, row.representation_id, 'actions_json'),
    effectiveFrom: row.effective_from,
    ...(row.expires_at !== null ? { expiresAt: row.expires_at } : {}),
    canRedelegate: row.can_redelegate === 1,
    delegationDepth: row.delegation_depth,
    ...(row.parent_representation_id !== null ? { parentRepresentativeAuthorityId: row.parent_representation_id } : {}),
    basis: readBasis(row),
    ...(row.revoked_at !== null ? { revokedAt: row.revoked_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    digest: row.representation_digest,
  });
}

function resolveOnDisk(dbPath: string): string {
  const absolute = resolve(dbPath);
  const directory = dirname(absolute);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  return absolute;
}

function resolveBusyTimeoutMs(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_BUSY_TIMEOUT_MS;
}

/**
 * SQLite-backed `GovernedRepresentationStore`, `better-sqlite3` loaded lazily,
 * hand-written SQL — mirroring `createSqliteGovernedAuthorityStore` in
 * pragmas, schema-version guarding and transaction discipline, so a reviewer
 * who has read one has read both.
 *
 * Every mutating call runs inside one synchronous `db.transaction(...)`. The
 * race that matters here is not conservation but *containment*: a redelegation
 * validating against a parent that a concurrent revocation is withdrawing must
 * not be able to observe the parent as live and commit after it is not.
 * Reading the parent and inserting the child in one synchronous transaction
 * makes that interleaving impossible in-process, and the `UNIQUE` and
 * `FOREIGN KEY` constraints serialize cross-process writers.
 *
 * The delegation-port lookup is deliberately performed *before* the
 * transaction opens: it may be asynchronous, and holding a SQLite write
 * transaction across an `await` is exactly how a busy-timeout stall becomes a
 * lock held for the duration of a network call.
 */
export async function createSqliteGovernedRepresentationStore(
  dbPath: string,
  options: CreateSqliteGovernedRepresentationStoreOptions = {},
): Promise<GovernedRepresentationStore> {
  const { default: Database } = await import('better-sqlite3');

  const now = options.now ?? (() => new Date().toISOString());
  const delegations = options.delegations;

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma(`busy_timeout = ${resolveBusyTimeoutMs(options.busyTimeoutMs)}`);

  // Fail closed on a database written by a different schema version, before
  // any DDL runs — never silently reuse or migrate a mismatched store.
  const versionTable = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get('governed_representation_store_versions');
  if (versionTable !== undefined) {
    const existingVersion = db.prepare(`SELECT schema_version FROM governed_representation_store_versions ORDER BY id DESC LIMIT 1`).get() as
      | { schema_version: string }
      | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION) {
      db.close();
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_STORE_UNAVAILABLE',
        `Governed Representation Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);
  const recordedVersion = db.prepare(`SELECT schema_version FROM governed_representation_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (recordedVersion === undefined) {
    db.prepare(`INSERT INTO governed_representation_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
      GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION,
      'applied',
      now(),
    );
  }

  const selectById = db.prepare(`SELECT * FROM governed_representations WHERE tenant_id = ? AND representation_id = ?`);
  const selectByIdempotencyKey = db.prepare(`SELECT * FROM governed_representations WHERE tenant_id = ? AND idempotency_key = ?`);
  const selectBinding = db.prepare(
    `SELECT * FROM governed_representations
       WHERE tenant_id = ? AND representative_ref = ? AND holder_ref = ? AND resource_kind = ? AND resource_id = ?
       ORDER BY created_at ASC, representation_id ASC`,
  );
  const insertRepresentation = db.prepare(
    `INSERT INTO governed_representations (
       representation_id, tenant_id, holder_ref, representative_ref, resource_kind, resource_id,
       governed_rights_json, scope_limit_kind, scope_limit_scope_kind, scope_limit_basis_points,
       scope_limit_units, scope_limit_unit_denomination, actions_json, effective_from, expires_at,
       can_redelegate, delegation_depth, parent_representation_id, basis_kind, basis_json,
       revoked_at, created_at, updated_at, correlation_id, idempotency_key, representation_digest, schema_version
     ) VALUES (
       @representation_id, @tenant_id, @holder_ref, @representative_ref, @resource_kind, @resource_id,
       @governed_rights_json, @scope_limit_kind, @scope_limit_scope_kind, @scope_limit_basis_points,
       @scope_limit_units, @scope_limit_unit_denomination, @actions_json, @effective_from, @expires_at,
       @can_redelegate, @delegation_depth, @parent_representation_id, @basis_kind, @basis_json,
       NULL, @created_at, @updated_at, @correlation_id, @idempotency_key, @representation_digest, @schema_version
     )`,
  );
  const updateRevocation = db.prepare(
    `UPDATE governed_representations SET revoked_at = @revoked_at, updated_at = @updated_at, representation_digest = @representation_digest
       WHERE tenant_id = @tenant_id AND representation_id = @representation_id`,
  );

  function readById(tenantId: string, id: string): GovernedRepresentativeAuthority | null {
    const row = selectById.get(tenantId, id) as RepresentationRow | undefined;
    return row === undefined ? null : toRepresentation(row);
  }

  return {
    providerKind: 'sqlite',

    async grantRepresentativeAuthority(
      context: AuthorityGovernanceContext,
      input: GrantRepresentativeAuthorityInput,
    ): Promise<GrantRepresentativeAuthorityOutcome> {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      assertRepresentationBasisShape(input.basis);

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

      // Awaited before the transaction opens: a write lock must never be held
      // across an asynchronous lookup.
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
      const timestamp = requireStrictUtcAuthorityTimestamp(now(), 'createdAt');

      const commit = db.transaction((): GrantRepresentativeAuthorityOutcome => {
        if (input.idempotencyKey !== undefined) {
          const existingRow = selectByIdempotencyKey.get(input.tenantId, input.idempotencyKey) as RepresentationRow | undefined;
          if (existingRow !== undefined) {
            const existing = toRepresentation(existingRow);
            assertRepresentationReplayMatches(existing, replayProjection);
            return { representation: existing, replayed: true };
          }
        }

        // Re-read inside the transaction. The parent read above informed
        // validation; this one is what the insert is actually consistent with,
        // so a concurrent revocation cannot slip between the two.
        if (parent !== null) {
          const current = readById(input.tenantId, parent.id);
          if (current === null || current.revokedAt !== undefined) {
            throw new AuthorityGovernanceError(
              'GOVERNED_REPRESENTATION_BASIS_INVALID',
              `Representation '${parent.id}' was withdrawn before this redelegation could be recorded.`,
              { parentId: parent.id },
            );
          }
          assertRedelegationContained(current, {
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

        const id =
          input.id ??
          deriveRepresentationId({
            tenantId: input.tenantId,
            holderRef,
            representativeRef: input.representativeRef,
            resourceKind: resource.kind,
            resourceId: resource.id,
            discriminator:
              input.idempotencyKey ??
              `ordinal:${((db.prepare(`SELECT COUNT(*) AS total FROM governed_representations WHERE tenant_id = ?`).get(input.tenantId) as { total: number }).total + 1).toString()}`,
          });

        if (readById(input.tenantId, id) !== null) {
          throw new AuthorityGovernanceError('GOVERNED_REPRESENTATION_CONFLICT', `Representation '${id}' already exists.`, { representativeAuthorityId: id });
        }

        const draft: Omit<GovernedRepresentativeAuthority, 'digest'> = {
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
        };

        insertRepresentation.run({
          representation_id: draft.id,
          tenant_id: draft.tenantId,
          holder_ref: draft.holderRef,
          representative_ref: draft.representativeRef,
          resource_kind: draft.resourceKind,
          resource_id: draft.resourceId,
          governed_rights_json: JSON.stringify(draft.governedRights),
          ...writeScopeLimitColumns(draft.scopeLimit),
          actions_json: JSON.stringify(draft.actions),
          effective_from: draft.effectiveFrom,
          expires_at: draft.expiresAt ?? null,
          can_redelegate: draft.canRedelegate ? 1 : 0,
          delegation_depth: draft.delegationDepth,
          parent_representation_id: draft.parentRepresentativeAuthorityId ?? null,
          basis_kind: draft.basis.kind,
          basis_json: JSON.stringify(draft.basis),
          created_at: draft.createdAt,
          updated_at: draft.updatedAt,
          correlation_id: draft.correlationId ?? null,
          idempotency_key: input.idempotencyKey ?? null,
          representation_digest: computeRepresentationDigest(draft),
          schema_version: GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION,
        });

        const stored = readById(input.tenantId, draft.id);
        if (stored === null) throw corrupted(`Governed representation '${draft.id}' could not be read back immediately after insertion.`);
        return { representation: stored, replayed: false };
      });

      return commit();
    },

    async revokeRepresentativeAuthority(context, tenantId, representativeAuthorityId) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const timestamp = requireStrictUtcAuthorityTimestamp(now(), 'revokedAt');

      const commit = db.transaction((): GovernedRepresentativeAuthority => {
        const existing = readById(tenantId, representativeAuthorityId);
        if (existing === null) {
          throw new AuthorityGovernanceError(
            'GOVERNED_REPRESENTATION_NOT_FOUND',
            `Representation '${representativeAuthorityId}' does not exist in tenant '${tenantId}'.`,
          );
        }
        const parent = existing.parentRepresentativeAuthorityId === undefined ? null : readById(tenantId, existing.parentRepresentativeAuthorityId);
        assertMayRevokeRepresentation(context, existing, parent);

        // Idempotent, and deliberately not a re-stamp: moving `revokedAt` on a
        // retry would rewrite *when* the withdrawal happened.
        if (existing.revokedAt !== undefined) return existing;

        const { digest: _digest, ...rest } = existing;
        const revoked: Omit<GovernedRepresentativeAuthority, 'digest'> = { ...rest, revokedAt: timestamp, updatedAt: timestamp };
        updateRevocation.run({
          tenant_id: tenantId,
          representation_id: representativeAuthorityId,
          revoked_at: timestamp,
          updated_at: timestamp,
          representation_digest: computeRepresentationDigest(revoked),
        });
        const stored = readById(tenantId, representativeAuthorityId);
        if (stored === null) throw corrupted(`Governed representation '${representativeAuthorityId}' could not be read back after withdrawal.`);
        return stored;
      });

      return commit();
    },

    async getRepresentativeAuthority(context, tenantId, representativeAuthorityId) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return readById(tenantId, representativeAuthorityId);
    },

    async listRepresentativeAuthorities(
      context: AuthorityGovernanceContext,
      tenantId: string,
      representativeRef: string,
      holderRef: string,
      resource: GovernedAuthorityResourceRef,
    ) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return (selectBinding.all(tenantId, representativeRef, holderRef, resource.kind, resource.id) as RepresentationRow[]).map(toRepresentation);
    },

    async health() {
      const representationCount = (db.prepare(`SELECT COUNT(*) AS total FROM governed_representations`).get() as { total: number }).total;
      return { providerKind: 'sqlite' as const, available: db.open, schemaVersion: GOVERNED_REPRESENTATION_STORE_SCHEMA_VERSION, representationCount };
    },

    async close() {
      db.close();
    },
  };
}
