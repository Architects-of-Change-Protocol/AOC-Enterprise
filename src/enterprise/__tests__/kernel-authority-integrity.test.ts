import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAocKernel, type KernelEvaluationRequest } from '../../kernel/index.js';
import { createInMemoryKernelAuthorityStore } from '../kernel-authority/in-memory-kernel-authority-store.js';
import { createSqliteKernelAuthorityStore } from '../kernel-authority/sqlite-kernel-authority-store.js';
import { createKernelAuthorityProvisioningService } from '../kernel-authority/provisioning-service.js';
import { createDurableKernelProviders } from '../kernel-authority/durable-kernel-providers.js';
import { KernelAuthorityError } from '../kernel-authority/errors.js';
import type { KernelAuthorityAccessContext, ProvisionActorInput } from '../kernel-authority/contracts.js';
import {
  DURABLE_FIXTURE_ORGANIZATION_ID,
  DURABLE_FIXTURE_OPERATOR,
  buildDurableAuthorityPayloads,
  buildDurableFixtureRequest,
  provisionDurableAuthorityFixture,
} from '../kernel-authority/fixtures/durable-authority.fixture.js';

/**
 * Regression suite for the ten defects a review of the original durable
 * Kernel Authority increment surfaced, six of which were reproduced against
 * the merged code before any fix was written.
 *
 * Every test here failed on the code as merged. They are grouped by the
 * property each one defends, because that is what a future change is at risk
 * of breaking -- not the individual bug.
 */

const ORG = DURABLE_FIXTURE_ORGANIZATION_ID;
const OPERATOR: KernelAuthorityAccessContext = { system: true, actorId: 'operator-1' };
const READER: KernelAuthorityAccessContext = { system: false, organizationId: ORG };
const ACTOR: ProvisionActorInput = { actorId: 'actor-alice', type: 'human', displayName: 'Alice' };

const tempDirs: string[] = [];
const closers: Array<() => Promise<void>> = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDbPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'aoc-kernel-authority-integrity-'));
  tempDirs.push(dir);
  return join(dir, `${name}.sqlite`);
}

async function rawSqlite(path: string): Promise<import('better-sqlite3').Database> {
  const { default: Database } = await import('better-sqlite3');
  return new Database(path);
}

// ---------------------------------------------------------------------------
// Persisted state must be tamper-evident, not merely digest-shaped.
// ---------------------------------------------------------------------------

