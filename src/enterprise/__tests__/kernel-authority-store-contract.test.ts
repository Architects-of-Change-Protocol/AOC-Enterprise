import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createInMemoryKernelAuthorityStore } from '../kernel-authority/in-memory-kernel-authority-store.js';
import { createSqliteKernelAuthorityStore } from '../kernel-authority/sqlite-kernel-authority-store.js';
import { KernelAuthorityError } from '../kernel-authority/errors.js';
import { KERNEL_AUTHORITY_SCHEMA_VERSION } from '../kernel-authority/contracts.js';
import { createKernelAuthorityProvisioningService, type KernelAuthorityProvisioningService } from '../kernel-authority/provisioning-service.js';
import type { KernelAuthorityStore } from '../kernel-authority/kernel-authority-store.js';
import type { KernelAuthorityAccessContext, ProvisionActorInput } from '../kernel-authority/contracts.js';

const ORG = 'org-acme';
const OTHER_ORG = 'org-beta';
const OPERATOR: KernelAuthorityAccessContext = { system: true, actorId: 'operator-1' };
const READER: KernelAuthorityAccessContext = { system: false, organizationId: ORG };

const closers: Array<() => Promise<void>> = [];
const tempDirs: string[] = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDbPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'aoc-kernel-authority-'));
  tempDirs.push(dir);
  return join(dir, `${name}.sqlite`);
}

interface Harness {
  readonly store: KernelAuthorityStore;
  readonly service: KernelAuthorityProvisioningService;
}

const PROVIDERS: readonly { readonly name: 'memory' | 'sqlite'; readonly create: (label: string) => Promise<KernelAuthorityStore> }[] = [
  { name: 'memory', create: async () => createInMemoryKernelAuthorityStore() },
  { name: 'sqlite', create: (label) => createSqliteKernelAuthorityStore(tempDbPath(label)) },
];

async function harness(provider: (typeof PROVIDERS)[number], label: string, organizationId = ORG): Promise<Harness> {
  const store = await provider.create(label);
  closers.push(() => store.close());
  return { store, service: createKernelAuthorityProvisioningService({ store, organizationId }) };
}

const ACTOR: ProvisionActorInput = { actorId: 'actor-alice', type: 'human', displayName: 'Alice' };

