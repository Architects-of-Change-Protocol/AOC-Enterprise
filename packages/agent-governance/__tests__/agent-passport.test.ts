import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalizeJson, sha256Hex, createHashUrn } from '../src/crypto/canonical-json.js';
import { generateAgentPassportId, isValidAgentPassportId } from '../src/passport/passport-id.js';
import {
  canTransitionAgentPassportStatus,
  transitionAgentPassportStatus,
} from '../src/passport/passport-status.js';
import { createAgentConstitution } from '../src/constitution/constitution.js';
import { createAgentPolicyManifest } from '../src/policy-manifest/policy-manifest.js';
import { issueAgentPassport, createAgentPassportPublicVerificationPayload } from '../src/passport/passport-issuance.js';
import { verifyAgentPassport } from '../src/passport/passport-verification.js';
import { verifyAgentRuntimeSeal } from '../src/runtime-seal/runtime-seal.js';
import { createTestSigner } from '../src/signing/test-signer.js';
import { createInMemoryAgentPassportStore } from '../src/store/store-port.js';
import type { AgentEnrollmentInput } from '../src/enrollment/enrollment-contracts.js';
import type { IssuedAgentPassportBundle } from '../src/passport/passport-contracts.js';

// Shared enrollment fixture
const ENROLLMENT: AgentEnrollmentInput = {
  agentName: 'DataSyncAgent',
  ownerId: 'org-001',
  ownerName: 'Acme Corp',
  purpose: 'Synchronise customer data between internal systems',
  region: 'EU',
  autonomyLevel: 'medium',
  riskTier: 'high',
  dataAccess: ['customer.pii', 'order.history'],
  tools: ['read_crm', 'write_warehouse', 'send_notification'],
  humanOversight: { requirement: 'optional', description: 'Weekly review required' },
  prohibitedActions: ['delete_customer', 'export_raw_pii'],
  escalationRules: [
    { trigger: 'data_anomaly_detected', action: 'pause_sync', escalateTo: 'data-team-lead' },
  ],
  createdBy: 'user-alice',
  issuedAt: '2026-03-15T10:00:00.000Z',
};

describe('Passport ID', () => {
  it('generates a valid ID with deterministic entropy', () => {
    const id = generateAgentPassportId({
      issuedAt: '2026-03-15T10:00:00.000Z',
      region: 'EU',
      entropy: 'ABCDEF',
    });
    assert.equal(id, 'AOC-AGT-2026-EU-ABCDEF');
    assert.ok(isValidAgentPassportId(id));
  });

  it('uses GLOBAL region when none is supplied', () => {
    const id = generateAgentPassportId({
      issuedAt: '2026-01-01T00:00:00.000Z',
      entropy: 'XYZ123',
    });
    assert.ok(id.startsWith('AOC-AGT-2026-GLOBAL-'));
    assert.ok(isValidAgentPassportId(id));
  });

  it('generates random entropy when none supplied', () => {
    const a = generateAgentPassportId({ issuedAt: '2026-01-01T00:00:00.000Z' });
    const b = generateAgentPassportId({ issuedAt: '2026-01-01T00:00:00.000Z' });
    assert.ok(isValidAgentPassportId(a));
    assert.ok(isValidAgentPassportId(b));
    // Extremely unlikely to collide
    assert.notEqual(a, b);
  });

  it('rejects invalid formats', () => {
    assert.equal(isValidAgentPassportId(''), false);
    assert.equal(isValidAgentPassportId('AOC-AGT-2026-EU-ABC'), false); // only 3 entropy chars
    assert.equal(isValidAgentPassportId('aoc-agt-2026-eu-abcdef'), false); // lowercase
    assert.equal(isValidAgentPassportId('AOC-AGT-26-EU-ABCDEF'), false); // 2-digit year
  });

  it('throws for invalid issuedAt date', () => {
    assert.throws(
      () => generateAgentPassportId({ issuedAt: 'not-a-date', entropy: 'AAAAAA' }),
    );
  });
});

describe('Canonical JSON hashing', () => {
  it('produces the same hash regardless of object key order', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    assert.equal(canonicalizeJson(a), canonicalizeJson(b));
    assert.equal(sha256Hex(canonicalizeJson(a)), sha256Hex(canonicalizeJson(b)));
  });

  it('sorts keys recursively in nested objects', () => {
    const a = { outer: { z: 'last', a: 'first' } };
    const b = { outer: { a: 'first', z: 'last' } };
    assert.equal(canonicalizeJson(a), canonicalizeJson(b));
  });

  it('does not sort array elements', () => {
    const a = canonicalizeJson([3, 1, 2]);
    assert.equal(a, '[3,1,2]');
  });

  it('createHashUrn produces sha256:<hex> format', () => {
    const urn = createHashUrn('hello');
    assert.ok(urn.startsWith('sha256:'));
    assert.equal(urn.length, 7 + 64);
  });

  it('is deterministic across calls', () => {
    const input = { b: 2, a: 1 };
    assert.equal(createHashUrn(canonicalizeJson(input)), createHashUrn(canonicalizeJson(input)));
  });
});

