import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAocKernel, type AocKernel, type KernelEvaluationRequest } from '../../kernel/index.js';
import { createDefaultKernelProviders } from '../providers/kernel-provider-composition.js';
import { createDurableKernelProviders, type DurableKernelProviderSet } from '../kernel-authority/durable-kernel-providers.js';
import { createInMemoryKernelAuthorityStore } from '../kernel-authority/in-memory-kernel-authority-store.js';
import { createSqliteKernelAuthorityStore } from '../kernel-authority/sqlite-kernel-authority-store.js';
import { createKernelAuthorityProvisioningService } from '../kernel-authority/provisioning-service.js';
import { KernelAuthorityError } from '../kernel-authority/errors.js';
import type { KernelAuthorityStore } from '../kernel-authority/kernel-authority-store.js';
import {
  DURABLE_FIXTURE_ORGANIZATION_ID,
  DURABLE_FIXTURE_OPERATOR,
  DURABLE_FIXTURE_OTHER_ACTION,
  DURABLE_FIXTURE_OTHER_RESOURCE_SCOPE,
  DURABLE_FIXTURE_OUTSIDER_ACTOR_ID,
  buildDurableAuthorityPayloads,
  buildDurableFixtureRequest,
  provisionDurableAuthorityFixture,
  type DurableAuthorityFixtureIds,
} from '../kernel-authority/fixtures/durable-authority.fixture.js';

const tempDirs: string[] = [];
const closers: Array<() => Promise<void>> = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDbPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'aoc-durable-authority-'));
  tempDirs.push(dir);
  return join(dir, `${name}.sqlite`);
}

function kernelFor(providers: DurableKernelProviderSet): AocKernel {
  return createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });
}

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `req-durable-${requestCounter}`;
}

async function statusOf(kernel: AocKernel, request: Omit<KernelEvaluationRequest, 'requestId'> & { requestId?: string }): Promise<string> {
  const result = await kernel.evaluate({ ...request, requestId: request.requestId ?? nextRequestId() } as KernelEvaluationRequest);
  return result.status;
}

/** Opens a *new* store handle and a *new* provider set over the same file -- the in-process stand-in for a restarted process. */
async function reopen(path: string): Promise<DurableKernelProviderSet> {
  const store = await createSqliteKernelAuthorityStore(path);
  closers.push(() => store.close());
  return createDurableKernelProviders({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });
}

describe('Durable Kernel Authority: fail-closed defaults', () => {
  it('hydrates an empty world from an empty store, denying exactly as the in-memory default does', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });

    assert.equal(providers.records().length, 0);

    const request: KernelEvaluationRequest = {
      requestId: nextRequestId(),
      actor: { id: 'actor-alice', trustDomainId: 'trust-domain-acme', type: 'human' },
      action: { type: 'execute.material-action', resourceScope: 'resource-project-1' },
      requestedAt: '2026-01-01T00:00:00.000Z',
    };

    const durable = await kernelFor(providers).evaluate(request);
    const empty = createDefaultKernelProviders();
    const legacy = await createAocKernel({ recognitionProvider: empty.recognitionProvider, clock: empty.clock, idGenerator: empty.idGenerator }).evaluate({
      ...request,
      requestId: nextRequestId(),
    });

    assert.equal(durable.status, 'denied');
    assert.deepEqual(durable.reasonCodes, legacy.reasonCodes, 'an empty durable world must deny for exactly the reasons the empty default world denies for');
  });

  it('leaves createDefaultKernelProviders untouched: an unconfigured deployment still gets a real, empty, fail-closed world', () => {
    const providers = createDefaultKernelProviders();
    assert.equal(providers.recognitionRuntime.actorRegistry.getActor('actor-alice'), undefined);
    assert.equal(providers.recognitionRuntime.trustDomainService.getTrustDomain('trust-domain-acme'), undefined);
  });
});

