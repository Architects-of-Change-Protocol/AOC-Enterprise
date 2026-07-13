# AOC Enterprise v1 — Automated Backup (`backup:v1`)

Automated counterpart to the manual procedure in
`docs/operations/BACKUP_RECOVERY_V1.md`. That document remains the
authority on *why* (consistency model, frequency, retention); this
document covers the `backup:v1` **command** it now recommends as the
default way to take a backup. Companion document:
`docs/operations/AOC_ENTERPRISE_RESTORE_V1.md`.

## What it backs up

Exactly the three independent SQLite stores the Enterprise Host itself
uses (see `docs/release/AOC_ENTERPRISE_V1_PORTABILITY_CURRENT_STATE.md`
for how this was verified against source, not assumed):

| Store | Config variable read | Backup filename |
|---|---|---|
| Governance Store | `AOC_ENTERPRISE_SQLITE_PATH` | `stores/governance.sqlite` |
| Agent Passport Store | `AOC_ENTERPRISE_PASSPORT_SQLITE_PATH` | `stores/agent-passport.sqlite` |
| Assurance Store | `AOC_ENTERPRISE_ASSURANCE_SQLITE_PATH` | `stores/assurance.sqlite` |

**Evidence Bundles are not backed up.** The Evidence Bundle Store has no
SQLite implementation in v1 — it is always in-memory
(`createInMemoryEvidenceStore`), regardless of
`AOC_ENTERPRISE_PERSISTENCE_PROVIDER`. A Bundle is a deterministic,
disclosure-scoped projection *of* a Governance Record; it is always
rebuildable on demand (`POST /api/evidence` with the same
`evaluationId`/`level`) once the Governance Store is restored. Only the
already-issued `bundleId` and its lifecycle bookkeeping
(`GENERATED`/`VERIFIED`/`EXPORTED`) do not survive a restart — this is a
documented v1 limitation, not something this tooling works around.

## Command

```bash
npm run backup:v1 -- --output <directory> [--force]
```

Reads store locations from the same environment variables the Enterprise
Host itself reads (`loadEnterpriseConfiguration()` — there is no separate
backup-specific configuration surface). Run it with the same environment
you'd use to start the Host, e.g.:

```bash
AOC_ENTERPRISE_PERSISTENCE_PROVIDER=sqlite \
AOC_ENTERPRISE_SQLITE_PATH=/var/lib/aoc-enterprise/enterprise-host.sqlite \
AOC_ENTERPRISE_PASSPORT_SQLITE_PATH=/var/lib/aoc-enterprise/agent-passport.sqlite \
AOC_ENTERPRISE_ASSURANCE_SQLITE_PATH=/var/lib/aoc-enterprise/assurance.sqlite \
npm run backup:v1 -- --output /backups/2026-07-13
```

