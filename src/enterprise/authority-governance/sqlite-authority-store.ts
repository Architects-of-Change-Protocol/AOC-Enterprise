import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  governedAuthorityEncumbranceConstrains,
  governedAuthorityReservationReducesAvailability,
  isGovernedAuthorityIssuanceBasis,
  type GovernedAuthorityBasis,
  type GovernedAuthorityEncumbrance,
  type GovernedAuthorityEncumbranceReleaseBasisKind,
  type GovernedAuthorityEncumbranceStatus,
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
  computeReservationDigest,
  deriveReservationId,
  reservationReplayMatches,
} from './reservation-lifecycle.js';
import {
  assertEncumbranceIntegrity,
  assertEncumbranceReleaseBasisAcceptable,
  assertRemainingScopeCoversEncumbrances,
  computeCapacity,
  computeEncumbranceDigest,
  deriveEncumbranceId,
  deriveEncumbranceIdempotencyKey,
  encumbranceReleaseReplayMatches,
  encumbranceReplayMatches,
  governedActionEncumbersAuthority,
  projectReleaseBasis,
  sumActiveEncumbrances,
} from './encumbrance-lifecycle.js';
import { requireAuthorityAccessToOrganization, requireStrictUtcAuthorityTimestamp, type GovernedAuthorityStore } from './authority-store.js';
import type {
  AcquireGovernedAuthorityReservationInput,
  AcquireGovernedAuthorityReservationOutcome,
  ApplyGovernedAuthorityTransitionInput,
  AuthorityGovernanceContext,
  BootstrapGovernedAuthorityInput,
  GovernedAuthorityAvailabilityQuery,
  GovernedAuthorityResourceRef,
  RecordGovernedAuthorityEncumbranceInput,
  RecordGovernedAuthorityEncumbranceOutcome,
  ReleaseGovernedAuthorityEncumbranceInput,
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
//  - `CHECK (status IN ('active','consumed','encumbered','released'))` -> the
//    closed lifecycle is enforced by the database, not only by the code above
//    it. There is deliberately no `'expired'`: expiry is derived from
//    `expires_at` against the clock, so a stopped cleanup process can never
//    leave a stored status disagreeing with it. `'encumbered'` was added in v3;
//    this DDL carries it because `CREATE TABLE IF NOT EXISTS` runs only when the
//    table is absent, so a database seeing it for the first time gets the
//    current shape, while one that already has the v2 shape is rebuilt by
//    `migrateReservationsToV3`.
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
    CHECK (status IN ('active', 'consumed', 'encumbered', 'released')),
    CHECK (scope_basis_points IS NULL OR scope_basis_points >= 0),
    CHECK (scope_units IS NULL OR scope_units >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_governed_authority_reservations_active
    ON governed_authority_reservations(tenant_id, holder_ref, resource_kind, resource_id, governed_right)
    WHERE status = 'active';
  CREATE INDEX IF NOT EXISTS idx_governed_authority_reservations_mandate
    ON governed_authority_reservations(tenant_id, source_mandate_ref);
`;

// ---------------------------------------------------------------------------
// Schema v3 adds one table and widens one CHECK: the persistent constraints a
// successfully executed governed action leaves over a position, and the fourth
// terminal reservation status a commitment reaches when it becomes one.
//
// Additive in the same sense v2 was — no position, transition or reservation
// row is read, rewritten or re-digested, so a v2 database's entire history
// keeps verifying byte-for-byte, and a v2 deployment's capacity on the day it
// upgrades is simply its availability, correct because it had no constraints to
// account for.
//
// SQLite cannot alter a CHECK in place, so widening the reservation status set
// to admit `'encumbered'` is done by the standard rebuild
// (`create the new table, copy, drop, rename`) in `migrateReservationsToV3`
// below, inside one transaction with `foreign_keys` already on and nothing
// referencing the table.
//
// Durable invariants pushed down to the database, in the same spirit as the
// tables before it:
//
//  - `UNIQUE (tenant_id, idempotency_key)` -> one constraint per idempotency
//    identity. A retried execution collides rather than constraining a second
//    quantity, and the constraint holds across processes where an in-memory
//    replay check would not.
//  - `UNIQUE (tenant_id, source_execution_ref, governed_right)` -> one
//    execution constrains each right at most once. This is what makes
//    "did this execution already encumber?" a single-row question, and what
//    stops a second constraint being laundered through a fresh idempotency key
//    for the same execution.
//  - `CHECK (status IN ('active','released'))` -> the closed two-state
//    lifecycle is enforced by the database, not only by the code above it.
//    There is deliberately no `'expired'`: this record carries no expiry, and a
//    stored status that could disagree with one is precisely what is not wanted.
//  - `CHECK (released_at IS NULL) = (status = 'active')` in effect, expressed as
//    the two CHECKs below -> a released row must say when and on what basis, and
//    an active one must claim neither.
//  - `CHECK (scope_basis_points >= 0)` / `CHECK (scope_units >= 0)` -> a
//    negative constraint, which would *manufacture* capacity, is
//    unrepresentable.
//
// The partial index on active rows is what the capacity read uses: the
// enforcement path asks this question on every committing authorization, and it
// must not scan released history to answer it.
// ---------------------------------------------------------------------------
const SCHEMA_V3 = `
  CREATE TABLE IF NOT EXISTS governed_authority_encumbrances (
    encumbrance_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    holder_ref TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    governed_right TEXT NOT NULL,
    scope_kind TEXT NOT NULL,
    scope_basis_points INTEGER,
    scope_units INTEGER,
    scope_unit_denomination TEXT,
    source_action TEXT NOT NULL,
    source_mandate_ref TEXT NOT NULL,
    source_execution_ref TEXT NOT NULL,
    source_reservation_ref TEXT,
    effective_from TEXT NOT NULL,
    status TEXT NOT NULL,
    released_at TEXT,
    release_basis TEXT,
    idempotency_key TEXT NOT NULL,
    correlation_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    encumbrance_digest TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (tenant_id, source_execution_ref, governed_right),
    CHECK (status IN ('active', 'released')),
    CHECK (status <> 'active' OR (released_at IS NULL AND release_basis IS NULL)),
    CHECK (status <> 'released' OR (released_at IS NOT NULL AND release_basis IS NOT NULL)),
    CHECK (scope_basis_points IS NULL OR scope_basis_points >= 0),
    CHECK (scope_units IS NULL OR scope_units >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_governed_authority_encumbrances_active
    ON governed_authority_encumbrances(tenant_id, holder_ref, resource_kind, resource_id, governed_right)
    WHERE status = 'active';
  CREATE INDEX IF NOT EXISTS idx_governed_authority_encumbrances_mandate
    ON governed_authority_encumbrances(tenant_id, source_mandate_ref);
`;

// ---------------------------------------------------------------------------
// Schema v4: the release lineage a governed discharge leaves behind.
//
// Purely additive, and additive in the strong sense that matters here — every
// new column is nullable, no existing column changes meaning, and no existing
// row's digest is recomputed. A v3 encumbrance that was never released
// projects byte-identically under the new digest projection, because every
// release lineage field is conditional on being present. That is what lets
// this migration run with `ALTER TABLE ... ADD COLUMN` and nothing else: there
// is no rebuild, no re-seal, and no historical release re-interpreted.
//
// The one durable invariant it adds is the partial UNIQUE index. A confirmed
// release execution discharges exactly the constraint it discharged; without
// this, a caller holding a store handle could present the same execution
// reference for a sibling constraint and free authority nothing ever released.
// Partial rather than total, because `NULL` release references are the
// overwhelming majority and SQLite treats NULLs as distinct in a UNIQUE index
// anyway — stating the predicate makes the intent legible rather than
// incidental.
//
// `release_basis` keeps its name and its `'administrative'` value: widening a
// column's accepted vocabulary is not the same as changing what an existing
// row means, and renaming it would have rewritten history to tidy a label.
// ---------------------------------------------------------------------------
const SCHEMA_V4_ENCUMBRANCE_RELEASE_COLUMNS: readonly string[] = [
  'release_action TEXT',
  'release_mandate_ref TEXT',
  'release_execution_ref TEXT',
  'released_by TEXT',
  'release_reason_code TEXT',
];

const SCHEMA_V4_INDEXES = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_governed_authority_encumbrances_release_execution
    ON governed_authority_encumbrances(tenant_id, release_execution_ref)
    WHERE release_execution_ref IS NOT NULL;
`;

/**
 * Adds v4's release lineage columns to an encumbrance table that predates
 * them.
 *
 * Written as "add the column unless it is already there" rather than as a
 * version-gated block, because `SCHEMA_V3` above uses
 * `CREATE TABLE IF NOT EXISTS` and therefore creates the *v3* shape on a fresh
 * database too. One code path brings both cases to the same place, so a fresh
 * store and a migrated store are structurally identical rather than nearly so.
 */
function applyEncumbranceReleaseColumns(db: {
  prepare: (sql: string) => { all: () => unknown[] };
  exec: (sql: string) => unknown;
}): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(governed_authority_encumbrances)`).all() as { readonly name: string }[]).map((column) => column.name),
  );
  for (const definition of SCHEMA_V4_ENCUMBRANCE_RELEASE_COLUMNS) {
    const columnName = definition.slice(0, definition.indexOf(' '));
    if (existing.has(columnName)) continue;
    db.exec(`ALTER TABLE governed_authority_encumbrances ADD COLUMN ${definition};`);
  }
  db.exec(SCHEMA_V4_INDEXES);
}

/** The reservations table as v3 defines it: identical to v2 except that the status CHECK admits `'encumbered'`. Used only by the rebuild migration. */
const SCHEMA_V3_RESERVATIONS_REBUILD = `
  CREATE TABLE governed_authority_reservations_v3 (
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
    CHECK (status IN ('active', 'consumed', 'encumbered', 'released')),
    CHECK (scope_basis_points IS NULL OR scope_basis_points >= 0),
    CHECK (scope_units IS NULL OR scope_units >= 0)
  );
`;

/** The predecessors this runtime knows how to bring forward. Anything else still refuses to open. */
const GOVERNED_AUTHORITY_STORE_SCHEMA_V1 = 'aoc.governed-authority-store.schema.v1';
const GOVERNED_AUTHORITY_STORE_SCHEMA_V2 = 'aoc.governed-authority-store.schema.v2';
const GOVERNED_AUTHORITY_STORE_SCHEMA_V3 = 'aoc.governed-authority-store.schema.v3';

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

interface EncumbranceRow {
  readonly encumbrance_id: string;
  readonly tenant_id: string;
  readonly holder_ref: string;
  readonly resource_kind: string;
  readonly resource_id: string;
  readonly governed_right: string;
  readonly scope_kind: string;
  readonly scope_basis_points: number | null;
  readonly scope_units: number | null;
  readonly scope_unit_denomination: string | null;
  readonly source_action: string;
  readonly source_mandate_ref: string;
  readonly source_execution_ref: string;
  readonly source_reservation_ref: string | null;
  readonly effective_from: string;
  readonly status: string;
  readonly released_at: string | null;
  readonly release_basis: string | null;
  readonly idempotency_key: string;
  readonly correlation_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly release_action: string | null;
  readonly release_mandate_ref: string | null;
  readonly release_execution_ref: string | null;
  readonly released_by: string | null;
  readonly release_reason_code: string | null;
  readonly encumbrance_digest: string;
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
  if (value === 'active' || value === 'consumed' || value === 'encumbered' || value === 'released') return value;
  throw corrupted(`Stored governed authority reservation '${recordId}' has an unknown status '${value}'.`, { recordId });
}

function readEncumbranceStatus(value: string, recordId: string): GovernedAuthorityEncumbranceStatus {
  if (value === 'active' || value === 'released') return value;
  throw corrupted(`Stored governed authority encumbrance '${recordId}' has an unknown status '${value}'.`, { recordId });
}

/** The two release basis kinds this model has. A stored row naming anything else was not written by this runtime, and is refused rather than read. */
function readEncumbranceReleaseBasis(value: string, recordId: string): GovernedAuthorityEncumbranceReleaseBasisKind {
  if (value === 'administrative' || value === 'governed-execution') return value;
  throw corrupted(`Stored governed authority encumbrance '${recordId}' has an unknown release basis '${value}'.`, { recordId });
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

/** Reads an encumbrance back, verifying its digest. A tampered row fails the read rather than dropping out of it: skipping one would silently free the authority it constrains. */
function toEncumbrance(row: EncumbranceRow): GovernedAuthorityEncumbrance {
  return assertEncumbranceIntegrity({
    id: row.encumbrance_id,
    tenantId: row.tenant_id,
    holderRef: row.holder_ref,
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    governedRight: readGovernedRight(row.governed_right, row.encumbrance_id),
    scope: readScopeColumns(row, row.encumbrance_id),
    sourceAction: row.source_action,
    sourceMandateRef: row.source_mandate_ref,
    sourceExecutionRef: row.source_execution_ref,
    ...(row.source_reservation_ref !== null ? { sourceReservationRef: row.source_reservation_ref } : {}),
    effectiveFrom: row.effective_from,
    status: readEncumbranceStatus(row.status, row.encumbrance_id),
    ...(row.released_at !== null ? { releasedAt: row.released_at } : {}),
    ...(row.release_basis !== null ? { releaseBasis: readEncumbranceReleaseBasis(row.release_basis, row.encumbrance_id) } : {}),
    ...(row.release_action !== null ? { releaseAction: row.release_action } : {}),
    ...(row.release_mandate_ref !== null ? { releaseMandateRef: row.release_mandate_ref } : {}),
    ...(row.release_execution_ref !== null ? { releaseExecutionRef: row.release_execution_ref } : {}),
    ...(row.released_by !== null ? { releasedBy: row.released_by } : {}),
    ...(row.release_reason_code !== null ? { releaseReasonCode: row.release_reason_code } : {}),
    idempotencyKey: row.idempotency_key,
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    digest: row.encumbrance_digest,
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
 * Widens the reservations table's status CHECK to admit `'encumbered'`.
 *
 * SQLite cannot alter a CHECK in place, so this is the standard rebuild —
 * create the new table, copy every row across unchanged, drop the old one,
 * rename — run inside one transaction so a crash leaves either the v2 table or
 * the v3 one, never neither.
 *
 * Deliberately a pure copy. Not one status is reinterpreted, not one digest is
 * recomputed, and no row acquires the new state retroactively: a v2 database's
 * reservations verify byte-for-byte afterwards exactly as they did before, and
 * `'encumbered'` only ever arises from a Phase 5.5 handoff that actually
 * happened. Manufacturing history to make old data look like it went through
 * the new lifecycle is precisely what a migration must not do.
 *
 * The indexes are recreated because dropping the table drops them with it.
 */
function migrateReservationsToV3(db: { exec: (sql: string) => unknown; transaction: (fn: () => void) => () => void }): void {
  db.transaction(() => {
    db.exec(SCHEMA_V3_RESERVATIONS_REBUILD);
    db.exec(`INSERT INTO governed_authority_reservations_v3 SELECT * FROM governed_authority_reservations;`);
    db.exec(`DROP TABLE governed_authority_reservations;`);
    db.exec(`ALTER TABLE governed_authority_reservations_v3 RENAME TO governed_authority_reservations;`);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_governed_authority_reservations_active
        ON governed_authority_reservations(tenant_id, holder_ref, resource_kind, resource_id, governed_right)
        WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_governed_authority_reservations_mandate
        ON governed_authority_reservations(tenant_id, source_mandate_ref);
    `);
  })();
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
  let migrating = false;
  let migrateReservationCheck = false;
  if (versionTable !== undefined) {
    const existingVersion = db.prepare(`SELECT schema_version FROM governed_authority_store_versions ORDER BY id DESC LIMIT 1`).get() as
      | { schema_version: string }
      | undefined;
    if (existingVersion !== undefined && existingVersion.schema_version !== GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION) {
      // v1, v2 and v3 are brought forward rather than refused, because every
      // one of those changes is additive: new tables, one widened status set,
      // five nullable columns and one partial index, and not a single existing
      // row's meaning altered or digest recomputed. A v3 encumbrance that was
      // never released projects byte-identically under v4's digest, because
      // every release lineage field is conditional on being present — which is
      // precisely why no historical release is re-interpreted and no row is
      // re-sealed. Every other version still refuses, so these are three known
      // migrations rather than a general "try to upgrade anything" policy — and
      // refusing outright would have stopped every deployment that already
      // holds authority state, to add columns they have no values for.
      if (
        existingVersion.schema_version !== GOVERNED_AUTHORITY_STORE_SCHEMA_V1 &&
        existingVersion.schema_version !== GOVERNED_AUTHORITY_STORE_SCHEMA_V2 &&
        existingVersion.schema_version !== GOVERNED_AUTHORITY_STORE_SCHEMA_V3
      ) {
        db.close();
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_STORE_UNAVAILABLE',
          `Governed Authority Store schema version '${existingVersion.schema_version}' is not supported by this runtime (expected '${GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION}'). Refusing to open the store.`,
        );
      }
      migrating = true;
      // Only a database that already carries the v2 reservations table needs
      // its status CHECK widened. A v1 database has no such table yet, so the
      // `SCHEMA_V2` DDL below creates it — with v3's own CHECK, since that DDL
      // has been updated in place and `CREATE TABLE IF NOT EXISTS` only ever
      // runs when the table is absent.
      migrateReservationCheck = existingVersion.schema_version === GOVERNED_AUTHORITY_STORE_SCHEMA_V2;
    }
  }

  db.exec(SCHEMA_V1);
  db.exec(SCHEMA_V2);
  if (migrateReservationCheck) migrateReservationsToV3(db);
  db.exec(SCHEMA_V3);
  // v4's release lineage. Unconditional, because `SCHEMA_V3`'s
  // `CREATE TABLE IF NOT EXISTS` leaves a fresh database at the v3 shape too;
  // one path brings a new store and a migrated one to exactly the same place.
  applyEncumbranceReleaseColumns(db);
  const recordedVersion = db.prepare(`SELECT schema_version FROM governed_authority_store_versions ORDER BY id DESC LIMIT 1`).get() as
    | { schema_version: string }
    | undefined;
  if (recordedVersion === undefined) {
    db.prepare(`INSERT INTO governed_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, ?, ?)`).run(
      GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
      'applied',
      now(),
    );
  } else if (migrating) {
    // Appended, never overwritten: the version table is a history, and a
    // reader must be able to see that this database was migrated rather than
    // created at v3.
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

  const selectEncumbrancesFor = db.prepare(
    `SELECT * FROM governed_authority_encumbrances
       WHERE tenant_id = ? AND holder_ref = ? AND resource_kind = ? AND resource_id = ? AND governed_right = ?
       ORDER BY encumbrance_id ASC`,
  );
  const selectEncumbranceById = db.prepare(`SELECT * FROM governed_authority_encumbrances WHERE tenant_id = ? AND encumbrance_id = ?`);
  const selectEncumbranceByIdempotencyKey = db.prepare(`SELECT * FROM governed_authority_encumbrances WHERE tenant_id = ? AND idempotency_key = ?`);
  const selectEncumbrancesByMandate = db.prepare(
    `SELECT * FROM governed_authority_encumbrances WHERE tenant_id = ? AND source_mandate_ref = ? ORDER BY encumbrance_id ASC`,
  );
  const selectEncumbranceByReleaseExecution = db.prepare(
    `SELECT * FROM governed_authority_encumbrances WHERE tenant_id = ? AND release_execution_ref = ?`,
  );
  const insertEncumbrance = db.prepare(
    `INSERT INTO governed_authority_encumbrances (
       encumbrance_id, tenant_id, holder_ref, resource_kind, resource_id, governed_right,
       scope_kind, scope_basis_points, scope_units, scope_unit_denomination,
       source_action, source_mandate_ref, source_execution_ref, source_reservation_ref,
       effective_from, status, released_at, release_basis,
       release_action, release_mandate_ref, release_execution_ref, released_by, release_reason_code,
       idempotency_key, correlation_id,
       created_at, updated_at, encumbrance_digest, schema_version
     ) VALUES (
       @encumbrance_id, @tenant_id, @holder_ref, @resource_kind, @resource_id, @governed_right,
       @scope_kind, @scope_basis_points, @scope_units, @scope_unit_denomination,
       @source_action, @source_mandate_ref, @source_execution_ref, @source_reservation_ref,
       @effective_from, @status, @released_at, @release_basis,
       @release_action, @release_mandate_ref, @release_execution_ref, @released_by, @release_reason_code,
       @idempotency_key, @correlation_id,
       @created_at, @updated_at, @encumbrance_digest, @schema_version
     )`,
  );
  const updateEncumbranceRelease = db.prepare(
    `UPDATE governed_authority_encumbrances
       SET status = @status, released_at = @released_at, release_basis = @release_basis,
           release_action = @release_action, release_mandate_ref = @release_mandate_ref,
           release_execution_ref = @release_execution_ref, released_by = @released_by,
           release_reason_code = @release_reason_code,
           updated_at = @updated_at, encumbrance_digest = @encumbrance_digest
       WHERE encumbrance_id = @encumbrance_id`,
  );
  const countActiveEncumbrances = db.prepare(`SELECT COUNT(*) AS total FROM governed_authority_encumbrances WHERE status = 'active'`);

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

  function readEncumbrancesFor(
    tenantId: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
    governedRight: GovernedRightType,
  ): GovernedAuthorityEncumbrance[] {
    return (selectEncumbrancesFor.all(tenantId, holderRef, resource.kind, resource.id, governedRight) as EncumbranceRow[]).map(toEncumbrance);
  }

  function insertSealedEncumbrance(draft: Omit<GovernedAuthorityEncumbrance, 'digest'>): GovernedAuthorityEncumbrance {
    const sealed: GovernedAuthorityEncumbrance = { ...draft, digest: computeEncumbranceDigest(draft) };
    insertEncumbrance.run({
      encumbrance_id: sealed.id,
      tenant_id: sealed.tenantId,
      holder_ref: sealed.holderRef,
      resource_kind: sealed.resourceKind,
      resource_id: sealed.resourceId,
      governed_right: sealed.governedRight,
      ...writeScopeColumns(sealed.scope),
      source_action: sealed.sourceAction,
      source_mandate_ref: sealed.sourceMandateRef,
      source_execution_ref: sealed.sourceExecutionRef,
      source_reservation_ref: sealed.sourceReservationRef ?? null,
      effective_from: sealed.effectiveFrom,
      status: sealed.status,
      released_at: sealed.releasedAt ?? null,
      release_basis: sealed.releaseBasis ?? null,
      release_action: sealed.releaseAction ?? null,
      release_mandate_ref: sealed.releaseMandateRef ?? null,
      release_execution_ref: sealed.releaseExecutionRef ?? null,
      released_by: sealed.releasedBy ?? null,
      release_reason_code: sealed.releaseReasonCode ?? null,
      idempotency_key: sealed.idempotencyKey,
      correlation_id: sealed.correlationId ?? null,
      created_at: sealed.createdAt,
      updated_at: sealed.updatedAt,
      encumbrance_digest: sealed.digest,
      schema_version: GOVERNED_AUTHORITY_STORE_SCHEMA_VERSION,
    });
    return sealed;
  }

  /**
   * Moves an encumbrance to `'released'`, re-sealing its digest over the new
   * bytes so the row stays verifiable rather than becoming a permanent
   * integrity failure.
   *
   * The status change and the lineage that justifies it are written by one
   * statement. A row that said `'released'` without naming what released it
   * would be exactly the unattributable state this phase exists to make
   * impossible, and the partial UNIQUE index on the release execution is
   * enforced by the same write — so a second constraint claiming one confirmed
   * release fails at the database rather than at a read.
   */
  function writeEncumbranceRelease(
    encumbrance: GovernedAuthorityEncumbrance,
    releasedAt: string,
    basis: ReleaseGovernedAuthorityEncumbranceInput['basis'],
  ): GovernedAuthorityEncumbrance {
    const { digest: _digest, ...rest } = encumbrance;
    const next = { ...rest, status: 'released' as const, releasedAt, ...projectReleaseBasis(basis), updatedAt: releasedAt };
    const sealed: GovernedAuthorityEncumbrance = { ...next, digest: computeEncumbranceDigest(next) };
    updateEncumbranceRelease.run({
      encumbrance_id: sealed.id,
      status: sealed.status,
      released_at: sealed.releasedAt ?? null,
      release_basis: sealed.releaseBasis ?? null,
      release_action: sealed.releaseAction ?? null,
      release_mandate_ref: sealed.releaseMandateRef ?? null,
      release_execution_ref: sealed.releaseExecutionRef ?? null,
      released_by: sealed.releasedBy ?? null,
      release_reason_code: sealed.releaseReasonCode ?? null,
      updated_at: sealed.updatedAt,
      encumbrance_digest: sealed.digest,
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
        const debited = subtractAuthorityScope(source.scope, input.scope, { positionId: source.id, governedRight });
        // The structural invariant, read inside this transaction so it cannot
        // straddle a concurrent constraint being recorded. What the source keeps
        // must still cover the persistent constraints standing over it, because
        // those constraints are holder-bound and do not follow the authority to
        // the recipient. Not "encumbered authority cannot move" — a holder with
        // 5 000 bp and a 4 000 bp constraint may still move 1 000 — but a
        // refusal to leave AOC holding a constraint over authority its holder no
        // longer possesses.
        assertRemainingScopeCoversEncumbrances(
          debited,
          readEncumbrancesFor(input.tenantId, input.fromHolderRef, input.resource, governedRight),
          input.occurredAt,
          { tenantId: input.tenantId, holderRef: input.fromHolderRef, governedRight, positionId: source.id },
        );
        return {
          governedRight,
          source,
          target,
          debited,
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
      // Persistent constraints are part of the same gate, not a separate one. A
      // commitment that ignored them would be exactly the post-execution double
      // commitment this layer closes: the reservations behind an executed
      // collateralization are terminal, so only its encumbrance still says that
      // authority is spoken for.
      const availability = computeCapacity(
        position,
        readReservationsFor(input.tenantId, input.holderRef, input.resource, input.governedRight),
        readEncumbrancesFor(input.tenantId, input.holderRef, input.resource, input.governedRight),
        recordedAt,
      );

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
      if (availability.outcome === 'overencumbered') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `More governed authority stands persistently constrained against '${input.holderRef}' than that holder possesses; refusing to commit further until the inconsistency is resolved.`,
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: availability.held,
            encumbered: availability.encumbered,
          },
        );
      }

      if (!governedRightsScopeWithin(serializeGovernedRightsScope(input.scope), availability.available)) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `'${input.holderRef}' holds enough '${input.governedRight}' in total, but too much of it is already committed or persistently constrained to commit this much more.`,
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: availability.held,
            ...(availability.committed !== undefined ? { committed: availability.committed } : {}),
            ...(availability.encumbered !== undefined ? { encumbered: availability.encumbered } : {}),
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
    if (reservation.status === 'encumbered') {
      // The commitment did not lapse — it became a persistent constraint, which
      // is now what accounts for the same quantity. Reopening the reservation
      // would not return the capacity (the encumbrance still holds it) but it
      // would misstate the lifecycle, and a later release of the constraint
      // would then have to reason about a reservation resurrected after being
      // spent.
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_RESERVATION_CONFLICT',
        `Governed authority reservation '${reservation.id}' became a persistent encumbrance when its governed action executed; the commitment was spent rather than ended, and releasing it here would misstate what happened. Release the encumbrance instead.`,
        { reservationId: reservation.id },
      );
    }
    return writeReservationStatus(reservation, 'released', releasedAt);
  });

  /**
   * One commit section for the whole handoff: decide capacity, write the
   * persistent constraint, and terminalize the commitment it takes over from —
   * or none of it.
   *
   * This is the transaction the whole phase turns on. Both rows live in this
   * database, so this is a real atomicity claim rather than a coordination
   * story: there is no instant at which the reservation has ended and the
   * constraint does not yet exist, and therefore no window in which a
   * competing acquisition is told the authority is free. Crashing before COMMIT
   * rolls back both, leaving the reservation active over an unconstrained
   * position — conservative, self-describing, and safe to retry, because the
   * retry is idempotent on the execution reference.
   *
   * `UNIQUE (tenant_id, idempotency_key)` and
   * `UNIQUE (tenant_id, source_execution_ref, governed_right)` refuse a
   * duplicate even if one somehow reached the insert.
   */
  const commitEncumbrance = db.transaction(
    (
      input: RecordGovernedAuthorityEncumbranceInput,
      idempotencyKey: string,
      effectiveFrom: string,
      recordedAt: string,
    ): RecordGovernedAuthorityEncumbranceOutcome => {
      const existingRow = selectEncumbranceByIdempotencyKey.get(input.tenantId, idempotencyKey) as EncumbranceRow | undefined;
      if (existingRow !== undefined) {
        const existing = toEncumbrance(existingRow);
        if (
          !encumbranceReplayMatches(existing, {
            holderRef: input.holderRef,
            resourceKind: input.resource.kind,
            resourceId: input.resource.id,
            governedRight: input.governedRight,
            scope: input.scope,
            sourceAction: input.sourceAction,
            sourceMandateRef: input.sourceMandateRef,
            sourceExecutionRef: input.sourceExecutionRef,
          })
        ) {
          throw new AuthorityGovernanceError(
            'GOVERNED_AUTHORITY_ENCUMBRANCE_CONFLICT',
            `Idempotency key '${idempotencyKey}' already constrains governed authority under materially different terms; a replay must restate the same constraint.`,
            { idempotencyKey, encumbranceId: existing.id },
          );
        }
        return { outcome: 'encumbered' as const, encumbrance: existing, replayed: true };
      }

      const position = readPosition(input.tenantId, input.holderRef, input.resource, input.governedRight);
      if (position === null) {
        const enrolled = ((countPositionsForResource.get(input.tenantId, input.resource.kind, input.resource.id) as { total: number } | undefined)?.total ?? 0) > 0;
        if (!enrolled) return { outcome: 'resource_not_enrolled' as const };
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE',
          `'${input.holderRef}' holds no recognized authority over '${input.governedRight}' of this resource; there is nothing to constrain.`,
          { tenantId: input.tenantId, holderRef: input.holderRef, governedRight: input.governedRight },
        );
      }

      const standing = readReservationsFor(input.tenantId, input.holderRef, input.resource, input.governedRight);
      const constraints = readEncumbrancesFor(input.tenantId, input.holderRef, input.resource, input.governedRight);

      // The handoff's central accounting rule: the commitment being converted
      // must not be counted against the constraint replacing it. Both describe
      // the same promised authority, one instant apart, so the reservations
      // recorded against this mandate are set aside while capacity for their
      // successor is decided. Every *other* commitment and every other
      // constraint still counts, which is what stops a competing mandate's
      // capacity being spent here.
      const surrendered =
        input.consumesReservationsForMandateRef === undefined
          ? new Set<string>()
          : new Set(
              standing
                .filter((reservation) => reservation.sourceMandateRef === input.consumesReservationsForMandateRef && reservation.status === 'active')
                .map((reservation) => reservation.id),
            );
      const capacity = computeCapacity(
        position,
        standing.filter((reservation) => !surrendered.has(reservation.id)),
        constraints,
        recordedAt,
      );

      if (capacity.outcome === 'incompatible') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
          'This governed authority cannot be constrained by that quantity: the position and the state standing against it are not commensurable with it.',
          { tenantId: input.tenantId, holderRef: input.holderRef, governedRight: input.governedRight },
        );
      }
      if (capacity.outcome === 'no_authority' || capacity.outcome === 'overcommitted' || capacity.outcome === 'overencumbered') {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `The governed authority of '${input.holderRef}' is already inconsistent with what stands against it; refusing to record a further persistent constraint until it is resolved.`,
          { tenantId: input.tenantId, holderRef: input.holderRef, governedRight: input.governedRight, capacity: capacity.outcome },
        );
      }
      // Commensurability first, so an incomparable quantity is named as one
      // rather than reported as a shortfall. `governedRightsScopeWithin` answers
      // false for both, and an operator's remedy for "these are not the same
      // kind of quantity" is nothing like their remedy for "too much is already
      // spoken for".
      const requestedScope = serializeGovernedRightsScope(input.scope);
      if (
        requestedScope.kind !== capacity.available.kind ||
        (requestedScope.kind === 'unitized' &&
          capacity.available.kind === 'unitized' &&
          requestedScope.unitDenomination !== capacity.available.unitDenomination)
      ) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE',
          'This governed authority cannot be constrained by that quantity: the two scopes are of different kinds, or name different unit denominations, and AOC holds no conversion between them.',
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: capacity.held,
            requested: requestedScope,
          },
        );
      }
      if (!governedRightsScopeWithin(requestedScope, capacity.available)) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT',
          `'${input.holderRef}' holds enough '${input.governedRight}' in total, but too much of it already stands committed or persistently constrained to constrain this much more.`,
          {
            tenantId: input.tenantId,
            holderRef: input.holderRef,
            governedRight: input.governedRight,
            held: capacity.held,
            ...(capacity.committed !== undefined ? { committed: capacity.committed } : {}),
            ...(capacity.encumbered !== undefined ? { encumbered: capacity.encumbered } : {}),
            available: capacity.available,
            requested: requestedScope,
          },
        );
      }

      const sourceReservation = [...surrendered][0];
      const encumbrance = insertSealedEncumbrance({
        id: deriveEncumbranceId(input.tenantId, input.sourceExecutionRef, input.governedRight),
        tenantId: input.tenantId,
        holderRef: input.holderRef,
        resourceKind: input.resource.kind,
        resourceId: input.resource.id,
        governedRight: input.governedRight,
        scope: serializeGovernedRightsScope(input.scope),
        sourceAction: input.sourceAction,
        sourceMandateRef: input.sourceMandateRef,
        sourceExecutionRef: input.sourceExecutionRef,
        ...(sourceReservation !== undefined ? { sourceReservationRef: sourceReservation } : {}),
        effectiveFrom,
        status: 'active',
        idempotencyKey,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        createdAt: recordedAt,
        updatedAt: recordedAt,
      });

      // The handoff, in the same transaction that just wrote the constraint. A
      // commitment is terminalized only once the constraints created under its
      // mandate cover the whole of what it reserved: a mandate whose terms
      // permit instalments keeps its reservation active until the last one
      // lands, and the reservation's residual — reserved less already-encumbered
      // — is what protects the instalments still to come without double-counting
      // the ones already recorded.
      if (input.consumesReservationsForMandateRef !== undefined) {
        const afterWrite = readEncumbrancesFor(input.tenantId, input.holderRef, input.resource, input.governedRight);
        for (const reservationId of surrendered) {
          const reservation = standing.find((candidate) => candidate.id === reservationId);
          if (reservation === undefined || reservation.status !== 'active') continue;
          const carvedOut = sumActiveEncumbrances(
            afterWrite.filter(
              (candidate) => candidate.sourceMandateRef === reservation.sourceMandateRef && candidate.governedRight === reservation.governedRight,
            ),
            recordedAt,
          );
          if (carvedOut === null || carvedOut === 'incompatible') continue;
          if (!governedRightsScopeWithin(reservation.scope, carvedOut)) continue;
          writeReservationStatus(reservation, 'encumbered', recordedAt);
        }
      }

      return { outcome: 'encumbered' as const, encumbrance, replayed: false };
    },
  );

  /**
   * One commit section for release: read the current status, check the grounds
   * against what is already stored, and write the terminal state together, so
   * two concurrent releases cannot both observe `'active'` and both restore the
   * same capacity.
   *
   * No capacity is written here, and that is the point. Availability is
   * *derived* from the constraints still active, so terminalizing one row is
   * the whole of the operation — there is no `available += released` step that
   * a retry, a race or a crash could apply twice.
   */
  const commitEncumbranceRelease = db.transaction(
    (input: ReleaseGovernedAuthorityEncumbranceInput, releasedAt: string): GovernedAuthorityEncumbrance => {
      const row = selectEncumbranceById.get(input.tenantId, input.encumbranceId) as EncumbranceRow | undefined;
      if (row === undefined) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_ENCUMBRANCE_NOT_FOUND',
          `No governed authority encumbrance '${input.encumbranceId}' exists in this tenant.`,
          { tenantId: input.tenantId, encumbranceId: input.encumbranceId },
        );
      }
      const encumbrance = toEncumbrance(row);

      // Already released: return it unchanged when the grounds match the ones
      // already recorded, and refuse when they do not. Capacity is derived from
      // the constraints still active rather than from a counter, so a second
      // release cannot free the same authority twice either way — but returning
      // the record rather than rewriting it keeps the audit honest about when
      // the release actually happened, and refusing *different* grounds
      // surfaces two lifecycles both believing they discharged one constraint.
      if (encumbrance.status === 'released') {
        if (!encumbranceReleaseReplayMatches(encumbrance, input.basis)) {
          throw new AuthorityGovernanceError(
            'GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_CONFLICT',
            `Governed authority encumbrance '${encumbrance.id}' was already released on different grounds; refusing to restate why a terminal constraint ended.`,
            { encumbranceId: encumbrance.id, recordedBasis: encumbrance.releaseBasis, presentedBasis: input.basis.kind },
          );
        }
        return encumbrance;
      }

      // One confirmed release execution terminalizes at most one constraint.
      // Checked here as well as by the partial UNIQUE index, so the refusal
      // arrives as this module's own error rather than as a driver constraint
      // violation — the index remains the durable defence against a writer this
      // process never sees.
      if (input.basis.kind === 'governed-execution') {
        const claimed = selectEncumbranceByReleaseExecution.get(input.tenantId, input.basis.executionRef) as EncumbranceRow | undefined;
        if (claimed !== undefined && claimed.encumbrance_id !== encumbrance.id) {
          throw new AuthorityGovernanceError(
            'GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_CONFLICT',
            `Release execution '${input.basis.executionRef}' already terminalized governed authority encumbrance '${claimed.encumbrance_id}'; one confirmed release discharges exactly the constraint it discharged.`,
            {
              releaseExecutionRef: input.basis.executionRef,
              releasedEncumbranceId: claimed.encumbrance_id,
              presentedEncumbranceId: encumbrance.id,
            },
          );
        }
      }

      return writeEncumbranceRelease(encumbrance, releasedAt, input.basis);
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
      return computeCapacity(
        position,
        readReservationsFor(query.tenantId, query.holderRef, query.resource, query.governedRight),
        readEncumbrancesFor(query.tenantId, query.holderRef, query.resource, query.governedRight),
        at,
      );
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

    async recordEncumbrance(context: AuthorityGovernanceContext, input: RecordGovernedAuthorityEncumbranceInput) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      assertKnownGovernedRight(input.governedRight);
      assertValidAuthorityScope(input.scope, 'scope');
      assertNonZeroAuthorityScope(input.scope, 'scope');

      // The trusted basis, asserted before the transaction opens. An action
      // that leaves no persistent constraint has no business recording one, and
      // a constraint with no execution behind it is a constraint somebody
      // asserted rather than earned.
      if (!governedActionEncumbersAuthority(input.sourceAction)) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID',
          `'${input.sourceAction}' is not classified as leaving a persistent governed authority constraint; refusing to record one for it.`,
          { sourceAction: input.sourceAction },
        );
      }
      if (input.sourceExecutionRef.length === 0 || input.sourceMandateRef.length === 0) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID',
          'A persistent governed authority constraint must name both the authorization artifact it arose under and the execution evidence that created it.',
          { sourceMandateRef: input.sourceMandateRef, sourceExecutionRef: input.sourceExecutionRef },
        );
      }

      const effectiveFrom = requireStrictUtcAuthorityTimestamp(input.effectiveFrom, 'effectiveFrom');
      const recordedAt = requireStrictUtcAuthorityTimestamp(now(), 'recordedAt');
      const idempotencyKey = input.idempotencyKey ?? deriveEncumbranceIdempotencyKey(input.sourceExecutionRef, input.governedRight);
      return commitEncumbrance(input, idempotencyKey, effectiveFrom, recordedAt);
    },

    async releaseEncumbrance(context: AuthorityGovernanceContext, input: ReleaseGovernedAuthorityEncumbranceInput) {
      requireAuthorityAccessToOrganization(context, input.tenantId);
      // An administrative withdrawal stays privileged, exactly as it always
      // was. A governed-execution basis is not, because what makes it
      // trustworthy is the execution reference it carries rather than the
      // caller's context — see the interface documentation on
      // `GovernedAuthorityStore.releaseEncumbrance`.
      if (input.basis.kind === 'administrative' && !context.system) {
        throw new AuthorityGovernanceError(
          'GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_NOT_PERMITTED',
          'A privileged administrative withdrawal of a persistent governed authority constraint requires a system context; ordinary discharge goes through the governed release lifecycle.',
          { encumbranceId: input.encumbranceId },
        );
      }
      assertEncumbranceReleaseBasisAcceptable(input.basis, { encumbranceId: input.encumbranceId });
      const releasedAt = requireStrictUtcAuthorityTimestamp(input.releasedAt ?? now(), 'releasedAt');
      return commitEncumbranceRelease(input, releasedAt);
    },

    async getEncumbranceByReleaseExecutionRef(context: AuthorityGovernanceContext, tenantId: string, releaseExecutionRef: string) {
      requireAuthorityAccessToOrganization(context, tenantId);
      const row = selectEncumbranceByReleaseExecution.get(tenantId, releaseExecutionRef) as EncumbranceRow | undefined;
      // A cross-tenant reference reads as absent rather than as a refusal,
      // exactly as `getEncumbrance` does.
      if (row === undefined) return null;
      return toEncumbrance(row);
    },

    async getEncumbrance(context: AuthorityGovernanceContext, tenantId: string, encumbranceId: string) {
      requireAuthorityAccessToOrganization(context, tenantId);
      // Scoped by tenant in the SQL itself, so a cross-tenant id reads as absent
      // rather than as a refusal: a caller must not be able to probe another
      // tenant's encumbrance identifiers by telling "denied" from "no such
      // thing".
      const row = selectEncumbranceById.get(tenantId, encumbranceId) as EncumbranceRow | undefined;
      return row === undefined ? null : toEncumbrance(row);
    },

    async listEncumbrancesByMandateRef(context: AuthorityGovernanceContext, tenantId: string, sourceMandateRef: string) {
      requireAuthorityAccessToOrganization(context, tenantId);
      return (selectEncumbrancesByMandate.all(tenantId, sourceMandateRef) as EncumbranceRow[]).map(toEncumbrance);
    },

    async listActiveEncumbrances(context: AuthorityGovernanceContext, query: GovernedAuthorityAvailabilityQuery) {
      requireAuthorityAccessToOrganization(context, query.tenantId);
      const at = requireStrictUtcAuthorityTimestamp(query.at, 'at');
      return readEncumbrancesFor(query.tenantId, query.holderRef, query.resource, query.governedRight).filter((encumbrance) =>
        governedAuthorityEncumbranceConstrains(encumbrance, at),
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
        activeEncumbranceCount: (countActiveEncumbrances.get() as { total: number }).total,
      };
    },

    async close() {
      db.close();
    },
  };
}
