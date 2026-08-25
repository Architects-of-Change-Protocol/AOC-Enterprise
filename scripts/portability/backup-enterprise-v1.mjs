#!/usr/bin/env node
// AOC Enterprise v1 backup command (`npm run backup:v1 -- --output <dir>`).
//
// Produces a self-describing `aoc.enterprise.backup.v1` backup set: a
// transactionally-consistent copy of each of the three SQLite stores (via
// SQLite's Online Backup API, never a plain `cp` of a live WAL database),
// a canonical manifest, a checksums file, and a generated RESTORE.md.
// See docs/operations/AOC_ENTERPRISE_BACKUP_V1.md for the full contract.
//
// Usage:
//   node scripts/portability/backup-enterprise-v1.mjs --output <dir> [--force]
//
// Reads store locations from the same environment variables the Enterprise
// Host itself reads (AOC_ENTERPRISE_SQLITE_PATH and friends) via
// `loadEnterpriseConfiguration()` -- there is no separate backup-specific
// configuration surface.

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { platform, arch } from 'node:os';

import {
  BACKUP_FORMAT,
  configuredStoreDefinitions,
  EXCLUDED_SECRET_ENV_VARS,
  loadEnterpriseModule,
  sha256File,
  stableJsonStringify,
  assertNoPathOverlap,
  sqliteIntegrityCheck,
  readStoreVersion,
  recordCount,
  safeSqliteCopy,
  gitInfo,
  createStagingDir,
  atomicPromote,
  cleanupDir,
  fileSize,
} from './lib-portability.mjs';

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') args.output = argv[++i];
    else if (arg === '--force' || arg === '--replace') args.force = true;
    else if (arg === '--allow-missing-stores') args.allowMissingStores = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.output) throw new Error('Usage: backup-enterprise-v1.mjs --output <dir> [--force]');
  return args;
}

function renderRestoreMd(manifest) {
  const storeLines = manifest.stores.map((store) => `- \`stores/${store.filename}\` -- ${store.name} (schema \`${store.schemaVersion}\`, ${store.sizeBytes} bytes, ${store.checksum})`).join('\n');
  return `# Restoring backup \`${manifest.backupId}\`

Created: ${manifest.createdAt}
Source commit: \`${manifest.source.commit}\`
Enterprise version: \`${manifest.enterprise.enterpriseVersion}\`

## Contents

${storeLines}

## Restore

From the repository root of a build at commit \`${manifest.source.commit}\` (or a
build whose store schema versions match \`metadata/store-versions.json\`):

\`\`\`bash
npm run restore:v1 -- --backup <this-directory> --target <fresh-data-directory>
\`\`\`

See \`docs/operations/AOC_ENTERPRISE_RESTORE_V1.md\` for the full procedure,
compatibility matrix, and failure modes. Do not hand-copy these files --
\`restore:v1\` validates checksums, SQLite integrity, and schema
compatibility before touching the target directory, and refuses to
overwrite existing stores without \`--force\`.
`;
}