for (const provider of PROVIDERS) {
  describe(`Kernel Authority Store contract (${provider.name})`, () => {
    it('provisions an entity and reconstructs it from its own event chain', async () => {
      const { store, service } = await harness(provider, 'provision');
      const result = await service.provisionActor(OPERATOR, ACTOR);

      assert.equal(result.replayed, false);
      assert.equal(result.record.status, 'active');
      assert.equal(result.record.provisionedBy, 'operator-1');
      assert.equal(result.record.entityKind, 'actor');
      assert.equal(result.record.latestSequence, 1);

      const events = await store.listEvents(READER, ORG, 'actor', ACTOR.actorId);
      assert.equal(events.length, 1);
      assert.equal(events[0]?.eventType, 'KernelAuthorityEntityProvisioned');
      assert.equal(events[0]?.previousEventDigest, undefined);
      assert.equal(events[0]?.schemaVersion, KERNEL_AUTHORITY_SCHEMA_VERSION);
    });

    it('refuses every write from a non-operator context, so an evaluation can never provision', async () => {
      const { service } = await harness(provider, 'operator-guard');

      for (const context of [READER, { system: false, organizationId: ORG, actorId: 'actor-alice' }, { system: false }] as const) {
        await assert.rejects(
          () => service.provisionActor(context, ACTOR),
          (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_OPERATOR_CONTEXT_REQUIRED',
        );
      }
    });

    it('refuses an operator context that does not name the operator, so every write is attributable', async () => {
      const { service } = await harness(provider, 'operator-identity');
      await assert.rejects(
        () => service.provisionActor({ system: true }, ACTOR),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_OPERATOR_CONTEXT_REQUIRED',
      );
    });

    it('replays an identical re-provision instead of creating a second grant', async () => {
      const { store, service } = await harness(provider, 'idempotent-replay');
      await service.provisionActor(OPERATOR, ACTOR);
      const second = await service.provisionActor(OPERATOR, ACTOR);

      assert.equal(second.replayed, true);
      assert.equal((await store.listEvents(READER, ORG, 'actor', ACTOR.actorId)).length, 1);
    });

    it('refuses a re-provision that changes the terms, rather than widening authority in place', async () => {
      const { service } = await harness(provider, 'conflict');
      await service.provisionActor(OPERATOR, ACTOR);
      await assert.rejects(
        () => service.provisionActor(OPERATOR, { ...ACTOR, type: 'organization' }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_ENTITY_CONFLICT',
      );
    });

    it('honours an idempotency key once per payload and rejects a conflicting retry', async () => {
      const { service } = await harness(provider, 'idempotency-key');
      const idempotency = { idempotencyKey: 'provision-alice-001' };

      const first = await service.provisionActor(OPERATOR, ACTOR, { idempotency });
      const retry = await service.provisionActor(OPERATOR, ACTOR, { idempotency });
      assert.equal(first.replayed, false);
      assert.equal(retry.replayed, true);

      await assert.rejects(
        () => service.provisionActor(OPERATOR, { ...ACTOR, actorId: 'actor-mallory' }, { idempotency }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_IDEMPOTENCY_CONFLICT',
      );
    });

    it('makes revocation terminal: a retry cannot resurrect revoked authority', async () => {
      const { service } = await harness(provider, 'revocation-terminal');
      await service.provisionActor(OPERATOR, ACTOR);
      const revoked = await service.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: 'offboarded' });

      assert.equal(revoked.record.status, 'revoked');
      assert.equal(revoked.record.revocationReason, 'offboarded');
      assert.equal(revoked.record.revokedBy, 'operator-1');

      await assert.rejects(
        () => service.provisionActor(OPERATOR, ACTOR),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_ENTITY_REVOKED',
      );
    });

    it('treats a repeated revocation as an idempotent replay', async () => {
      const { store, service } = await harness(provider, 'revocation-idempotent');
      await service.provisionActor(OPERATOR, ACTOR);
      await service.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: 'offboarded' });
      const again = await service.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: 'offboarded again' });

      assert.equal(again.replayed, true);
      assert.equal((await store.listEvents(READER, ORG, 'actor', ACTOR.actorId)).length, 2);
    });

    it('refuses to revoke something that was never provisioned', async () => {
      const { service } = await harness(provider, 'revoke-missing');
      await assert.rejects(
        () => service.revoke(OPERATOR, { entityKind: 'actor', entityId: 'actor-ghost', reason: 'n/a' }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_ENTITY_NOT_FOUND',
      );
    });

    it('refuses to revoke a trust domain or root issuer, which would widen what the remaining state appears to mean', async () => {
      const { service } = await harness(provider, 'revoke-boundary');
      for (const entityKind of ['trust-domain', 'root-issuer'] as const) {
        await assert.rejects(
          () => service.revoke(OPERATOR, { entityKind, entityId: 'x', reason: 'retiring' }),
          (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_VALIDATION_ERROR',
        );
      }
    });

    it('requires a reason on every revocation so the audit trail explains the withdrawal', async () => {
      const { service } = await harness(provider, 'revoke-reason');
      await service.provisionActor(OPERATOR, ACTOR);
      await assert.rejects(
        () => service.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: '  ' }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_VALIDATION_ERROR',
      );
    });

    it('binds one external principal to exactly one actor per organization', async () => {
      const { store, service } = await harness(provider, 'external-subject');
      const externalSubject = { system: 'example-app', subjectId: 'external-user-42' };
      await service.provisionActor(OPERATOR, { ...ACTOR, externalSubject });

      const resolved = await store.findActorByExternalSubject(READER, ORG, externalSubject);
      assert.equal(resolved?.entityId, ACTOR.actorId);

      await assert.rejects(
        () => service.provisionActor(OPERATOR, { actorId: 'actor-mallory', type: 'human', displayName: 'Mallory', externalSubject }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_EXTERNAL_SUBJECT_CONFLICT',
      );
    });

    it('resolves nothing for an unbound external principal rather than minting an actor', async () => {
      const { store } = await harness(provider, 'external-subject-unbound');
      assert.equal(await store.findActorByExternalSubject(READER, ORG, { system: 'example-app', subjectId: 'nobody' }), null);
    });

    it('keeps the same external subject id in two organizations bound to two different actors', async () => {
      const { store, service } = await harness(provider, 'external-subject-tenancy');
      const other = createKernelAuthorityProvisioningService({ store, organizationId: OTHER_ORG });
      const externalSubject = { system: 'example-app', subjectId: 'external-user-42' };

      await service.provisionActor(OPERATOR, { ...ACTOR, externalSubject });
      await other.provisionActor(OPERATOR, { actorId: 'actor-beta-alice', type: 'human', displayName: 'Alice (Beta)', externalSubject });

      assert.equal((await store.findActorByExternalSubject(OPERATOR, ORG, externalSubject))?.entityId, 'actor-alice');
      assert.equal((await store.findActorByExternalSubject(OPERATOR, OTHER_ORG, externalSubject))?.entityId, 'actor-beta-alice');
    });

    it('refuses a cross-organization read', async () => {
      const { store, service } = await harness(provider, 'tenancy-read');
      await service.provisionActor(OPERATOR, ACTOR);

      await assert.rejects(
        () => store.listRecords({ system: false, organizationId: OTHER_ORG }, { organizationId: ORG }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_ACCESS_SCOPE_VIOLATION',
      );
      await assert.rejects(
        () => store.listRecords({ system: false }, { organizationId: ORG }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_TENANT_SCOPE_REQUIRED',
      );
    });

    it('never returns one organization records provisioned by another', async () => {
      const { store, service } = await harness(provider, 'tenancy-list');
      const other = createKernelAuthorityProvisioningService({ store, organizationId: OTHER_ORG });
      await service.provisionActor(OPERATOR, ACTOR);
      await other.provisionActor(OPERATOR, { ...ACTOR, displayName: 'Alice of Beta' });

      const acme = await store.listRecords(READER, { organizationId: ORG });
      assert.equal(acme.length, 1);
      assert.equal(acme[0]?.organizationId, ORG);
      assert.equal((acme[0]?.payload as unknown as ProvisionActorInput).displayName, 'Alice');
    });

    it('reports health without leaking any authority content', async () => {
      const { store, service } = await harness(provider, 'health');
      await service.provisionActor(OPERATOR, ACTOR);
      const health = await store.health();

      assert.equal(health.providerKind, provider.name);
      assert.equal(health.status, 'healthy');
      assert.equal(health.schemaVersion, KERNEL_AUTHORITY_SCHEMA_VERSION);
      assert.equal(health.recordCount, 1);
      assert.ok(!JSON.stringify(health).includes(ACTOR.actorId));
    });

    it('refuses every call after close rather than answering from a store it no longer holds', async () => {
      const store = await provider.create('closed');
      const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });
      await service.provisionActor(OPERATOR, ACTOR);
      await store.close();

      await assert.rejects(
        () => service.provisionActor(OPERATOR, { ...ACTOR, actorId: 'actor-bob' }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_STORE_UNAVAILABLE',
      );
      await assert.rejects(
        () => store.listRecords(READER, { organizationId: ORG }),
        (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_STORE_UNAVAILABLE',
      );
    });
  });
}

describe('Kernel Authority Store durability and corruption handling (sqlite)', () => {
  it('reopens a closed store and reconstructs the same records', async () => {
    const path = tempDbPath('reopen');
    const first = await createSqliteKernelAuthorityStore(path);
    await createKernelAuthorityProvisioningService({ store: first, organizationId: ORG }).provisionActor(OPERATOR, ACTOR);
    await first.close();

    const second = await createSqliteKernelAuthorityStore(path);
    closers.push(() => second.close());
    const records = await second.listRecords(READER, { organizationId: ORG });
    assert.equal(records.length, 1);
    assert.equal(records[0]?.entityId, ACTOR.actorId);
    assert.equal(records[0]?.status, 'active');
  });

  it('preserves a revocation across a close/reopen cycle', async () => {
    const path = tempDbPath('revocation-durable');
    const first = await createSqliteKernelAuthorityStore(path);
    const firstService = createKernelAuthorityProvisioningService({ store: first, organizationId: ORG });
    await firstService.provisionActor(OPERATOR, ACTOR);
    await firstService.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: 'offboarded' });
    await first.close();

    const second = await createSqliteKernelAuthorityStore(path);
    closers.push(() => second.close());
    const record = await second.getRecord(READER, ORG, 'actor', ACTOR.actorId);
    assert.equal(record?.status, 'revoked');
    assert.equal(record?.revocationReason, 'offboarded');

    // And it stays terminal in the new process, so no retry ordering resurrects it.
    await assert.rejects(
      () => createKernelAuthorityProvisioningService({ store: second, organizationId: ORG }).provisionActor(OPERATOR, ACTOR),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_ENTITY_REVOKED',
    );
  });

  it('refuses to open a store recorded under a different schema version, and leaves it untouched', async () => {
    const path = tempDbPath('foreign-schema');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.exec(`CREATE TABLE kernel_authority_store_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, schema_version TEXT NOT NULL, migration_state TEXT NOT NULL, recorded_at TEXT NOT NULL);`);
    db.prepare(`INSERT INTO kernel_authority_store_versions (schema_version, migration_state, recorded_at) VALUES (?, 'current', ?)`).run(
      'aoc.kernel-authority.schema.v99',
      '2026-01-01T00:00:00.000Z',
    );
    db.close();

    await assert.rejects(
      () => createSqliteKernelAuthorityStore(path),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_VERSION_UNSUPPORTED',
    );

    const reopened = new Database(path);
    const tables = (reopened.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]).map((row) => row.name);
    reopened.close();
    assert.deepEqual(
      tables.filter((name) => !name.startsWith('sqlite_')),
      ['kernel_authority_store_versions'],
      'a foreign-schema database must not have this runtime tables created in it',
    );
  });

  it('refuses to interpret a malformed persisted payload rather than skipping the record', async () => {
    const path = tempDbPath('malformed-payload');
    const store = await createSqliteKernelAuthorityStore(path);
    await createKernelAuthorityProvisioningService({ store, organizationId: ORG }).provisionActor(OPERATOR, ACTOR);
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.prepare(`UPDATE kernel_authority_events SET payload_json = ? WHERE entity_id = ?`).run('{not json', ACTOR.actorId);
    db.close();

    const reopened = await createSqliteKernelAuthorityStore(path);
    closers.push(() => reopened.close());
    await assert.rejects(
      () => reopened.listRecords(READER, { organizationId: ORG }),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_INTEGRITY_FAILED',
    );
  });

  it('refuses a broken event chain rather than reading a status the events do not support', async () => {
    const path = tempDbPath('broken-chain');
    const store = await createSqliteKernelAuthorityStore(path);
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });
    await service.provisionActor(OPERATOR, ACTOR);
    await service.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: 'offboarded' });
    await store.close();

    // Deleting the revocation event is the dangerous direction: a store that
    // tolerated it would report the actor active again.
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.prepare(`DELETE FROM kernel_authority_events WHERE entity_id = ? AND sequence = 1`).run(ACTOR.actorId);
    db.close();

    const reopened = await createSqliteKernelAuthorityStore(path);
    closers.push(() => reopened.close());
    await assert.rejects(
      () => reopened.getRecord(READER, ORG, 'actor', ACTOR.actorId),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_INTEGRITY_FAILED',
    );
  });

  it('refuses a record naming an entity kind this runtime cannot interpret', async () => {
    const path = tempDbPath('unknown-kind');
    const store = await createSqliteKernelAuthorityStore(path);
    await createKernelAuthorityProvisioningService({ store, organizationId: ORG }).provisionActor(OPERATOR, ACTOR);
    await store.close();

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path);
    db.pragma('foreign_keys = OFF');
    db.prepare(`UPDATE kernel_authority_records SET entity_kind = 'super-actor' WHERE entity_id = ?`).run(ACTOR.actorId);
    db.close();

    const reopened = await createSqliteKernelAuthorityStore(path);
    closers.push(() => reopened.close());
    await assert.rejects(
      () => reopened.listRecords(READER, { organizationId: ORG }),
      (error: unknown) => error instanceof KernelAuthorityError && error.code === 'KERNEL_AUTHORITY_INTEGRITY_FAILED',
    );
  });

  it('commits a concurrent duplicate provision exactly once', async () => {
    const path = tempDbPath('concurrent-provision');
    const store = await createSqliteKernelAuthorityStore(path);
    closers.push(() => store.close());
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });

    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.provisionActor(OPERATOR, ACTOR)));
    const committed = results.filter((result) => result.status === 'fulfilled' && result.value.replayed === false);
    assert.equal(committed.length, 1, 'exactly one of the concurrent provisions may append an event');

    const events = await store.listEvents(READER, ORG, 'actor', ACTOR.actorId);
    assert.equal(events.length, 1, 'a race must never produce a second grant for one entity');
  });

  it('serializes a concurrent revocation race into one revocation', async () => {
    const path = tempDbPath('concurrent-revoke');
    const store = await createSqliteKernelAuthorityStore(path);
    closers.push(() => store.close());
    const service = createKernelAuthorityProvisioningService({ store, organizationId: ORG });
    await service.provisionActor(OPERATOR, ACTOR);

    await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) => service.revoke(OPERATOR, { entityKind: 'actor', entityId: ACTOR.actorId, reason: `reason-${index}` })),
    );

    const events = await store.listEvents(READER, ORG, 'actor', ACTOR.actorId);
    assert.equal(events.length, 2, 'provision + exactly one revocation');
    assert.equal((await store.getRecord(READER, ORG, 'actor', ACTOR.actorId))?.status, 'revoked');
  });
});
