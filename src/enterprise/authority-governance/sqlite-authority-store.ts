import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { isGovernedAuthorityIssuanceBasis, type GovernedAuthorityBasis, type GovernedAuthorityPosition, type GovernedAuthorityTransition } from '@aoc-enterprise/governed-authority';
import { isGovernedRightType, serializeGovernedRightsScope, type GovernedRightType, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import { AuthorityGovernanceError } from './errors.js';
import { GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION, assertReplayMatches } from './in-memory-authority-store.js';
import {
  addAuthorityScopes,
  assertBasisMatchesMovement,
  assertDistinctHolders,
  assertKnownGovernedRight,
  assertNonZeroAuthorityScope,
  assertPositionIntegrity,
  assertTransitionIntegrity,
  assertValidAuthorityScope,
  computePositionDigest,
  computeTransitionDigest,
  deriveAuthorityIssuanceTransitionId,
  deriveAuthorityMovementTransitionId,
  deriveAuthorityPositionId,
  subtractAuthorityScope,
} from './lifecycle.js';
import { requireAuthorityAccessToOrganization, requireStrictUtcAuthorityTimestamp, type GovernedAuthorityStore } from './authority-store.js';
import type {
  ApplyGovernedAuthorityTransitionInput,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityResourceRef,
} from './contracts.js';

export interface CreateSqliteGovernedAuthorityStoreOptions {
  readonly now?: () => string;
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Schema (`aoc.governed-authority-store.schema.v1`). One current-state table
// projecting the append-only history beside it, plus the version row — the
// same shape `../transfer-governance/sqlite-mandate-store.ts` and
// `../access-governance/sqlite-access-grant-store.ts` persist.
//
// Durable invariants pushed down to the database, so they hold even against a
// second writer this process never sees:
//
//  - `UNIQUE (tenant_id, actor_ref, resource_kind, resource_id, governed_right)`
//    -> one actor holds at most one position per right per resource. This is
//    what makes "how much does Alice control" have exactly one answer, and it
//    is what stops a concurrent credit from opening a second row instead of
//    summing into the first.
//  - `UNIQUE (tenant_id, execution_ref, governed_right)` -> one execution moves
//    one right at most once. A replayed transfer execution cannot debit twice
//    or credit twice, no matter how it is retried, and the constraint holds
//    across processes where an in-memory replay check would not.
//  - `UNIQUE (tenant_id, sequence)` -> a stable, restart-stable append order
//    per tenant, independent of insertion timing or rowid reuse. The digest
//    chain is built over this order.
//  - `CHECK (scope_basis_points >= 0)` / `CHECK (scope_units >= 0)` -> negative
//    authority is unrepresentable in the database, not merely refused by the
//    code above it. Both columns are nullable because exactly one applies per
//    row, and SQLite's CHECK passes on NULL.
//  - `execution_ref` is nullable: an issuance has no execution behind it, and
//    SQLite treats NULLs as distinct in a UNIQUE index, so many bootstraps
//    coexist while two executions with the same reference cannot.
//
// Positions are stored rather than replayed from transitions on every read,
// because the enforcement path answers a coverage question on every governed
// request and re-deriving a balance per request is a different system. The
// transitions remain the audit chain, and `position_digest` plus the chained
// `transition_digest` make either one's alteration detectable.
// ---------------------------------------------------------------------------
const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS governed_authority_store_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL,
    migration_state TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS governed_authority_positions (
    position_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_ref TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    governed_right TEXT NOT NULL,
    scope_kind TEXT NOT NULL,
    scope_basis_points INTEGER,
    scope_units INTEGER,
    scope_unit_denomination TEXT,
    effective_from TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_transition_ref TEXT NOT NULL,
    position_digest TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    UNIQUE (tenant_id, actor_ref, resource_kind, resource_id, governed_right),
    CHECK (scope_basis_points IS NULL OR scope_basis_points >= 0),
    CHECK (scope_units IS NULL OR scope_units >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_governed_authority_positions_resource
    ON governed_authority_positions(tenant_id, resource_kind, resource_id);

  CREATE TABLE IF NOT EXISTS governed_authority_transitions (
    transition_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    governed_right TEXT NOT NULL,
    scope_kind TEXT NOT NULL,
    scope_basis_points INTEGER,
    scope_units INTEGER,
    scope_unit_denomination TEXT,
    from_actor_ref TEXT,
    to_actor_ref TEXT NOT NULL,
    basis_kind TEXT NOT NULL,
    basis_json TEXT NOT NULL,
    execution_ref TEXT,
    occurred_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    correlation_id TEXT,
    previous_digest TEXT,
    transition_digest TEXT NOT NULL,
    UNIQUE (tenant_id, sequence),
    UNIQUE (tenant_id, execution_ref, governed_right),
    CHECK (scope_basis_points IS NULL OR scope_basis_points >= 0),
    CHECK (scope_units IS NULL OR scope_units >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_governed_authority_transitions_execution
    ON governed_authority_transitions(tenant_id, execution_ref);
  CREATE INDEX IF NOT EXISTS idx_governed_authority_transitions_subject
    ON governed_authority_transitions(tenant_id, resource_kind, resource_id, governed_right);
`;

interface PositionRow {
  readonly position_id: string;
  readonly tenant_id: string;
  readonly actor_ref: string;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly governed_right: string;
  readonly scope_kind: string;
  readonly scope_basis_points: number | null;
  readonly scope_units: number | null;
  readonly scope_unit_denomination: string | null;
  readonly effective_from: string;
  readonly expires_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_transition_ref: string;
  readonly position_digest: string;
}

interface TransitionRow {
  readonly transition_id: string;
  readonly tenant_id: string;
  readonly sequence: number;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly governed_right: string;
  readonly scope_kind: string;
  readonly scope_basis_points: number | null;
  readonly scope_units: number | null;
  readonly scope_unit_denomination: string | null;
  readonly from_actor_ref: string | null;
  readonly to_actor_ref: string;
  readonly basis_kind: string;
  readonly basis_json: string;
  readonly execution_ref: string | null;
  readonly occurred_at: string;
  readonly recorded_at: string;
  readonly correlation_id: string | null;
  readonly previous_digest: string | null;
  readonly transition_digest: string;
}

function corrupted(message: string, details?: Readonly<Record<string, unknown>>): AuthorityGovernanceError {
  return new AuthorityGovernanceError('GOVERNED_AUTHORITY_RECORD_CORRUPTED', message, details);
}

/** Reads a stored scope back from its columns, failing closed on anything that is not one of the two canonical shapes. A row AOC cannot read is never reconstructed into recognized authority. */
function readScopeColumns(
  row: { scope_kind: string; scope_basis_points: number | null; scope_units: number | null; scope_unit_denomination: string | null },
  recordId: string,
): GovernedRightsScope {
  if (row.scope_kind === 'proportional') {
    if (row.scope_basis_points === null || !Number.isSafeInteger(row.scope_basis_points) || row.scope_basis_points < 0) {
      throw corrupted(`Stored governed authority record '${recordId}' has a malformed proportional scope.`, { recordId });
    }
    return { kind: 'proportional', basisPoints: row.scope_basis_points };
  }
  if (row.scope_kind === 'unitized') {
    if (
      row.scope_units === null ||
      !Number.isSafeInteger(row.scope_units) ||
      row.scope_units < 0 ||
      row.scope_unit_denomination === null ||
      row.scope_unit_denomination.length === 0
    ) {
      throw corrupted(`Stored governed authority record '${recordId}' has a malformed unitized scope.`, { recordId });
    }
    return { kind: 'unitized', units: row.scope_units, unitDenomination: row.scope_unit_denomination };
  }
  throw corrupted(`Stored governed authority record '${recordId}' has an unknown scope kind '${row.scope_kind}'.`, { recordId });
}

/** Projects a scope onto its four columns. Exactly one of the two shapes is populated; the other columns stay NULL so a half-written row is unrepresentable. */
function writeScopeColumns(scope: GovernedRightsScope): {
  scope_kind: string;
  scope_basis_points: number | null;
  scope_units: number | null;
  scope_unit_denomination: string | null;
} {
  return scope.kind === 'proportional'
    ? { scope_kind: 'proportional', scope_basis_points: scope.basisPoints, scope_units: null, scope_unit_denomination: null }
    : { scope_kind: 'unitized', scope_basis_points: null, scope_units: scope.units, scope_unit_denomination: scope.unitDenomination };
}

function readGovernedRight(value: string, recordId: string): GovernedRightType {
  if (!isGovernedRightType(value)) {
    throw corrupted(`Stored governed authority record '${recordId}' names an unknown governed right '${value}'.`, { recordId });
  }
  return value;
}

function readBasis(row: TransitionRow): GovernedAuthorityBasis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.basis_json);
  } catch {
    throw corrupted(`Stored governed authority transition '${row.transition_id}' has an unreadable basis column.`, { transitionId: row.transition_id });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw corrupted(`Stored governed authority transition '${row.transition_id}' has a malformed basis.`, { transitionId: row.transition_id });
  }
  const basis = parsed as GovernedAuthorityBasis;
  if (basis.kind !== row.basis_kind) {
    throw corrupted(`Stored governed authority transition '${row.transition_id}' disagrees with its own basis kind column.`, { transitionId: row.transition_id });
  }
  if (basis.kind !== 'administrative-bootstrap' && basis.kind !== 'recognized-external-evidence' && basis.kind !== 'governed-execution') {
    throw corrupted(`Stored governed authority transition '${row.transition_id}' names an unknown basis kind.`, { transitionId: row.transition_id });
  }
  return basis;
}

function toPosition(row: PositionRow): GovernedAuthorityPosition {
  return assertPositionIntegrity({
    id: row.position_id,
    tenantId: row.tenant_id,
    actorRef: row.actor_ref,
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    governedRight: readGovernedRight(row.governed_right, row.position_id),
    scope: readScopeColumns(row, row.position_id),
    effectiveFrom: row.effective_from,
    ...(row.expires_at !== null ? { expiresAt: row.expires_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTransitionRef: row.last_transition_ref,
    digest: row.position_digest,
  });
}

function toTransition(row: TransitionRow): GovernedAuthorityTransition {
  return assertTransitionIntegrity({
    id: row.transition_id,
    tenantId: row.tenant_id,
    sequence: row.sequence,
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    governedRight: readGovernedRight(row.governed_right, row.transition_id),
    scope: readScopeColumns(row, row.transition_id),
    ...(row.from_actor_ref !== null ? { fromActorRef: row.from_actor_ref } : {}),
    toActorRef: row.to_actor_ref,
    basis: readBasis(row),
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    ...(row.previous_digest !== null ? { previousDigest: row.previous_digest } : {}),
    digest: row.transition_digest,
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
 * SQLite-backed `GovernedAuthorityStore`, `better-sqlite3` loaded lazily,
 * hand-written SQL — mirrors `createSqliteTransferMandateStore` and its
 * siblings in pragmas, schema-version guarding and transaction discipline.
 *
 * Concurrency is the property this store exists to get right, because
 * conservation is a concurrency problem before it is anything else. Every
 * mutating call runs entirely inside one synchronous `db.transaction(...)`:
 * better-sqlite3's API is synchronous, so no other in-process caller can
 * interleave between reading a balance and writing the new one, and the
 * `UNIQUE`/`CHECK` constraints documented on `SCHEMA_V1` serialize
 * cross-process writers too. The lost update that would let one 10 000 bp
 * position fund two 6 000 bp movements cannot occur: the second transaction
 * reads the already-debited balance and its debit is refused.
 *
 * This store holds authority state. It never moves a right in the world, never
 * contacts a registry, and never claims legal title — the same boundary every
 * other module in AOC Enterprise keeps.
 */
export async function createSqliteGovernedAuthorityStore(
  dbPath: string,
  options: CreateSqliteGovernedAuthorityStoreOptions = {},
): Promise<GovernedAuthorityStore> {
  const { default: Database } = await import('better-sqlite3');

  const now = options.now ?? (() => new Date().toISOString());

  const path = dbPath === ':memory:' ? ':memory:' : resolveOnDisk(dbPath);
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma(`busy_timeout = ${resolveBusyTimeoutMs(options.busyTimeoutMs)}`);

  // Fail closed on a database written by a different schema version, before
  // any DDL runs — never silently reuse or migrate a mismatched store.
  const versionTable = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get('governed_authority_store_versions');
  if (versionTable !== undefined) {
    const existingVersion = db.prepare(`SELECT schema_version FROM governed_authority_store_versions ORDER BY id DESC LIMIT 1`).get() as
      | { schema_version: string }
      | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION) {
      db.close();
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_STORE_UNAVAILABLE',
        `Governed Authority Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
      );
    }
  }

  db.exec(SCHEMA_V1);
  const recordedVersion = db.prepare(`SELECT schema_version FROM governed_authority_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (recordedVersion === undefined) {
    db.prepare(`INSERT INTO governed_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
      GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
      'applied',
      now(),
    );
  }

  const selectPosition = db.prepare(
    `SELECT * FROM governed_authority_positions WHERE tenant_id = ? AND actor_ref = ? AND resource_kind = ? AND resource_id = ? AND governed_right = ?`,
  );
  const selectPositionsForHolder = db.prepare(
    `SELECT * FROM governed_authority_positions WHERE tenant_id = ? AND actor_ref = ? AND resource_kind = ? AND resource_id = ? ORDER BY governed_right ASC`,
  );
  const countPositionsForResource = db.prepare(
    `SELECT COUNT(*) AS total FROM governed_authority_positions WHERE tenant_id = ? AND resource_kind = ? AND resource_id = ?`,
  );
  const selectTransitionsByExecution = db.prepare(
    `SELECT * FROM governed_authority_transitions WHERE tenant_id = ? AND execution_ref = ? ORDER BY sequence ASC`,
  );
  const selectTransitionsForSubject = db.prepare(
    `SELECT * FROM governed_authority_transitions
       WHERE tenant_id = ? AND resource_kind = ? AND resource_id = ? AND governed_right = ? AND (to_actor_ref = ? OR from_actor_ref = ?)
       ORDER BY sequence ASC`,
  );
  const selectMaxSequence = db.prepare(`SELECT MAX(sequence) AS maximum FROM governed_authority_transitions WHERE tenant_id = ?`);
  const selectLastDigest = db.prepare(`SELECT transition_digest FROM governed_authority_transitions WHERE tenant_id = ? ORDER BY sequence DESC LIMIT 1`);
  const insertTransition = db.prepare(
    `INSERT INTO governed_authority_transitions (
       transition_id, tenant_id, sequence, resource_kind, resource_id, governed_right,
       scope_kind, scope_basis_points, scope_units, scope_unit_denomination,
       from_actor_ref, to_actor_ref, basis_kind, basis_json, execution_ref,
       occurred_at, recorded_at, correlation_id, previous_digest, transition_digest
     ) VALUES (
       @transition_id, @tenant_id, @sequence, @resource_kind, @resource_id, @governed_right,
       @scope_kind, @scope_basis_points, @scope_units, @scope_unit_denomination,
       @from_actor_ref, @to_actor_ref, @basis_kind, @basis_json, @execution_ref,
       @occurred_at, @recorded_at, @correlation_id, @previous_digest, @transition_digest
     )`,
  );
  const upsertPosition = db.prepare(
    `INSERT INTO governed_authority_positions (
       position_id, tenant_id, actor_ref, resource_kind, resource_id, governed_right,
       scope_kind, scope_basis_points, scope_units, scope_unit_denomination,
       effective_from, expires_at, created_at, updated_at, last_transition_ref, position_digest, schema_version
     ) VALUES (
       @position_id, @tenant_id, @actor_ref, @resource_kind, @resource_id, @governed_right,
       @scope_kind, @scope_basis_points, @scope_units, @scope_unit_denomination,
       @effective_from, @expires_at, @created_at, @updated_at, @last_transition_ref, @position_digest, @schema_version
     )
     ON CONFLICT (tenant_id, actor_ref, resource_kind, resource_id, governed_right) DO UPDATE SET
       scope_kind = excluded.scope_kind,
       scope_basis_points = excluded.scope_basis_points,
       scope_units = excluded.scope_units,
       scope_unit_denomination = excluded.scope_unit_denomination,
       updated_at = excluded.updated_at,
       last_transition_ref = excluded.last_transition_ref,
       position_digest = excluded.position_digest`,
  );

  /** The chain position the next transition for a tenant will occupy. Read inside the caller's transaction, so it cannot straddle another writer. */
  function nextSequenceFor(tenantId: string): number {
    return ((selectMaxSequence.get(tenantId) as { maximum: number | null } | undefined)?.maximum ?? 0) + 1;
  }

  function readPosition(
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): GovernedAuthorityPosition | null {
    const row = selectPosition.get(tenantId, holderRef, resource.kind, resource.id, governedRight) as PositionRow | undefined;
    return row === undefined ? null : toPosition(row);
  }

  /** Assigns the next chain position for a tenant and links the new transition to its predecessor's digest. Called only inside a transaction, so the read and the write cannot straddle another writer. */
  function sealTransition(draft: Omit<GovernedAuthorityTransition, 'sequence' | 'previousDigest' | 'digest'>): GovernedAuthorityTransition {
    const previous = (selectLastDigest.get(draft.tenantId) as { transition_digest: string } | undefined)?.transition_digest;
    const unsealed = {
      ...draft,
      sequence: nextSequenceFor(draft.tenantId),
      ...(previous !== undefined ? { previousDigest: previous } : {}),
    };
    const sealed: GovernedAuthorityTransition = { ...unsealed, digest: computeTransitionDigest(unsealed) };
    const scopeColumns = writeScopeColumns(sealed.scope);
    insertTransition.run({
      transition_id: sealed.id,
      tenant_id: sealed.tenantId,
      sequence: sealed.sequence,
      resource_kind: sealed.resourceKind,
      resource_id: sealed.resourceId,
      governed_right: sealed.governedRight,
      ...scopeColumns,
      from_actor_ref: sealed.fromActorRef ?? null,
      to_actor_ref: sealed.toActorRef,
      basis_kind: sealed.basis.kind,
      basis_json: JSON.stringify(sealed.basis),
      execution_ref: sealed.basis.kind === 'governed-execution' ? sealed.basis.executionRef : null,
      occurred_at: sealed.occurredAt,
      recorded_at: sealed.recordedAt,
      correlation_id: sealed.correlationId ?? null,
      previous_digest: sealed.previousDigest ?? null,
      transition_digest: sealed.digest,
    });
    return sealed;
  }

  function writePosition(draft: Omit<GovernedAuthorityPosition, 'digest'>): GovernedAuthorityPosition {
    const sealed: GovernedAuthorityPosition = { ...draft, digest: computePositionDigest(draft) };
    upsertPosition.run({
      position_id: sealed.id,
      tenant_id: sealed.tenantId,
      actor_ref: sealed.actorRef,
      resource_kind: sealed.resourceKind,
      resource_id: sealed.resourceId,
      governed_right: sealed.governedRight,
      ...writeScopeColumns(sealed.scope),
      effective_from: sealed.effectiveFrom,
      expires_at: sealed.expiresAt ?? null,
      created_at: sealed.createdAt,
      updated_at: sealed.updatedAt,
      last_transition_ref: sealed.lastTransitionRef,
      position_digest: sealed.digest,
      schema_version: GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
    });
    return sealed;
  }

  /** One commit section: append the issuance transition and create or increase the position together, or neither. */
  const commitBootstrap = db.transaction((input: BootstrapGovernedAuthorityInput, recordedAt: string, occurredAt: string): GovernedAuthorityPosition => {
    const existing = readPosition(input.tenantId, input.holderRef, input.resource, input.governedRight);
    const transition = sealTransition({
      id: input.transitionId ?? deriveAuthorityIssuanceTransitionId(input.tenantId, nextSequenceFor(input.tenantId)),
      tenantId: input.tenantId,
      resourceKind: input.resource.kind,
      resourceId: input.resource.id,
      governedRight: input.governedRight,
      scope: serializeGovernedRightsScope(input.scope),
      toActorRef: input.holderRef,
      basis: input.basis,
      occurredAt,
      recordedAt,
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    });

    if (existing === null) {
      return writePosition({
        id:
          input.positionId ??
          deriveAuthorityPositionId({
            tenantId: input.tenantId,
            actorRef: input.holderRef,
            resourceKind: input.resource.kind,
            resourceId: input.resource.id,
            governedRight: input.governedRight,
          }),
        tenantId: input.tenantId,
        actorRef: input.holderRef,
        resourceKind: input.resource.kind,
        resourceId: input.resource.id,
        governedRight: input.governedRight,
        scope: serializeGovernedRightsScope(input.scope),
        effectiveFrom: input.effectiveFrom,
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        createdAt: recordedAt,
        updatedAt: recordedAt,
        lastTransitionRef: transition.id,
      });
    }
    return writePosition({
      ...existing,
      scope: addAuthorityScopes(existing.scope, input.scope, { positionId: existing.id }),
      updatedAt: recordedAt,
      lastTransitionRef: transition.id,
    });
  });

  /**
   * One commit section for the whole movement: every named right's debit and
   * credit, or none of them. The replay check reads inside the same
   * transaction as the writes, so a concurrent retry of the same execution
   * cannot slip past it, and the `UNIQUE (tenant_id, execution_ref,
   * governed_right)` constraint refuses it even if one somehow did.
   */
  const commitTransition = db.transaction(
    (input: ApplyGovernedAuthorityTransitionInput, recordedAt: string): { transitions: readonly GovernedAuthorityTransition[]; replayed: boolean } => {
      const appliedRows = selectTransitionsByExecution.all(input.tenantId, input.basis.executionRef) as TransitionRow[];
      if (appliedRows.length > 0) {
        const applied = appliedRows.map(toTransition);
        assertReplayMatches(applied, input);
        return { transitions: applied, replayed: true };
      }

      const staged = input.governedRights.map((governedRight) => {
        const source = readPosition(input.tenantId, input.fromHolderRef, input.resource, governedRight);
        if (source === null) {
          throw new AuthorityGovernanceError(
            'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
            `'${input.fromHolderRef}' holds no recognized authority over '${governedRight}' of this resource; there is nothing to move.`,
            { tenantId: input.tenantId, holderRef: input.fromHolderRef, governedRight },
          );
        }
        const target = readPosition(input.tenantId, input.toHolderRef, input.resource, governedRight);
        return {
          governedRight,
          source,
          target,
          debited: subtractAuthorityScope(source.scope, input.scope, { positionId: source.id, governedRight }),
          credited:
            target === null ? serializeGovernedRightsScope(input.scope) : addAuthorityScopes(target.scope, input.scope, { positionId: target.id, governedRight }),
        };
      });

      const applied: GovernedAuthorityTransition[] = [];
      for (const entry of staged) {
        const transition = sealTransition({
          id: deriveAuthorityMovementTransitionId(
            input.transitionIdPrefix ?? 'governed-authority-transition',
            input.tenantId,
            input.basis.executionRef,
            entry.governedRight,
          ),
          tenantId: input.tenantId,
          resourceKind: input.resource.kind,
          resourceId: input.resource.id,
          governedRight: entry.governedRight,
          scope: serializeGovernedRightsScope(input.scope),
          fromActorRef: input.fromHolderRef,
          toActorRef: input.toHolderRef,
          basis: input.basis,
          occurredAt: input.occurredAt,
          recordedAt,
          ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        });

        writePosition({ ...entry.source, scope: entry.debited, updatedAt: recordedAt, lastTransitionRef: transition.id });

        if (entry.target === null) {
          writePosition({
            id: deriveAuthorityPositionId({
              tenantId: input.tenantId,
              actorRef: input.toHolderRef,
              resourceKind: input.resource.kind,
              resourceId: input.resource.id,
              governedRight: entry.governedRight,
            }),
            tenantId: input.tenantId,
            actorRef: input.toHolderRef,
            resourceKind: input.resource.kind,
            resourceId: input.resource.id,
            governedRight: entry.governedRight,
            scope: entry.credited,
            effectiveFrom: input.occurredAt,
            createdAt: recordedAt,
            updatedAt: recordedAt,
            lastTransitionRef: transition.id,
          });
        } else {
          writePosition({ ...entry.target, scope: entry.credited, updatedAt: recordedAt, lastTransitionRef: transition.id });
        }

        applied.push(transition);
      }

      return { transitions: applied, replayed: false };
    },
  );

  return {
    providerKind: 'sqlite',

    async bootstrapPosition(context: AuthorityGovernanceContext, input: BootstrapGovernedAuthorityInput) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      if (!context.system) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED',
          'Creating governed authority requires a privileged administrative context; an actor can never obtain a position by asserting one.',
          { tenantId: input.tenantId, holderRef: input.holderRef },
        );
      }
      assertKnownGovernedRight(input.governedRight);
      assertValidAuthorityScope(input.scope, 'scope');
      assertNonZeroAuthorityScope(input.scope, 'scope');
      assertBasisMatchesMovement(input.basis, undefined);
      if (!isGovernedAuthorityIssuanceBasis(input.basis)) {
        throw new AuthorityGovernanceError('GOVERNED_AUTHORITY_BASIS_INVALID', 'Bootstrapping requires an issuing basis.', { basisKind: input.basis.kind });
      }
      const effectiveFrom = requireStrictUtcAuthorityTimestamp(input.effectiveFrom, 'effectiveFrom');
      if (input.expiresAt !== undefined) requireStrictUtcAuthorityTimestamp(input.expiresAt, 'expiresAt');
      const occurredAt = requireStrictUtcAuthorityTimestamp(input.occurredAt ?? effectiveFrom, 'occurredAt');
      const recordedAt = requireStrictUtcAuthorityTimestamp(now(), 'recordedAt');
      return commitBootstrap(input, recordedAt, occurredAt);
    },

    async applyTransition(context: AuthorityGovernanceContext, input: ApplyGovernedAuthorityTransitionInput) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      assertBasisMatchesMovement(input.basis, input.fromHolderRef);
      assertDistinctHolders(input.fromHolderRef, input.toHolderRef);
      assertValidAuthorityScope(input.scope, 'scope');
      assertNonZeroAuthorityScope(input.scope, 'scope');
      if (input.governedRights.length === 0) {
        throw new AuthorityGovernanceError('GOVERNED_AUTHORITY_BASIS_INVALID', 'A governed authority transition must name at least one governed right.');
      }
      for (const right of input.governedRights) assertKnownGovernedRight(right);
      requireStrictUtcAuthorityTimestamp(input.occurredAt, 'occurredAt');
      const recordedAt = requireStrictUtcAuthorityTimestamp(now(), 'recordedAt');
      return commitTransition(input, recordedAt);
    },

    async getPosition(context: AuthorityGovernanceContext, tenantId: string, holderRef: string, resource: GovernedAuthorityResourceRef, governedRight: GovernedRightType) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return readPosition(tenantId, holderRef, resource, governedRight);
    },

    async isResourceEnrolled(context: AuthorityGovernanceContext, tenantId: string, resource: GovernedAuthorityResourceRef) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const row = countPositionsForResource.get(tenantId, resource.kind, resource.id) as { total: number } | undefined;
      return (row?.total ?? 0) > 0;
    },

    async listPositionsForHolder(context: AuthorityGovernanceContext, tenantId: string, holderRef: string, resource: GovernedAuthorityResourceRef) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return (selectPositionsForHolder.all(tenantId, holderRef, resource.kind, resource.id) as PositionRow[]).map(toPosition);
    },

    async getProvenance(
      context: AuthorityGovernanceContext,
      tenantId: string,
      holderRef: string,
      resource: GovernedAuthorityResourceRef,
      governedRight: GovernedRightType,
    ) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const position = readPosition(tenantId, holderRef, resource, governedRight);
      if (position === null) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_POSITION_NOT_FOUND',
          `'${holderRef}' holds no recognized authority over '${governedRight}' of '${resource.kind}:${resource.id}'.`,
          { tenantId, holderRef, governedRight },
        );
      }
      const rows = selectTransitionsForSubject.all(tenantId, resource.kind, resource.id, governedRight, holderRef, holderRef) as TransitionRow[];
      return { position, transitions: rows.map(toTransition) };
    },

    async listTransitionsByExecutionRef(context: AuthorityGovernanceContext, tenantId: string, executionRef: string) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return (selectTransitionsByExecution.all(tenantId, executionRef) as TransitionRow[]).map(toTransition);
    },

    async health() {
      const positionCount = (db.prepare(`SELECT COUNT(*) AS total FROM governed_authority_positions`).get() as { total: number }).total;
      const transitionCount = (db.prepare(`SELECT COUNT(*) AS total FROM governed_authority_transitions`).get() as { total: number }).total;
      return { providerKind: 'sqlite' as const, available: db.open, schemaVersion: GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION, positionCount, transitionCount };
    },

    async close() {
      db.close();
    },
  };
}
