#!/usr/bin/env node
// AOC Enterprise v1 restore command (`npm run restore:v1 -- --backup <dir> --target <dir>`).
//
// Validates an `aoc.enterprise.backup.v1` backup set (format version,
// structure, checksums, SQLite integrity, schema-version compatibility,
// path safety, no symlinks, no unexpected extra files) before touching the
// target directory. Refuses to overwrite existing stores without
// `--force`, takes a pre-restore safety copy before any destructive
// replacement, and rolls back the target on any post-restore verification
// failure. See docs/operations/AOC_ENTERPRISE_RESTORE_V1.md.
//
// Usage:
//   node scripts/portability/restore-enterprise-v1.mjs --backup <dir> --target <dir> [--force]

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  BACKUP_FORMAT,
  STORE_DEFINITIONS,
  loadEnterpriseModule,
  sha256File,
  stableJsonStringify,
  assertNoPathOverlap,
  assertContained,
  assertNotSymlink,
  sqliteIntegrityCheck,
} from './lib-portability.mjs';

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--backup') args.backup = argv[++i];
    else if (arg === '--target') args.target = argv[++i];
    else if (arg === '--force' || arg === '--replace') args.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.backup || !args.target) throw new Error('Usage: restore-enterprise-v1.mjs --backup <dir> --target <dir> [--force]');
  return args;
}

class RestoreValidationError extends Error {}

function loadAndValidateManifest(backupPath) {
  const manifestPath = join(backupPath, 'backup-manifest.json');
  if (!existsSync(manifestPath)) throw new RestoreValidationError(`No backup-manifest.json found in '${backupPath}'.`);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new RestoreValidationError(`backup-manifest.json is not valid JSON: ${error.message}`);
  }

  if (manifest.backupFormat !== BACKUP_FORMAT) {
    throw new RestoreValidationError(
      `Unsupported backup format '${manifest.backupFormat}'. This runtime supports only '${BACKUP_FORMAT}'. ` +
        'A newer format must never be silently accepted; an older format requires an explicit migration path that does not exist in v1.',
    );
  }
  for (const field of ['backupId', 'createdAt', 'source', 'enterprise', 'stores', 'configuration', 'verification']) {
    if (!(field in manifest)) throw new RestoreValidationError(`Malformed manifest: missing required field '${field}'.`);
  }
  if (!Array.isArray(manifest.stores) || manifest.stores.length === 0) {
    throw new RestoreValidationError('Malformed manifest: "stores" must be a non-empty array.');
  }
  return manifest;
}

function assertNoUnexpectedFiles(storesDir, manifestStores) {
  const expected = new Set(manifestStores.map((s) => s.filename));
  const actual = readdirSync(storesDir);
  for (const file of actual) {
    if (!expected.has(file)) {
      throw new RestoreValidationError(`Unexpected file '${file}' in backup stores/ directory -- refusing to restore a backup set with extra, unmanifested files.`);
    }
  }
  for (const filename of expected) {
    if (!actual.includes(filename)) {
      throw new RestoreValidationError(`Manifest declares store file '${filename}' but it is missing from stores/.`);
    }
  }
}

async function validateBackupSet(backupPath, manifest, enterprise) {
  const storesDir = join(backupPath, 'stores');
  if (!existsSync(storesDir)) throw new RestoreValidationError(`Backup set has no stores/ directory.`);

  assertNoUnexpectedFiles(storesDir, manifest.stores);

  const requiredNames = new Set(STORE_DEFINITIONS.filter((d) => manifest.stores.some((s) => s.name === d.name && s.required)).map((d) => d.name));
  for (const storeDef of STORE_DEFINITIONS) {
    const entry = manifest.stores.find((s) => s.name === storeDef.name);
    if (entry === undefined) {
      if (requiredNames.has(storeDef.name)) throw new RestoreValidationError(`Required store '${storeDef.name}' is missing from the manifest.`);
      continue;
    }

    const filePath = assertContained(storesDir, entry.filename, `Store '${storeDef.name}' filename`);
    assertNotSymlink(filePath, `Store '${storeDef.name}' file`);
    if (!existsSync(filePath)) throw new RestoreValidationError(`Store '${storeDef.name}' file '${entry.filename}' does not exist.`);

    const actualChecksum = sha256File(filePath);
    if (actualChecksum !== entry.checksum) {
      throw new RestoreValidationError(`Checksum mismatch for store '${storeDef.name}': manifest says '${entry.checksum}', file is '${actualChecksum}'. The backup may be corrupted or tampered with.`);
    }

    const integrity = await sqliteIntegrityCheck(filePath);
    if (!integrity.ok) {
      throw new RestoreValidationError(`SQLite integrity check failed for store '${storeDef.name}': ${integrity.detail}.`);
    }

    const expectedSchemaVersion = storeDef.schemaVersionKeyOf(enterprise);
    if (entry.schemaVersion !== expectedSchemaVersion) {
      throw new RestoreValidationError(
        `Store '${storeDef.name}' was backed up under schema version '${entry.schemaVersion}', but this runtime build supports only '${expectedSchemaVersion}'. ` +
          'Restoring would silently open a store this build cannot correctly read. Use the build generation recorded in metadata/release-context.json instead.',
      );
    }
  }
}

