import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryProtectedResourceStore } from '../content-protection/in-memory-protected-resource-store.js';
import { createSqliteProtectedResourceStore } from '../content-protection/sqlite-protected-resource-store.js';
import { isContentProtectionError } from '../content-protection/errors.js';
import type { ProtectedResourceStore } from '../content-protection/protected-resource-store.js';
import type { CreatePendingProtectedResourceInput } from '../content-protection/contracts.js';

const ORG_A = { organizationId: 'org-a', system: false } as const;
const ORG_B = { organizationId: 'org-b', system: false } as const;
const SYSTEM = { system: true } as const;

function buildClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function pendingInput(overrides: Partial<CreatePendingProtectedResourceInput> = {}): CreatePendingProtectedResourceInput {
  return {
    protectedResourceId: nextId('protected-resource'),
    organizationId: 'org-a',
    resource: { kind: 'document', id: 'internal-resource-1' },
    encryptionProfile: 'AOC-ENTERPRISE-PROTECTION-V1',
    correlationId: nextId('corr'),
    ...overrides,
  };
}

const activeFields = {
  plaintextDigest: 'sha256:' + 'a'.repeat(64),
  ciphertextDigest: 'sha256:' + 'b'.repeat(64),
  nonce: Buffer.alloc(12, 1).toString('base64'),
  authTag: Buffer.alloc(16, 2).toString('base64'),
  wrappedKey: { kind: 'dev-local-ephemeral', profile: 'aoc-enterprise-dev-local-kek-v1', wrappedDek: 'd2VpcmQ=', nonce: 'bm9uY2U=', authTag: 'dGFn' },
  storageRef: { providerSystem: 'in-memory', providerRef: 'ref-1', storedAt: '2026-01-01T00:00:00.000Z', sizeBytes: 42 },
};

const closers: Array<() => Promise<void>> = [];
after(async () => {
  await Promise.all(closers.map((close) => close().catch(() => {})));
});

const providers: readonly { readonly name: string; readonly build: () => Promise<ProtectedResourceStore> }[] = [
  { name: 'in-memory', build: async () => createInMemoryProtectedResourceStore({ now: buildClock() }) },
  { name: 'sqlite (:memory:)', build: async () => createSqliteProtectedResourceStore(':memory:', { now: buildClock() }) },
];

for (const provider of providers) {
  describe(`ProtectedResourceStore contract -- ${provider.name}`, () => {
    async function open(): Promise<ProtectedResourceStore> {
      const store = await provider.build();
      closers.push(() => store.close());
      return store;
    }

    it('creates a pending record and reads it back', async () => {
      const store = await open();
      const input = pendingInput();
      const created = await store.createPending(ORG_A, input);
      assert.equal(created.state, 'pending');
      assert.equal(created.protectedResourceId, input.protectedResourceId);
      assert.equal(created.plaintextDigest, undefined);
      assert.equal(created.wrappedKey, undefined);

      const fetched = await store.getProtectedResource(ORG_A, input.protectedResourceId);
      assert.equal(fetched.state, 'pending');
    });

    it('rejects a duplicate protectedResourceId', async () => {
      const store = await open();
      const input = pendingInput();
      await store.createPending(ORG_A, input);
      await assert.rejects(() => store.createPending(ORG_A, input), (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_ALREADY_EXISTS');
    });

    it('markActive transitions pending -> active and persists every field, never the raw DEK', async () => {
      const store = await open();
      const input = pendingInput();
      await store.createPending(ORG_A, input);

      const active = await store.markActive(ORG_A, { protectedResourceId: input.protectedResourceId, organizationId: 'org-a', ...activeFields });
      assert.equal(active.state, 'active');
      assert.equal(active.plaintextDigest, activeFields.plaintextDigest);
      assert.equal(active.wrappedKey?.wrappedDek, activeFields.wrappedKey.wrappedDek);
      assert.equal(active.storageRef?.providerRef, activeFields.storageRef.providerRef);

      // Test J basis: the persisted representation never carries a field
      // that could be a raw DEK -- only the wrapped (already-encrypted) form.
      const serialized = JSON.stringify(active);
      assert.ok(!serialized.includes('"dek"'), 'no raw "dek" field must ever appear in a persisted record');
    });

    it('markActive fails when the record is not pending (Test M/N transition-guard basis)', async () => {
      const store = await open();
      const input = pendingInput();
      await store.createPending(ORG_A, input);
      await store.markActive(ORG_A, { protectedResourceId: input.protectedResourceId, organizationId: 'org-a', ...activeFields });

      await assert.rejects(
        () => store.markActive(ORG_A, { protectedResourceId: input.protectedResourceId, organizationId: 'org-a', ...activeFields }),
        (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_INVALID_STATE_TRANSITION',
      );
    });

    it('markFailed transitions pending -> failed with a reason', async () => {
      const store = await open();
      const input = pendingInput();
      await store.createPending(ORG_A, input);

      const failed = await store.markFailed(ORG_A, { protectedResourceId: input.protectedResourceId, organizationId: 'org-a', reason: 'test failure reason' });
      assert.equal(failed.state, 'failed');
      assert.equal(failed.failureReason, 'test failure reason');
    });

    it('markOrphaned transitions pending -> orphaned, preserving the storageRef for recovery', async () => {
      const store = await open();
      const input = pendingInput();
      await store.createPending(ORG_A, input);

      const orphaned = await store.markOrphaned(ORG_A, {
        protectedResourceId: input.protectedResourceId,
        organizationId: 'org-a',
        storageRef: activeFields.storageRef,
        reason: 'persistence failed after upload',
      });
      assert.equal(orphaned.state, 'orphaned');
      assert.equal(orphaned.storageRef?.providerRef, activeFields.storageRef.providerRef);
      assert.equal(orphaned.failureReason, 'persistence failed after upload');
    });

    it('Test K: tenant isolation -- org B cannot read, or transition, org A\'s record', async () => {
      const store = await open();
      const input = pendingInput({ organizationId: 'org-a' });
      await store.createPending(ORG_A, input);

      await assert.rejects(
        () => store.getProtectedResource(ORG_B, input.protectedResourceId),
        (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_ACCESS_SCOPE_VIOLATION',
      );
      await assert.rejects(
        () => store.markFailed(ORG_B, { protectedResourceId: input.protectedResourceId, organizationId: 'org-a', reason: 'attempted cross-tenant mutation' }),
        (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_ACCESS_SCOPE_VIOLATION',
      );

      // A system caller can see it; an org-scoped caller for a different org cannot even learn it exists via createPending's own tenant check.
      const seenBySystem = await store.getProtectedResource(SYSTEM, input.protectedResourceId);
      assert.equal(seenBySystem.organizationId, 'org-a');
    });

    it('a non-system caller without an organizationId is rejected', async () => {
      const store = await open();
      await assert.rejects(
        () => store.createPending({ system: false }, pendingInput()),
        (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_TENANT_SCOPE_REQUIRED',
      );
    });

    it('getProtectedResource on an unknown id throws NOT_FOUND', async () => {
      const store = await open();
      await assert.rejects(() => store.getProtectedResource(SYSTEM, 'does-not-exist'), (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_NOT_FOUND');
    });

    it('health reports healthy while open and unhealthy after close', async () => {
      const store = await provider.build();
      const healthy = await store.health();
      assert.equal(healthy.status, 'healthy');
      await store.close();
      const unhealthy = await store.health();
      assert.equal(unhealthy.status, 'unhealthy');
    });
  });
}