describe('Kernel Authority: persisted authority is tamper-evident', () => {
  it('rejects a payload edited in place, even when every digest column is left untouched', async () => {
    const path = tempDbPath('tampered-payload');
    const store = await createSqliteKernelAuthorityStore(path);
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });
    const payloads = buildDurableAuthorityPayloads();
    await service.provisionActor(OPERATOR, payloads.issuerActor);
    await service.provisionTrustDomain(OPERATOR, payloads.trustDomain);
    await service.provisionActor(OPERATOR, payloads.agentActor);
    await service.provisionCapabilityToken(OPERATOR, payloads.capabilityToken);
    await store.close();

    // Widen the token: more actions, more scopes. Digest columns untouched --
    // this is exactly what an attacker with write access to the file would do.
    const db = await rawSqlite(path);
    const row = db.prepare(`SELECT payload_json FROM kernel_authority_events WHERE entity_id = ?`).get(payloads.capabilityToken.capabilityTokenId) as {
      payload_json: string;
    };
    const widened = JSON.parse(row.payload_json) as Record<string, unknown>;
    widened.actions = ['execute.material-action', 'delete.material-action', 'admin.everything'];
    widened.resourceScopes = ['resource-project-1', 'resource-project-2', 'resource-everything'];
    db.prepare(`UPDATE kernel_authority_events SET payload_json = ? WHERE entity_id = ?`).run(JSON.stringify(widened), payloads.capabilityToken.capabilityTokenId);
    db.prepare(`UPDATE kernel_authority_records SET payload_json = ? WHERE entity_id = ?`).run(JSON.stringify(widened), payloads.capabilityToken.capabilityTokenId);
    db.close();

    const reopened = await createSqliteKernelAuthorityStore(path);
    closers.push(() => reopened.close());
    await assert.rejects(
      () => reopened.getRecord(READER, ORG, 'capability-token', payloads.capabilityToken.capabilityTokenId),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_INTEGRITY_FAILED',
      'a widened capability payload must never hydrate as authority',
    );
  });

  it('rejects a truncated revocation tail rather than reading the entity back as active', async () => {
    const path = tempDbPath('truncated-revocation');
    const store = await createSqliteKernelAuthorityStore(path);
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });
    await service.provisionActor(OPERATOR, ACTOR);
    await service.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: 'offboarded' });
    await store.close();

    // Lose ONLY the final event. The surviving prefix is internally perfectly
    // consistent, so sequence contiguity and digest linkage both still pass --
    // which is precisely why the chain head has to be checked independently.
    const db = await rawSqlite(path);
    db.prepare(`DELETE FROM kernel_authority_events WHERE entity_id = ? AND sequence = 2`).run(ACTOR.actorId);
    db.close();

    const reopened = await createSqliteKernelAuthorityStore(path);
    closers.push(() => reopened.close());
    await assert.rejects(
      () => reopened.getRecord(READER, ORG, 'actor', ACTOR.actorId),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_INTEGRITY_FAILED',
      'a lost revocation must fail closed, never resurrect the actor',
    );
  });

  it('rejects a chain whose recorded head sequence disagrees with the events present', async () => {
    const path = tempDbPath('head-mismatch');
    const store = await createSqliteKernelAuthorityStore(path);
    await createKernelAuthorityProvisioningService({ store, organizationId: ORG }).provisionActor(OPERATOR, ACTOR);
    await store.close();

    const db = await rawSqlite(path);
    db.prepare(`UPDATE kernel_authority_records SET latest_sequence = 7 WHERE entity_id = ?`).run(ACTOR.actorId);
    db.close();

    const reopened = await createSqliteKernelAuthorityStore(path);
    closers.push(() => reopened.close());
    await assert.rejects(
      () => reopened.getRecord(READER, ORG, 'actor', ACTOR.actorId),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_INTEGRITY_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// Hydration must survive any world an operator can legitimately provision.
// ---------------------------------------------------------------------------

describe('Kernel Authority: hydration respects dependency order', () => {
  it('hydrates a child grant whose id sorts before its parent', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });

    await service.provisionActor(OPERATOR, { actorId: 'a-org', type: 'organization', displayName: 'Acme' });
    await service.provisionTrustDomain(OPERATOR, {
      trustDomainId: 'td',
      name: 'td',
      issuerActorId: 'a-org',
      acceptedIssuerIds: ['a-org'],
      acceptedActorTypes: ['human', 'organization', 'agent'],
    });
    await service.provisionActor(OPERATOR, { actorId: 'a-alice', type: 'human', displayName: 'Alice', issuerId: 'a-org', trustDomainId: 'td' });
    await service.provisionActor(OPERATOR, { actorId: 'a-bob', type: 'human', displayName: 'Bob', issuerId: 'a-org', trustDomainId: 'td' });
    await service.provisionRootIssuer(OPERATOR, { trustDomainId: 'td', actorId: 'a-org' });

    // 'z-parent' sorts AFTER 'a-child', so lexical ordering replays the child first.
    await service.provisionAuthorityGrant(OPERATOR, {
      authorityGrantId: 'z-parent',
      issuerActorId: 'a-org',
      subjectActorId: 'a-alice',
      trustDomainId: 'td',
      capability: 'c',
      actions: ['read'],
      resourceScopes: ['s'],
      canDelegate: true,
      maxDelegationDepth: 2,
    });
    await service.provisionAuthorityGrant(OPERATOR, {
      authorityGrantId: 'a-child',
      issuerActorId: 'a-alice',
      subjectActorId: 'a-bob',
      trustDomainId: 'td',
      capability: 'c',
      actions: ['read'],
      resourceScopes: ['s'],
      parentGrantId: 'z-parent',
    });

    const providers = await createDurableKernelProviders({ store, organizationId: ORG });
    assert.equal(providers.records().length, 7, 'every provisioned record must be replayed, in an order the engine accepts');
  });

  it('hydrates a re-delegation whose id sorts before the delegation it derives from', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });

    await service.provisionActor(OPERATOR, { actorId: 'a-org', type: 'organization', displayName: 'Acme' });
    await service.provisionTrustDomain(OPERATOR, {
      trustDomainId: 'td',
      name: 'td',
      issuerActorId: 'a-org',
      acceptedIssuerIds: ['a-org'],
      acceptedActorTypes: ['human', 'organization', 'agent'],
    });
    for (const [id, type] of [
      ['a-alice', 'human'],
      ['a-agent-1', 'agent'],
      ['a-agent-2', 'agent'],
    ] as const) {
      await service.provisionActor(OPERATOR, { actorId: id, type, displayName: id, issuerId: 'a-org', trustDomainId: 'td' });
    }
    await service.provisionRootIssuer(OPERATOR, { trustDomainId: 'td', actorId: 'a-org' });
    await service.provisionAuthorityGrant(OPERATOR, {
      authorityGrantId: 'g-root',
      issuerActorId: 'a-org',
      subjectActorId: 'a-alice',
      trustDomainId: 'td',
      capability: 'c',
      actions: ['read'],
      resourceScopes: ['s'],
      canDelegate: true,
      allowedDelegateActorTypes: ['agent'],
      maxDelegationDepth: 2,
    });
    // 'z-first' is the source of 'a-second', but sorts after it.
    await service.provisionDelegationGrant(OPERATOR, {
      delegationGrantId: 'z-first',
      delegatorActorId: 'a-alice',
      delegateActorId: 'a-agent-1',
      delegateActorType: 'agent',
      trustDomainId: 'td',
      sourceAuthorityGrantId: 'g-root',
      capability: 'c',
      actions: ['read'],
      resourceScopes: ['s'],
      canRedelegate: true,
    });
    await service.provisionDelegationGrant(OPERATOR, {
      delegationGrantId: 'a-second',
      delegatorActorId: 'a-agent-1',
      delegateActorId: 'a-agent-2',
      delegateActorType: 'agent',
      trustDomainId: 'td',
      sourceAuthorityGrantId: 'z-first',
      capability: 'c',
      actions: ['read'],
      resourceScopes: ['s'],
    });

    const providers = await createDurableKernelProviders({ store, organizationId: ORG });
    assert.equal(providers.records().length, 9);
  });

  it('fails closed on a dependency cycle rather than looping or silently dropping records', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });
    await service.provisionActor(OPERATOR, { actorId: 'a-org', type: 'organization', displayName: 'Acme' });
    await service.provisionTrustDomain(OPERATOR, {
      trustDomainId: 'td',
      name: 'td',
      issuerActorId: 'a-org',
      acceptedIssuerIds: ['a-org'],
      acceptedActorTypes: ['human', 'organization'],
    });
    await service.provisionActor(OPERATOR, { actorId: 'a-alice', type: 'human', displayName: 'Alice', issuerId: 'a-org', trustDomainId: 'td' });
    await service.provisionRootIssuer(OPERATOR, { trustDomainId: 'td', actorId: 'a-org' });
    // Two grants naming each other as parent -- unreachable through the
    // provisioning rules, but reachable through a corrupted or hand-edited store.
    for (const [id, parent] of [
      ['g-a', 'g-b'],
      ['g-b', 'g-a'],
    ] as const) {
      await store.appendEvent(OPERATOR, {
        organizationId: ORG,
        entityKind: 'authority-grant',
        entityId: id,
        eventType: 'KernelAuthorityEntityProvisioned',
        payload: {
          authorityGrantId: id,
          issuerActorId: 'a-org',
          subjectActorId: 'a-alice',
          trustDomainId: 'td',
          capability: 'c',
          actions: ['read'],
          resourceScopes: ['s'],
          parentGrantId: parent,
        },
      });
    }

    await assert.rejects(
      () => createDurableKernelProviders({ store, organizationId: ORG }),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_REFERENCE_INVALID',
    );
  });
});

