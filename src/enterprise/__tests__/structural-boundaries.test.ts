import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Enforces the architectural boundaries this iteration establishes:
 * `src/enterprise` is the new Enterprise Host, `src/runtime` (grants/
 * delegation/vault/federation) and `src/kernel` (the decision engine) are
 * both untouched and unaware of it. These run against the repo-root-
 * relative TypeScript sources (not `dist/`) so they hold regardless of
 * build artifacts, matching this repo's existing `tests/*.mjs` convention
 * of asserting on source text directly.
 */

function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function importsMatching(files: readonly string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (pattern.test(text)) hits.push(file);
  }
  return hits;
}

describe('Structural boundaries: src/enterprise, src/runtime, src/kernel', () => {
  it('src/enterprise exists as the AOC Enterprise Host', () => {
    assert.ok(existsSync('src/enterprise'), 'src/enterprise must exist');
    assert.ok(statSync('src/enterprise').isDirectory());
    assert.ok(existsSync('src/enterprise/index.ts'), 'src/enterprise must have a public index.ts');
  });

  it('src/runtime (grants/delegation/vault/federation) is untouched by this iteration -- it never imports from src/enterprise or src/kernel-host', () => {
    assert.ok(existsSync('src/runtime'), 'src/runtime must still exist');
    const runtimeFiles = walkTsFiles('src/runtime');
    assert.ok(runtimeFiles.length > 0, 'src/runtime must still contain real files');

    const leaks = importsMatching(runtimeFiles, /from ['"]\.\.\/enterprise\/|from ['"]\.\.\/kernel-host\//);
    assert.deepEqual(leaks, [], 'src/runtime must not import the new Enterprise Host');
  });

  it('src/kernel (the decision engine) remains behaviorally unchanged -- it never imports from src/enterprise, src/kernel-host, or src/runtime', () => {
    assert.ok(existsSync('src/kernel'), 'src/kernel must still exist');
    const kernelFiles = walkTsFiles('src/kernel');
    assert.ok(kernelFiles.length > 0);

    const leaks = importsMatching(kernelFiles, /from ['"]\.\.\/enterprise\/|from ['"]\.\.\/kernel-host\/|from ['"]\.\.\/runtime\//);
    assert.deepEqual(leaks, [], 'src/kernel must remain independent of both the Enterprise Host and src/runtime');
  });

  it('src/enterprise imports the Kernel (a one-way dependency, never the reverse)', () => {
    const enterpriseFiles = walkTsFiles('src/enterprise').filter((f) => !f.includes('/__tests__/'));
    const kernelImporters = importsMatching(enterpriseFiles, /from ['"]\.\.\/\.\.\/kernel\/(index\.js)?['"]/);
    assert.ok(kernelImporters.length > 0, 'at least one src/enterprise module must import the Kernel');
  });

  it('src/enterprise does not import from src/runtime directly (no implicit coupling to the unrelated grants/vault/federation system)', () => {
    const enterpriseFiles = walkTsFiles('src/enterprise').filter((f) => !f.includes('/__tests__/'));
    const leaks = importsMatching(enterpriseFiles, /from ['"]\.\.\/\.\.\/runtime\//);
    assert.deepEqual(leaks, [], 'src/enterprise must not import src/runtime without an explicit public contract');
  });

  it('no circular dependency exists between src/kernel and src/enterprise', () => {
    const kernelFiles = walkTsFiles('src/kernel');
    const enterpriseFiles = walkTsFiles('src/enterprise').filter((f) => !f.includes('/__tests__/'));

    const kernelImportsEnterprise = importsMatching(kernelFiles, /from ['"].*enterprise/);
    const enterpriseImportsKernel = importsMatching(enterpriseFiles, /from ['"].*kernel\//);

    assert.deepEqual(kernelImportsEnterprise, [], 'Kernel must never import Enterprise');
    assert.ok(enterpriseImportsKernel.length > 0, 'Enterprise importing Kernel is the one legitimate direction');
  });
});

describe('Structural boundaries: Governance Store (PR-004)', () => {
  it('the Kernel never imports the Governance Store — it remains persistence-independent', () => {
    const kernelFiles = walkTsFiles('src/kernel');
    const leaks = importsMatching(kernelFiles, /from ['"].*governance-store/);
    assert.deepEqual(leaks, [], 'src/kernel must not know the Governance Store exists');
  });

  it('the Governance Store contains no decision logic — it never imports the wrapped engine or evaluates anything', () => {
    const storeFiles = walkTsFiles('src/enterprise/governance-store');
    assert.ok(storeFiles.length > 0);
    const engineImports = importsMatching(storeFiles, /from ['"].*features\/action-enforcement/);
    assert.deepEqual(engineImports, [], 'the Store records decisions; it must never reach into the decision engine');
    const evaluateCalls = importsMatching(storeFiles, /kernel\.evaluate|\.evaluate\(/);
    assert.deepEqual(evaluateCalls, [], 'the Store must never invoke an evaluation');
  });

  it('HTTP handlers execute no SQL — better-sqlite3 and SQL strings stay inside the Store', () => {
    const adapterFiles = walkTsFiles('src/enterprise/adapters').concat(walkTsFiles('src/enterprise/host'));
    const sqlLeaks = importsMatching(adapterFiles, /better-sqlite3|SELECT |INSERT INTO|CREATE TABLE/);
    assert.deepEqual(sqlLeaks, [], 'no HTTP-facing module may touch the database directly');
  });

  it('the public Store contracts expose no better-sqlite3 types', () => {
    for (const file of ['src/enterprise/governance-store/contracts.ts', 'src/enterprise/governance-store/governance-store.ts', 'src/enterprise/governance-store/errors.ts']) {
      const text = readFileSync(file, 'utf8');
      assert.ok(!text.includes('better-sqlite3'), `${file} must not reference the SQLite driver`);
    }
  });

  it('the Store interface exposes no public update or delete methods', () => {
    const text = readFileSync('src/enterprise/governance-store/governance-store.ts', 'utf8');
    assert.ok(!/\b(update|delete|remove|purge)\w*\s*\(/.test(text), 'the GovernanceStore interface must stay append-oriented');
  });

  it('both providers implement the same interface via the same shared projection (no drift by construction)', () => {
    for (const file of ['src/enterprise/governance-store/in-memory-governance-store.ts', 'src/enterprise/governance-store/sqlite-governance-store.ts']) {
      const text = readFileSync(file, 'utf8');
      assert.ok(text.includes('buildGovernanceAggregate'), `${file} must build aggregates through the shared projection`);
      assert.ok(text.includes('verifyGovernanceRecordIntegrity'), `${file} must verify through the shared verification`);
    }
  });

  it('the module registry remains generic — it never mentions the Governance Store', () => {
    const registryFiles = walkTsFiles('src/enterprise/registry');
    const leaks = importsMatching(registryFiles, /governance-store/);
    assert.deepEqual(leaks, [], 'the registry stays module-agnostic');
  });
});
