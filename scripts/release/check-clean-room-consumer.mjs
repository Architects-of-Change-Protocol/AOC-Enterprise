#!/usr/bin/env node
// Clean-room external-consumer proof for the Frontera runtime (@aoc-enterprise/runtime).
//
// Builds the real packaged artifacts and installs them into a throwaway package
// created OUTSIDE this repository, then proves an unrelated downstream repository
// (PMFreak is the intended one) can consume Frontera through nothing but its
// published package surface:
//
//   * every declared export resolves, typechecks against the shipped .d.ts, and
//     executes;
//   * @aoc/protocol resolves only through the installed, checksummed candidate;
//   * nothing resolves back into this repository or a Protocol source checkout;
//   * undeclared/deep imports remain unresolvable.
//
// Publishes nothing, creates no tag and no release. Prints a JSON evidence object
// as its final stdout line.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const log = (m) => process.stderr.write(`[clean-room] ${m}\n`);

const run = (cmd, args, cwd, { allowFailure = false } = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFailure) {
    process.stderr.write(r.stdout ?? '');
    process.stderr.write(r.stderr ?? '');
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
  }
  return r;
};

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// Workspace packages that are real dependencies of the shipped public API and so
// must be installed as packed tarballs too, exactly like the root package --
// never through workspace "*" resolution, which only works inside this monorepo.
const WORKSPACE_DEPS = [
  { name: '@aoc-enterprise/identity', dir: 'packages/identity' },
  { name: '@aoc-enterprise/scoped-access', dir: 'packages/scoped-access' },
];

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
};