describe('Durable Kernel Authority: restart matrix', () => {
  it('restores a legitimate ALLOW in a fresh provider set without re-seeding, and keeps every denial denied', async () => {
    const path = tempDbPath('restart-matrix');

    // --- Instance #1: provision, then evaluate. -----------------------------
    const first = await reopen(path);
    const service = createKernelAuthorityProvisioningService({
      store: first.authorityStore,
      organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
      onCommitted: () => first.reload(),
    });
    const ids = await provisionDurableAuthorityFixture(service);
    const firstKernel = kernelFor(first);

    const before = {
      valid: await statusOf(firstKernel, buildDurableFixtureRequest(ids)),
      wrongAction: await statusOf(firstKernel, buildDurableFixtureRequest(ids, { action: DURABLE_FIXTURE_OTHER_ACTION })),
      wrongResource: await statusOf(firstKernel, buildDurableFixtureRequest(ids, { resourceScope: DURABLE_FIXTURE_OTHER_RESOURCE_SCOPE })),
      unknownActor: await statusOf(firstKernel, buildDurableFixtureRequest(ids, { actorId: 'actor-nobody' })),
      unauthorizedActor: await statusOf(firstKernel, buildDurableFixtureRequest(ids, { actorId: DURABLE_FIXTURE_OUTSIDER_ACTOR_ID })),
      crossOrganization: await statusOf(firstKernel, buildDurableFixtureRequest(ids, { organizationId: 'org-beta' })),
    };

    assert.deepEqual(before, {
      valid: 'allowed',
      wrongAction: 'denied',
      wrongResource: 'denied',
      unknownActor: 'denied',
      unauthorizedActor: 'denied',
      crossOrganization: 'denied',
    });

    // --- Instance #2: a brand-new store handle and provider set over the
    // same durable file, with no provisioning of any kind. -------------------
    await first.authorityStore.close();
    const second = await reopen(path);
    assert.notEqual(second, first);
    assert.notEqual(second.authorityStore, first.authorityStore, 'the restarted world must read through a genuinely different store handle');
    assert.notEqual(second.recognitionProvider, first.recognitionProvider, 'and answer through a genuinely different provider instance');

    const secondKernel = kernelFor(second);
    const after_ = {
      valid: await statusOf(secondKernel, buildDurableFixtureRequest(ids)),
      wrongAction: await statusOf(secondKernel, buildDurableFixtureRequest(ids, { action: DURABLE_FIXTURE_OTHER_ACTION })),
      wrongResource: await statusOf(secondKernel, buildDurableFixtureRequest(ids, { resourceScope: DURABLE_FIXTURE_OTHER_RESOURCE_SCOPE })),
      unknownActor: await statusOf(secondKernel, buildDurableFixtureRequest(ids, { actorId: 'actor-nobody' })),
      unauthorizedActor: await statusOf(secondKernel, buildDurableFixtureRequest(ids, { actorId: DURABLE_FIXTURE_OUTSIDER_ACTOR_ID })),
      crossOrganization: await statusOf(secondKernel, buildDurableFixtureRequest(ids, { organizationId: 'org-beta' })),
    };

    assert.deepEqual(after_, before, 'every outcome must survive the restart unchanged');
  });

  it('reproduces the pre-P0-PKG-07 failure for the in-memory composition, proving the restart matrix measures something real', async () => {
    // The empirical P0-PKG-06 finding: a second provider instance over the same
    // ids denies, because the world lived in the first instance's memory. This
    // is the behaviour the durable path exists to change, so it is asserted
    // rather than assumed.
    const seeded = createDefaultKernelProviders();
    const payloads = buildDurableAuthorityPayloads();
    seeded.recognitionRuntime.registerActor({ id: payloads.issuerActor.actorId, type: 'organization', displayName: 'Acme' });
    seeded.recognitionRuntime.createTrustDomain({
      id: payloads.trustDomain.trustDomainId,
      name: payloads.trustDomain.name,
      issuerActorId: payloads.trustDomain.issuerActorId,
      acceptedIssuerIds: payloads.trustDomain.acceptedIssuerIds,
      acceptedActorTypes: payloads.trustDomain.acceptedActorTypes,
    });

    const fresh = createDefaultKernelProviders();
    assert.equal(
      fresh.recognitionRuntime.getAuditTrail().length + Number(fresh.recognitionRuntime.actorRegistry.getActor(payloads.issuerActor.actorId) !== undefined),
      0,
      'a new in-memory provider instance must not see the previous instance seeded world',
    );
  });
});