// ---------------------------------------------------------------------------
// The evaluation surface must carry no way to mutate the world.
// ---------------------------------------------------------------------------

describe('Kernel Authority: the evaluation surface is read-only', () => {
  it('hands an external consumer no mutable runtime handles at all', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: ORG });

    const surface = providers as unknown as Record<string, unknown>;
    for (const handle of ['recognitionRuntime', 'authorityRuntime', 'approvalRuntime', 'handshakeRuntime']) {
      assert.equal(surface[handle], undefined, `the durable decision surface must not expose '${handle}' -- it carries actor registration and token issuance`);
    }
    assert.equal(typeof providers.recognitionProvider.verifyAction, 'function');
    assert.equal(typeof providers.reload, 'function');
  });

  it('cannot be used to mint authority and then evaluate against it', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: ORG });
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG, onCommitted: () => providers.reload() });
    const ids = await provisionDurableAuthorityFixture(service);

    // Everything an application holds, probed for a write path into the world.
    const reachable = Object.values(providers as unknown as Record<string, unknown>).filter(
      (value): value is Record<string, unknown> => typeof value === 'object' && value !== null,
    );
    for (const candidate of reachable) {
      for (const forbidden of ['registerActor', 'issueCapabilityToken', 'issuePassport', 'issueAuthorityGrant', 'createDelegationGrant', 'registerRootIssuer']) {
        assert.equal(typeof candidate[forbidden], 'undefined', `no object on the evaluation surface may expose '${forbidden}'`);
      }
    }

    const kernel = createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });
    const forged = await kernel.evaluate({
      requestId: 'req-forged',
      actor: { id: 'actor-mallory', trustDomainId: ids.trustDomainId, type: 'human' },
      action: { type: ids.action, resourceScope: ids.resourceScope },
      organization: { id: ORG },
      requestedAt: '2026-01-01T00:00:00.000Z',
      context: { passportId: 'passport-forged', capabilityTokenId: 'cap-forged' },
    });
    assert.equal(forged.status, 'denied');
  });
});

