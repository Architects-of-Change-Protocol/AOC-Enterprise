#!/usr/bin/env node
// Builds a reproducible @aoc/protocol tarball from a pinned AOC Protocol commit.
//
// Two supported modes:
//   Option A - local checkout already on disk:
//     AOC_PROTOCOL_REPO=/path/to/Architects_of_Change_Protocol node scripts/protocol/build-protocol-tarball.mjs
//     (AOC_PROTOCOL_REF is optional here; if set, it is verified against the checkout's HEAD.)
//
//   Option B - fixed remote commit, fetched into a temporary directory:
//     AOC_PROTOCOL_REPO=https://github.com/Architects-of-Change-Protocol/Architects_of_Change_Protocol.git \
//     AOC_PROTOCOL_REF=<full 40-char commit SHA> \
//     node scripts/protocol/build-protocol-tarball.mjs
//     (AOC_PROTOCOL_REF is required here -- this script refuses to build from a mutable ref.)
//
// Never publishes anything. Prints a single JSON result object as the final stdout line;
// all other logging goes to stderr so stdout stays machine-parseable.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';

import { assertPinnedRef, assertCommitMatches, assertIsProtocolRepository, assertTarballMatchesPackage } from './lib-protocol-artifact.mjs';

const DEFAULT_REPO_URL = 'https://github.com/Architects-of-Change-Protocol/Architects_of_Change_Protocol.git';
const EXPECTED_GITHUB_OWNER_REPO = 'architects-of-change-protocol/architects_of_change_protocol';

function log(message) {
  process.stderr.write(`[protocol-tarball] ${message}\n`);
}

function run(cmd, args, cwd, { allowFailure = false } = {}) {
  log(`$ ${cmd} ${args.join(' ')} (cwd=${cwd})`);
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0 && !allowFailure) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
  }
  return result;
}

function looksLikeLocalPath(value) {
  return value.startsWith('.') || value.startsWith('/') || isAbsolute(value);
}

async function resolveRepoDirectory({ repoSource, ref, tempDirs }) {
  if (looksLikeLocalPath(repoSource)) {
    const localPath = resolve(repoSource);
    if (!existsSync(join(localPath, '.git'))) {
      throw new Error(`AOC_PROTOCOL_REPO="${repoSource}" is not a git checkout (no .git directory found).`);
    }
    log(`Using local AOC Protocol checkout at ${localPath} (Option A).`);
    return { repoDir: localPath, mode: 'local-checkout' };
  }

  const pinnedRef = assertPinnedRef(ref);
  const remoteUrl = repoSource;
  const lowerUrl = remoteUrl.toLowerCase();
  if (!lowerUrl.includes(EXPECTED_GITHUB_OWNER_REPO)) {
    throw new Error(
      `AOC_PROTOCOL_REPO="${remoteUrl}" does not reference the expected repository (${EXPECTED_GITHUB_OWNER_REPO}). Refusing to fetch an untrusted remote.`,
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'aoc-protocol-checkout-'));
  tempDirs.push(tempDir);
  log(`Fetching pinned commit ${pinnedRef} from ${remoteUrl} into temporary directory ${tempDir} (Option B).`);

  run('git', ['init', '--quiet'], tempDir);
  run('git', ['remote', 'add', 'origin', remoteUrl], tempDir);
  run('git', ['fetch', '--depth', '1', 'origin', pinnedRef], tempDir);
  run('git', ['checkout', '--quiet', 'FETCH_HEAD'], tempDir);

  return { repoDir: tempDir, mode: 'temp-checkout' };
}

