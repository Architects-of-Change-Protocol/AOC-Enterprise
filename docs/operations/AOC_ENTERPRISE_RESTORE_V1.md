# AOC Enterprise v1 — Automated Restore (`restore:v1`)

Companion to `docs/operations/AOC_ENTERPRISE_BACKUP_V1.md`. Validates an
`aoc.enterprise.backup.v1` backup set thoroughly **before** touching the
target directory, and fails closed — never silently repairs, migrates, or
partially restores a backup it cannot fully verify.

## Command

```bash
npm run restore:v1 -- --backup <backup-directory> --target <target-directory> [--force]
```

- `--backup <dir>` (required) — a directory produced by `backup:v1`
  (containing `backup-manifest.json`, `checksums.sha256`, `stores/`).
- `--target <dir>` (required) — where to place the restored SQLite files.
  Created if it does not exist. The restored files are always named
  `enterprise-host.sqlite`, `agent-passport.sqlite`, `assurance.sqlite` —
  point your `AOC_ENTERPRISE_*_SQLITE_PATH` variables at them after
  restore completes.
- `--force` / `--replace` — required if `--target` already contains any of
  those three filenames; without it, restore refuses to touch an existing
  store.

Requires `npm run build` to have already run.

## Validation order (all of this happens before any file is copied)

1. **Format version** — `backup-manifest.json`'s `backupFormat` must be
   exactly `aoc.enterprise.backup.v1`. Anything else — a future format
   this build predates, or an unrecognized string — is rejected outright.
   There is no "best effort" reading of an unknown format.
2. **Manifest structure** — every required top-level field
   (`backupId`, `createdAt`, `source`, `enterprise`, `stores`,
   `configuration`, `verification`) must be present, and `stores` must be
   a non-empty array. A manifest that is not even valid JSON is rejected
   with that fact stated plainly.
3. **No unexpected files** — the set of files actually present under
   `stores/` must exactly equal the set the manifest declares. An extra
   file (planted, or left over from a different backup) fails the
   restore; a missing declared file fails the restore.
4. **Path containment** — every manifest-declared filename is resolved
   and asserted to still live inside `stores/` after resolution — a
   `filename` of `../../etc/passwd` is rejected before it is ever opened.
5. **No symlinks** — every store file must be a regular file. A symlinked
   store file (which could point anywhere on the restoring host) is
   rejected.
6. **Checksum** — each file's SHA-256 must match the manifest's recorded
   checksum. This is the primary corruption/tamper detector; because any
   single-byte change anywhere in a SQLite file changes its checksum,
   this check alone already implies the file is byte-identical to what
   `backup:v1` produced.
7. **SQLite integrity** — `PRAGMA integrity_check` must report `ok` on
   every store file (defense in depth beyond the checksum: catches
   corruption a matching checksum could theoretically still carry, e.g.
   a bit-identical copy of an already-corrupt source).
8. **Schema-version compatibility** — each store's manifest-recorded
   schema version must equal what *this build's own runtime* exports
   (`GOVERNANCE_STORE_SCHEMA_VERSION` and siblings from
   `dist/src/enterprise/index.js`). A mismatch — older or newer — is
   rejected with the exact versions named. **v1 has no migration runner:**
   a schema mismatch is never silently migrated, only refused. Restore
   the backup using the build generation recorded in
   `metadata/release-context.json` instead (see the compatibility matrix
   below).

Only after all of the above pass does restore touch the target directory.

## Target handling

- If `--target` doesn't exist, it's created.
- If it exists but is empty of the three expected filenames, restore
  proceeds without `--force`.
- If any of the three filenames already exists in `--target`, restore
  refuses **unless** `--force`/`--replace` is passed.
- With `--force`, before copying anything in, existing target files are
  copied aside into
  `<target>/.pre-restore-safety-<backupId>/` — a safety net, never
  deleted by this command. Nothing is overwritten silently.
- Files are then copied from the (already fully verified) backup into
  `--target`, each re-checksummed immediately after the copy (defense
  against a copy-time I/O error).
- Each restored store is then opened through the **real runtime store
  constructor** (`createSqliteGovernanceStore`, etc. — from
  `dist/src/enterprise/index.js`, the exact same code the Enterprise Host
  itself uses) and its `.health()` is checked. This is what actually
  proves the restore: not "the bytes matched," but "this build can open
  this store and it reports healthy."
- **If any store fails this final open-and-health-check, restore rolls
  back**: every file it copied in this run is removed. If a
  pre-restore safety copy was taken, the target is left in the (safe,
  pre-restore) state that copy represents — restore never leaves a
  target directory in an unverified, half-restored condition.
