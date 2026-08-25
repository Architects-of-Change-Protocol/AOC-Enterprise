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
//   * an operator can provision a durable authority world, and an unrelated
//     application can then obtain a real, restart-surviving Frontera
//     authorization decision from it in a separate process -- through public
//     exports only, seeding nothing at evaluation time;
//   * @aoc/protocol resolves only through the installed, checksummed candidate;
//   * nothing resolves back into this repository or a Protocol source checkout;
//   * undeclared/deep imports remain unresolvable.
//
// Publishes nothing, creates no tag and no release. Prints a JSON evidence object
// as its final stdout line.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
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

// The consumer installs the Frontera artifact and the Protocol candidate. Nothing
// else. Frontera's private implementation packages travel INSIDE the artifact as
// npm bundleDependencies, so a consumer never learns their names, never resolves
// them from a registry, and never reconstructs this monorepo's workspace graph.
//
// Installing those private packages here as separate tarballs -- which this gate
// used to do -- would prove only that a consumer can rebuild the dependency graph
// by hand. It would NOT prove that @aoc-enterprise/runtime is a self-contained
// distributable, which is the entire claim under test. Do not add them back.
const EXPECTED_BUNDLED = [
  '@aoc-enterprise/governed-authority',
  '@aoc-enterprise/governed-authorization',
  '@aoc-enterprise/identity',
  '@aoc-enterprise/scoped-access',
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

  // --- the clean room: a package that has never heard of this repository ------
  const consumer = await mkdtemp(join(tmpdir(), 'frontera-cleanroom-consumer-'));
  tempDirs.push(consumer);
  await mkdir(join(consumer, 'src'), { recursive: true });

  const dependencies = {
    '@aoc/protocol': `file:${protocolTarball}`,
    [pkg.name]: `file:${fronteraTarball}`,
  };

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

  // A consumer's CI runs `npm ci`, not `npm install`, and `npm ci` refuses to run
  // when package.json and the lockfile disagree. A bundled dependency whose own
  // manifest names a sibling by a path specifier desynchronises the consumer's
  // lockfile and fails there while `npm install` passes, so both are exercised.
  // --offline additionally proves nothing in the private graph is fetched from a
  // registry.
  const ciRun = run('npm', ['ci', '--offline', '--no-audit', '--no-fund'], consumer, { allowFailure: true });
  if (ciRun.status !== 0) process.stderr.write(`${ciRun.stdout ?? ''}${ciRun.stderr ?? ''}`);
  check(ciRun.status === 0, 'npm ci --offline reinstalls from the lockfile with no registry lookup for private modules');

  // --- Self-containment: the private graph must travel INSIDE the artifact ----
  const consumerScope = join(consumer, 'node_modules', '@aoc-enterprise');
  const topLevelEnterprise = existsSync(consumerScope)
    ? (await readdir(consumerScope)).filter((n) => n !== 'runtime')
    : [];
  check(
    topLevelEnterprise.length === 0,
    `no private @aoc-enterprise/* package is installed alongside the runtime${topLevelEnterprise.length ? ` (found: ${topLevelEnterprise.join(', ')})` : ''}`,
  );

  const bundledDir = join(consumer, 'node_modules', pkg.name, 'node_modules', '@aoc-enterprise');
  const bundled = existsSync(bundledDir) ? (await readdir(bundledDir)).sort() : [];
  const expectedBundled = EXPECTED_BUNDLED.map((n) => n.split('/')[1]).sort();
  check(
    JSON.stringify(bundled) === JSON.stringify(expectedBundled),
    `artifact carries exactly its private implementation packages [${expectedBundled.join(', ')}]${JSON.stringify(bundled) === JSON.stringify(expectedBundled) ? '' : ` (found: ${bundled.join(', ') || 'none'})`}`,
  );

  for (const name of bundled) {
    const dir = join(bundledDir, name);
    const isLink = run('node', ['-e', `process.stdout.write(String(require('node:fs').lstatSync(${JSON.stringify(dir)}).isSymbolicLink()))`], consumer).stdout.trim();
    check(isLink === 'false', `bundled ${name} is a real directory, not a symlink into the monorepo`);
    const bundledPkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    check(bundledPkg.private === true, `bundled ${name} remains private (not promoted to a published product)`);
  }

  // The consumer's own manifest must name only the two external artifacts.
  const consumerPkg = JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8'));
  const declared = Object.keys(consumerPkg.dependencies).sort();
  check(
    JSON.stringify(declared) === JSON.stringify(['@aoc-enterprise/runtime', '@aoc/protocol']),
    `consumer declares only the runtime and Protocol artifacts (declared: ${declared.join(', ')})`,
  );

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

  // --- Durable authority: a real external consumer, restarting for real -----
  //
  // Everything above proves the artifact *loads*. This proves the capability
  // P0-PKG-07 exists to deliver: an unrelated application can obtain an
  // independent, durable Frontera authorization decision without seeding
  // Frontera on every request, without becoming its own authority issuer,
  // without inventing capability tokens, and without a single deep import.
  //
  // Each step runs in a SEPARATE child process, so nothing can be carried
  // between them in memory -- the only thing they share is a SQLite file.
  let durableAuthority = { ran: false };
  if (loadable.length === specifiers.length) {
    const authorityDir = join(consumer, 'authority');
    await mkdir(authorityDir, { recursive: true });
    const dbPath = join(authorityDir, 'kernel-authority.sqlite');

    // The operator's provisioning program. Public package imports only.
    await writeFile(
      join(consumer, 'operator-provision.mjs'),
      `
import { createSqliteKernelAuthorityStore, createKernelAuthorityProvisioningService } from '${pkg.name}/enterprise';

const OPERATOR = { system: true, actorId: 'operator-acme-admin' };
const ORG = 'org-acme';
const TD = 'trust-domain-acme';
const ISSUER = 'actor-org-acme';
const OWNER = 'actor-alice';
const AGENT = 'actor-agent-1';
const SCOPE = 'resource-project-1';
const ACTION = 'execute.material-action';

const store = await createSqliteKernelAuthorityStore(process.argv[2]);
const operator = createKernelAuthorityProvisioningService({ store, organizationId: ORG });

await operator.provisionActor(OPERATOR, { actorId: ISSUER, type: 'organization', displayName: 'Acme' });
await operator.provisionTrustDomain(OPERATOR, { trustDomainId: TD, name: 'Acme', issuerActorId: ISSUER, acceptedIssuerIds: [ISSUER], acceptedActorTypes: ['human', 'organization', 'agent'] });
await operator.provisionActor(OPERATOR, { actorId: OWNER, type: 'human', displayName: 'Alice', issuerId: ISSUER, trustDomainId: TD, externalSubject: { system: 'example-app', subjectId: 'external-user-42' } });
await operator.provisionActor(OPERATOR, { actorId: AGENT, type: 'agent', displayName: 'Acme Automation Agent', issuerId: ISSUER, trustDomainId: TD });
await operator.provisionPassport(OPERATOR, { passportId: 'passport-agent-1', type: 'agent_passport', subjectActorId: AGENT, issuerActorId: ISSUER, trustDomainId: TD });
await operator.provisionCapabilityToken(OPERATOR, { capabilityTokenId: 'cap-agent-1', subjectActorId: AGENT, principalActorId: OWNER, issuerActorId: OWNER, trustDomainId: TD, capability: 'material-action.execute', actions: [ACTION], resourceScopes: [SCOPE], riskLevel: 'medium' });
await operator.provisionRootIssuer(OPERATOR, { trustDomainId: TD, actorId: ISSUER });
await operator.provisionAuthorityGrant(OPERATOR, { authorityGrantId: 'authority-grant-alice', issuerActorId: ISSUER, subjectActorId: OWNER, trustDomainId: TD, roleId: 'role-resource-owner', capability: 'material-action.manage', actions: [ACTION], resourceScopes: [SCOPE], canDelegate: true, allowedDelegateActorTypes: ['agent'], maxDelegationDepth: 1 });
await operator.provisionDelegationGrant(OPERATOR, { delegationGrantId: 'delegation-grant-agent-1', delegatorActorId: OWNER, delegateActorId: AGENT, delegateActorType: 'agent', trustDomainId: TD, sourceAuthorityGrantId: 'authority-grant-alice', capability: 'material-action.execute', actions: [ACTION], resourceScopes: [SCOPE] });

const bound = await operator.findActorByExternalSubject(OPERATOR, { system: 'example-app', subjectId: 'external-user-42' });
await store.close();
process.stdout.write(JSON.stringify({ pid: process.pid, externalSubjectResolvesTo: bound?.entityId ?? null }));
`,
    );

    // The operator's revocation program.
    await writeFile(
      join(consumer, 'operator-revoke.mjs'),
      `
import { createSqliteKernelAuthorityStore, createKernelAuthorityProvisioningService } from '${pkg.name}/enterprise';
const store = await createSqliteKernelAuthorityStore(process.argv[2]);
const operator = createKernelAuthorityProvisioningService({ store, organizationId: 'org-acme' });
const result = await operator.revoke({ system: true, actorId: 'operator-acme-admin' }, { entityKind: 'delegation-grant', entityId: 'delegation-grant-agent-1', reason: 'agent decommissioned' });
await store.close();
process.stdout.write(JSON.stringify({ pid: process.pid, status: result.record.status }));
`,
    );

    // The APPLICATION. It opens the durable store, restores the world, and
    // asks. It never imports the provisioning service, never holds an operator
    // context, and provisions nothing.
    await writeFile(
      join(consumer, 'application-evaluate.mjs'),
      `
import { createSqliteKernelAuthorityStore, createDurableKernelProviders } from '${pkg.name}/enterprise';
import { createAocKernel } from '${pkg.name}/kernel';

const ORG = 'org-acme';
const TD = 'trust-domain-acme';
const OWNER = 'actor-alice';
const AGENT = 'actor-agent-1';
const SCOPE = 'resource-project-1';
const ACTION = 'execute.material-action';

const store = await createSqliteKernelAuthorityStore(process.argv[2]);
const providers = await createDurableKernelProviders({ store, organizationId: ORG });
const kernel = createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });

const ask = async (label, over = {}) => {
  const decision = await kernel.evaluate({
    requestId: 'req-' + label,
    actor: { id: over.actorId ?? AGENT, principalId: OWNER, trustDomainId: TD, type: 'agent' },
    action: { type: over.action ?? ACTION, resourceScope: over.resourceScope ?? SCOPE, capability: 'material-action.execute' },
    organization: { id: over.organizationId ?? ORG },
    requestedAt: new Date().toISOString(),
  });
  return decision.status;
};

const out = { pid: process.pid, hydratedRecords: providers.records().length, results: {} };
out.results.matching = await ask('matching');
out.results.wrongAction = await ask('wrong-action', { action: 'delete.material-action' });
out.results.wrongResource = await ask('wrong-resource', { resourceScope: 'resource-project-2' });
out.results.unknownActor = await ask('unknown-actor', { actorId: 'actor-nobody' });
out.results.crossOrganization = await ask('cross-org', { organizationId: 'org-beta' });
out.recordsAfter = (await store.listRecords({ system: false, organizationId: ORG }, { organizationId: ORG })).length;
await store.close();
process.stdout.write(JSON.stringify(out));
`,
    );

    const runConsumerStep = (script, ...extra) => {
      const result = run('node', [script, dbPath, ...extra], consumer, { allowFailure: true });
      if (result.status !== 0) {
        process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
        return null;
      }
      return JSON.parse(result.stdout);
    };

    const provisioned = runConsumerStep('operator-provision.mjs');
    check(provisioned !== null, 'operator provisions a durable authority world through supported public exports only');

    const firstRun = provisioned === null ? null : runConsumerStep('application-evaluate.mjs');
    check(firstRun !== null, 'application restores the durable world in a fresh process and evaluates');

    if (provisioned !== null && firstRun !== null) {
      check(provisioned.externalSubjectResolvesTo === 'actor-alice', 'external application principal resolves to a Frontera actor through the public binding');
      check(firstRun.pid !== provisioned.pid, 'evaluation runs in a different OS process than provisioning (no shared memory)');
      check(firstRun.hydratedRecords === 9, `restored world holds the 9 provisioned records (found ${firstRun.hydratedRecords})`);
      check(firstRun.results.matching === 'allowed', 'matching actor/resource/action is ALLOWED after restart, with no re-seeding');
      check(firstRun.results.wrongAction === 'denied', 'wrong action is DENIED');
      check(firstRun.results.wrongResource === 'denied', 'wrong resource is DENIED');
      check(firstRun.results.unknownActor === 'denied', 'unknown actor is DENIED');
      check(firstRun.results.crossOrganization === 'denied', 'cross-organization request is DENIED');
      check(firstRun.recordsAfter === 9, 'evaluating did not create, change or remove a single authority record');

      const secondRun = runConsumerStep('application-evaluate.mjs');
      check(secondRun !== null && secondRun.pid !== firstRun.pid, 'a second, independent application process starts from the same durable state');
      check(secondRun !== null && secondRun.results.matching === 'allowed', 'the ALLOW is reproducible across repeated restarts');

      const revoked = runConsumerStep('operator-revoke.mjs');
      check(revoked !== null && revoked.status === 'revoked', 'operator revokes the delegated authority through the public operator surface');
      check(revoked !== null && revoked.pid !== firstRun.pid, 'revocation runs in its own OS process');

      const afterRevoke = runConsumerStep('application-evaluate.mjs');
      check(afterRevoke !== null && afterRevoke.pid !== (revoked?.pid ?? -1), 'the application restarts once more after the revocation');
      check(afterRevoke !== null && afterRevoke.results.matching === 'denied', 'the formerly-allowed request is DENIED after revocation + restart');
      check(afterRevoke !== null && afterRevoke.results.unknownActor === 'denied', 'unknown actor remains DENIED after revocation + restart');

      durableAuthority = {
        ran: true,
        provisionedInPid: provisioned.pid,
        evaluatedInPids: [firstRun.pid, secondRun?.pid ?? null, afterRevoke?.pid ?? null],
        hydratedRecords: firstRun.hydratedRecords,
        externalSubjectResolvesTo: provisioned.externalSubjectResolvesTo,
        beforeRevocation: firstRun.results,
        afterRevocation: afterRevoke?.results ?? null,
        authorityRecordsUnchangedByEvaluation: firstRun.recordsAfter === 9,
        importsUsed: [`${pkg.name}/enterprise`, `${pkg.name}/kernel`],
        deepImportsUsed: false,
      };
    }
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
    durableAuthority,
    bundledPrivateModules: bundled,
    privatePackagesInstalledSeparately: topLevelEnterprise,
    consumerDeclaredDependencies: declared,
    workspaceLinksUsed: false,
    localSourceResolutionUsed: false,
    installFlags: 'npm install then npm ci --offline (no --force, no --legacy-peer-deps)',
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
