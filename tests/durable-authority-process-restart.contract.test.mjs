// Cross-process durability proof for the Frontera durable Kernel Authority world.
//
// Every other durable-authority test reopens the store inside one Node process.
// That proves the world is rebuilt from the store rather than shared between
// provider instances, but it cannot rule out a module-level Map or a cached
// singleton surviving between them. This suite removes that doubt the only way
// it can be removed: each step runs in a **separate OS process**, and the only
// thing they share is a file on disk.
//
// It is the direct answer to the P0-PKG-06 measurement "new provider instance,
// same IDs -> denied".
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ENTERPRISE = join(ROOT, 'dist/src/enterprise/index.js');
const KERNEL = join(ROOT, 'dist/src/kernel/index.js');

const ORG = 'org-acme';
const TRUST_DOMAIN = 'trust-domain-acme';
const ISSUER = 'actor-org-acme';
const OWNER = 'actor-alice';
const AGENT = 'actor-agent-1';
const SCOPE = 'resource-project-1';
const ACTION = 'execute.material-action';

let workdir;
let dbPath;

before(() => {
  assert.ok(existsSync(ENTERPRISE), 'run "npm run build" before this suite');
  workdir = mkdtempSync(join(tmpdir(), 'aoc-durable-authority-processes-'));
  dbPath = join(workdir, 'kernel-authority.sqlite');

  writeFileSync(
    join(workdir, 'provision.mjs'),
    `
const ent = await import(${JSON.stringify(ENTERPRISE)});
const OP = { system: true, actorId: 'operator-acme-admin' };
const store = await ent.createSqliteKernelAuthorityStore(process.argv[2]);
const svc = ent.createKernelAuthorityProvisioningService({ store, organizationId: ${JSON.stringify(ORG)} });
await svc.provisionActor(OP, { actorId: ${JSON.stringify(ISSUER)}, type: 'organization', displayName: 'Acme' });
await svc.provisionTrustDomain(OP, { trustDomainId: ${JSON.stringify(TRUST_DOMAIN)}, name: 'Acme', issuerActorId: ${JSON.stringify(ISSUER)}, acceptedIssuerIds: [${JSON.stringify(ISSUER)}], acceptedActorTypes: ['human', 'organization', 'agent'] });
await svc.provisionActor(OP, { actorId: ${JSON.stringify(OWNER)}, type: 'human', displayName: 'Alice', issuerId: ${JSON.stringify(ISSUER)}, trustDomainId: ${JSON.stringify(TRUST_DOMAIN)}, externalSubject: { system: 'example-app', subjectId: 'external-user-42' } });
await svc.provisionActor(OP, { actorId: ${JSON.stringify(AGENT)}, type: 'agent', displayName: 'Agent', issuerId: ${JSON.stringify(ISSUER)}, trustDomainId: ${JSON.stringify(TRUST_DOMAIN)} });
await svc.provisionPassport(OP, { passportId: 'passport-agent-1', type: 'agent_passport', subjectActorId: ${JSON.stringify(AGENT)}, issuerActorId: ${JSON.stringify(ISSUER)}, trustDomainId: ${JSON.stringify(TRUST_DOMAIN)} });
await svc.provisionCapabilityToken(OP, { capabilityTokenId: 'cap-agent-1', subjectActorId: ${JSON.stringify(AGENT)}, principalActorId: ${JSON.stringify(OWNER)}, issuerActorId: ${JSON.stringify(OWNER)}, trustDomainId: ${JSON.stringify(TRUST_DOMAIN)}, capability: 'material-action.execute', actions: [${JSON.stringify(ACTION)}], resourceScopes: [${JSON.stringify(SCOPE)}], riskLevel: 'medium' });
await svc.provisionRootIssuer(OP, { trustDomainId: ${JSON.stringify(TRUST_DOMAIN)}, actorId: ${JSON.stringify(ISSUER)} });
await svc.provisionAuthorityGrant(OP, { authorityGrantId: 'authority-grant-alice', issuerActorId: ${JSON.stringify(ISSUER)}, subjectActorId: ${JSON.stringify(OWNER)}, trustDomainId: ${JSON.stringify(TRUST_DOMAIN)}, roleId: 'role-resource-owner', capability: 'material-action.manage', actions: [${JSON.stringify(ACTION)}], resourceScopes: [${JSON.stringify(SCOPE)}], canDelegate: true, allowedDelegateActorTypes: ['agent'], maxDelegationDepth: 1 });
await svc.provisionDelegationGrant(OP, { delegationGrantId: 'delegation-grant-agent-1', delegatorActorId: ${JSON.stringify(OWNER)}, delegateActorId: ${JSON.stringify(AGENT)}, delegateActorType: 'agent', trustDomainId: ${JSON.stringify(TRUST_DOMAIN)}, sourceAuthorityGrantId: 'authority-grant-alice', capability: 'material-action.execute', actions: [${JSON.stringify(ACTION)}], resourceScopes: [${JSON.stringify(SCOPE)}] });
await store.close();
process.stdout.write(JSON.stringify({ pid: process.pid, provisioned: true }));
`,
  );

  writeFileSync(
    join(workdir, 'revoke.mjs'),
    `
const ent = await import(${JSON.stringify(ENTERPRISE)});
const store = await ent.createSqliteKernelAuthorityStore(process.argv[2]);
const svc = ent.createKernelAuthorityProvisioningService({ store, organizationId: ${JSON.stringify(ORG)} });
const result = await svc.revoke({ system: true, actorId: 'operator-acme-admin' }, { entityKind: process.argv[3], entityId: process.argv[4], reason: 'withdrawn by operator' });
await store.close();
process.stdout.write(JSON.stringify({ pid: process.pid, status: result.record.status, revokedBy: result.record.revokedBy }));
`,
  );

  // The evaluating process never imports the provisioning service and never
  // holds an operator context. It opens the store, restores the world, and asks.
  writeFileSync(
    join(workdir, 'evaluate.mjs'),
    `
const ent = await import(${JSON.stringify(ENTERPRISE)});
const k = await import(${JSON.stringify(KERNEL)});
const store = await ent.createSqliteKernelAuthorityStore(process.argv[2]);
const providers = await ent.createDurableKernelProviders({ store, organizationId: ${JSON.stringify(ORG)} });
const kernel = k.createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });
const base = (over = {}) => ({
  requestId: 'req-' + Math.random().toString(36).slice(2),
  actor: { id: over.actorId ?? ${JSON.stringify(AGENT)}, principalId: ${JSON.stringify(OWNER)}, trustDomainId: ${JSON.stringify(TRUST_DOMAIN)}, type: 'agent' },
  action: { type: over.action ?? ${JSON.stringify(ACTION)}, resourceScope: over.resourceScope ?? ${JSON.stringify(SCOPE)}, capability: 'material-action.execute' },
  organization: { id: over.organizationId ?? ${JSON.stringify(ORG)} },
  requestedAt: new Date().toISOString(),
});
const out = { pid: process.pid, hydratedRecords: providers.records().length, results: {} };
for (const [label, over] of Object.entries({
  valid: {},
  wrongAction: { action: 'delete.material-action' },
  wrongResource: { resourceScope: 'resource-project-2' },
  unknownActor: { actorId: 'actor-nobody' },
  crossOrganization: { organizationId: 'org-beta' },
})) {
  const decision = await kernel.evaluate(base(over));
  out.results[label] = decision.status;
}
out.recordsAfterEvaluating = (await store.listRecords({ system: false, organizationId: ${JSON.stringify(ORG)} }, { organizationId: ${JSON.stringify(ORG)} })).length;
await store.close();
process.stdout.write(JSON.stringify(out));
`,
  );
});

