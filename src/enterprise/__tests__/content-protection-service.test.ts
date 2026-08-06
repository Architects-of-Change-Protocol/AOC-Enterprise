import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createContentProtectionService } from '../content-protection/service.js';
import { createInMemoryProtectedResourceStore } from '../content-protection/in-memory-protected-resource-store.js';
import { createDevLocalKeyWrappingProvider } from '../content-protection/key-wrapping-port.js';
import { createAlwaysFailingContentStoragePort, createInMemoryContentStoragePort } from '../content-protection/storage-port.js';
import { sha256Hex } from '../content-protection/aead.js';
import { isContentProtectionError } from '../content-protection/errors.js';
import type { ProtectedResourceStore } from '../content-protection/protected-resource-store.js';
import type { KeyWrappingPort, WrappedDekMaterial, KeyWrappingContext } from '../content-protection/key-wrapping-port.js';
import type { SovereignAssetBindingPort, SovereignManifest } from '../content-protection/sovereign-binding-port.js';
import type {
  ContentProtectionEvent,
  MarkProtectedResourceActiveInput,
  ProtectedResourceRecord,
} from '../content-protection/index.js';

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

function newDeps(overrides: Partial<{ store: ProtectedResourceStore; keyWrapping: KeyWrappingPort; storage: ReturnType<typeof createInMemoryContentStoragePort> }> = {}) {
  const store = overrides.store ?? createInMemoryProtectedResourceStore({ now: buildClock() });
  const keyWrapping = overrides.keyWrapping ?? createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true });
  const storage = overrides.storage ?? createInMemoryContentStoragePort({ now: buildClock() });
  const events: ContentProtectionEvent[] = [];
  const service = createContentProtectionService({ store, keyWrapping, storage, now: buildClock(), nextId, onEvent: (event) => events.push(event) });
  return { store, keyWrapping, storage, service, events };
}

/** Wraps a real store, injecting a failure into `markActive` for a specific id -- simulates "persistence failed after upload" (Test M). */
function withFailingMarkActive(inner: ProtectedResourceStore, failForId: string): ProtectedResourceStore {
  return {
    ...inner,
    async markActive(context, input: MarkProtectedResourceActiveInput): Promise<ProtectedResourceRecord> {
      if (input.protectedResourceId === failForId) {
        throw new Error('simulated database failure during markActive');
      }
      return inner.markActive(context, input);
    },
  };
}

/** Wraps a real key-wrapping port, injecting a failure into `wrapKey` -- simulates key-wrapping failure (Test N). */
function withFailingWrapKey(inner: KeyWrappingPort): KeyWrappingPort {
  return {
    ...inner,
    async wrapKey(dek: Buffer, context: KeyWrappingContext): Promise<WrappedDekMaterial> {
      throw new Error('simulated KMS outage');
    },
  };
}

function fakeSovereignBindingPort(manifest: SovereignManifest, options: { verifies?: boolean } = {}): SovereignAssetBindingPort {
  return {
    kind: 'test-only-fake',
    async resolveSovereignAsset() {
      return manifest;
    },
    async verifySovereignManifest() {
      return options.verifies ?? true;
    },
  };
}

