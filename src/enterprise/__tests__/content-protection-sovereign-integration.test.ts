import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CANONICAL_JSON_PROFILE } from '@aoc/protocol/canonical';
import { computeContentIdentity, mintSovereignAssetId } from '@aoc/protocol/identity';
import type { SovereignAssetId } from '@aoc/protocol/identity';
import {
  buildSovereignManifestV1,
  computeManifestDigest,
  generateSovereignKeyPair,
  signSovereignManifest,
  verifySovereignManifest,
} from '@aoc/protocol/manifest';
import type { SignedSovereignManifest, SovereignAssetRegistry } from '@aoc/protocol/manifest';

import { buildContentProtectionAad } from '../content-protection/aad.js';
import { decryptContent, zeroBuffer } from '../content-protection/aead.js';
import { createInMemoryProtectedResourceStore } from '../content-protection/in-memory-protected-resource-store.js';
import { createDevLocalKeyWrappingProvider } from '../content-protection/key-wrapping-port.js';
import { createContentProtectionService } from '../content-protection/service.js';
import { createInMemorySovereignAssetRegistry, SOVEREIGN_BINDING_GATE } from '../content-protection/sovereign-registry.js';
import { createInMemoryContentStoragePort } from '../content-protection/storage-port.js';
import { isContentProtectionError } from '../content-protection/errors.js';
import type { ContentProtectionEvent, ProtectedResourceRecord } from '../content-protection/index.js';

const ORG = { organizationId: 'org-a', system: false } as const;
let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;
const now = () => '2026-08-07T12:00:00.000Z';

function signedFixture(plaintext: Buffer, options: { assetId?: SovereignAssetId; version?: number } = {}): SignedSovereignManifest {
  const sovereignAssetId = options.assetId ?? mintSovereignAssetId();
  const manifest = buildSovereignManifestV1({
    sovereignAssetId,
    manifestVersion: options.version ?? 1,
    contentIdentity: computeContentIdentity(plaintext),
    registrant: 'slice-2.1-test-registrant',
    createdAt: now(),
  });
  const keys = generateSovereignKeyPair();
  return signSovereignManifest(manifest, keys.privateKeyPem, keys.signingKey, new Date(now()));
}

function harness(registry?: SovereignAssetRegistry) {
  const store = createInMemoryProtectedResourceStore({ now });
  const storage = createInMemoryContentStoragePort({ now });
  const keyWrapping = createDevLocalKeyWrappingProvider({ allowNonProductionKeyWrapping: true });
  const events: ContentProtectionEvent[] = [];
  const service = createContentProtectionService({ store, storage, keyWrapping, ...(registry ? { sovereignAssetRegistry: registry } : {}), now, nextId, onEvent: (event) => { events.push(event); } });
  return { store, storage, keyWrapping, events, service };
}

async function decryptRecord(record: ProtectedResourceRecord, ciphertext: Buffer, keyWrapping: ReturnType<typeof createDevLocalKeyWrappingProvider>, overrides: Partial<{ sovereignAssetId: string; manifestDigest: string; manifestVersion: number }> = {}): Promise<Buffer> {
  assert.ok(record.wrappedKey && record.nonce && record.authTag && record.sovereignBinding);
  const dek = await keyWrapping.unwrapKey(record.wrappedKey, { protectedResourceId: record.protectedResourceId, organizationId: record.organizationId });
  try {
    return decryptContent({
      ciphertext,
      key: dek,
      nonce: Buffer.from(record.nonce, 'base64'),
      authTag: Buffer.from(record.authTag, 'base64'),
      aad: buildContentProtectionAad({
        protectedResourceId: record.protectedResourceId,
        organizationId: record.organizationId,
        resource: record.resource,
        encryptionProfile: record.encryptionProfile,
        sovereignAssetId: overrides.sovereignAssetId ?? record.sovereignBinding.sovereignAssetId,
        manifestDigest: overrides.manifestDigest ?? record.sovereignBinding.manifestDigest,
        manifestVersion: overrides.manifestVersion ?? record.sovereignBinding.manifestVersion,
      }),
    });
  } finally {
    zeroBuffer(dek);
  }
}

