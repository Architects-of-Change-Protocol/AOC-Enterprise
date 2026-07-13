#!/usr/bin/env node
// AOC Enterprise v1 clean-room portability drill (`npm run validate:portability:v1`).
//
// Proves the mission's core claim end-to-end: a `git archive` of HEAD,
// extracted OUTSIDE this working tree, with no access to this tree's
// `node_modules`/`dist`/untracked files/env, can install, build, seed a
// synthetic fixture, back it up, have its source stores destroyed, restore
// from the backup alone, and reproduce logically-equivalent governed state
// -- then still pass the full v1 release gate. See
// docs/operations/AOC_ENTERPRISE_CLEAN_ROOM_DRILL.md.
//
// Usage:
//   node scripts/portability/validate-portability-v1.mjs [--keep] [--skip-release-gate]

import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, cpSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, execFileSync } from 'node:child_process';

import { REPO_ROOT, stableJsonStringify } from './lib-portability.mjs';

function parseArgs(argv) {
  const args = { keep: false, skipReleaseGate: false };
  for (const arg of argv) {
    if (arg === '--keep') args.keep = true;
    else if (arg === '--skip-release-gate') args.skipReleaseGate = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function step(steps, name, fn) {
  const startedAt = Date.now();
  console.log(`\n=== [${name}] ===`);
  try {
    const detail = fn();
    steps.push({ name, status: 'pass', durationMs: Date.now() - startedAt, detail: detail ?? null });
    console.log(`--- [${name}] PASS (${Date.now() - startedAt}ms)`);
  } catch (error) {
    steps.push({ name, status: 'fail', durationMs: Date.now() - startedAt, error: error.message });
    console.error(`--- [${name}] FAIL: ${error.message}`);
    throw new DrillFailure(name, error, steps);
  }
}

class DrillFailure extends Error {
  constructor(stepName, cause, steps) {
    super(`Clean-room drill failed at step '${stepName}': ${cause.message}`);
    this.steps = steps;
  }
}

function run(cwd, command, args, envOverrides) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 64,
    env: envOverrides ? { ...process.env, ...envOverrides } : process.env,
  });
}