Requires `npm run build` to have already run (the command loads
`dist/src/enterprise/index.js`, the built package's public surface).

Flags:

- `--output <dir>` (required) — destination directory. Must not exist, or
  must be empty, unless `--force`/`--replace` is passed.
- `--force` / `--replace` — permit replacing an existing, non-empty output
  directory.
- `--allow-missing-stores` — permit backing up fewer than three stores,
  for a deployment that deliberately never uses one of them (e.g. Passport
  disabled). Without this flag, a missing store file is treated as an
  error, not a silent skip — see "Fails closed" below.

## What the command actually does (Phase 5/6/7 of the portability mission)

1. Validates `AOC_ENTERPRISE_PERSISTENCE_PROVIDER=sqlite` — the `memory`
   provider has nothing durable to back up and the command refuses to run
   against it.
2. Rejects an `--output` path that is nested inside (or is an ancestor
   of) any source store's directory.
3. For each store, copies the live database using **SQLite's Online
   Backup API** (`better-sqlite3`'s `Database#backup()`), never a plain
   byte-level `cp`. This is safe against a live writer and produces a
   transactionally consistent snapshot of that file, exactly like the
   manual procedure's `sqlite3 <db> ".backup ..."` (see Phase 6 in
   `AOC_ENTERPRISE_V1_PORTABILITY_REPORT.md` for why a raw `cp` of a
   WAL-mode database is unsafe). If the copy inherits WAL mode from the
   source, it is switched to `journal_mode = DELETE` immediately
   afterward, so the backup artifact is one self-contained file with no
   `-wal`/`-shm` sidecars.
4. Runs `PRAGMA integrity_check` on every copied file. Any result other
   than `ok` aborts the entire backup — no partial backup is ever
   promoted.
5. Reads each store's own schema-version table
   (`governance_store_versions`, `agent_passport_store_versions`,
   `assurance_store_versions`) and refuses to back up a store whose
   recorded schema this build's own runtime does not support.
6. Computes a SHA-256 checksum of each copied file.
7. Writes the canonical `backup-manifest.json` (format
   `aoc.enterprise.backup.v1`; see the schema below), `checksums.sha256`,
   `metadata/*.json`, and a generated `RESTORE.md`.
8. Assembles all of this in a staging directory (a sibling of `--output`,
   so the final move is a same-filesystem, effectively atomic rename),
   then promotes it into `--output` only once everything above has
   succeeded.
9. On **any** failure, the staging directory is deleted and `--output` is
   left exactly as it was before the command ran — there is no partial
   backup on disk to trust by accident.
10. Never reads or copies `.env`, `AOC_ENTERPRISE_API_KEYS`, or any other
    secret. The manifest records which environment variables are required
    to restore and which are deliberately excluded
    (`configuration.excludedSecrets`).

### "Fails closed" on a missing store

Unlike the runtime itself (which auto-creates an empty, schema-stamped
SQLite file for a store it has never used), `backup:v1` treats a missing
store file as an error by default. A missing file is ambiguous — it could
mean "this store was never used" or "the wrong path was configured" — and
a backup command should never guess. Start the Host once against the
target configuration (which creates the empty, schema-stamped file), or
pass `--allow-missing-stores` if the omission is intentional.

## Backup manifest (`aoc.enterprise.backup.v1`)

```json
{
  "backupFormat": "aoc.enterprise.backup.v1",
  "backupId": "backup-<timestamp>-<short-commit>",
  "createdAt": "<ISO-8601, non-deterministic>",
  "source": { "commit": "...", "branch": "...", "releaseVersion": "1.0.0", "nodeVersion": "v22.x", "platform": "linux", "architecture": "x64" },
  "enterprise": { "enterpriseVersion": "...", "governanceStoreVersion": "...", "evidenceRuntimeVersion": "...", "passportRuntimeVersion": "...", "assuranceRuntimeVersion": "..." },
  "stores": [
    { "name": "governance", "filename": "governance.sqlite", "originalPath": "...", "sizeBytes": 0, "checksum": "sha256:...", "schemaVersion": "...", "migrationState": "...", "required": true, "recordCount": 0, "integrityCheck": "ok" }
  ],
  "configuration": { "requiredEnvironmentVariables": ["AOC_ENTERPRISE_PERSISTENCE_PROVIDER", "..."], "excludedSecrets": ["AOC_ENTERPRISE_API_KEYS"] },
  "verification": { "checksumAlgorithm": "sha256", "sqliteIntegrityChecked": true, "recordIntegrityChecked": false }
}
```

- `stores` is always ordered `governance`, `agent-passport`, `assurance`
  (a fixed, stable order — never reflects filesystem iteration order).
- Every field is written through a stable-key-sorted JSON serializer
  (`scripts/portability/lib-portability.mjs`'s `stableJsonStringify`), so
  two backups of identical logical content diff cleanly. `createdAt` and
  `backupId` are the only fields that are inherently non-deterministic
  (they encode the moment the backup was taken).
- `verification.recordIntegrityChecked` is `false` in v1: `backup:v1`
  verifies SQLite-level integrity (`PRAGMA integrity_check`) and
  checksums, but does not additionally re-run the Governance/Passport/
  Assurance store's own digest-verification endpoints against every
  record during backup (that would make routine backups scan the entire
  history). Run the sampled `verify` endpoints from
  `BACKUP_RECOVERY_V1.md` §"Verifying backups" for that, or rely on
  `restore:v1`'s post-restore verification, which does open every
  restored store and confirm it reports `healthy`.

## Consistency model (Phase 6)

`backup:v1`'s Online-Backup-API copy is **per-file consistent**: safe
against a live writer, and internally coherent for that one store. It is
**not** a cross-store transactional snapshot — the three copies still
happen at slightly different instants if the Host is running, exactly as
documented in `BACKUP_RECOVERY_V1.md`. For strict cross-store consistency
(pre-upgrade, compliance snapshots), stop the Host first, then run
`backup:v1` — the existing "cold backup" recommendation is unchanged by
this tooling; `backup:v1` just replaces the manual `sqlite3 .backup`
invocations and adds a manifest, checksums, and integrity verification
around them.

## Security

- Never copies `.env`, API keys, tokens, or credentials — it only ever
  reads the three configured SQLite paths.
- Rejects an output path that recurses into a source store directory.
- Refuses to follow symlinks when reading store files (see
  `restore:v1`'s equivalent guard; backup reads sources directly by path,
  so this matters most on restore, where the *backup* becomes untrusted
  input).
- Sets no special permissions on the output directory beyond the
  process's umask — **the operator is responsible for storing backups
  encrypted, access-controlled, and off-host.** Governed records may
  still contain sensitive business data even though credentials are
  excluded; treat a backup with the same care as the live store.
- Commit only this tooling (scripts, docs, fixtures) to Git — never a
  real backup. `.gitignore` excludes `/backups/`, `/.portability-drill/`,
  and `*.aoc-enterprise-backup/`.

## RPO/RTO (see the portability report for the measured drill numbers)

Backup duration is dominated by store size; the synthetic fixture used in
CI/drill validation backs up in well under a second per store. Production
RPO is still **your backup interval** — see `BACKUP_RECOVERY_V1.md`
("RPO = your backup interval") — `backup:v1` does not add replication or
point-in-time recovery, it only makes taking a *verified* backup a single
command instead of a five-step manual procedure.