// ---------------------------------------------------------------------------
// Organization scope must be explicit and unspoofable.
// ---------------------------------------------------------------------------

describe('Kernel Authority: organization scope is explicit', () => {
  async function durableKernel() {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: ORG });
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG, onCommitted: () => providers.reload() });
    const ids = await provisionDurableAuthorityFixture(service);
    return { kernel: createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator }), ids };
  }

  it('denies a request that names no organization at all', async () => {
    const { kernel, ids } = await durableKernel();
    const request = buildDurableFixtureRequest(ids, { requestId: 'req-no-org' }) as KernelEvaluationRequest & { organization?: unknown };
    delete request.organization;

    const result = await kernel.evaluate(request as KernelEvaluationRequest);
    assert.equal(result.status, 'denied', 'an omitted organization must not be read as an implicit match for the configured one');
  });

  it('ignores an organization injected through free-form request context', async () => {
    const { kernel, ids } = await durableKernel();
    const request = buildDurableFixtureRequest(ids, { requestId: 'req-spoofed-org' }) as KernelEvaluationRequest & { organization?: unknown };
    delete request.organization;

    // The typed field is absent; the caller tries to supply it through the
    // free-form bag, which on the HTTP path is not covered by organization-scoped
    // API-key authorization.
    const spoofed = { ...request, context: { organizationId: ORG } } as KernelEvaluationRequest;
    const result = await kernel.evaluate(spoofed);
    assert.equal(result.status, 'denied', 'a reserved organization key supplied as free-form context must never establish scope');
  });

  it('still allows the request when the organization is named correctly', async () => {
    const { kernel, ids } = await durableKernel();
    const result = await kernel.evaluate(buildDurableFixtureRequest(ids, { requestId: 'req-named-org' }) as KernelEvaluationRequest);
    assert.equal(result.status, 'allowed');
  });
});