export async function runCleanRoomDrill({ keep = false, skipReleaseGate = false } = {}) {
  const steps = [];
  const drillStartedAt = Date.now();

  const gitStatus = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const worktreeClean = gitStatus.length === 0;
  console.log(worktreeClean ? 'Source worktree is clean.' : `Source worktree has local changes (recorded, not blocking):\n${gitStatus}`);

  const commit = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

  const cleanRoomRoot = mkdtempSync(join(tmpdir(), 'aoc-enterprise-clean-room-'));
  const checkoutDir = join(cleanRoomRoot, 'checkout');
  const drillDataDir = join(cleanRoomRoot, 'drill-data');
  mkdirSync(checkoutDir, { recursive: true });
  mkdirSync(drillDataDir, { recursive: true });

  const archivePath = join(cleanRoomRoot, 'source.tar');

  try {
    step(steps, 'clean-source-extraction', () => {
      // `git archive` emits exactly the tracked tree at `commit` -- no
      // .git directory, no node_modules/dist, no untracked or ignored
      // files, no ambient Codespace state. This is the "strongest
      // practical clean-source mechanism" the mission calls for (Phase 16).
      execFileSync('git', ['archive', '--format=tar', '--output', archivePath, commit], { cwd: REPO_ROOT });
      execFileSync('tar', ['-xf', archivePath, '-C', checkoutDir]);
      unlinkSync(archivePath);
      const forbidden = ['node_modules', 'dist', '.data'].filter((entry) => existsSync(join(checkoutDir, entry)));
      if (forbidden.length > 0) throw new Error(`Clean-room checkout unexpectedly contains: ${forbidden.join(', ')} -- these must come from the build, not the source tree.`);
      return { commit, checkoutDir };
    });

    step(steps, 'npm-ci', () => {
      const output = run(checkoutDir, 'npm', ['ci']);
      return { outputTail: output.split('\n').slice(-5).join('\n') };
    });

    step(steps, 'build', () => run(checkoutDir, 'npm', ['run', 'build']));
    step(steps, 'typecheck', () => run(checkoutDir, 'npm', ['run', 'typecheck']));
    step(steps, 'lint', () => run(checkoutDir, 'npm', ['run', 'lint']));

    const testOutput = { value: '' };
    step(steps, 'compiled-tests', () => {
      testOutput.value = run(checkoutDir, 'npm', ['run', 'test:root']);
      return { summary: testOutput.value.split('\n').filter((line) => line.startsWith('# ')).join(' | ') };
    });

    const preDir = join(drillDataDir, 'pre');
    const preReferenceDir = join(drillDataDir, 'pre-reference');
    const backupDir = join(drillDataDir, 'backup');
    const postDir = join(drillDataDir, 'post');
    const comparisonPath = join(drillDataDir, 'portability-comparison.json');

    step(steps, 'synthetic-fixture-generation', () => {
      run(checkoutDir, 'node', ['scripts/portability/generate-portability-fixture.mjs', '--target', preDir]);
      return { preDir };
    });

    const backupEnv = {
      AOC_ENTERPRISE_PERSISTENCE_PROVIDER: 'sqlite',
      AOC_ENTERPRISE_SQLITE_PATH: join(preDir, 'enterprise-host.sqlite'),
      AOC_ENTERPRISE_PASSPORT_SQLITE_PATH: join(preDir, 'agent-passport.sqlite'),
      AOC_ENTERPRISE_ASSURANCE_SQLITE_PATH: join(preDir, 'assurance.sqlite'),
    };
    step(steps, 'full-backup', () => {
      const output = run(checkoutDir, 'node', ['scripts/portability/backup-enterprise-v1.mjs', '--output', backupDir], backupEnv);
      return JSON.parse(output.slice(output.indexOf('{')));
    });

    step(steps, 'pre-reference-capture', () => {
      // A drill needs a known-good reference to compare the restore
      // against, captured before the simulated disaster. This is
      // deliberately separate from the backup under test: the backup is
      // what gets restored; this reference is only ever read by the
      // comparison step, never by restore.
      cpSync(preDir, preReferenceDir, { recursive: true });
      return { preReferenceDir };
    });

    step(steps, 'source-store-destruction', () => {
      for (const file of ['enterprise-host.sqlite', 'agent-passport.sqlite', 'assurance.sqlite']) {
        rmSync(join(preDir, file), { force: true });
      }
      return { destroyed: preDir };
    });

    step(steps, 'full-restore', () => run(checkoutDir, 'node', ['scripts/portability/restore-enterprise-v1.mjs', '--backup', backupDir, '--target', postDir]));

    step(steps, 'logical-comparison', () => {
      const output = run(checkoutDir, 'node', [
        'scripts/portability/compare-portability-state.mjs',
        '--pre', preReferenceDir,
        '--post', postDir,
        '--fixture', join(preReferenceDir, 'fixture-manifest.json'),
        '--output', comparisonPath,
      ]);
      const parsed = JSON.parse(output.slice(output.indexOf('{')));
      if (!parsed.overallEquivalent) throw new Error(`Pre/post logical state is NOT equivalent: ${JSON.stringify(parsed)}`);
      return parsed;
    });

    if (!skipReleaseGate) {
      step(steps, 'clean-room-release-gate', () => run(checkoutDir, 'npm', ['run', 'validate:v1-release']));
    }

    const report = {
      drillVersion: 'aoc.enterprise.portability-drill.v1',
      runAt: new Date(drillStartedAt).toISOString(),
      sourceCommit: commit,
      sourceWorktreeClean: worktreeClean,
      cleanRoomRoot,
      steps,
      totalDurationMs: Date.now() - drillStartedAt,
      result: 'PASS',
    };
    writeFileSync(join(cleanRoomRoot, 'clean-room-drill-report.json'), stableJsonStringify(report));
    console.log(`\nClean-room drill PASSED in ${report.totalDurationMs}ms. Report: ${join(cleanRoomRoot, 'clean-room-drill-report.json')}`);
    if (keep) {
      console.log(`--keep set: clean-room directory retained at ${cleanRoomRoot}`);
    } else {
      rmSync(cleanRoomRoot, { recursive: true, force: true });
    }
    return report;
  } catch (error) {
    const report = {
      drillVersion: 'aoc.enterprise.portability-drill.v1',
      runAt: new Date(drillStartedAt).toISOString(),
      sourceCommit: commit,
      sourceWorktreeClean: worktreeClean,
      cleanRoomRoot,
      steps: error instanceof DrillFailure ? error.steps : steps,
      totalDurationMs: Date.now() - drillStartedAt,
      result: 'FAIL',
      failure: error.message,
    };
    try {
      writeFileSync(join(cleanRoomRoot, 'clean-room-drill-report.json'), stableJsonStringify(report));
    } catch {
      // best-effort
    }
    console.error(`\nClean-room drill FAILED. Report and artifacts retained at ${cleanRoomRoot} for inspection.`);
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runCleanRoomDrill(args);
  console.log(JSON.stringify({ result: report.result, steps: report.steps.map((s) => ({ name: s.name, status: s.status, durationMs: s.durationMs })) }, null, 2));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