describe('Status transitions', () => {
  it('allows valid transitions', () => {
    assert.ok(canTransitionAgentPassportStatus('draft', 'issued'));
    assert.ok(canTransitionAgentPassportStatus('issued', 'active'));
    assert.ok(canTransitionAgentPassportStatus('active', 'suspended'));
    assert.ok(canTransitionAgentPassportStatus('suspended', 'active'));
    assert.ok(canTransitionAgentPassportStatus('active', 'revoked'));
    assert.ok(canTransitionAgentPassportStatus('suspended', 'revoked'));
    assert.ok(canTransitionAgentPassportStatus('active', 'expired'));
    assert.ok(canTransitionAgentPassportStatus('issued', 'revoked'));
  });

  it('rejects invalid transitions', () => {
    assert.equal(canTransitionAgentPassportStatus('revoked', 'active'), false);
    assert.equal(canTransitionAgentPassportStatus('expired', 'active'), false);
    assert.equal(canTransitionAgentPassportStatus('draft', 'active'), false);
    assert.equal(canTransitionAgentPassportStatus('active', 'issued'), false);
  });

  it('revoked is terminal', () => {
    assert.equal(canTransitionAgentPassportStatus('revoked', 'draft'), false);
    assert.equal(canTransitionAgentPassportStatus('revoked', 'issued'), false);
    assert.equal(canTransitionAgentPassportStatus('revoked', 'active'), false);
    assert.equal(canTransitionAgentPassportStatus('revoked', 'suspended'), false);
    assert.equal(canTransitionAgentPassportStatus('revoked', 'expired'), false);
  });

  it('expired is terminal', () => {
    assert.equal(canTransitionAgentPassportStatus('expired', 'active'), false);
    assert.equal(canTransitionAgentPassportStatus('expired', 'revoked'), false);
  });

  it('transitionAgentPassportStatus returns updated object', () => {
    const obj = { status: 'draft' as const, name: 'test' };
    const updated = transitionAgentPassportStatus(obj, 'issued');
    assert.equal(updated.status, 'issued');
    assert.equal(updated.name, 'test');
  });

  it('transitionAgentPassportStatus throws on invalid transition', () => {
    const obj = { status: 'revoked' as const };
    assert.throws(() => transitionAgentPassportStatus(obj, 'active'));
  });
});

describe('Constitution creation', () => {
  it('creates a constitution with all 8 articles', () => {
    const passportId = 'AOC-AGT-2026-EU-TEST01';
    const constitution = createAgentConstitution(ENROLLMENT, passportId);

    assert.equal(constitution.passportId, passportId);
    assert.equal(constitution.agentName, ENROLLMENT.agentName);
    assert.equal(constitution.owner.id, ENROLLMENT.ownerId);
    assert.equal(constitution.owner.name, ENROLLMENT.ownerName);
    assert.equal(constitution.articles.length, 8);
    assert.equal(constitution.articles[0]?.number, 'I');
    assert.equal(constitution.articles[7]?.number, 'VIII');
    assert.ok(constitution.constitutionId.startsWith('CONST-'));
    assert.equal(constitution.version, '1.0');
    assert.deepEqual(constitution.dataBoundaries, [...ENROLLMENT.dataAccess]);
    assert.deepEqual(constitution.toolBoundaries, [...ENROLLMENT.tools]);
    assert.deepEqual(constitution.prohibitedActions, [...ENROLLMENT.prohibitedActions]);
  });

  it('article VIII contains the tamper-evidence statement', () => {
    const constitution = createAgentConstitution(ENROLLMENT, 'AOC-AGT-2026-EU-TEST01');
    const articleVIII = constitution.articles.find((a) => a.number === 'VIII');
    assert.ok(articleVIII !== undefined);
    assert.ok(articleVIII !== undefined && articleVIII.content.includes("AOC-governed verification status"));
  });

  it('is stable (same input → same canonical hash)', () => {
    const id = 'AOC-AGT-2026-EU-STBL01';
    const c1 = createAgentConstitution(ENROLLMENT, id);
    const c2 = createAgentConstitution(ENROLLMENT, id);
    assert.equal(canonicalizeJson(c1), canonicalizeJson(c2));
  });
});