describe('Durable Kernel Authority: revocation durability', () => {
  const cases = [
    { label: 'capability token', entityKind: 'capability-token' as const, entityIdOf: (ids: DurableAuthorityFixtureIds) => ids.capabilityTokenId },
    { label: 'delegation grant', entityKind: 'delegation-grant' as const, entityIdOf: (ids: DurableAuthorityFixtureIds) => ids.delegationGrantId },
    { label: 'authority grant', entityKind: 'authority-grant' as const, entityIdOf: (ids: DurableAuthorityFixtureIds) => ids.authorityGrantId },
    { label: 'actor', entityKind: 'actor' as const, entityIdOf: (ids: DurableAuthorityFixtureIds) => ids.agentActorId },
    { label: 'passport', entityKind: 'passport' as const, entityIdOf: (ids: DurableAuthorityFixtureIds) => ids.passportId },
  ];

  for (const testCase of cases) {
    it(`denies in the same process and after restart once the ${testCase.label} is revoked`, async () => {
      const path = tempDbPath(`revoke-${testCase.entityKind}`);
      const first = await reopen(path);
      const service = createKernelAuthorityProvisioningService({
        store: first.authorityStore,
        organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
        onCommitted: () => first.reload(),
      });
      const ids = await provisionDurableAuthorityFixture(service);

      assert.equal(await statusOf(kernelFor(first), buildDurableFixtureRequest(ids)), 'allowed');

      await service.revoke(DURABLE_FIXTURE_OPERATOR, { entityKind: testCase.entityKind, entityId: testCase.entityIdOf(ids), reason: 'withdrawn by operator' });

      assert.equal(await statusOf(kernelFor(first), buildDurableFixtureRequest(ids)), 'denied', 'revocation must take effect in the running process');

      await first.authorityStore.close();
      const second = await reopen(path);
      assert.equal(await statusOf(kernelFor(second), buildDurableFixtureRequest(ids)), 'denied', 'a restart must never resurrect revoked authority');
    });
  }
});

