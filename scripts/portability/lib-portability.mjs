// Shared helpers for the AOC Enterprise v1 backup/restore/portability tooling
// (docs/release/AOC_ENTERPRISE_V1_PORTABILITY_REPORT.md). Used by
// backup-enterprise-v1.mjs, restore-enterprise-v1.mjs,
// generate-portability-fixture.mjs, compare-portability-state.mjs, and
// validate-portability-v1.mjs so all five agree on the backup format,
// store list, and canonicalization.
//
// Reuses the runtime's own exported canonical JSON serializer
// (`canonicalSerialize`, `aoc.canonical-json.v1`) rather than inventing a
// second canonicalization -- see AOC_ENTERPRISE_V1_PORTABILITY_CURRENT_STATE.md.

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync, lstatSync, mkdirSync, readdirSync, rmSync, renameSync, mkdtempSync } from 'node:fs';
import { resolve, join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

export const BACKUP_FORMAT = 'aoc.enterprise.backup.v1';

export const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);

/**
 * The durable SQLite stores backed up as one set (Phase 1 inventory).
 *
 * Evidence Bundles still have no SQLite store -- see the current-state doc --
 * so there is deliberately no entry for them.
 *
 * The Kernel Authority Store (P0-PKG-07) IS here, and its inclusion is not
 * optional the way an audit store's would be: it is authority
 * source-of-truth, so a disaster recovery that restored evaluation history
 * but not the authority world would come back with every actor unrecognized
 * and every action denied. A backup that loses it is not a backup.
 */
export const STORE_DEFINITIONS = [
  {
    name: 'governance',
    filename: 'governance.sqlite',
    configPathOf: (config) => config.persistence.sqlitePath,
    versionTable: 'governance_store_versions',
    recordTable: 'governance_evaluations',
    schemaVersionKeyOf: (enterprise) => enterprise.GOVERNANCE_STORE_SCHEMA_VERSION,
    openStore: (enterprise, path) => enterprise.createSqliteGovernanceStore(path),
  },
  {
    name: 'agent-passport',
    filename: 'agent-passport.sqlite',
    configPathOf: (config) => config.passport.sqlitePath,
    versionTable: 'agent_passport_store_versions',
    recordTable: 'agent_passport_events',
    schemaVersionKeyOf: (enterprise) => enterprise.AGENT_PASSPORT_SCHEMA_VERSION,
    openStore: (enterprise, path) => enterprise.createSqlitePassportStore(path),
  },
  {
    name: 'assurance',
    filename: 'assurance.sqlite',
    configPathOf: (config) => config.assurance.sqlitePath,
    versionTable: 'assurance_store_versions',
    recordTable: 'assurance_assessments',
    schemaVersionKeyOf: (enterprise) => enterprise.ASSURANCE_STORE_SCHEMA_VERSION,
    openStore: (enterprise, path) => enterprise.createSqliteAssuranceStore(path),
  },
  {
    name: 'kernel-authority',
    filename: 'kernel-authority.sqlite',
    configPathOf: (config) => config.kernelAuthority.sqlitePath,
    versionTable: 'kernel_authority_store_versions',
    recordTable: 'kernel_authority_events',
    schemaVersionKeyOf: (enterprise) => enterprise.KERNEL_AUTHORITY_SCHEMA_VERSION,
    openStore: (enterprise, path) => enterprise.createSqliteKernelAuthorityStore(path),
  },
];

/** Secrets that must never be copied into a backup, even if present in the ambient environment (Phase 7). */
export const EXCLUDED_SECRET_ENV_VARS = ['AOC_ENTERPRISE_API_KEYS'];

let cachedEnterpriseModule;
let cachedBetterSqlite3;

/** Dynamically imports the built package's `./enterprise` subpath -- the same public surface `scripts/lib-release-manifest.mjs` already imports from `dist/src/enterprise/index.js`. Requires `npm run build` to have run first. */
export async function loadEnterpriseModule() {
  if (cachedEnterpriseModule === undefined) {
    const distPath = resolve(REPO_ROOT, 'dist/src/enterprise/index.js');
    if (!existsSync(distPath)) {
      throw new Error(`Built output not found at ${distPath}. Run "npm run build" before using the portability tooling.`);
    }
    cachedEnterpriseModule = await import(distPath);
  }
  return cachedEnterpriseModule;
}

/** Lazily loads `better-sqlite3` -- the project's own SQLite dependency (never the `sqlite3` CLI, per Phase 5/6). */
export async function loadBetterSqlite3() {
  if (cachedBetterSqlite3 === undefined) {
    const mod = await import('better-sqlite3');
    cachedBetterSqlite3 = mod.default ?? mod;
  }
  return cachedBetterSqlite3;
}

export function sha256Buffer(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

/** Recursively sorts object keys (mirrors `aoc.canonical-json.v1`'s ordering rule) so a manifest is stable and diff-friendly on disk, while staying human-readable (pretty-printed) -- unlike `canonicalSerialize`, which is compact and meant for digesting, not for storage. */
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key]);
    return sorted;
  }
  return value;
}