describe('Policy manifest creation', () => {
  it('creates manifest with correct fields', () => {
    const passportId = 'AOC-AGT-2026-EU-MAN001';
    const manifest = createAgentPolicyManifest(ENROLLMENT, passportId);

    assert.equal(manifest.passportId, passportId);
    assert.equal(manifest.riskTier, ENROLLMENT.riskTier);
    assert.equal(manifest.autonomyLevel, ENROLLMENT.autonomyLevel);
    assert.deepEqual(manifest.toolAccess, [...ENROLLMENT.tools]);
    assert.deepEqual(manifest.dataAccess, [...ENROLLMENT.dataAccess]);
    assert.deepEqual(manifest.prohibitedActions, [...ENROLLMENT.prohibitedActions]);
    assert.equal(manifest.audit.required, true);
    assert.equal(manifest.audit.level, 'standard'); // high risk tier
    assert.equal(manifest.audit.retentionDays, 365);
  });

  it('requires human approval for all tools when oversight is required', () => {
    const strict: AgentEnrollmentInput = {
      ...ENROLLMENT,
      humanOversight: { requirement: 'required' },
    };
    const manifest = createAgentPolicyManifest(strict, 'AOC-AGT-2026-EU-STR001');
    assert.deepEqual(manifest.humanApprovalRequiredFor, [...strict.tools]);
  });

  it('no human approval required when oversight is none', () => {
    const none: AgentEnrollmentInput = {
      ...ENROLLMENT,
      humanOversight: { requirement: 'none' },
    };
    const manifest = createAgentPolicyManifest(none, 'AOC-AGT-2026-EU-NON001');
    assert.equal(manifest.humanApprovalRequiredFor.length, 0);
  });

  it('uses enhanced audit level for critical risk tier', () => {
    const critical: AgentEnrollmentInput = { ...ENROLLMENT, riskTier: 'critical' };
    const manifest = createAgentPolicyManifest(critical, 'AOC-AGT-2026-EU-CRT001');
    assert.equal(manifest.audit.level, 'enhanced');
    assert.equal(manifest.audit.retentionDays, 2555);
  });
});

describe('Passport issuance', () => {
  let bundle: IssuedAgentPassportBundle;
  const signer = createTestSigner({ keyId: 'test-k1', issuer: 'AOC-Test-Issuer' });

  before(async () => {
    bundle = await issueAgentPassport(ENROLLMENT, {
      signer,
      baseVerificationUrl: 'https://aocprotocol.org/verify',
      issuer: 'AOC-Governance-Authority',
    });
  });

  it('produces a passport with a valid ID', () => {
    assert.ok(isValidAgentPassportId(bundle.passport.passportId));
  });

  it('passport starts in issued status', () => {
    assert.equal(bundle.passport.status, 'issued');
  });

  it('governance level is constitutional', () => {
    assert.equal(bundle.passport.governanceLevel, 'constitutional');
  });

  it('constitution is present with correct passport ID', () => {
    assert.equal(bundle.constitution.passportId, bundle.passport.passportId);
    assert.equal(bundle.constitution.articles.length, 8);
  });

  it('policy manifest is present with correct passport ID', () => {
    assert.equal(bundle.policyManifest.passportId, bundle.passport.passportId);
  });

  it('constitution hash is populated and stable', () => {
    assert.ok(bundle.passport.constitutionHash.startsWith('sha256:'));
    const expected = createHashUrn(canonicalizeJson(bundle.constitution));
    assert.equal(bundle.passport.constitutionHash, expected);
  });

  it('policy manifest hash is populated and stable', () => {
    assert.ok(bundle.passport.policyManifestHash.startsWith('sha256:'));
    const expected = createHashUrn(canonicalizeJson(bundle.policyManifest));
    assert.equal(bundle.passport.policyManifestHash, expected);
  });

  it('passport hash is populated', () => {
    assert.ok(bundle.passport.passportHash.startsWith('sha256:'));
  });

  it('signature is present', () => {
    assert.ok(bundle.passport.signature.signature.length > 0);
    assert.equal(bundle.passport.signature.keyId, 'test-k1');
  });

  it('verification URL is correctly formed', () => {
    const expected = `https://aocprotocol.org/verify/${bundle.passport.passportId}`;
    assert.equal(bundle.passport.verificationUrl, expected);
  });

  it('QR payload matches verification URL', () => {
    assert.equal(bundle.passport.qrPayload, bundle.passport.verificationUrl);
  });

  it('runtime seal is present with correct hashes', () => {
    assert.equal(bundle.runtimeSeal.passportId, bundle.passport.passportId);
    assert.equal(bundle.runtimeSeal.passportHash, bundle.passport.passportHash);
    assert.equal(bundle.runtimeSeal.constitutionHash, bundle.passport.constitutionHash);
    assert.equal(bundle.runtimeSeal.policyManifestHash, bundle.passport.policyManifestHash);
  });

  it('emits draft + issued + runtime_seal_created events', () => {
    const types = bundle.events.map((e) => e.type);
    assert.ok(types.includes('agent_passport.drafted'));
    assert.ok(types.includes('agent_passport.issued'));
    assert.ok(types.includes('agent_passport.runtime_seal_created'));
  });

  it('all events reference the correct passportId', () => {
    for (const event of bundle.events) {
      assert.equal(event.passportId, bundle.passport.passportId);
    }
  });
});