describe('Content Protection -- protectResource orchestration (Slice 2 Tests H-N + tenant isolation)', () => {
  it('happy path: protects an ordinary (non-sovereign-bound) resource end to end', async () => {
    const { service, store, storage, events } = newDeps();
    const plaintext = Buffer.from('quarterly earnings report -- confidential', 'utf8');

    const record = await service.protectResource(ORG_A, {
      organizationId: 'org-a',
      resource: { kind: 'document', id: 'doc-1' },
      plaintext,
    });

    assert.equal(record.state, 'active');
    assert.equal(record.sovereignBinding, undefined);
    assert.equal(record.plaintextDigest, sha256Hex(plaintext));
    assert.ok(record.wrappedKey !== undefined);
    assert.ok(record.storageRef !== undefined);

    const reread = await store.getProtectedResource(ORG_A, record.protectedResourceId);
    assert.equal(reread.state, 'active');

    const uploaded = storage.inspect(record.storageRef!.providerRef);
    assert.ok(uploaded !== undefined);
    assert.notDeepEqual(uploaded, plaintext, 'Test I basis: the storage adapter never receives plaintext bytes');

    const eventTypes = events.map((e) => e.type);
    assert.deepEqual(eventTypes, ['protection_requested', 'ciphertext_stored', 'protection_succeeded']);
    for (const event of events) {
      assert.ok(JSON.stringify(event).length < 2000, 'events must be small, bounded, structured detail -- never a plaintext/key dump');
    }
  });

  it('Test H: sovereign-bound content-digest mismatch fails closed and never persists an active record', async () => {
    const manifest: SovereignManifest = { sovereignAssetId: 'sov-1', contentDigest: sha256Hex(Buffer.from('the REAL bytes')) };
    const { service, store, storage, events } = newDeps();
    const serviceWithSovereign = createContentProtectionService({
      store,
      keyWrapping: createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }),
      storage,
      sovereignBinding: fakeSovereignBindingPort(manifest),
      now: buildClock(),
      nextId,
      onEvent: (event) => events.push(event),
    });

    const wrongPlaintext = Buffer.from('these are NOT the real bytes');

    await assert.rejects(
      () =>
        serviceWithSovereign.protectResource(ORG_A, {
          organizationId: 'org-a',
          resource: { kind: 'document', id: 'doc-sovereign' },
          plaintext: wrongPlaintext,
          sovereignAssetId: 'sov-1',
        }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_CONTENT_INTEGRITY_MISMATCH',
    );

    assert.ok(events.some((e) => e.type === 'integrity_mismatch'));
    assert.ok(!events.some((e) => e.type === 'protection_succeeded'));

    // The pending row was durably marked 'failed', never 'active'.
    const records = await Promise.all(
      events.filter((e) => e.type === 'protection_requested').map((e) => store.getProtectedResource(SYSTEM, e.protectedResourceId)),
    );
    for (const record of records) {
      assert.notEqual(record.state, 'active');
    }
  });

  it('Test I: no plaintext at the provider boundary -- the storage adapter cannot find the exact plaintext content anywhere in what it received', async () => {
    const { service, storage } = newDeps();
    const plaintext = Buffer.from('UNMISTAKABLE-PLAINTEXT-MARKER-0xCAFEBABE-do-not-leak-this-string', 'utf8');

    const record = await service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-2' }, plaintext });

    const uploaded = storage.inspect(record.storageRef!.providerRef)!;
    assert.equal(uploaded.includes(plaintext), false);
    assert.equal(uploaded.indexOf(plaintext), -1, 'plaintext bytes must not appear anywhere inside what reached the storage provider');
  });

  it('Test J: no raw DEK is persisted anywhere in the durable ProtectedResource record', async () => {
    const { service } = newDeps();
    const plaintext = Buffer.from('secret payload', 'utf8');
    const record = await service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-3' }, plaintext });

    const serialized = JSON.stringify(record);
    // The wrapped DEK ciphertext is expected to appear (it is safe, already-encrypted material) -- what must never appear is a field that is the RAW DEK.
    assert.ok(record.wrappedKey !== undefined);
    assert.ok(!('dek' in record), 'no top-level raw "dek" field');
    assert.ok(!serialized.includes('"rawDek"'));
  });

  it('Test K: tenant isolation -- org B cannot read org A\'s protected resource', async () => {
    const { service } = newDeps();
    const record = await service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-4' }, plaintext: Buffer.from('x') });

    await assert.rejects(
      () => service.getProtectedResource(ORG_B, record.protectedResourceId),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_ACCESS_SCOPE_VIOLATION',
    );
    await assert.rejects(
      () => service.protectResource(ORG_B, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-5' }, plaintext: Buffer.from('y') }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_ACCESS_SCOPE_VIOLATION',
    );
  });

  it('Test L: provider (storage) failure -- no ACTIVE ProtectedResource may exist', async () => {
    const store = createInMemoryProtectedResourceStore({ now: buildClock() });
    const { service, events } = newDeps({ store, storage: createAlwaysFailingContentStoragePort() as ReturnType<typeof createInMemoryContentStoragePort> });

    await assert.rejects(
      () => service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-6' }, plaintext: Buffer.from('z') }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_STORAGE_FAILED',
    );

    const failedEvent = events.find((e) => e.type === 'protection_requested');
    assert.ok(failedEvent);
    const record = await store.getProtectedResource(SYSTEM, failedEvent!.protectedResourceId);
    assert.equal(record.state, 'failed');
    assert.notEqual(record.state, 'active');
  });

  it('Test M: persistence failure after upload -- record is explicitly orphaned, storageRef preserved, never silently active', async () => {
    const innerStore = createInMemoryProtectedResourceStore({ now: buildClock() });
    let capturedId = '';
    const store: ProtectedResourceStore = {
      ...innerStore,
      async createPending(context, input) {
        const result = await innerStore.createPending(context, input);
        capturedId = result.protectedResourceId;
        return result;
      },
      async markActive(context, input) {
        return withFailingMarkActive(innerStore, capturedId).markActive(context, input);
      },
    };
    const { service, events } = newDeps({ store });

    await assert.rejects(
      () => service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-7' }, plaintext: Buffer.from('w') }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_STORE_UNAVAILABLE',
    );

    const record = await innerStore.getProtectedResource(SYSTEM, capturedId);
    assert.equal(record.state, 'orphaned');
    assert.ok(record.storageRef !== undefined, 'the orphaned record must still point at the uploaded ciphertext for recovery');
    assert.notEqual(record.state, 'active');
    assert.ok(events.some((e) => e.type === 'ciphertext_stored'), 'upload genuinely succeeded before the persistence failure');
    assert.ok(!events.some((e) => e.type === 'protection_succeeded'));
  });

  it('Test N: key-wrapping failure -- the storage provider never receives the ciphertext at all', async () => {
    const storage = createInMemoryContentStoragePort({ now: buildClock() });
    const keyWrapping = withFailingWrapKey(createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }));
    const { service, store, events } = newDeps({ storage, keyWrapping });

    await assert.rejects(
      () => service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-8' }, plaintext: Buffer.from('v') }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_KEY_WRAPPING_FAILED',
    );

    assert.ok(!events.some((e) => e.type === 'ciphertext_stored'), 'storage.store must never be reached when key wrapping fails');
    const failedEvent = events.find((e) => e.type === 'protection_requested');
    const record = await store.getProtectedResource(SYSTEM, failedEvent!.protectedResourceId);
    assert.equal(record.state, 'failed');
  });

  it('unsupported encryption profile fails closed before any pending row is created', async () => {
    const { service } = newDeps();
    await assert.rejects(
      () => service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-9' }, plaintext: Buffer.from('u'), encryptionProfile: 'bogus-profile' }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_UNSUPPORTED_ENCRYPTION_PROFILE',
    );
  });

  it('sovereign-bound protection succeeds and records the verified binding when the digest matches', async () => {
    const plaintext = Buffer.from('the REAL bytes');
    const manifest: SovereignManifest = { sovereignAssetId: 'sov-2', sovereignVersion: 'v3', contentDigest: sha256Hex(plaintext) };
    const store = createInMemoryProtectedResourceStore({ now: buildClock() });
    const events: ContentProtectionEvent[] = [];
    const service = createContentProtectionService({
      store,
      keyWrapping: createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }),
      storage: createInMemoryContentStoragePort({ now: buildClock() }),
      sovereignBinding: fakeSovereignBindingPort(manifest),
      now: buildClock(),
      nextId,
      onEvent: (event) => events.push(event),
    });

    const record = await service.protectResource(ORG_A, {
      organizationId: 'org-a',
      resource: { kind: 'document', id: 'doc-sovereign-ok' },
      plaintext,
      sovereignAssetId: 'sov-2',
      sovereignVersion: 'v3',
    });

    assert.equal(record.state, 'active');
    assert.equal(record.sovereignBinding?.sovereignAssetId, 'sov-2');
    assert.equal(record.sovereignBinding?.contentDigest, manifest.contentDigest);
    assert.ok(!events.some((e) => e.type === 'integrity_mismatch'));
  });

  it('sovereign binding: manifest verification failure fails closed', async () => {
    const manifest: SovereignManifest = { sovereignAssetId: 'sov-3', contentDigest: sha256Hex(Buffer.from('x')) };
    const store = createInMemoryProtectedResourceStore({ now: buildClock() });
    const service = createContentProtectionService({
      store,
      keyWrapping: createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true }),
      storage: createInMemoryContentStoragePort({ now: buildClock() }),
      sovereignBinding: fakeSovereignBindingPort(manifest, { verifies: false }),
      now: buildClock(),
      nextId,
    });

    await assert.rejects(
      () => service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-sovereign-bad' }, plaintext: Buffer.from('x'), sovereignAssetId: 'sov-3' }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_SOVEREIGN_BINDING_BLOCKED',
    );
  });

  it('the default composition (no sovereignBinding dependency supplied) reports SOVEREIGN_BINDING_GATE = BLOCKED_BY_PROTOCOL for a sovereign-bound request, while ordinary protection is unaffected', async () => {
    const { service } = newDeps();

    // Ordinary protection works fine -- the gate never blocks non-sovereign-bound resources.
    const ordinary = await service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-ordinary' }, plaintext: Buffer.from('fine') });
    assert.equal(ordinary.state, 'active');

    await assert.rejects(
      () => service.protectResource(ORG_A, { organizationId: 'org-a', resource: { kind: 'document', id: 'doc-blocked' }, plaintext: Buffer.from('x'), sovereignAssetId: 'sov-anything' }),
      (error: unknown) => isContentProtectionError(error) && error.code === 'CONTENT_PROTECTION_SOVEREIGN_BINDING_BLOCKED',
    );
  });
});
