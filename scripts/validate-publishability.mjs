import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixtureDir = resolve(root, 'tests/fixtures/external-consumer');
const tmp = await mkdtemp(join(tmpdir(), 'aoc-publishability-'));
const consumerDir = join(tmp, 'external-consumer');
let packedTarballPath;

// Frontera's private implementation packages (@aoc-enterprise/identity,
// scoped-access, governed-authority, governed-authorization) travel INSIDE the
// root artifact as npm bundleDependencies, so an external consumer installs the
// runtime tarball and nothing else. This check used to pack and inject them
// alongside the root package; doing that now would mask the very property the
// artifact is supposed to have, so it does not. See
// docs/architecture/ADR-FRONTERA-SELF-CONTAINED-PACKAGING.md.

const rootPkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const protocolSpec = rootPkg.devDependencies?.['@aoc/protocol'] ?? rootPkg.dependencies?.['@aoc/protocol'];
if (!protocolSpec || !protocolSpec.startsWith('file:')) {
  throw new Error('Root devDependency (or dependency) @aoc/protocol must be a real file: dependency for publishability validation.');
}
const declaredProtocolPath = resolve(root, protocolSpec.slice('file:'.length));
const stubProtocolPath = resolve(root, 'tests/fixtures/protocol-stub');
let protocolPath = declaredProtocolPath;
let usingProtocolStub = false;
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
  protocolPath = stubProtocolPath;
  usingProtocolStub = true;
  console.log(
    `[publishability] @aoc/protocol not found at '${declaredProtocolPath}' (neither a vendored tarball nor a sibling checkout); ` +
      `using the type-only stub package at '${stubProtocolPath}'. This is faithful because @aoc/protocol ` +
      'is a compile-time type dependency: this run independently asserts that no shipped artifact ' +
      "requires '@aoc/protocol' at runtime.",
  );
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

try {
  run('npm', ['run', 'build'], root);
  // npm pack drops the tarball in the repo root; remember it for cleanup.
  const packStdout = run('npm', ['pack', '--json'], root);
  const packMeta = JSON.parse(packStdout);
  const tarballName = packMeta[0]?.filename;
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

  // @aoc/protocol is documented as a compile-time type dependency. Assert the
  // shipped artifacts never import it at runtime -- this is the invariant that
  // makes the type-only stub a faithful stand-in for the real package. If this
  // ever fails, either remove the value import or rework the stub before release.
  const installedDist = join(consumerDir, 'node_modules', '@aoc-enterprise', 'runtime', 'dist');
  const shippedJs = (await readdir(installedDist, { recursive: true }))
    .filter((entry) => /\.(?:js|cjs|mjs)$/.test(entry))
    .map((entry) => join(installedDist, entry));
  for (const file of shippedJs) {
    const source = await readFile(file, 'utf8');
    if (/require\((['"])@aoc\/protocol\1\)|from\s+(['"])@aoc\/protocol\2/.test(source)) {
      throw new Error(`Shipped artifact '${file}' imports '@aoc/protocol' at runtime; @aoc/protocol must remain a type-only dependency (or the publishability stub must be reworked).`);
    }
  }
  console.log(`Runtime-import scan: ${shippedJs.length} shipped JS artifacts contain no runtime '@aoc/protocol' import${usingProtocolStub ? ' (stub protocol package validated as faithful)' : ''}.`);

  const declCheck = run('node', [resolve(root, 'scripts/check-declaration-leaks.mjs')], consumerDir);
  if (!declCheck.includes('passed')) {
    throw new Error('Declaration path check did not run as expected.');
  }

  console.log('Publishability validation completed successfully.');
} finally {
  await rm(tmp, { recursive: true, force: true });
  if (packedTarballPath !== undefined) await rm(packedTarballPath, { force: true });
}