describe('Public verification payload', () => {
  let bundle: IssuedAgentPassportBundle;
  const signer = createTestSigner();

  before(async () => {
    bundle = await issueAgentPassport(ENROLLMENT, { signer });
  });

  it('contains expected public fields', () => {
    const payload = createAgentPassportPublicVerificationPayload(bundle.passport);
    assert.equal(payload.passportId, bundle.passport.passportId);
    assert.equal(payload.agentName, bundle.passport.agentName);
    assert.equal(payload.ownerName, bundle.passport.ownerName);
    assert.equal(payload.status, bundle.passport.status);
    assert.equal(payload.constitutionHash, bundle.passport.constitutionHash);
    assert.equal(payload.policyManifestHash, bundle.passport.policyManifestHash);
    assert.equal(payload.passportHash, bundle.passport.passportHash);
    assert.equal(payload.verificationUrl, bundle.passport.verificationUrl);
  });

  it('does not expose ownerId or sensitive metadata', () => {
    const payload = createAgentPassportPublicVerificationPayload(bundle.passport);
    const keys = Object.keys(payload);
    assert.ok(!keys.includes('ownerId'));
    assert.ok(!keys.includes('metadata'));
    assert.ok(!keys.includes('signature'));
    assert.ok(!keys.includes('qrPayload'));
  });
});