// ---------------------------------------------------------------------------
// Credential resolution, idempotency, and the engine's full restriction set.
// ---------------------------------------------------------------------------

describe('Kernel Authority: credential resolution and provisioning contract', () => {
  it('prefers an unexpired credential over an expired one that sorts earlier', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: ORG });
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG, onCommitted: () => providers.reload() });
    const ids = await provisionDurableAuthorityFixture(service);
    const payloads = buildDurableAuthorityPayloads();

    // 'cap-agent-0' sorts before the fixture's 'cap-agent-1' and is expired.
    await service.provisionCapabilityToken(OPERATOR, {
      ...payloads.capabilityToken,
      capabilityTokenId: 'cap-agent-0',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const kernel = createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });
    const result = await kernel.evaluate(buildDurableFixtureRequest(ids, { requestId: 'req-expired-first' }) as KernelEvaluationRequest);
    assert.equal(result.status, 'allowed', 'an expired token sorting first must not deny an actor who still holds a valid one');
  });

  it('claims an idempotency key even when the entity operation itself replays', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });

    await service.provisionActor(OPERATOR, ACTOR);
    // Same entity, same terms, now carrying a key: the entity replays, but the
    // key must still be pinned to this payload.
    await service.provisionActor(OPERATOR, ACTOR, { idempotency: { idempotencyKey: 'K' } });

    await assert.rejects(
      () => service.provisionActor(OPERATOR, { actorId: 'actor-mallory', type: 'human', displayName: 'Mallory' }, { idempotency: { idempotencyKey: 'K' } }),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_IDEMPOTENCY_CONFLICT',
      'a key claimed during a replay must still be unusable for a different entity',
    );
  });

  it('persists and replays approval and evidence requirements on a capability token', async () => {
    const store = createInMemoryKernelAuthorityStore();
    closers.push(() => store.close());
    const providers = await createDurableKernelProviders({ store, organizationId: ORG });
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG, onCommitted: () => providers.reload() });
    const payloads = buildDurableAuthorityPayloads();

    await service.provisionActor(OPERATOR, payloads.issuerActor);
    await service.provisionTrustDomain(OPERATOR, payloads.trustDomain);
    await service.provisionActor(OPERATOR, payloads.ownerActor);
    await service.provisionActor(OPERATOR, payloads.agentActor);
    await service.provisionPassport(OPERATOR, payloads.passport);
    await service.provisionRootIssuer(OPERATOR, payloads.rootIssuer);
    await service.provisionAuthorityGrant(OPERATOR, payloads.authorityGrant);
    await service.provisionDelegationGrant(OPERATOR, payloads.delegationGrant);
    await service.provisionCapabilityToken(OPERATOR, {
      ...payloads.capabilityToken,
      approvalRequirement: { actions: [payloads.capabilityToken.actions[0] as string], requiredApproverActorIds: [payloads.ownerActor.actorId] },
      evidenceRequirements: [{ action: payloads.capabilityToken.actions[0] as string, requiredEvidenceTypes: ['email_thread'] }],
    });

    const ids = {
      organizationId: ORG,
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

    const kernel = createAocKernel({ recognitionProvider: providers.recognitionProvider, clock: providers.clock, idGenerator: providers.idGenerator });
    const result = await kernel.evaluate(buildDurableFixtureRequest(ids, { requestId: 'req-approval-gated' }) as KernelEvaluationRequest);
    assert.notEqual(
      result.status,
      'allowed',
      'a token restricted by approval and evidence requirements must not hydrate into an unrestricted ALLOW',
    );
  });
});