- On full success, a `restore-report.json` is written into `--target`
  (see the schema below).

## Restore report

```json
{
  "backupId": "backup-...",
  "targetPath": "/path/to/target",
  "compatibilityResult": "supported",
  "checksumResult": "ok",
  "sqliteIntegrityResult": "ok",
  "migrationsApplied": [],
  "objectVerification": {
    "governance": { "opened": true, "status": "healthy", "schemaVersion": "...", "readable": true, "writable": true },
    "agent-passport": { "...": "..." },
    "assurance": { "...": "..." }
  },
  "status": "restored",
  "startedAt": "...",
  "finishedAt": "...",
  "durationMs": 0,
  "preRestoreSafetyCopy": null
}
```

`migrationsApplied` is always `[]` in v1 — see "No migration runner"
below.

## Compatibility matrix

| Backup format | Store schema | Runtime build | Restore result |
|---|---|---|---|
| `aoc.enterprise.backup.v1` | matches this build's exported schema version | same/compatible build | **supported** — proceeds |
| `aoc.enterprise.backup.v1` | older, unsupported schema version | current build | **rejected** — "no migration runner" (see below); restore using the build generation named in `metadata/release-context.json` |
| `aoc.enterprise.backup.v1` | newer schema version than this build supports | older build | **rejected** — this build cannot safely read a store from a newer generation |
| anything other than `aoc.enterprise.backup.v1` | any | any | **rejected outright** — unknown/future formats are never guessed at |

No backward- or forward-compatibility is claimed beyond exact schema-
version equality, because none has been implemented or tested. This
mirrors the existing store-level guard already in production
(`GOVERNANCE_SCHEMA_VERSION_UNSUPPORTED`, `PASSPORT_STORE_UNAVAILABLE`,
`ASSURANCE_STORE_UNAVAILABLE` — see
`docs/enterprise/MIGRATION_REVIEW_V1.md`); `restore:v1` simply checks the
same fact earlier, against the manifest, before ever touching disk.

### No migration runner (v1 limitation, stated plainly)

There is no schema migration tooling anywhere in this codebase — each
store either opens under the schema version it was written with, or it
refuses to open. `restore:v1` inherits this exactly: it never attempts to
transform an older or newer schema into the current one. If you need to
restore a backup taken under a different schema version, deploy the
matching build generation first (kept available for exactly this reason
— see `docs/operations/AOC_ENTERPRISE_BACKUP_V1.md` and the existing
Rollback runbook, `RUNBOOKS_V1.md` §3).

## Failure modes (all fail closed, all produce an actionable message)

| Injected failure | Result |
|---|---|
| A backup database's bytes were modified | checksum mismatch — rejected |
| The manifest's checksum field was tampered with | checksum mismatch — rejected |
| Unsupported/future `backupFormat` | rejected outright |
| Unsupported/future store schema version | rejected — no migration attempted |
| Manifest declares a store not present in `stores/` | rejected — missing required file |
| A store's manifest filename path-traverses out of `stores/` | rejected — path containment violation |
| A store file is a symlink | rejected — symlinks are never permitted |
| An extra, unmanifested file sits in `stores/` | rejected — unexpected file |
| Malformed (non-JSON) manifest | rejected — parse error surfaced directly |
| `--target` already has store files, no `--force` | rejected — pass `--force` explicitly |
| Store fails to open/health-check after copying | restore rolls back its own copy; any pre-restore safety copy is left intact |

Every one of the above is exercised by
`tests/portability-backup-restore.contract.test.mjs`.

## Post-restore verification

`restore:v1` proves the runtime *can open* every store. It does not, by
itself, replay every governed record's digest. For a release-grade
restore, follow it with:

```bash
node scripts/portability/compare-portability-state.mjs \
  --pre <known-good-reference-dir> --post <target-dir> --fixture <fixture-manifest.json>
```

(against a known-good reference, e.g. from the clean-room drill), or the
sampled `verify` endpoint calls in `BACKUP_RECOVERY_V1.md` §"Verifying
backups" against the restored, running Host.

## Use-after-restore

Restored stores are ordinary SQLite files understood by this build like
any other — they can be closed and reopened repeatedly, and the
Enterprise Host can be started directly against them by pointing
`AOC_ENTERPRISE_*_SQLITE_PATH` at the restored filenames. This is
exercised directly in the contract test suite (open, close, reopen,
health-check again).