async function main() {
  const tempDirs = [];
  let tarballCopyDestination;
  try {
    const repoSource = process.env.AOC_PROTOCOL_REPO ?? DEFAULT_REPO_URL;
    const requestedRef = process.env.AOC_PROTOCOL_REF;
    const outDir = process.env.AOC_PROTOCOL_TARBALL_OUT
      ? resolve(process.env.AOC_PROTOCOL_TARBALL_OUT)
      : await mkdtemp(join(tmpdir(), 'aoc-protocol-tarball-'));
    const runConsumerCheck = process.env.AOC_PROTOCOL_SKIP_CONSUMER_CHECK !== 'true';

    await mkdir(outDir, { recursive: true });

    const { repoDir, mode } = await resolveRepoDirectory({ repoSource, ref: requestedRef, tempDirs });

    const resolvedShaResult = run('git', ['rev-parse', 'HEAD'], repoDir);
    const resolvedSha = resolvedShaResult.stdout.trim().toLowerCase();
    log(`Resolved AOC Protocol commit: ${resolvedSha}`);

    if (requestedRef) {
      const pinnedRef = assertPinnedRef(requestedRef);
      assertCommitMatches(resolvedSha, pinnedRef);
      log(`Commit matches pinned AOC_PROTOCOL_REF.`);
    } else if (mode === 'local-checkout') {
      log('AOC_PROTOCOL_REF not provided; proceeding with the local checkout HEAD. Record this commit explicitly before treating it as a validated artifact.');
    }

    const rootPkg = JSON.parse(await readFile(join(repoDir, 'package.json'), 'utf8'));
    const protocolPkgPath = join(repoDir, 'packages', 'protocol', 'package.json');
    if (!existsSync(protocolPkgPath)) {
      throw new Error(`packages/protocol/package.json not found under ${repoDir}; this does not look like the AOC Protocol repository.`);
    }
    const protocolPkg = JSON.parse(await readFile(protocolPkgPath, 'utf8'));
    assertIsProtocolRepository(rootPkg, protocolPkg);
    log(`Verified repository identity: root="${rootPkg.name}", packages/protocol="${protocolPkg.name}"@${protocolPkg.version}.`);

    log('Installing AOC Protocol dependencies (npm ci)...');
    run('npm', ['ci'], repoDir);

    log('Building @aoc/protocol (npm run build --workspace @aoc/protocol)...');
    run('npm', ['run', 'build', '--workspace', '@aoc/protocol'], repoDir);

    if (runConsumerCheck && existsSync(join(repoDir, 'scripts', 'validate-protocol-consumer.mjs'))) {
      log('Running AOC Protocol\'s own consumer/package validation (npm run protocol:consumer:check)...');
      const consumerCheckResult = run('npm', ['run', 'protocol:consumer:check'], repoDir, { allowFailure: true });
      if (consumerCheckResult.status !== 0) {
        log('WARNING: protocol:consumer:check reported failures. This does not block tarball generation, but should be investigated before trusting this artifact:');
        process.stderr.write(consumerCheckResult.stdout ?? '');
        process.stderr.write(consumerCheckResult.stderr ?? '');
      } else {
        log('protocol:consumer:check passed.');
      }
    } else {
      log('Skipping AOC Protocol consumer/package validation (AOC_PROTOCOL_SKIP_CONSUMER_CHECK=true or script not present).');
    }

    log('Packing @aoc/protocol (npm pack --json ./packages/protocol)...');
    const packResult = run('npm', ['pack', '--json', './packages/protocol'], repoDir);
    const packMeta = JSON.parse(packResult.stdout)[0];
    assertTarballMatchesPackage(packMeta, protocolPkg);

    const tarballPathInRepo = join(repoDir, packMeta.filename);
    if (!existsSync(tarballPathInRepo)) {
      throw new Error(`Expected tarball at ${tarballPathInRepo} but it was not found.`);
    }

    tarballCopyDestination = join(outDir, packMeta.filename);
    await cp(tarballPathInRepo, tarballCopyDestination);
    await rm(tarballPathInRepo, { force: true });

    const tarballBuffer = await readFile(tarballCopyDestination);
    const sha256 = createHash('sha256').update(tarballBuffer).digest('hex');

    const result = {
      repository: 'Architects-of-Change-Protocol/Architects_of_Change_Protocol',
      commit: resolvedSha,
      package: protocolPkg.name,
      version: protocolPkg.version,
      tarball: packMeta.filename,
      tarballPath: tarballCopyDestination,
      sha256,
      sizeBytes: tarballBuffer.length,
      mode,
      builtAt: new Date().toISOString(),
    };

    log(`Built ${result.tarball} (${result.sizeBytes} bytes) at ${result.tarballPath}`);
    log(`SHA-256: ${result.sha256}`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[protocol-tarball] FAILED: ${error.message}\n`);
  process.exitCode = 1;
});