describe('Durable Kernel Authority: evaluation cannot provision', () => {
  it('gives the evaluation path no write surface at all', async () => {
    const path = tempDbPath('no-self-provision');
    const providers = await reopen(path);
    const service = createKernelAuthorityProvisioningService({
      store: providers.authorityStore,
      organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
      onCommitted: () => providers.reload(),
    });
    const ids = await provisionDurableAuthorityFixture(service);
    const kernel = kernelFor(providers);

    const recordsBefore = await providers.authorityStore.listRecords(DURABLE_FIXTURE_OPERATOR, { organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });

    // A denied request for an actor that does not exist, an action that was
    // never granted, a scope that was never granted, and a wide-open payload
    // that tries to describe the authority it wishes it had.
    await kernel.evaluate({
      requestId: nextRequestId(),
      actor: { id: 'actor-mallory', principalId: 'actor-mallory', trustDomainId: ids.trustDomainId, type: 'agent' },
      action: { type: 'execute.material-action', resourceScope: 'resource-project-99', capability: 'material-action.execute' },
      organization: { id: DURABLE_FIXTURE_ORGANIZATION_ID },
      requestedAt: '2026-01-01T00:00:00.000Z',
      context: {
        // None of this is a provisioning command. It is request metadata, and
        // the durable path reads only the credential ids it names -- which,
        // for an actor with no records, resolve to nothing.
        actorId: 'actor-mallory',
        capabilityTokenId: 'cap-forged',
        passportId: 'passport-forged',
        system: true,
        organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
      },
    });

    const recordsAfter = await providers.authorityStore.listRecords(DURABLE_FIXTURE_OPERATOR, { organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });
    assert.deepEqual(
      recordsAfter.map((record) => `${record.entityKind}:${record.entityId}:${record.status}`),
      recordsBefore.map((record) => `${record.entityKind}:${record.entityId}:${record.status}`),
      'evaluation must not add, change or revoke a single authority record',
    );
    assert.equal(recordsAfter.some((record) => record.entityId === 'actor-mallory'), false);
  });

  it('cannot un-revoke through evaluation, in this process or the next', async () => {
    const path = tempDbPath('no-unrevoke');
    const first = await reopen(path);
    const service = createKernelAuthorityProvisioningService({
      store: first.authorityStore,
      organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
      onCommitted: () => first.reload(),
    });
    const ids = await provisionDurableAuthorityFixture(service);
    await service.revoke(DURABLE_FIXTURE_OPERATOR, { entityKind: 'capability-token', entityId: ids.capabilityTokenId, reason: 'withdrawn' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(await statusOf(kernelFor(first), buildDurableFixtureRequest(ids)), 'denied');
    }
    assert.equal((await first.authorityStore.getRecord(DURABLE_FIXTURE_OPERATOR, DURABLE_FIXTURE_ORGANIZATION_ID, 'capability-token', ids.capabilityTokenId))?.status, 'revoked');

    await first.authorityStore.close();
    const second = await reopen(path);
    assert.equal(await statusOf(kernelFor(second), buildDurableFixtureRequest(ids)), 'denied');
  });
});

describe('Durable Kernel Authority: organization isolation', () => {
  it('does not let one organization actor inherit another authority, even with identical ids', async () => {
    const path = tempDbPath('org-isolation');
    const store = await createSqliteKernelAuthorityStore(path);
    closers.push(() => store.close());

    // Both organizations provision the *same* actor, trust domain and resource
    // ids. Only Acme provisions the authority behind them.
    const acme = createKernelAuthorityProvisioningService({ store, organizationId: 'org-acme' });
    const ids = await provisionDurableAuthorityFixture(acme);

    const beta = createKernelAuthorityProvisioningService({ store, organizationId: 'org-beta' });
    const payloads = buildDurableAuthorityPayloads('org-beta');
    await beta.provisionActor(DURABLE_FIXTURE_OPERATOR, payloads.issuerActor);
    await beta.provisionTrustDomain(DURABLE_FIXTURE_OPERATOR, payloads.trustDomain);
    await beta.provisionActor(DURABLE_FIXTURE_OPERATOR, { ...payloads.ownerActor, externalSubject: { system: 'example-app', subjectId: 'external-user-42' } });
    await beta.provisionActor(DURABLE_FIXTURE_OPERATOR, payloads.agentActor);

    const betaProviders = await createDurableKernelProviders({ store, organizationId: 'org-beta' });
    const betaKernel = kernelFor(betaProviders);

    assert.equal(
      await statusOf(betaKernel, buildDurableFixtureRequest({ ...ids, organizationId: 'org-beta' })),
      'denied',
      'the same actor id in another organization must not inherit Acme authority',
    );

    // And the Acme world still allows it, so the denial above is isolation and not a broken fixture.
    const acmeProviders = await createDurableKernelProviders({ store, organizationId: 'org-acme' });
    assert.equal(await statusOf(kernelFor(acmeProviders), buildDurableFixtureRequest(ids)), 'allowed');
  });

  it('denies a request that names an organization this decision service holds no authority for', async () => {
    const path = tempDbPath('org-scope');
    const providers = await reopen(path);
    const service = createKernelAuthorityProvisioningService({
      store: providers.authorityStore,
      organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
      onCommitted: () => providers.reload(),
    });
    const ids = await provisionDurableAuthorityFixture(service);

    const result = await kernelFor(providers).evaluate(
      buildDurableFixtureRequest(ids, { organizationId: 'org-somebody-else', requestId: nextRequestId() }) as KernelEvaluationRequest,
    );
    assert.equal(result.status, 'denied');
    assert.equal(result.recognition.reasonCode, 'RECOGNITION_ORGANIZATION_SCOPE_VIOLATION');
  });

  it('resolves an external principal to its own organization actor and never another', async () => {
    const path = tempDbPath('external-binding');
    const store = await createSqliteKernelAuthorityStore(path);
    closers.push(() => store.close());
    const acme = createKernelAuthorityProvisioningService({ store, organizationId: 'org-acme' });
    await provisionDurableAuthorityFixture(acme);

    const resolved = await acme.findActorByExternalSubject(DURABLE_FIXTURE_OPERATOR, { system: 'example-app', subjectId: 'external-user-42' });
    assert.equal(resolved?.entityId, 'actor-alice');
    assert.equal(resolved?.organizationId, 'org-acme');

    const beta = createKernelAuthorityProvisioningService({ store, organizationId: 'org-beta' });
    assert.equal(await beta.findActorByExternalSubject(DURABLE_FIXTURE_OPERATOR, { system: 'example-app', subjectId: 'external-user-42' }), null);
  });
});

describe('Durable Kernel Authority: hydration never widens', () => {
  it('refuses to start on an authority record the engine cannot replay, rather than hydrating a partial world', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const service = createKernelAuthorityProvisioningService({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });
    const payloads = buildDurableAuthorityPayloads();

    // A capability token whose subject actor was never provisioned: the store
    // accepts the record (it is well-formed), and the engine rejects it.
    await service.provisionActor(DURABLE_FIXTURE_OPERATOR, payloads.issuerActor);
    await service.provisionTrustDomain(DURABLE_FIXTURE_OPERATOR, payloads.trustDomain);
    await service.provisionCapabilityToken(DURABLE_FIXTURE_OPERATOR, payloads.capabilityToken);

    await assert.rejects(
      () => createDurableKernelProviders({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID }),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_REFERENCE_INVALID',
    );
  });

  it('denies through a revoked credential with a truthful reason rather than a generic one', async () => {
    const store: KernelAuthorityStore = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });
    const service = createKernelAuthorityProvisioningService({
      store,
      organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
      onCommitted: () => providers.reload(),
    });
    const ids = await provisionDurableAuthorityFixture(service);
    await service.revoke(DURABLE_FIXTURE_OPERATOR, { entityKind: 'capability-token', entityId: ids.capabilityTokenId, reason: 'withdrawn' });

    const result = await kernelFor(providers).evaluate(buildDurableFixtureRequest(ids, { requestId: nextRequestId() }) as KernelEvaluationRequest);
    assert.equal(result.status, 'denied');
    assert.match(
      result.recognition.reasonCode ?? '',
      /REVOKED/,
      'a revoked-but-covering credential must still be the one presented, so the denial names the revocation',
    );
  });

  it('presents a live credential in preference to a revoked one, so a real grant is not falsely denied', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });
    const service = createKernelAuthorityProvisioningService({
      store,
      organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
      onCommitted: () => providers.reload(),
    });
    const ids = await provisionDurableAuthorityFixture(service);
    const payloads = buildDurableAuthorityPayloads();

    // A second, equivalent token for the same subject. Revoking the first must
    // not deny an actor who genuinely still holds the second.
    await service.provisionCapabilityToken(DURABLE_FIXTURE_OPERATOR, { ...payloads.capabilityToken, capabilityTokenId: 'cap-agent-2' });
    await service.revoke(DURABLE_FIXTURE_OPERATOR, { entityKind: 'capability-token', entityId: ids.capabilityTokenId, reason: 'rotated' });

    assert.equal(await statusOf(kernelFor(providers), buildDurableFixtureRequest(ids)), 'allowed');

    // ...and revoking the replacement too denies again.
    await service.revoke(DURABLE_FIXTURE_OPERATOR, { entityKind: 'capability-token', entityId: 'cap-agent-2', reason: 'withdrawn' });
    assert.equal(await statusOf(kernelFor(providers), buildDurableFixtureRequest(ids)), 'denied');
  });

  it('denies when any single state family is missing, so the positive control is narrow', async () => {
    const payloads = buildDurableAuthorityPayloads();
    const order = ['issuerActor', 'trustDomain', 'ownerActor', 'agentActor', 'passport', 'capabilityToken', 'rootIssuer', 'authorityGrant', 'delegationGrant'] as const;

    for (const omitted of ['passport', 'capabilityToken', 'authorityGrant', 'delegationGrant'] as const) {
      const store = createInMemoryKernelAuthorityStore();
      closers.push(() => store.close());
      const service = createKernelAuthorityProvisioningService({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });

      for (const key of order) {
        if (key === omitted) continue;
        // Skip anything that structurally depends on the omitted record.
        if (omitted === 'authorityGrant' && key === 'delegationGrant') continue;
        switch (key) {
          case 'issuerActor':
          case 'ownerActor':
          case 'agentActor':
            await service.provisionActor(DURABLE_FIXTURE_OPERATOR, payloads[key]);
            break;
          case 'trustDomain':
            await service.provisionTrustDomain(DURABLE_FIXTURE_OPERATOR, payloads.trustDomain);
            break;
          case 'passport':
            await service.provisionPassport(DURABLE_FIXTURE_OPERATOR, payloads.passport);
            break;
          case 'capabilityToken':
            await service.provisionCapabilityToken(DURABLE_FIXTURE_OPERATOR, payloads.capabilityToken);
            break;
          case 'rootIssuer':
            await service.provisionRootIssuer(DURABLE_FIXTURE_OPERATOR, payloads.rootIssuer);
            break;
          case 'authorityGrant':
            await service.provisionAuthorityGrant(DURABLE_FIXTURE_OPERATOR, payloads.authorityGrant);
            break;
          case 'delegationGrant':
            await service.provisionDelegationGrant(DURABLE_FIXTURE_OPERATOR, payloads.delegationGrant);
            break;
        }
      }

      const providers = await createDurableKernelProviders({ store, organizationId: DURABLE_FIXTURE_ORGANIZATION_ID });
      const ids: DurableAuthorityFixtureIds = {
        organizationId: DURABLE_FIXTURE_ORGANIZATION_ID,
        trustDomainId: payloads.trustDomain.trustDomainId,
        issuerActorId: payloads.issuerActor.actorId,
        ownerActorId: payloads.ownerActor.actorId,
        agentActorId: payloads.agentActor.actorId,
        resourceScope: payloads.capabilityToken.resourceScopes[0] as string,
        action: payloads.capabilityToken.actions[0] as string,
        capability: payloads.capabilityToken.capability,
        passportId: payloads.passport.passportId,
        capabilityTokenId: payloads.capabilityToken.capabilityTokenId,
        authorityGrantId: payloads.authorityGrant.authorityGrantId,
        delegationGrantId: payloads.delegationGrant.delegationGrantId,
      };

      assert.equal(await statusOf(kernelFor(providers), buildDurableFixtureRequest(ids)), 'denied', `omitting the ${omitted} record must deny`);
    }
  });
});
