import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixtureDir = resolve(root, 'tests/fixtures/external-consumer');
const tmp = await mkdtemp(join(tmpdir(), 'aoc-publishability-'));
const consumerDir = join(tmp, 'external-consumer');

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

  const protocolStubDir = join(tmp, 'protocol-contracts-stub');
  await mkdir(protocolStubDir, { recursive: true });
  await writeFile(join(protocolStubDir, 'package.json'), JSON.stringify({
    name: '@aoc/protocol',
    version: '0.0.0',
    private: true,
    type: 'module',
    exports: {
      './contracts': { types: './contracts.d.ts', default: './contracts.js' }
    }
  }, null, 2));
  await writeFile(join(protocolStubDir, 'contracts.d.ts'), 'export type AocIdentityClaims = Record<string, unknown>;\nexport type CapabilityToken = Record<string, unknown>;\nexport type ConsentGrant = Record<string, unknown>;\nexport type ScopedAccessRequest = Record<string, unknown>;\nexport type AuditEventEnvelope = Record<string, unknown>;\n');
  await writeFile(join(protocolStubDir, 'contracts.js'), 'export {};\n');

  run('npm', ['install', protocolStubDir], consumerDir);
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