after(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

function runStep(script, ...args) {
  const stdout = execFileSync(process.execPath, [join(workdir, script), dbPath, ...args], { encoding: 'utf8', cwd: workdir });
  return JSON.parse(stdout);
}

describe('Durable Kernel Authority survives a real process restart', () => {
  it('provisions in one process and allows in a different one, with no re-seeding', () => {
    const provisioning = runStep('provision.mjs');
    assert.equal(provisioning.provisioned, true);

    const first = runStep('evaluate.mjs');
    const second = runStep('evaluate.mjs');

    assert.notEqual(first.pid, provisioning.pid, 'evaluation must run in a different OS process than provisioning');
    assert.notEqual(second.pid, first.pid, 'the two evaluating processes must be distinct');

    assert.equal(first.hydratedRecords, 9);
    assert.equal(second.hydratedRecords, 9);

    const expected = {
      valid: 'allowed',
      wrongAction: 'denied',
      wrongResource: 'denied',
      unknownActor: 'denied',
      crossOrganization: 'denied',
    };
    assert.deepEqual(first.results, expected);
    assert.deepEqual(second.results, expected, 'the restart matrix must be identical in a second fresh process');
  });

  it('leaves the authority record set untouched by evaluating', () => {
    const evaluated = runStep('evaluate.mjs');
    assert.equal(evaluated.recordsAfterEvaluating, 9, 'evaluation must neither create nor remove authority records');
  });

  it('keeps a revocation revoked in every process that starts afterwards', () => {
    const revocation = runStep('revoke.mjs', 'delegation-grant', 'delegation-grant-agent-1');
    assert.equal(revocation.status, 'revoked');
    assert.equal(revocation.revokedBy, 'operator-acme-admin');

    for (const attempt of [0, 1]) {
      const evaluated = runStep('evaluate.mjs');
      assert.equal(evaluated.results.valid, 'denied', `restart #${attempt + 1} must not resurrect revoked authority`);
      assert.equal(evaluated.results.wrongAction, 'denied');
      assert.equal(evaluated.results.unknownActor, 'denied');
    }
  });
});