export async function runBackup({ output, force = false, allowMissingStores = false, env = process.env }) {
  const enterprise = await loadEnterpriseModule();
  const configuration = enterprise.loadEnterpriseConfiguration(env);

  if (configuration.persistence.provider !== 'sqlite') {
    throw new Error(
      "backup:v1 requires AOC_ENTERPRISE_PERSISTENCE_PROVIDER=sqlite. The 'memory' provider keeps no durable state and has nothing to back up.",
    );
  }

  const outputPath = resolve(output);
  const storeDefinitions = configuredStoreDefinitions(configuration);
  for (const storeDef of storeDefinitions) {
    const sourcePath = resolve(storeDef.configPathOf(configuration));
    if (sourcePath === ':memory:') continue;
    assertNoPathOverlap(outputPath, sourcePath, `Backup output directory must not overlap a source store path (${storeDef.name})`);
  }

  if (existsSync(outputPath) && readdirSync(outputPath).length > 0 && !force) {
    throw new Error(`Output directory '${outputPath}' already exists and is non-empty. Pass --force to replace it.`);
  }

  const startedAt = new Date().toISOString();
  const staging = createStagingDir(outputPath, 'backup');
  const storesDir = join(staging, 'stores');
  const metadataDir = join(staging, 'metadata');
  mkdirSync(storesDir, { recursive: true });
  mkdirSync(metadataDir, { recursive: true });

  try {
    const storeEntries = [];
    for (const storeDef of storeDefinitions) {
      const sourcePath = resolve(storeDef.configPathOf(configuration));
      if (!existsSync(sourcePath)) {
        if (allowMissingStores) continue;
        throw new Error(
          `Required store '${storeDef.name}' has no database file at '${sourcePath}'. ` +
            'Start the Enterprise Host once against this configuration (it auto-creates an empty, schema-stamped store), or pass --allow-missing-stores if this store is intentionally never used.',
        );
      }

      const destPath = join(storesDir, storeDef.filename);
      await safeSqliteCopy(sourcePath, destPath);

      const integrity = await sqliteIntegrityCheck(destPath);
      if (!integrity.ok) {
        throw new Error(`SQLite integrity check failed for store '${storeDef.name}' immediately after copy: ${integrity.detail}`);
      }

      const version = await readStoreVersion(destPath, storeDef.versionTable);
      const expectedSchemaVersion = storeDef.schemaVersionKeyOf(enterprise);
      if (version.schemaVersion !== null && version.schemaVersion !== expectedSchemaVersion) {
        throw new Error(
          `Store '${storeDef.name}' reports schema version '${version.schemaVersion}' but this build's runtime supports '${expectedSchemaVersion}'. Refusing to back up a store this build cannot itself open.`,
        );
      }

      const count = await recordCount(destPath, storeDef.recordTable);

      storeEntries.push({
        name: storeDef.name,
        filename: storeDef.filename,
        originalPath: storeDef.configPathOf(configuration),
        sizeBytes: fileSize(destPath),
        checksum: sha256File(destPath),
        schemaVersion: version.schemaVersion ?? expectedSchemaVersion,
        migrationState: version.migrationState,
        required: true,
        recordCount: count,
        integrityCheck: 'ok',
      });
    }

    if (storeEntries.length === 0) {
      throw new Error('No store files were found to back up.');
    }

    const { commit, branch } = gitInfo();
    const backupId = `backup-${startedAt.replace(/[:.]/g, '-')}-${commit ? commit.slice(0, 12) : 'unknown'}`;

    const manifest = {
      backupFormat: BACKUP_FORMAT,
      backupId,
      createdAt: startedAt,
      source: {
        commit: commit ?? 'unknown',
        branch: branch ?? 'unknown',
        releaseVersion: configuration.enterpriseVersion,
        nodeVersion: process.version,
        platform: platform(),
        architecture: arch(),
      },
      enterprise: {
        enterpriseVersion: enterprise.AOC_ENTERPRISE_HOST_VERSION,
        kernelVersion: configuration.enterpriseVersion,
        governanceStoreVersion: enterprise.AOC_GOVERNANCE_STORE_VERSION,
        evidenceRuntimeVersion: enterprise.AOC_EVIDENCE_BUNDLE_VERSION,
        passportRuntimeVersion: enterprise.AOC_AGENT_PASSPORT_RUNTIME_VERSION,
        assuranceRuntimeVersion: enterprise.AOC_ASSURANCE_RUNTIME_VERSION,
      },
      stores: storeEntries,
      configuration: {
        requiredEnvironmentVariables: [
          'AOC_ENTERPRISE_PERSISTENCE_PROVIDER',
          'AOC_ENTERPRISE_SQLITE_PATH',
          'AOC_ENTERPRISE_PASSPORT_SQLITE_PATH',
          'AOC_ENTERPRISE_ASSURANCE_SQLITE_PATH',
        ],
        excludedSecrets: EXCLUDED_SECRET_ENV_VARS,
      },
      verification: {
        checksumAlgorithm: 'sha256',
        sqliteIntegrityChecked: true,
        recordIntegrityChecked: false,
      },
      notes: [
        'Evidence Bundles are not included: the Evidence Bundle Store is in-memory only in v1 (see AOC_ENTERPRISE_V1_PORTABILITY_CURRENT_STATE.md). Bundles are deterministically rebuildable from the Governance Store after restore.',
        'This backup captures a per-file consistent snapshot of each store via the SQLite Online Backup API. For strict cross-store consistency, stop the Host before backing up (docs/operations/BACKUP_RECOVERY_V1.md, "Cold backup").',
      ],
    };

    writeFileSync(join(metadataDir, 'store-versions.json'), stableJsonStringify(Object.fromEntries(storeEntries.map((s) => [s.name, { schemaVersion: s.schemaVersion, migrationState: s.migrationState }]))));
    writeFileSync(join(metadataDir, 'runtime-versions.json'), stableJsonStringify(manifest.enterprise));
    writeFileSync(join(metadataDir, 'release-context.json'), stableJsonStringify(manifest.source));

    const finishedAt = new Date().toISOString();
    const verificationSummary = {
      startedAt,
      finishedAt,
      storesBackedUp: storeEntries.map((s) => s.name),
      allIntegrityChecksPassed: storeEntries.every((s) => s.integrityCheck === 'ok'),
    };
    writeFileSync(join(metadataDir, 'verification-summary.json'), stableJsonStringify(verificationSummary));

    writeFileSync(join(staging, 'backup-manifest.json'), stableJsonStringify(manifest));
    writeFileSync(join(staging, 'RESTORE.md'), renderRestoreMd(manifest));

    const checksumLines = [];
    for (const store of storeEntries) checksumLines.push(`${store.checksum.replace('sha256:', '')}  stores/${store.filename}`);
    for (const file of ['metadata/store-versions.json', 'metadata/runtime-versions.json', 'metadata/release-context.json', 'metadata/verification-summary.json', 'backup-manifest.json']) {
      checksumLines.push(`${sha256File(join(staging, file)).replace('sha256:', '')}  ${file}`);
    }
    writeFileSync(join(staging, 'checksums.sha256'), `${checksumLines.join('\n')}\n`);

    atomicPromote(staging, outputPath, { force });

    const report = {
      backupId,
      sourceCommit: manifest.source.commit,
      releaseVersion: manifest.enterprise.enterpriseVersion,
      stores: storeEntries.map((s) => ({ name: s.name, schemaVersion: s.schemaVersion, checksum: s.checksum, sizeBytes: s.sizeBytes, recordCount: s.recordCount })),
      excludedSecrets: EXCLUDED_SECRET_ENV_VARS,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      outputPath,
    };
    return report;
  } catch (error) {
    cleanupDir(staging);
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runBackup(args);
  console.log(`Backup '${report.backupId}' written to ${report.outputPath}`);
  console.log(JSON.stringify(report, null, 2));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((error) => {
    console.error(`[backup:v1] ${error.message}`);
    process.exitCode = 1;
  });
}