export function stableJsonStringify(value) {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

/** Resolves an absolute path and asserts it does not sit inside `ancestorPath` (or vice versa) -- guards against a backup destination recursing into a source store directory, or a restore target escaping via `..` (Phase 7/8 path-traversal requirements). */
export function assertNoPathOverlap(pathA, pathB, description) {
  const a = resolve(pathA);
  const b = resolve(pathB);
  if (a === b) throw new Error(`${description}: paths must not be identical (${a}).`);
  const aWithSep = `${a}${sep}`;
  const bWithSep = `${b}${sep}`;
  if (a.startsWith(bWithSep) || b.startsWith(aWithSep)) {
    throw new Error(`${description}: '${a}' and '${b}' must not be nested inside one another.`);
  }
}

/** Asserts `candidatePath`, once resolved, still lives inside `containerPath` -- rejects `../../etc/passwd`-style manifest filenames before they are ever opened. */
export function assertContained(containerPath, candidatePath, description) {
  const container = resolve(containerPath);
  const candidate = resolve(containerPath, candidatePath);
  if (candidate !== container && !candidate.startsWith(`${container}${sep}`)) {
    throw new Error(`${description}: '${candidatePath}' escapes its containing directory.`);
  }
  return candidate;
}

/** Refuses a symlink at `path` -- a backup/restore file set must be real files, never a link an attacker could repoint after validation (Phase 7/8/27). */
export function assertNotSymlink(path, description) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`${description}: '${path}' is a symlink, which is not permitted in a backup or restore file set.`);
  }
}

export async function sqliteIntegrityCheck(dbPath) {
  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.pragma('integrity_check');
    const ok = rows.length === 1 && rows[0].integrity_check === 'ok';
    return { ok, detail: ok ? 'ok' : rows.map((row) => row.integrity_check).join('; ') };
  } finally {
    db.close();
  }
}

export async function readStoreVersion(dbPath, versionTable) {
  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(versionTable);
    if (tableExists === undefined) return { schemaVersion: null, migrationState: null };
    const row = db.prepare(`SELECT schema_version, migration_state FROM ${versionTable} ORDER BY id DESC LIMIT 1`).get();
    return { schemaVersion: row?.schema_version ?? null, migrationState: row?.migration_state ?? null };
  } finally {
    db.close();
  }
}

export async function recordCount(dbPath, table) {
  const Database = await loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
    if (tableExists === undefined) return 0;
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
    return row.count;
  } finally {
    db.close();
  }
}

/**
 * Makes a transactionally-consistent copy of a possibly-live (WAL-mode)
 * SQLite database using SQLite's own Online Backup API, exposed by
 * better-sqlite3 as `Database#backup()` (Phase 6). Never a plain
 * byte-level `cp` of a live database.
 *
 * The copy inherits the source's `journal_mode`. If that is `wal` (the
 * runtime's default -- see `sqlite-governance-store.ts` and siblings), the
 * copy is switched to `journal_mode = DELETE` immediately afterward: a
 * backup artifact must be one self-contained file, exactly like the
 * existing manual procedure's `sqlite3 <db> ".backup ..."` output
 * (`docs/operations/BACKUP_RECOVERY_V1.md`: "no sidecars needed on
 * restore"). Without this, even a later *read-only* open of the WAL copy
 * would create `-shm`/`-wal` sidecars next to it.
 */
export async function safeSqliteCopy(sourcePath, destPath) {
  const Database = await loadBetterSqlite3();
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destPath);
  } finally {
    source.close();
  }

  const copy = new Database(destPath, { fileMustExist: true });
  try {
    const [{ journal_mode: mode }] = copy.pragma('journal_mode');
    if (mode === 'wal') copy.pragma('journal_mode = DELETE');
  } finally {
    copy.close();
  }
}

export function gitInfo() {
  const git = (args) => {
    try {
      return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  };
  return {
    commit: git('rev-parse HEAD'),
    branch: git('rev-parse --abbrev-ref HEAD'),
  };
}

/** A staging directory created as a *sibling* of `finalPath` so the final move is a same-filesystem `rename` (atomic) rather than a cross-device copy (Phase 5 point 16). */
export function createStagingDir(finalPath, prefix) {
  const parent = dirname(resolve(finalPath));
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, `.${prefix}-staging-`));
}

export function atomicPromote(stagingDir, finalPath, { force = false } = {}) {
  const resolvedFinal = resolve(finalPath);
  if (existsSync(resolvedFinal)) {
    const entries = readdirSync(resolvedFinal);
    if (entries.length > 0 && !force) {
      throw new Error(`Destination '${resolvedFinal}' already exists and is non-empty. Pass --force to replace it.`);
    }
    rmSync(resolvedFinal, { recursive: true, force: true });
  }
  renameSync(stagingDir, resolvedFinal);
}

export function cleanupDir(path) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

export function fileSize(path) {
  return statSync(path).size;
}

export function relativeToRepo(path) {
  return relative(REPO_ROOT, resolve(path));
}