function expectCode(code: string) {
  return (error: unknown) => isContentProtectionError(error) && error.code === code;
}

describe('Content Protection Slice 2.1 -- real public @aoc/protocol integration', () => {
  it('real end-to-end acceptance: mint, identify, build, sign, register, verify, protect, persist, and test-only decrypt', async () => {
    assert.equal(SOVEREIGN_BINDING_GATE, 'INTEGRATED_WITH_PROTOCOL');
    const plaintext = Buffer.from('real sovereign plaintext');
    const signed = signedFixture(plaintext);
    const registry = createInMemorySovereignAssetRegistry();
    await registry.register(signed);
    const { service, storage, keyWrapping, events } = harness(registry);

    const resolved = await registry.resolveVersion(signed.manifest.sovereignAssetId, signed.manifest.manifestVersion);
    assert.ok(resolved);
    assert.equal((await verifySovereignManifest(resolved!, { contentBytes: plaintext })).valid, true);

    const record = await service.protectResource(ORG, {
      organizationId: 'org-a',
      protectedResourceId: 'sovereign-pr-1',
      resource: { kind: 'document', id: 'enterprise-resource-1' },
      plaintext,
      sovereignAssetId: signed.manifest.sovereignAssetId,
      manifestVersion: signed.manifest.manifestVersion,
    });

    assert.equal(record.state, 'active');
    assert.equal(record.sovereignBinding?.sovereignAssetId, signed.manifest.sovereignAssetId);
    assert.equal(record.sovereignBinding?.manifestDigest, signed.manifestDigest);
    assert.equal(record.sovereignBinding?.manifestVersion, signed.manifest.manifestVersion);
    assert.equal(record.sovereignBinding?.canonicalizationProfile, CANONICAL_JSON_PROFILE);
    assert.deepEqual(record.sovereignBinding?.contentIdentity, computeContentIdentity(plaintext));
    assert.ok(!('dek' in record) && !JSON.stringify(record).includes('rawDek'));
    const ciphertext = storage.inspect(record.storageRef!.providerRef)!;
    assert.notDeepEqual(ciphertext, plaintext);
    assert.deepEqual(await decryptRecord(record, ciphertext, keyWrapping), plaintext);
    assert.deepEqual(events.map((event) => event.type), [
      'sovereign_binding_validation_started', 'sovereign_manifest_verified', 'sovereign_content_identity_matched',
      'protection_requested', 'ciphertext_stored', 'protected_resource_activated', 'protection_succeeded',
    ]);
  });

  it('fails closed for an unknown SovereignAssetId before provider/persistence work', async () => {
    const registry = createInMemorySovereignAssetRegistry();
    const unknown = mintSovereignAssetId();
    const { service, events } = harness(registry);
    await assert.rejects(() => service.protectResource(ORG, { organizationId: 'org-a', resource: { kind: 'document', id: 'unknown' }, plaintext: Buffer.from('x'), sovereignAssetId: unknown }), expectCode('CONTENT_PROTECTION_SOVEREIGN_ASSET_UNRESOLVED'));
    assert.deepEqual(events.map((event) => event.type), ['sovereign_binding_validation_started', 'sovereign_binding_rejected']);
  });

  it('fails closed for a tampered SignedSovereignManifest', async () => {
    const plaintext = Buffer.from('authentic');
    const signed = signedFixture(plaintext);
    const registry = createInMemorySovereignAssetRegistry();
    await registry.register({ ...signed, manifest: { ...signed.manifest, createdAt: '2026-08-08T00:00:00.000Z' } });
    const { service } = harness(registry);
    await assert.rejects(() => service.protectResource(ORG, { organizationId: 'org-a', resource: { kind: 'document', id: 'tampered' }, plaintext, sovereignAssetId: signed.manifest.sovereignAssetId }), expectCode('CONTENT_PROTECTION_MANIFEST_DIGEST_MISMATCH'));
  });

  it('fails closed when the registry returns the wrong SovereignAssetId', async () => {
    const plaintext = Buffer.from('asset-a');
    const requested = mintSovereignAssetId();
    const wrong = signedFixture(plaintext);
    const registry: SovereignAssetRegistry = { register() {}, resolve: () => wrong, resolveVersion: () => wrong, findByContentDigest: () => [] };
    const { service } = harness(registry);
    await assert.rejects(() => service.protectResource(ORG, { organizationId: 'org-a', resource: { kind: 'document', id: 'wrong-id' }, plaintext, sovereignAssetId: requested }), expectCode('CONTENT_PROTECTION_SOVEREIGN_ASSET_ID_MISMATCH'));
  });

  it('fails closed when plaintext ContentIdentity does not match', async () => {
    const signed = signedFixture(Buffer.from('right'));
    const registry = createInMemorySovereignAssetRegistry();
    await registry.register(signed);
    const { service } = harness(registry);
    await assert.rejects(() => service.protectResource(ORG, { organizationId: 'org-a', resource: { kind: 'document', id: 'wrong-content' }, plaintext: Buffer.from('wrong'), sovereignAssetId: signed.manifest.sovereignAssetId }), expectCode('CONTENT_PROTECTION_CONTENT_IDENTITY_MISMATCH'));
  });

  it('preserves exact historical manifests and rejects historical substitution', async () => {
    const assetId = mintSovereignAssetId();
    const v1 = signedFixture(Buffer.from('v1'), { assetId, version: 1 });
    const v2 = signedFixture(Buffer.from('v2'), { assetId, version: 2 });
    const registry = createInMemorySovereignAssetRegistry();
    await registry.register(v1); await registry.register(v2);
    const { service } = harness(registry);
    const record = await service.protectResource(ORG, { organizationId: 'org-a', resource: { kind: 'document', id: 'history' }, plaintext: Buffer.from('v1'), sovereignAssetId: assetId, manifestVersion: 1 });
    assert.equal(record.sovereignBinding?.manifestDigest, v1.manifestDigest);
    assert.notEqual(record.sovereignBinding?.manifestDigest, v2.manifestDigest);

    const substituting: SovereignAssetRegistry = { register() {}, resolve: () => v2, resolveVersion: () => v2, findByContentDigest: () => [] };
    const { service: badService } = harness(substituting);
    await assert.rejects(() => badService.protectResource(ORG, { organizationId: 'org-a', resource: { kind: 'document', id: 'substitute' }, plaintext: Buffer.from('v1'), sovereignAssetId: assetId, manifestVersion: 1 }), expectCode('CONTENT_PROTECTION_HISTORICAL_MANIFEST_SUBSTITUTION'));
  });

  it('AAD rejects SovereignAssetId and manifest digest relabeling', async () => {
    const plaintext = Buffer.from('aad-bound');
    const signed = signedFixture(plaintext);
    const registry = createInMemorySovereignAssetRegistry(); await registry.register(signed);
    const { service, storage, keyWrapping } = harness(registry);
    const record = await service.protectResource(ORG, { organizationId: 'org-a', resource: { kind: 'document', id: 'aad' }, plaintext, sovereignAssetId: signed.manifest.sovereignAssetId });
    const ciphertext = storage.inspect(record.storageRef!.providerRef)!;
    await assert.rejects(() => decryptRecord(record, ciphertext, keyWrapping, { sovereignAssetId: mintSovereignAssetId() }), expectCode('CONTENT_PROTECTION_AUTHENTICATION_FAILED'));
    await assert.rejects(() => decryptRecord(record, ciphertext, keyWrapping, { manifestDigest: '0'.repeat(64) }), expectCode('CONTENT_PROTECTION_AUTHENTICATION_FAILED'));
  });

  it('registry prevents a different manifest from replacing an existing asset/version', async () => {
    const assetId = mintSovereignAssetId();
    const registry = createInMemorySovereignAssetRegistry();
    await registry.register(signedFixture(Buffer.from('original'), { assetId }));
    await assert.rejects(async () => registry.register(signedFixture(Buffer.from('substitute'), { assetId })), expectCode('CONTENT_PROTECTION_HISTORICAL_MANIFEST_SUBSTITUTION'));
  });
});
