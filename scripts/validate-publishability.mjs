import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixtureDir = resolve(root, 'tests/fixtures/external-consumer');
const tmp = await mkdtemp(join(tmpdir(), 'aoc-publishability-'));
const consumerDir = join(tmp, 'external-consumer');
let packedTarballPath;
const packedWorkspaceTarballPaths = [];

// @aoc-enterprise/identity and @aoc-enterprise/scoped-access are real
// dependencies of the shipped public API (VerifiedActorClaims and
// EnterpriseScopedAccessRequest appear in exported .d.ts files, e.g.
// RuntimeContext, AuthorizationGrantInput). An external consumer needs them
// resolvable too, so they must be packed and installed exactly like the root
// package itself -- not left to workspace-only "*" resolution, which only
// works inside this monorepo.
const bundledWorkspacePackages = [
  { name: '@aoc-enterprise/identity', dir: resolve(root, 'packages/identity') },
  { name: '@aoc-enterprise/scoped-access', dir: resolve(root, 'packages/scoped-access') },
];

const rootPkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const protocolSpec = rootPkg.devDependencies?.['@aoc/protocol'] ?? rootPkg.dependencies?.['@aoc/protocol'];
if (!protocolSpec || !protocolSpec.startsWith('file:')) {
  throw new Error('Root devDependency (or dependency) @aoc/protocol must be a real file: dependency for publishability validation.');
}
const declaredProtocolPath = resolve(root, protocolSpec.slice('file:'.length));
let protocolPath = declaredProtocolPath;
try {
  const declaredStat = await stat(declaredProtocolPath);
  if (declaredStat.isFile()) {
    // The declared file: dependency is a vendored, checksummed tarball (see
    // protocol-consumer.lock.json) -- the real, pinned @aoc/protocol package,
    // not a sibling source checkout. This is strictly more faithful than the
    // sibling-checkout case below: it's the exact artifact Enterprise is
    // validated against, not whatever happens to be on a dev machine's disk.
    console.log(`[publishability] using the vendored @aoc/protocol tarball at '${declaredProtocolPath}'.`);
  } else {
    await stat(resolve(declaredProtocolPath, 'package.json'));
    console.log(`[publishability] using the @aoc/protocol sibling checkout at '${declaredProtocolPath}'.`);
  }
} catch {
  throw new Error(`The real vendored @aoc/protocol artifact is required at '${declaredProtocolPath}'.`);
}

const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (${cwd})`);
  }
  return result.stdout.trim();
};

function npmTarballFilename(pkg) {
  return `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
}

try {
  run('npm', ['run', 'build'], root);
  // npm pack drops the tarball in the repo root; remember it for cleanup.
  const packStdout = run('npm', ['pack', '--json'], root);
  const packMeta = packStdout ? JSON.parse(packStdout) : [];
  const tarballName = packMeta[0]?.filename ?? npmTarballFilename(rootPkg);
  if (!tarballName) {
    throw new Error('Could not read tarball name from npm pack output.');
  }

  const tarballPath = resolve(root, tarballName);
  packedTarballPath = tarballPath;
  await cp(fixtureDir, consumerDir, { recursive: true });

  const fixturePkgPath = join(consumerDir, 'package.json');
  const fixturePkg = JSON.parse(await readFile(fixturePkgPath, 'utf8'));
  fixturePkg.dependencies = fixturePkg.dependencies ?? {};
  fixturePkg.dependencies['@aoc/protocol'] = `file:${protocolPath}`;
  fixturePkg.dependencies['@aoc-enterprise/runtime'] = `file:${tarballPath}`;

  for (const { name, dir } of bundledWorkspacePackages) {
    const workspacePackStdout = run('npm', ['pack', '--json', dir], root);
    const workspacePackMeta = workspacePackStdout ? JSON.parse(workspacePackStdout) : [];
    const workspacePkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
    const workspaceTarballName = workspacePackMeta[0]?.filename ?? npmTarballFilename(workspacePkg);
    if (!workspaceTarballName) {
      throw new Error(`Could not read tarball name from npm pack output for ${name}.`);
    }
    const workspaceTarballPath = resolve(root, workspaceTarballName);
    packedWorkspaceTarballPaths.push(workspaceTarballPath);
    fixturePkg.dependencies[name] = `file:${workspaceTarballPath}`;
  }

  await writeFile(fixturePkgPath, `${JSON.stringify(fixturePkg, null, 2)}\n`);

  run('npm', ['install', '--prefer-offline'], consumerDir);

  run('npx', ['--no-install', 'tsc', '--pretty', 'false', '--noEmit', '-p', 'tsconfig.json'], consumerDir);
  run('npx', ['--no-install', 'tsc', '--pretty', 'false', '-p', 'tsconfig.json'], consumerDir);

  const pkgJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const exported = Object.keys(pkgJson.exports);

  const resolveScript = exported
    .map((key) => (key === '.' ? '@aoc-enterprise/runtime' : `@aoc-enterprise/runtime/${key.slice(2)}`))
    .map((specifier) => `import.meta.resolve('${specifier}');`)
    .join('\n');

  await writeFile(join(consumerDir, 'resolve-exports.mjs'), resolveScript);
  run('node', ['resolve-exports.mjs'], consumerDir);

  run('node', [resolve(root, 'scripts/assert-invalid-imports.mjs')], consumerDir);

  // Slice 2.1 deliberately consumes Protocol cryptography at runtime. Reject
  // only private/deep paths; public package entry points are legitimate.
  const installedDist = join(consumerDir, 'node_modules', '@aoc-enterprise', 'runtime', 'dist');
  const shippedJs = (await readdir(installedDist, { recursive: true }))
    .filter((entry) => /\.(?:js|cjs|mjs)$/.test(entry))
    .map((entry) => join(installedDist, entry));
  for (const file of shippedJs) {
    const source = await readFile(file, 'utf8');
    if (/['"]@aoc\/protocol\/(?:src|dist|internal)(?:\/|['"])/.test(source)) {
      throw new Error(`Shipped artifact '${file}' imports a private @aoc/protocol path.`);
    }
  }
  console.log(`Runtime-import scan: ${shippedJs.length} shipped JS artifacts contain no private @aoc/protocol import.`);

  const declCheck = run('node', [resolve(root, 'scripts/check-declaration-leaks.mjs')], consumerDir);
  if (!declCheck.includes('passed')) {
    throw new Error('Declaration path check did not run as expected.');
  }

  console.log('Publishability validation completed successfully.');
} finally {
  await rm(tmp, { recursive: true, force: true });
  if (packedTarballPath !== undefined) await rm(packedTarballPath, { force: true });
  for (const workspaceTarballPath of packedWorkspaceTarballPaths) {
    await rm(workspaceTarballPath, { force: true });
  }
}
