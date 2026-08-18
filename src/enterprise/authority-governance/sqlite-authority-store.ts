import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  governedAuthorityReservationReducesAvailability,
  isGovernedAuthorityIssuanceBasis,
  type GovernedAuthorityBasis,
  type GovernedAuthorityPosition,
  type GovernedAuthorityReservation,
  type GovernedAuthorityReservationStatus,
  type GovernedAuthorityTransition,
} from '@aoc-enterprise/governed-authority';
import { governedRightsScopeWithin, isGovernedRightType, serializeGovernedRightsScope, type GovernedRightType, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

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
import {
  assertReservationIntegrity,
  computeAvailability,
  computeReservationDigest,
  deriveReservationId,
  reservationReplayMatches,
} from './reservation-lifecycle.js';
import { requireAuthorityAccessToOrganization, requireStrictUtcAuthorityTimestamp, type GovernedAuthorityStore } from './authority-store.js';
import type {
  AcquireGovernedAuthorityReservationInput,
  AcquireGovernedAuthorityReservationOutcome,
  ApplyGovernedAuthorityTransitionInput,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityAvailabilityQuery,
  GovernedAuthorityResourceRef,
  ReleaseGovernedAuthorityReservationInput,
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

// ---------------------------------------------------------------------------
// Schema v2 adds one table and changes nothing existing: how much of each
// position is already committed to a still-live governed authorization.
//
// Purely additive, which is what makes the v1 -> v2 migration below safe to
// apply automatically. No position or transition row is read, rewritten or
// re-digested, so a v1 database's entire authority history keeps verifying
// byte-for-byte, and a v1 deployment's availability on the day it upgrades is
// simply its holdings — correct, because it had no commitments to account for.
//
// Durable invariants pushed down to the database, in the same spirit as the
// position and transition tables:
//
//  - `UNIQUE (tenant_id, idempotency_key)` -> one commitment per idempotency
//    identity. A retried acquisition collides rather than committing a second
//    quantity, and the constraint holds across processes where an in-memory
//    replay check would not.
//  - `UNIQUE (tenant_id, source_mandate_ref, governed_right)` -> one
//    authorization artifact commits each right at most once. This is what makes
//    "was this mandate supported by a reservation?" a single-row question, and
//    what stops a second acquisition being laundered through a fresh
//    idempotency key for the same mandate.
//  - `CHECK (status IN ('active','consumed','released'))` -> the closed
//    lifecycle is enforced by the database, not only by the code above it.
//    There is deliberately no `'expired'`: expiry is derived from `expires_at`
//    against the clock, so a stopped cleanup process can never leave a stored
//    status disagreeing with it.
//  - `CHECK (scope_basis_points >= 0)` / `CHECK (scope_units >= 0)` -> a
//    negative commitment, which would *manufacture* availability, is
//    unrepresentable.
//
// The partial index on active rows is what the availability read uses: the
// enforcement path asks this question on every conserving authorization, and it
// must not scan terminal history to answer it.
// ---------------------------------------------------------------------------
const SCHEMA_V2 = `
  CREATE TABLE IF NOT EXISTS governed_authority_reservations (
    reservation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    holder_ref TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    governed_right TEXT NOT NULL,
    scope_kind TEXT NOT NULL,
    scope_basis_points INTEGER,
    scope_units INTEGER,
    scope_unit_denomination TEXT,
    action TEXT NOT NULL,
    source_request_ref TEXT NOT NULL,
    source_decision_ref TEXT,
    source_mandate_ref TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    correlation_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reservation_digest TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (tenant_id, source_mandate_ref, governed_right),
    CHECK (status IN ('active', 'consumed', 'released')),
    CHECK (scope_basis_points IS NULL OR scope_basis_points >= 0),
    CHECK (scope_units IS NULL OR scope_units >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_governed_authority_reservations_active
    ON governed_authority_reservations(tenant_id, holder_ref, resource_kind, resource_id, governed_right)
    WHERE status = 'active';
  CREATE INDEX IF NOT EXISTS idx_governed_authority_reservations_mandate
    ON governed_authority_reservations(tenant_id, source_mandate_ref);
`;

/** The one predecessor this runtime knows how to bring forward. Anything else still refuses to open. */
const GOVERNED_AUTHORITY_STORE_SCHEMA_V1 = 'aoc.governed-authority-store.schema.v1';

interface ReservationRow {
  readonly reservation_id: string;
  readonly tenant_id: string;
  readonly holder_ref: string;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly governed_right: string;
  readonly scope_kind: string;
  readonly scope_basis_points: number | null;
  readonly scope_units: number | null;
  readonly scope_unit_denomination: string | null;
  readonly action: string;
  readonly source_request_ref: string;
  readonly source_decision_ref: string | null;
  readonly source_mandate_ref: string;
  readonly effective_from: string;
  readonly expires_at: string;
  readonly status: string;
  readonly idempotency_key: string;
  readonly correlation_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly reservation_digest: string;
}

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

function readReservationStatus(value: string, recordId: string): GovernedAuthorityReservationStatus {
  if (value === 'active' || value === 'consumed' || value === 'released') return value;
  throw corrupted(`Stored governed authority reservation '${recordId}' has an unknown status '${value}'.`, { recordId });
}

/** Reads a reservation back, verifying its digest. A tampered row fails the read rather than dropping out of it: skipping one would silently free the capacity it commits. */
function toReservation(row: ReservationRow): GovernedAuthorityReservation {
  return assertReservationIntegrity({
    id: row.reservation_id,
    tenantId: row.tenant_id,
    holderRef: row.holder_ref,
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    governedRight: readGovernedRight(row.governed_right, row.reservation_id),
    scope: readScopeColumns(row, row.reservation_id),
    action: row.action,
    sourceRequestRef: row.source_request_ref,
    ...(row.source_decision_ref !== null ? { sourceDecisionRef: row.source_decision_ref } : {}),
    sourceMandateRef: row.source_mandate_ref,
    effectiveFrom: row.effective_from,
    expiresAt: row.expires_at,
    status: readReservationStatus(row.status, row.reservation_id),
    idempotencyKey: row.idempotency_key,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    digest: row.reservation_digest,
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
  let migrateFromV1 = false;
  if (versionTable !== undefined) {
    const existingVersion = db.prepare(`SELECT schema_version FROM governed_authority_store_versions ORDER BY id DESC LIMIT 1`).get() as
      | { schema_version: string }
      | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION) {
      // v1 -> v2 is brought forward rather than refused, because the change is
      // purely additive: one new table, and not a single existing row read,
      // rewritten or re-digested. Every other version still refuses, so this is
      // one known migration rather than a general "try to upgrade anything"
      // policy — and refusing v1 outright would have stopped every deployment
      // that already holds authority state, to add a table they have no rows
      // for.
      if (existingVersion.schema_version !== GOVERNED_AUTHORITY_STORE_SCHEMA_V1) {
        db.close();
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_STORE_UNAVAILABLE',
          `Governed Authority Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
        );
      }
      migrateFromV1 = true;
    }
  }

  db.exec(SCHEMA_V1);
  db.exec(SCHEMA_V2);
  const recordedVersion = db.prepare(`SELECT schema_version FROM governed_authority_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (recordedVersion === undefined) {
    db.prepare(`INSERT INTO governed_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
      GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
      'applied',
      now(),
    );
  } else if (migrateFromV1) {
    // Appended, never overwritten: the version table is a history, and a
    // reader must be able to see that this database was migrated rather than
    // created at v2.
    db.prepare(`INSERT INTO governed_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
      GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
      'migrated',
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

  const selectReservationsFor = db.prepare(
    `SELECT * FROM governed_authority_reservations
       WHERE tenant_id = ? AND holder_ref = ? AND resource_kind = ? AND resource_id = ? AND governed_right = ?
       ORDER BY reservation_id ASC`,
  );
  const selectReservationById = db.prepare(`SELECT * FROM governed_authority_reservations WHERE tenant_id = ? AND reservation_id = ?`);
  const selectReservationByIdempotencyKey = db.prepare(`SELECT * FROM governed_authority_reservations WHERE tenant_id = ? AND idempotency_key = ?`);
  const selectReservationsByMandate = db.prepare(
    `SELECT * FROM governed_authority_reservations WHERE tenant_id = ? AND source_mandate_ref = ? ORDER BY reservation_id ASC`,
  );
  const selectActiveReservationsByMandate = db.prepare(
    `SELECT * FROM governed_authority_reservations WHERE tenant_id = ? AND source_mandate_ref = ? AND status = 'active' ORDER BY reservation_id ASC`,
  );
  const insertReservation = db.prepare(
    `INSERT INTO governed_authority_reservations (
       reservation_id, tenant_id, holder_ref, resource_kind, resource_id, governed_right,
       scope_kind, scope_basis_points, scope_units, scope_unit_denomination,
       action, source_request_ref, source_decision_ref, source_mandate_ref,
       effective_from, expires_at, status, idempotency_key, correlation_id,
       created_at, updated_at, reservation_digest, schema_version
     ) VALUES (
       @reservation_id, @tenant_id, @holder_ref, @resource_kind, @resource_id, @governed_right,
       @scope_kind, @scope_basis_points, @scope_units, @scope_unit_denomination,
       @action, @source_request_ref, @source_decision_ref, @source_mandate_ref,
       @effective_from, @expires_at, @status, @idempotency_key, @correlation_id,
       @created_at, @updated_at, @reservation_digest, @schema_version
     )`,
  );
  const updateReservationStatus = db.prepare(
    `UPDATE governed_authority_reservations SET status = @status, updated_at = @updated_at, reservation_digest = @reservation_digest WHERE reservation_id = @reservation_id`,
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

  function readReservationsFor(
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): GovernedAuthorityReservation[] {
    return (selectReservationsFor.all(tenantId, holderRef, resource.kind, resource.id, governedRight) as ReservationRow[]).map(toReservation);
  }

  function insertSealedReservation(draft: Omit<GovernedAuthorityReservation, 'digest'>): GovernedAuthorityReservation {
    const sealed: GovernedAuthorityReservation = { ...draft, digest: computeReservationDigest(draft) };
    insertReservation.run({
      reservation_id: sealed.id,
      tenant_id: sealed.tenantId,
      holder_ref: sealed.holderRef,
      resource_kind: sealed.resourceKind,
      resource_id: sealed.resourceId,
      governed_right: sealed.governedRight,
      ...writeScopeColumns(sealed.scope),
      action: sealed.action,
      source_request_ref: sealed.sourceRequestRef,
      source_decision_ref: sealed.sourceDecisionRef ?? null,
      source_mandate_ref: sealed.sourceMandateRef,
      effective_from: sealed.effectiveFrom,
      expires_at: sealed.expiresAt,
      status: sealed.status,
      idempotency_key: sealed.idempotencyKey,
      correlation_id: sealed.correlationId ?? null,
      created_at: sealed.createdAt,
      updated_at: sealed.updatedAt,
      reservation_digest: sealed.digest,
      schema_version: GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
    });
    return sealed;
  }

  /** Moves a reservation to a terminal status, re-sealing its digest over the new bytes so the row stays verifiable rather than becoming a permanent integrity failure. */
  function writeReservationStatus(
    reservation: GovernedAuthorityReservation,
    status: GovernedAuthorityReservationStatus,
    updatedAt: string,
  ): GovernedAuthorityReservation {
    const { digest: _digest, ...rest } = reservation;
    const next = { ...rest, status, updatedAt };
    const sealed: GovernedAuthorityReservation = { ...next, digest: computeReservationDigest(next) };
    updateReservationStatus.run({ reservation_id: sealed.id, status: sealed.status, updated_at: sealed.updatedAt, reservation_digest: sealed.digest });
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

      // Terminalized in the same transaction that just debited the position, so
      // "capacity released" and "authority moved" commit together or not at
      // all. This is the coordination §"Execution atomicity" asks for, and it is
      // a real one: both rows live in this database and this is one
      // `db.transaction(...)`. Crashing before COMMIT rolls back both.
      if (input.consumesReservationsForMandateRef !== undefined) {
        const active = (selectActiveReservationsByMandate.all(input.tenantId, input.consumesReservationsForMandateRef) as ReservationRow[]).map(toReservation);
        for (const reservation of active) writeReservationStatus(reservation, 'consumed', recordedAt);
      }

      return { transitions: applied, replayed: false };
    },
  );

  /**
   * One commit section for check-and-reserve.
   *
   * The availability read and the insert are inside the same transaction, so
   * two concurrent acquisitions against the same position serialize: the second
   * reads the first's committed row and is refused. `UNIQUE (tenant_id,
   * idempotency_key)` and `UNIQUE (tenant_id, source_mandate_ref,
   * governed_right)` refuse a duplicate even if one somehow reached the insert.
   */
  const commitReservation = db.transaction(
    (
      input: AcquireGovernedAuthorityReservationInput,
      idempotencyKey: string,
      effectiveFrom: string,
      expiresAt: string,
      recordedAt: string,
    ): AcquireGovernedAuthorityReservationOutcome => {
      const existingRow = selectReservationByIdempotencyKey.get(input.tenantId, idempotencyKey) as ReservationRow | undefined;
      if (existingRow !== undefined) {
        const existing = toReservation(existingRow);
        if (
          !reservationReplayMatches(existing, {
            holderRef: input.holderRef,
            resourceKind: input.resource.kind,
            resourceId: input.resource.id,
            governedRight: input.governedRight,
            scope: input.scope,
            action: input.action,
            sourceMandateRef: input.sourceMandateRef,
          })
        ) {
          throw new AuthorityGovernanceError(
            'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
            `Idempotency key '${idempotencyKey}' already commits governed authority under materially different terms; a replay must restate the same commitment.`,
            { idempotencyKey, reservationId: existing.id },
          );
        }
        return { outcome: 'reserved', reservation: existing, replayed: true };
      }

      // A commitment is identified by the artifact it stands for, so a second
      // acquisition naming the same mandate and right is the same commitment
      // however it was keyed. Refused explicitly rather than left to collide on
      // the derived id — in memory that collision would silently overwrite a
      // live commitment, and in SQLite it would surface as a raw driver error
      // instead of this module's taxonomy.
      const forSameMandate = selectReservationsByMandate.all(input.tenantId, input.sourceMandateRef) as ReservationRow[];
      const clashing = forSameMandate.find((row) => row.governed_right === input.governedRight);
      if (clashing !== undefined) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
          `Mandate '${input.sourceMandateRef}' already commits governed authority over '${input.governedRight}' under a different idempotency key.`,
          { sourceMandateRef: input.sourceMandateRef, governedRight: input.governedRight, reservationId: clashing.reservation_id },
        );
      }

      const position = readPosition(input.tenantId, input.holderRef, input.resource, input.governedRight);
      const availability = computeAvailability(position, readReservationsFor(input.tenantId, input.holderRef, input.resource, input.governedRight), recordedAt);

      if (availability.outcome === 'no_authority') {
        // Enrolment is consulted only once the holder turns out to have no
        // position, so the common enforced path costs no extra read — the same
        // ordering `resolver.ts` uses for coverage. A resource with positions
        // but none for this holder-and-right is enrolled, and fails closed.
        const enrolled = ((countPositionsForResource.get(input.tenantId, input.resource.kind, input.resource.id) as { total: number } | undefined)?.total ?? 0) > 0;
        if (!enrolled) return { outcome: 'resource_not_enrolled' as const };
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
          `'${input.holderRef}' holds no recognized authority over '${input.governedRight}' of this resource; there is nothing to commit.`,
          { tenantId: input.tenantId, holderRef: input.holderRef, governedRight: input.governedRight },
        );
      }
      if (availability.outcome === 'incompatible') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
          'This governed authority cannot be committed by that quantity: the position and the standing commitments are not commensurable with it.',
          { tenantId: input.tenantId, holderRef: input.holderRef, governedRight: input.governedRight },
        );
      }
      if (availability.outcome === 'overcommitted') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `More governed authority already stands committed against '${input.holderRef}' than that holder possesses; refusing to commit further until the inconsistency is resolved.`,
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: availability.held,
            committed: availability.committed,
          },
        );
      }

      if (!governedRightsScopeWithin(serializeGovernedRightsScope(input.scope), availability.available)) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `'${input.holderRef}' holds enough '${input.governedRight}' in total, but too much of it is already committed to still-live governed authorizations to commit this much more.`,
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: availability.held,
            ...(availability.committed !== undefined ? { committed: availability.committed } : {}),
            available: availability.available,
            requested: serializeGovernedRightsScope(input.scope),
          },
        );
      }

      const reservation = insertSealedReservation({
        id: deriveReservationId(input.tenantId, input.sourceMandateRef, input.governedRight),
        tenantId: input.tenantId,
        holderRef: input.holderRef,
        resourceKind: input.resource.kind,
        resourceId: input.resource.id,
        governedRight: input.governedRight,
        scope: serializeGovernedRightsScope(input.scope),
        action: input.action,
        sourceRequestRef: input.sourceRequestRef,
        ...(input.sourceDecisionRef !== undefined ? { sourceDecisionRef: input.sourceDecisionRef } : {}),
        sourceMandateRef: input.sourceMandateRef,
        effectiveFrom,
        expiresAt,
        status: 'active',
        idempotencyKey,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        createdAt: recordedAt,
        updatedAt: recordedAt,
      });
      return { outcome: 'reserved' as const, reservation, replayed: false };
    },
  );

  /** One commit section for release: read the current status and write the terminal one together, so two concurrent releases cannot both observe `'active'`. */
  const commitRelease = db.transaction((tenantId: string, reservationId: string, releasedAt: string): GovernedAuthorityReservation => {
    const row = selectReservationById.get(tenantId, reservationId) as ReservationRow | undefined;
    if (row === undefined) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_RESERVATION_NOT_FOUND',
        `No governed authority reservation '${reservationId}' exists in this tenant.`,
        { tenantId, reservationId },
      );
    }
    const reservation = toReservation(row);
    if (reservation.status === 'released') return reservation;
    if (reservation.status === 'consumed') {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
        `Governed authority reservation '${reservation.id}' was consumed by a completed movement; the authority has already moved and releasing it would fabricate capacity.`,
        { reservationId: reservation.id },
      );
    }
    return writeReservationStatus(reservation, 'released', releasedAt);
  });

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

    async acquireReservation(context: AuthorityGovernanceContext, input: AcquireGovernedAuthorityReservationInput) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      assertKnownGovernedRight(input.governedRight);
      assertValidAuthorityScope(input.scope, 'scope');
      assertNonZeroAuthorityScope(input.scope, 'scope');
      const effectiveFrom = requireStrictUtcAuthorityTimestamp(input.effectiveFrom, 'effectiveFrom');
      const expiresAt = requireStrictUtcAuthorityTimestamp(input.expiresAt, 'expiresAt');
      if (Date.parse(expiresAt) <= Date.parse(effectiveFrom)) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_SCOPE_INVALID',
          'A governed authority reservation must expire after it becomes effective; a commitment that never stands reduces nothing.',
          { effectiveFrom, expiresAt },
        );
      }
      const recordedAt = requireStrictUtcAuthorityTimestamp(now(), 'recordedAt');
      return commitReservation(input, input.idempotencyKey ?? input.sourceMandateRef, effectiveFrom, expiresAt, recordedAt);
    },

    async releaseReservation(context: AuthorityGovernanceContext, input: ReleaseGovernedAuthorityReservationInput) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      if (input.reason === 'administrative' && !context.system) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED',
          'Administratively cancelling a governed authority reservation requires a privileged system context.',
          { reservationId: input.reservationId },
        );
      }
      const releasedAt = requireStrictUtcAuthorityTimestamp(input.releasedAt ?? now(), 'releasedAt');
      return commitRelease(input.tenantId, input.reservationId, releasedAt);
    },

    async resolveAvailability(context: AuthorityGovernanceContext, query: GovernedAuthorityAvailabilityQuery) {
      requireAuthorityAccessToOrganization(context, query.tenantId);
      const at = requireStrictUtcAuthorityTimestamp(query.at, 'at');
      const position = readPosition(query.tenantId, query.holderRef, query.resource, query.governedRight);
      return computeAvailability(position, readReservationsFor(query.tenantId, query.holderRef, query.resource, query.governedRight), at);
    },

    async getReservation(context: AuthorityGovernanceContext, tenantId: string, reservationId: string) {
      requireAuthorityAccessToOrganization(context, tenantId);
      // Scoped by tenant in the SQL itself, so a cross-tenant id reads as absent
      // rather than as a refusal: a caller must not be able to probe another
      // tenant's reservation identifiers by telling "denied" from "no such
      // thing".
      const row = selectReservationById.get(tenantId, reservationId) as ReservationRow | undefined;
      return row === undefined ? null : toReservation(row);
    },

    async listReservationsByMandateRef(context: AuthorityGovernanceContext, tenantId: string, sourceMandateRef: string) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return (selectReservationsByMandate.all(tenantId, sourceMandateRef) as ReservationRow[]).map(toReservation);
    },

    async listActiveReservations(context: AuthorityGovernanceContext, query: GovernedAuthorityAvailabilityQuery) {
      requireAuthorityAccessToOrganization(context, query.tenantId);
      const at = requireStrictUtcAuthorityTimestamp(query.at, 'at');
      return readReservationsFor(query.tenantId, query.holderRef, query.resource, query.governedRight).filter((reservation) =>
        governedAuthorityReservationReducesAvailability(reservation, at),
      );
    },

    async health() {
      const positionCount = (db.prepare(`SELECT COUNT(*) AS total FROM governed_authority_positions`).get() as { total: number }).total;
      const transitionCount = (db.prepare(`SELECT COUNT(*) AS total FROM governed_authority_transitions`).get() as { total: number }).total;
      const activeReservationCount = (
        db.prepare(`SELECT COUNT(*) AS total FROM governed_authority_reservations WHERE status = 'active'`).get() as { total: number }
      ).total;
      return {
        providerKind: 'sqlite' as const,
        available: db.open,
        schemaVersion: GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
        positionCount,
        transitionCount,
        activeReservationCount,
      };
    },

    async close() {
      db.close();
    },
  };
}
