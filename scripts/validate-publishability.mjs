import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixtureDir = resolve(root, 'tests/fixtures/external-consumer');
const tmp = await mkdtemp(join(tmpdir(), 'aoc-publishability-'));
const consumerDir = join(tmp, 'external-consumer');

const rootPkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const protocolSpec = rootPkg.devDependencies?.['@aoc/protocol'] ?? rootPkg.dependencies?.['@aoc/protocol'];
if (!protocolSpec || !protocolSpec.startsWith('file:')) {
  throw new Error('Root devDependency (or dependency) @aoc/protocol must be a real file: dependency for publishability validation.');
}
const protocolPath = resolve(root, protocolSpec.slice('file:'.length));
const protocolPkgJson = resolve(protocolPath, 'package.json');
await stat(protocolPkgJson);

const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (${cwd})`);
  }
  return result.stdout.trim();
};

try {
  run('npm', ['run', 'build'], root);
  const packStdout = run('npm', ['pack', '--json'], root);
  const packMeta = JSON.parse(packStdout);
  const tarballName = packMeta[0]?.filename;
  if (!tarballName) {
    throw new Error('Could not read tarball name from npm pack output.');
  }

  const tarballPath = resolve(root, tarballName);
  await cp(fixtureDir, consumerDir, { recursive: true });


  const fixturePkgPath = join(consumerDir, 'package.json');
  const fixturePkg = JSON.parse(await readFile(fixturePkgPath, 'utf8'));
  fixturePkg.dependencies = fixturePkg.dependencies ?? {};
  fixturePkg.dependencies['@aoc/protocol'] = `file:${protocolPath}`;
  await writeFile(fixturePkgPath, `${JSON.stringify(fixturePkg, null, 2)}\n`);

  run('npm', ['install'], consumerDir);
  run('npm', ['install', tarballPath], consumerDir);

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

  const declCheck = run('node', [resolve(root, 'scripts/check-declaration-leaks.mjs')], consumerDir);
  if (!declCheck.includes('passed')) {
    throw new Error('Declaration path check did not run as expected.');
  }

  console.log('Publishability validation completed successfully.');
} finally {
  await rm(tmp, { recursive: true, force: true });
}