describe('Passport verification', () => {
  let bundle: IssuedAgentPassportBundle;
  const signer = createTestSigner();

  before(async () => {
    bundle = await issueAgentPassport(ENROLLMENT, { signer });
  });

  it('verifies a valid issued passport', async () => {
    const result = await verifyAgentPassport(bundle.passport, { signer });
    assert.ok(result.valid);
    assert.ok(result.reasonCodes.includes('passport.valid'));
  });

  it('fails when passport hash is tampered', async () => {
    const tampered = { ...bundle.passport, passportHash: 'sha256:deadbeef' };
    const result = await verifyAgentPassport(tampered, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.invalid_hash'));
  });

  it('fails when signature is invalid', async () => {
    const badSig = {
      ...bundle.passport.signature,
      signature: 'deadbeef'.repeat(8),
    };
    const tampered = { ...bundle.passport, signature: badSig };
    const result = await verifyAgentPassport(tampered, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.invalid_signature'));
  });

  it('fails when status is revoked', async () => {
    const revoked = { ...bundle.passport, status: 'revoked' as const };
    const result = await verifyAgentPassport(revoked, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.revoked'));
  });

  it('fails when status is expired', async () => {
    const expired = { ...bundle.passport, status: 'expired' as const };
    const result = await verifyAgentPassport(expired, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.expired'));
  });

  it('fails when status is suspended', async () => {
    const suspended = { ...bundle.passport, status: 'suspended' as const };
    const result = await verifyAgentPassport(suspended, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.status_not_active'));
  });

  it('passportHash is stable across status transitions (status not in hash core)', async () => {
    const active = { ...bundle.passport, status: 'active' as const };
    assert.equal(active.passportHash, bundle.passport.passportHash);
    const result = await verifyAgentPassport(active, { signer });
    assert.ok(result.valid, `Expected valid but got: ${JSON.stringify(result.reasonCodes)}`);
  });

  it('fails when expiresAt is in the past', async () => {
    const expired = { ...bundle.passport, expiresAt: '2020-01-01T00:00:00.000Z' };
    const result = await verifyAgentPassport(expired, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.expired'));
  });

  it('passes when expiresAt is in the future', async () => {
    const future = { ...bundle.passport, expiresAt: '2099-01-01T00:00:00.000Z' };
    const result = await verifyAgentPassport(future, { signer });
    assert.ok(result.valid);
  });
});

describe('Runtime seal verification', () => {
  let bundle: IssuedAgentPassportBundle;
  const signer = createTestSigner();

  before(async () => {
    bundle = await issueAgentPassport(ENROLLMENT, {
      signer,
      issuer: 'AOC-Governance-Authority',
    });
  });

  it('verifies a valid runtime seal against an issued passport (allowIssued)', async () => {
    const result = await verifyAgentRuntimeSeal(bundle.runtimeSeal, bundle.passport, { signer }, { allowIssued: true });
    assert.ok(result.valid);
    assert.ok(result.reasonCodes.includes('runtime_seal.valid'));
  });

  it('fails verification when passport is not active and allowIssued is false', async () => {
    const result = await verifyAgentRuntimeSeal(bundle.runtimeSeal, bundle.passport, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.status_not_active'));
  });

  it('verifies active passport without allowIssued', async () => {
    const activePassport = { ...bundle.passport, status: 'active' as const };
    const result = await verifyAgentRuntimeSeal(bundle.runtimeSeal, activePassport, { signer });
    assert.ok(result.valid);
  });

  it('fails when seal passportId is tampered', async () => {
    const tampered = { ...bundle.runtimeSeal, passportId: 'AOC-AGT-2026-XX-TAMPER' };
    const activePassport = { ...bundle.passport, status: 'active' as const };
    const result = await verifyAgentRuntimeSeal(tampered, activePassport, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('runtime_seal.passport_mismatch'));
  });

  it('fails when seal passportHash is tampered', async () => {
    const tampered = { ...bundle.runtimeSeal, passportHash: 'sha256:deadbeef' };
    const activePassport = { ...bundle.passport, status: 'active' as const };
    const result = await verifyAgentRuntimeSeal(tampered, activePassport, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('runtime_seal.hash_mismatch'));
  });

  it('fails when seal signature is invalid', async () => {
    const badSig = { ...bundle.runtimeSeal.signature, signature: 'badbad'.repeat(11) };
    const tampered = { ...bundle.runtimeSeal, signature: badSig };
    const activePassport = { ...bundle.passport, status: 'active' as const };
    const result = await verifyAgentRuntimeSeal(tampered, activePassport, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('runtime_seal.invalid_signature'));
  });

  it('fails when passport is revoked', async () => {
    const revoked = { ...bundle.passport, status: 'revoked' as const };
    const result = await verifyAgentRuntimeSeal(bundle.runtimeSeal, revoked, { signer }, { allowIssued: true });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.revoked'));
  });

  it('fails when passport is suspended', async () => {
    const suspended = { ...bundle.passport, status: 'suspended' as const };
    const result = await verifyAgentRuntimeSeal(bundle.runtimeSeal, suspended, { signer });
    assert.equal(result.valid, false);
    assert.ok(result.reasonCodes.includes('passport.status_not_active'));
  });
});

describe('In-memory store', () => {
  it('savePassportBundle seeds events so listPassportEvents returns them', async () => {
    const store = createInMemoryAgentPassportStore();
    const signer = createTestSigner();
    const bundle = await issueAgentPassport(ENROLLMENT, { signer });
    await store.savePassportBundle(bundle);
    const events = await store.listPassportEvents(bundle.passport.passportId);
    assert.equal(events.length, bundle.events.length);
    assert.equal(events[0]?.type, bundle.events[0]?.type);
  });

  it('appendPassportEvent adds to existing seeded events', async () => {
    const store = createInMemoryAgentPassportStore();
    const signer = createTestSigner();
    const bundle = await issueAgentPassport(ENROLLMENT, { signer });
    await store.savePassportBundle(bundle);
    await store.appendPassportEvent({
      eventId: 'evt-extra',
      passportId: bundle.passport.passportId,
      type: 'agent_passport.activated',
      actorId: 'system',
      occurredAt: new Date().toISOString(),
      reasonCodes: ['passport.activated'],
    });
    const events = await store.listPassportEvents(bundle.passport.passportId);
    assert.equal(events.length, bundle.events.length + 1);
  });
});

describe('Existing contracts still compile', () => {
  it('GovernedAgentProfile, AgentGovernanceCheckRequest, AgentGovernanceCheckResponse are importable', async () => {
    const mod = await import('../src/contracts.js');
    // Types are erased at runtime — just verify the module loads without error
    assert.ok(typeof mod === 'object');
  });
});