function targetStorePaths(targetDir) {
  return {
    governance: join(targetDir, 'enterprise-host.sqlite'),
    'agent-passport': join(targetDir, 'agent-passport.sqlite'),
    assurance: join(targetDir, 'assurance.sqlite'),
  };
}

export async function runRestore({ backup, target, force = false }) {
  const enterprise = await loadEnterpriseModule();
  const backupPath = resolve(backup);
  const targetPath = resolve(target);

  if (!existsSync(backupPath)) throw new RestoreValidationError(`Backup directory '${backupPath}' does not exist.`);
  assertNoPathOverlap(backupPath, targetPath, 'Restore target must not overlap the backup directory');

  const manifest = loadAndValidateManifest(backupPath);
  await validateBackupSet(backupPath, manifest, enterprise);

  mkdirSync(targetPath, { recursive: true });
  const paths = targetStorePaths(targetPath);
  const existingTargets = Object.values(paths).filter((path) => existsSync(path));

  let safetyCopyDir;
  if (existingTargets.length > 0) {
    if (!force) {
      throw new RestoreValidationError(
        `Target directory '${targetPath}' already has store file(s): ${existingTargets.map((p) => p.split('/').pop()).join(', ')}. Pass --force to replace them (a pre-restore safety copy will be taken first).`,
      );
    }
    safetyCopyDir = join(targetPath, `.pre-restore-safety-${manifest.backupId}`);
    mkdirSync(safetyCopyDir, { recursive: true });
    for (const path of existingTargets) copyFileSync(path, join(safetyCopyDir, path.split('/').pop()));
  }

  const startedAt = new Date().toISOString();
  const copiedPaths = [];
  const objectVerification = {};

  try {
    for (const storeDef of STORE_DEFINITIONS) {
      const entry = manifest.stores.find((s) => s.name === storeDef.name);
      if (entry === undefined) continue;
      const sourceFile = join(backupPath, 'stores', entry.filename);
      const destFile = paths[storeDef.name];
      cpSync(sourceFile, destFile);
      copiedPaths.push(destFile);

      const postCopyChecksum = sha256File(destFile);
      if (postCopyChecksum !== entry.checksum) {
        throw new RestoreValidationError(`Post-copy checksum mismatch for store '${storeDef.name}' -- the copy to the target directory is not byte-identical to the verified backup file.`);
      }
    }

    for (const storeDef of STORE_DEFINITIONS) {
      const entry = manifest.stores.find((s) => s.name === storeDef.name);
      if (entry === undefined) continue;
      const store = await storeDef.openStore(enterprise, paths[storeDef.name]);
      try {
        const health = await store.health();
        objectVerification[storeDef.name] = { opened: true, status: health.status, schemaVersion: health.schemaVersion, readable: health.readable ?? true, writable: health.writable ?? true };
        if (health.status === 'unhealthy') {
          throw new RestoreValidationError(`Restored store '${storeDef.name}' reports unhealthy status after restore.`);
        }
      } finally {
        await store.close();
      }
    }

    const finishedAt = new Date().toISOString();
    const report = {
      backupId: manifest.backupId,
      targetPath,
      compatibilityResult: 'supported',
      checksumResult: 'ok',
      sqliteIntegrityResult: 'ok',
      migrationsApplied: [],
      objectVerification,
      status: 'restored',
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      preRestoreSafetyCopy: safetyCopyDir ?? null,
    };
    writeFileSync(join(targetPath, 'restore-report.json'), stableJsonStringify(report));
    return report;
  } catch (error) {
    // Fail closed: never leave a half-restored, unverified target. Remove
    // whatever this run copied; the pre-restore safety copy (if any) is
    // left in place as the recovery path back to the prior state.
    for (const path of copiedPaths) {
      try {
        rmSync(path, { force: true });
      } catch {
        // best-effort cleanup
      }
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runRestore(args);
  console.log(`Restore of backup '${report.backupId}' into ${report.targetPath}: ${report.status}`);
  console.log(JSON.stringify(report, null, 2));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((error) => {
    console.error(`[restore:v1] ${error.message}`);
    process.exitCode = 1;
  });
}