const tempDirs = [];
try {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(ROOT, 'protocol-consumer.lock.json'), 'utf8'));
  const exportKeys = Object.keys(pkg.exports);
  const specifiers = exportKeys.map((k) => (k === '.' ? pkg.name : `${pkg.name}/${k.slice(2)}`));

  const protocolTarball = resolve(ROOT, 'vendor', lock.tarball.filename);
  if (!existsSync(protocolTarball)) {
    throw new Error(`Vendored Protocol candidate not found at ${protocolTarball}`);
  }
  const protocolSha = sha256(protocolTarball);
  check(
    protocolSha === lock.tarball.sha256,
    `vendored @aoc/protocol tarball matches protocol-consumer.lock.json sha256 (${protocolSha})`,
  );

  const staging = await mkdtemp(join(tmpdir(), 'frontera-cleanroom-pack-'));
  tempDirs.push(staging);
  log('Building and packing the Frontera runtime...');
  run('npm', ['run', 'build'], ROOT);
  const packMeta = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', staging], ROOT).stdout)[0];
  const fronteraTarball = join(staging, packMeta.filename);
  const fronteraSha = sha256(fronteraTarball);
  log(`Frontera artifact ${packMeta.filename} sha256=${fronteraSha}`);

  const workspaceTarballs = [];
  for (const dep of WORKSPACE_DEPS) {
    const meta = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', staging, resolve(ROOT, dep.dir)], ROOT).stdout)[0];
    workspaceTarballs.push({ ...dep, path: join(staging, meta.filename) });
  }

  // --- the clean room: a package that has never heard of this repository ------
  const consumer = await mkdtemp(join(tmpdir(), 'frontera-cleanroom-consumer-'));
  tempDirs.push(consumer);
  await mkdir(join(consumer, 'src'), { recursive: true });

  const dependencies = {
    '@aoc/protocol': `file:${protocolTarball}`,
    [pkg.name]: `file:${fronteraTarball}`,
  };
  for (const w of workspaceTarballs) dependencies[w.name] = `file:${w.path}`;

  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'frontera-clean-room-consumer', private: true, version: '0.0.0', type: 'module', dependencies, devDependencies: { typescript: '^5.0.0', '@types/node': '^22.0.0' } }, null, 2)}\n`,
  );
  await writeFile(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, esModuleInterop: true, skipLibCheck: false, noEmit: true }, include: ['src/**/*'] }, null, 2)}\n`,
  );

  // Compile against the SHIPPED declarations, importing every declared export.
  const tsImports = specifiers.map((s, i) => `import * as ns${i} from '${s}';`).join('\n');
  const tsUses = specifiers.map((_, i) => `if (typeof ns${i} !== 'object') throw new Error('bad namespace ${i}');`).join('\n');
  await writeFile(join(consumer, 'src', 'index.ts'), `${tsImports}\n${tsUses}\n`);

  // No --legacy-peer-deps and no --force: peer ranges must resolve honestly.
  log('Installing packaged artifacts into the clean room (strict peer resolution)...');
  const install = run('npm', ['install', '--no-audit', '--no-fund'], consumer, { allowFailure: true });
  check(install.status === 0, 'npm install resolves with strict peer semantics (no --force / --legacy-peer-deps)');
  if (install.status !== 0) {
    process.stderr.write(install.stdout ?? '');
    process.stderr.write(install.stderr ?? '');
    throw new Error('Clean-room install failed; remaining checks cannot run.');
  }

  const tsc = run('npx', ['--no-install', 'tsc', '--pretty', 'false', '-p', 'tsconfig.json'], consumer, { allowFailure: true });
  if (tsc.status !== 0) process.stderr.write(`${tsc.stdout ?? ''}${tsc.stderr ?? ''}`);
  check(tsc.status === 0, `all ${specifiers.length} declared exports typecheck against the shipped declarations`);

  // Resolve + LOAD each declared export independently, so one broken export is
  // reported as one broken export rather than collapsing the whole proof.
  // import.meta.resolve() alone is not enough: it answers "is there a file at
  // that specifier" and never executes the module, so a shipped dependency that
  // is missing from the manifest stays invisible until something imports it.
  const perExport = {};
  for (const spec of specifiers) {
    await writeFile(
      join(consumer, 'one.mjs'),
      `import { createRequire } from 'node:module';\nawait import(${JSON.stringify(spec)});\nprocess.stdout.write(createRequire(import.meta.url).resolve(${JSON.stringify(spec)}));\n`,
    );
    const r = run('node', ['one.mjs'], consumer, { allowFailure: true });
    if (r.status === 0) {
      perExport[spec] = { loaded: true, resolvedPath: r.stdout.trim() };
    } else {
      const missing = (r.stderr.match(/Cannot find (?:module|package) '([^']+)'/) || [])[1] ?? null;
      perExport[spec] = { loaded: false, missingDependency: missing, error: r.stderr.split('\n').find((l) => l.includes('Error')) ?? null };
    }
    check(r.status === 0, `export loads from the installed package: ${spec}${perExport[spec].loaded ? '' : ` (missing ${perExport[spec].missingDependency})`}`);
  }

  const loadable = specifiers.filter((s2) => perExport[s2].loaded);
  const blocked = specifiers.filter((s2) => !perExport[s2].loaded);

  let probeOut = {};
  if (loadable.length > 0) {
    await writeFile(
      join(consumer, 'probe.mjs'),
      `
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const out = { versions: {}, paths: {} };
out.paths.frontera = require_.resolve(${JSON.stringify(pkg.name)});
out.paths.protocol = require_.resolve('@aoc/protocol');
import { readFileSync } from 'node:fs';
const readPkg = (dir) => JSON.parse(readFileSync(new URL('node_modules/' + dir + '/package.json', import.meta.url), 'utf8'));
out.versions.frontera = readPkg(${JSON.stringify(pkg.name)}).version;
out.versions.protocol = readPkg('@aoc/protocol').version;
const rt = await import(${JSON.stringify(pkg.name)});
out.executed = typeof rt.evaluateEnforcementPipeline === 'function' && typeof rt.verifyCapabilityToken === 'function';
const verification = rt.verifyCapabilityToken(
  {
    schemaVersion: '1.0.0', tokenId: 'token-1', issuer: 'issuer-1', subject: 'user-1',
    resource: { kind: 'tenant', id: '123' }, scope: ['read'], expiresAt: '2100-01-01T00:00:00.000Z',
    proof: { proofType: 'jwt', proofRef: 'sig-ref-fixture-1', issuedAt: new Date().toISOString() },
  },
  { trustDomain: 'enterprise', revokedJti: new Set(), nowIso: new Date().toISOString() },
);
out.capabilityVerificationValid = verification.valid === true;
process.stdout.write(JSON.stringify(out));
`,
    );
    const probeRun = run('node', ['probe.mjs'], consumer, { allowFailure: true });
    if (probeRun.status === 0) {
      probeOut = JSON.parse(probeRun.stdout);
      check(probeOut.executed === true, 'representative runtime entry points are callable through the packaged surface');
      check(probeOut.capabilityVerificationValid === true, 'representative runtime execution produces the expected result');
      check(probeOut.versions.frontera === pkg.version, `resolved Frontera version is ${pkg.version}`);
      check(probeOut.versions.protocol === lock.expectedVersion, `resolved Protocol version is ${lock.expectedVersion}`);
      check(probeOut.paths.frontera.startsWith(consumer), 'Frontera resolves inside the clean room, not back into the Enterprise repository');
      check(probeOut.paths.protocol.startsWith(consumer), 'Protocol resolves inside the clean room, not into a Protocol source checkout');
      check(!probeOut.paths.frontera.includes(ROOT) && !probeOut.paths.protocol.includes(ROOT), 'no resolution path points at this repository');
    } else {
      process.stderr.write(`${probeRun.stdout ?? ''}${probeRun.stderr ?? ''}`);
      check(false, 'representative runtime execution through the packaged surface');
    }
    for (const [spec, info] of Object.entries(perExport)) {
      if (info.loaded && !info.resolvedPath.startsWith(consumer)) {
        failures.push(`${spec} resolved outside the clean room: ${info.resolvedPath}`);
      }
    }
  }

  // The installed Protocol must be the real package, not a symlinked checkout.
  const protocolDir = join(consumer, 'node_modules', '@aoc', 'protocol');
  const lstat = run('node', ['-e', `process.stdout.write(String(require('node:fs').lstatSync(${JSON.stringify(protocolDir)}).isSymbolicLink()))`], consumer).stdout.trim();
  check(lstat === 'false', 'installed @aoc/protocol is a real directory, not a symlink to a checkout');

  const installedContract = join(protocolDir, 'integration-contract.json');
  if (existsSync(installedContract)) {
    const contract = JSON.parse(await readFile(installedContract, 'utf8'));
    check(contract.status === 'frozen', `installed Protocol ships integration contract ${contract.contract}@${contract.contractVersion} (${contract.status})`);
    check(contract.protocol.version === lock.expectedVersion, 'installed integration contract agrees with the pinned Protocol version');
  } else {
    failures.push('installed @aoc/protocol does not ship integration-contract.json');
  }

  // Negative: undeclared/deep imports must not resolve.
  const negatives = [
    `${pkg.name}/src/index`,
    `${pkg.name}/dist/src/index.js`,
    `${pkg.name}/internal`,
    '@aoc/protocol/src/index',
    '@aoc/protocol/dist/contracts/index.js',
  ];
  const negativeResults = {};
  for (const spec of negatives) {
    const r = run('node', ['-e', `require('node:module').createRequire(${JSON.stringify(join(consumer, 'x.js'))}).resolve(${JSON.stringify(spec)})`], consumer, { allowFailure: true });
    negativeResults[spec] = r.status !== 0 ? 'unresolvable (correct)' : 'RESOLVED (violation)';
    check(r.status !== 0, `undeclared import is unresolvable: ${spec}`);
  }

  const evidence = {
    humanProduct: 'Frontera',
    package: pkg.name,
    version: pkg.version,
    tarball: packMeta.filename,
    tarballSha256: fronteraSha,
    protocol: {
      package: lock.package,
      version: lock.expectedVersion,
      commit: lock.commit,
      tarball: lock.tarball.filename,
      tarballSha256: protocolSha,
    },
    resolvedFronteraPath: probeOut.paths?.frontera ?? null,
    resolvedProtocolPath: probeOut.paths?.protocol ?? null,
    exportsTested: specifiers,
    exportsConsumable: loadable,
    exportsBlocked: blocked,
    perExport,
    negativeImports: negativeResults,
    workspaceLinksUsed: false,
    localSourceResolutionUsed: false,
    installFlags: 'npm install (no --force, no --legacy-peer-deps)',
    ok: failures.length === 0,
  };

  if (failures.length > 0) {
    log('CLEAN-ROOM CONSUMER FAILED:');
    for (const f of failures) log(` - ${f}`);
    process.exitCode = 1;
  } else {
    log(`Clean-room consumer passed: ${specifiers.length} exports, ${negatives.length} negative imports.`);
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true }).catch(() => {});
}
