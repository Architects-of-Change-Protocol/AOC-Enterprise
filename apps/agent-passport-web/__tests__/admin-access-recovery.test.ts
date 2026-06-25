import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../src/lib/db.js';
import type Database from 'better-sqlite3';
import {
  createOrganizationRegistry,
  createRegistryEntitlement,
  getRegistryByRegistryId,
  updateRegistryAdminToken,
  updateRegistryRecoveryCode,
  markRecoveryCodeUsed,
  updateRegistryProfile,
  getRegistryAdminAccessStatus,
  createRegistryAdminSession,
  getRegistryAdminSession,
  revokeRegistryAdminSessions,
} from '../src/lib/organization-registry-repository.js';
import {
  createRegistryAdminAccessToken,
  hashRegistryAdminAccessToken,
  verifyRegistryAdminAccessToken,
  createRegistryRecoveryCode,
  hashRegistryRecoveryCode,
  verifyRegistryRecoveryCode,
} from '../src/lib/registry-access-token.js';
import {
  sanitizeOrganizationProfile,
  validateOrganizationProfile,
  normalizeEmail,
} from '../src/lib/organization-profile-validation.js';
import {
  ensureOrganizationRegistry,
  rotateRegistryAdminToken,
} from '../src/lib/organization-registry-service.js';
import {
  createAdminSession,
  verifyAdminSession,
  hashSessionToken,
} from '../src/lib/registry-admin-session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeRegistry(db: Database.Database, opts: { orgName?: string; buyerEmail?: string; buyerContactEmail?: string } = {}) {
  const purchaseId = nanoid('purchase');
  const token = createRegistryAdminAccessToken();
  const tokenHash = hashRegistryAdminAccessToken(token);
  const recoveryCode = createRegistryRecoveryCode();
  const recoveryHash = hashRegistryRecoveryCode(recoveryCode);

  const registry = createOrganizationRegistry(
    {
      purchaseId,
      organizationName: opts.orgName ?? 'Test Org',
      buyerEmail: opts.buyerEmail ?? 'buyer@example.com',
      adminAccessTokenHash: tokenHash,
      recoveryCodeHash: recoveryHash,
      buyerContactEmail: opts.buyerContactEmail ?? 'contact@example.com',
    },
    db,
  );
  createRegistryEntitlement(registry.registryId, purchaseId, 10, db);

  return { registry, token, tokenHash, recoveryCode, recoveryHash, purchaseId };
}

// ---------------------------------------------------------------------------
// Organization Profile Validation
// ---------------------------------------------------------------------------

describe('organization profile validation', () => {
  it('validates a complete profile', () => {
    const result = validateOrganizationProfile({
      organizationName: 'Acme Corp',
      buyerContactEmail: 'cto@acme.com',
      buyerContactName: 'Jane Smith',
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    assert.equal(result.profile.organizationName, 'Acme Corp');
    assert.equal(result.profile.buyerContactEmail, 'cto@acme.com');
  });

  it('rejects missing organizationName', () => {
    const result = validateOrganizationProfile({ buyerContactEmail: 'a@b.com' });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error('unreachable');
    assert.equal(result.code, 'ORGANIZATION_PROFILE_INVALID');
  });

  it('rejects missing buyerContactEmail', () => {
    const result = validateOrganizationProfile({ organizationName: 'Acme' });
    assert.equal(result.ok, false);
  });

  it('rejects invalid email', () => {
    const result = validateOrganizationProfile({ organizationName: 'Acme', buyerContactEmail: 'notanemail' });
    assert.equal(result.ok, false);
  });

  it('trims string fields', () => {
    const result = validateOrganizationProfile({
      organizationName: '  Acme  ',
      buyerContactEmail: '  cto@acme.com  ',
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    assert.equal(result.profile.organizationName, 'Acme');
    assert.equal(result.profile.buyerContactEmail, 'cto@acme.com');
  });

  it('strips control characters', () => {
    const result = sanitizeOrganizationProfile({
      organizationName: 'Acme\x00Corp\x1F',
      buyerContactEmail: 'a@b.com',
    });
    assert.equal(result.organizationName, 'AcmeCorp');
  });

  it('truncates overly long organizationName', () => {
    const longName = 'A'.repeat(200);
    const result = sanitizeOrganizationProfile({ organizationName: longName, buyerContactEmail: 'a@b.com' });
    assert.equal(result.organizationName.length, 120);
  });

  it('accepts optional fields', () => {
    const result = validateOrganizationProfile({
      organizationName: 'Acme',
      buyerContactEmail: 'a@b.com',
      organizationWebsite: 'https://acme.com',
      organizationCountry: 'US',
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    assert.equal(result.profile.organizationWebsite, 'https://acme.com');
  });

  it('normalizes buyerContactEmail to lowercase', () => {
    assert.equal(normalizeEmail('  CTO@ACME.COM  '), 'cto@acme.com');
  });
});

// ---------------------------------------------------------------------------
// Recovery code helpers
// ---------------------------------------------------------------------------

describe('recovery code helpers', () => {
  it('createRegistryRecoveryCode returns formatted code', () => {
    const code = createRegistryRecoveryCode();
    assert.match(code, /^AOC-RECOVERY-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('recovery code hash does not equal raw code', () => {
    const code = createRegistryRecoveryCode();
    assert.notEqual(hashRegistryRecoveryCode(code), code);
  });

  it('verifyRegistryRecoveryCode accepts valid code', () => {
    const code = createRegistryRecoveryCode();
    const hash = hashRegistryRecoveryCode(code);
    assert.equal(verifyRegistryRecoveryCode(code, hash), true);
  });

  it('verifyRegistryRecoveryCode rejects wrong code', () => {
    const code = createRegistryRecoveryCode();
    const hash = hashRegistryRecoveryCode(code);
    assert.equal(verifyRegistryRecoveryCode('AOC-RECOVERY-DEAD-BEEF-1234-5678', hash), false);
  });

  it('different codes produce different hashes', () => {
    const a = createRegistryRecoveryCode();
    const b = createRegistryRecoveryCode();
    assert.notEqual(hashRegistryRecoveryCode(a), hashRegistryRecoveryCode(b));
  });
});

// ---------------------------------------------------------------------------
// Admin token rotation
// ---------------------------------------------------------------------------

describe('admin token rotation', () => {
  let db: Database.Database;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('rotate with current access token succeeds', () => {
    const { registry, token } = makeRegistry(db);
    const result = rotateRegistryAdminToken({ registryId: registry.registryId, currentAccessToken: token }, db);
    assert.ok(!('error' in result));
    if ('error' in result) throw new Error('unreachable');
    assert.ok(result.newAccessToken);
    assert.ok(result.newRecoveryCode);
    assert.match(result.newRecoveryCode, /^AOC-RECOVERY-/);
  });

  it('old admin token stops working after rotation', () => {
    const { registry, token } = makeRegistry(db);
    const result = rotateRegistryAdminToken({ registryId: registry.registryId, currentAccessToken: token }, db);
    assert.ok(!('error' in result));

    // Old token should be rejected
    const updated = getRegistryByRegistryId(registry.registryId, db)!;
    assert.equal(verifyRegistryAdminAccessToken(token, updated.adminAccessTokenHash!), false);
  });

  it('new admin token works after rotation', () => {
    const { registry, token } = makeRegistry(db);
    const result = rotateRegistryAdminToken({ registryId: registry.registryId, currentAccessToken: token }, db);
    assert.ok(!('error' in result));
    if ('error' in result) throw new Error('unreachable');

    const updated = getRegistryByRegistryId(registry.registryId, db)!;
    assert.equal(verifyRegistryAdminAccessToken(result.newAccessToken, updated.adminAccessTokenHash!), true);
  });

  it('rotate rejects invalid token', () => {
    const { registry } = makeRegistry(db);
    const result = rotateRegistryAdminToken({ registryId: registry.registryId, currentAccessToken: 'badtoken' }, db);
    assert.ok('error' in result);
  });

  it('rotate with recovery code succeeds', () => {
    const { registry, recoveryCode } = makeRegistry(db, { buyerContactEmail: 'contact@example.com' });
    const result = rotateRegistryAdminToken({
      registryId: registry.registryId,
      recoveryCode,
      buyerContactEmail: 'contact@example.com',
    }, db);
    assert.ok(!('error' in result));
    if ('error' in result) throw new Error('unreachable');
    assert.ok(result.newAccessToken);
    assert.ok(result.newRecoveryCode);
  });

  it('rotate rejects recovery code with email mismatch', () => {
    const { registry, recoveryCode } = makeRegistry(db, { buyerContactEmail: 'contact@example.com' });
    const result = rotateRegistryAdminToken({
      registryId: registry.registryId,
      recoveryCode,
      buyerContactEmail: 'wrong@example.com',
    }, db);
    assert.ok('error' in result);
    if (!('error' in result)) throw new Error('unreachable');
    assert.equal(result.code, 'REGISTRY_RECOVERY_EMAIL_MISMATCH');
  });

  it('rotate rejects invalid recovery code', () => {
    const { registry } = makeRegistry(db);
    const result = rotateRegistryAdminToken({
      registryId: registry.registryId,
      recoveryCode: 'AOC-RECOVERY-0000-0000-0000-0000',
      buyerContactEmail: 'contact@example.com',
    }, db);
    assert.ok('error' in result);
  });

  it('rotation updates admin_access_token_rotated_at', () => {
    const { registry, token } = makeRegistry(db);
    assert.equal(registry.adminAccessTokenRotatedAt, null);
    rotateRegistryAdminToken({ registryId: registry.registryId, currentAccessToken: token }, db);
    const updated = getRegistryByRegistryId(registry.registryId, db)!;
    assert.ok(updated.adminAccessTokenRotatedAt);
  });

  it('new recovery code is generated after rotation', () => {
    const { registry, token, recoveryCode } = makeRegistry(db);
    const result = rotateRegistryAdminToken({ registryId: registry.registryId, currentAccessToken: token }, db);
    assert.ok(!('error' in result));
    if ('error' in result) throw new Error('unreachable');
    // New recovery code must differ from old
    assert.notEqual(result.newRecoveryCode, recoveryCode);
  });
});

// ---------------------------------------------------------------------------
// Admin session tests
// ---------------------------------------------------------------------------

describe('admin sessions', () => {
  let db: Database.Database;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('createAdminSession returns a session token', () => {
    const { registry } = makeRegistry(db);
    const session = createAdminSession(registry.registryId, db);
    assert.ok(session.sessionToken);
    assert.ok(session.sessionId);
    assert.ok(session.expiresAt);
  });

  it('admin session stores only token hash', () => {
    const { registry } = makeRegistry(db);
    const session = createAdminSession(registry.registryId, db);
    const tokenHash = hashSessionToken(session.sessionToken);
    const stored = getRegistryAdminSession(tokenHash, db);
    assert.ok(stored);
    assert.notEqual(stored!.session_token_hash, session.sessionToken);
  });

  it('valid session verifies against registry', () => {
    const { registry } = makeRegistry(db);
    const session = createAdminSession(registry.registryId, db);
    const valid = verifyAdminSession(session.sessionToken, registry.registryId, db);
    assert.equal(valid, true);
  });

  it('session rejects wrong registry', () => {
    const { registry } = makeRegistry(db);
    const session = createAdminSession(registry.registryId, db);
    const valid = verifyAdminSession(session.sessionToken, 'wrong-registry-id', db);
    assert.equal(valid, false);
  });

  it('revoked session is rejected', () => {
    const { registry } = makeRegistry(db);
    const session = createAdminSession(registry.registryId, db);
    revokeRegistryAdminSessions(registry.registryId, db);
    const valid = verifyAdminSession(session.sessionToken, registry.registryId, db);
    assert.equal(valid, false);
  });

  it('sessions are revoked after token rotation', () => {
    const { registry, token } = makeRegistry(db);
    const session = createAdminSession(registry.registryId, db);
    // Verify session is valid before rotation
    assert.equal(verifyAdminSession(session.sessionToken, registry.registryId, db), true);
    // Rotate token
    rotateRegistryAdminToken({ registryId: registry.registryId, currentAccessToken: token }, db);
    // Session should now be revoked
    assert.equal(verifyAdminSession(session.sessionToken, registry.registryId, db), false);
  });
});

// ---------------------------------------------------------------------------
// ensureOrganizationRegistry with profile
// ---------------------------------------------------------------------------

describe('ensureOrganizationRegistry with profile', () => {
  let db: Database.Database;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('creates registry with organization profile', () => {
    const purchaseId = nanoid('purchase');
    const result = ensureOrganizationRegistry({
      purchaseId,
      tier: 'organization_agent_registry',
      organizationProfile: {
        organizationName: 'Profile Corp',
        buyerContactEmail: 'admin@profile.com',
        buyerContactName: 'Alice Admin',
        organizationCountry: 'US',
      },
    }, db);
    assert.ok(result);
    assert.ok(result!.wasCreated);
    assert.equal(result!.registry.organizationName, 'Profile Corp');
    assert.equal(result!.registry.buyerContactEmail, 'admin@profile.com');
    assert.equal(result!.registry.buyerContactName, 'Alice Admin');
    assert.equal(result!.registry.organizationCountry, 'US');
  });

  it('returns admin access token and recovery code on first creation', () => {
    const purchaseId = nanoid('purchase');
    const result = ensureOrganizationRegistry({
      purchaseId,
      tier: 'organization_agent_registry',
      organizationProfile: {
        organizationName: 'Token Corp',
        buyerContactEmail: 'cto@token.com',
      },
    }, db);
    assert.ok(result!.adminAccessToken);
    assert.ok(result!.recoveryCode);
    assert.match(result!.recoveryCode!, /^AOC-RECOVERY-/);
  });

  it('stores recovery code hash not raw code', () => {
    const purchaseId = nanoid('purchase');
    const result = ensureOrganizationRegistry({
      purchaseId,
      tier: 'organization_agent_registry',
      organizationProfile: {
        organizationName: 'Hash Corp',
        buyerContactEmail: 'hash@corp.com',
      },
    }, db);
    const registry = getRegistryByRegistryId(result!.registry.registryId, db)!;
    assert.ok(registry.recoveryCodeHash);
    assert.notEqual(registry.recoveryCodeHash, result!.recoveryCode);
  });

  it('uses My Organization fallback for missing profile', () => {
    const purchaseId = nanoid('purchase');
    const result = ensureOrganizationRegistry({
      purchaseId,
      tier: 'organization_agent_registry',
    }, db);
    assert.equal(result!.registry.organizationName, 'My Organization');
    assert.equal(result!.registry.profileCompletedAt, null);
  });

  it('sets profile_completed_at when required fields present', () => {
    const purchaseId = nanoid('purchase');
    const result = ensureOrganizationRegistry({
      purchaseId,
      tier: 'organization_agent_registry',
      organizationProfile: {
        organizationName: 'Complete Corp',
        buyerContactEmail: 'done@corp.com',
      },
    }, db);
    assert.ok(result!.registry.profileCompletedAt);
  });

  it('is idempotent — returns null token on second call', () => {
    const purchaseId = nanoid('purchase');
    const first = ensureOrganizationRegistry({
      purchaseId,
      tier: 'organization_agent_registry',
      organizationProfile: { organizationName: 'Idempotent Inc', buyerContactEmail: 'a@b.com' },
    }, db);
    const second = ensureOrganizationRegistry({ purchaseId, tier: 'organization_agent_registry' }, db);
    assert.ok(first!.wasCreated);
    assert.equal(second!.wasCreated, false);
    assert.equal(second!.adminAccessToken, null);
    assert.equal(second!.recoveryCode, null);
  });
});

// ---------------------------------------------------------------------------
// Profile update
// ---------------------------------------------------------------------------

describe('profile update', () => {
  let db: Database.Database;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('updates organization profile fields', () => {
    const { registry } = makeRegistry(db);
    updateRegistryProfile(registry.registryId, {
      organizationName: 'Updated Corp',
      buyerContactEmail: 'updated@corp.com',
      organizationWebsite: 'https://updated.com',
      organizationCountry: null,
      organizationIndustry: 'Technology',
      organizationSize: '51-200',
      organizationUseCase: 'Agent governance',
      buyerContactName: 'Bob Updated',
      buyerContactRole: 'CTO',
    }, db);
    const updated = getRegistryByRegistryId(registry.registryId, db)!;
    assert.equal(updated.organizationName, 'Updated Corp');
    assert.equal(updated.buyerContactEmail, 'updated@corp.com');
    assert.equal(updated.organizationWebsite, 'https://updated.com');
    assert.equal(updated.organizationIndustry, 'Technology');
    assert.ok(updated.profileUpdatedAt);
  });

  it('sets profile_completed_at when required fields present', () => {
    const { registry } = makeRegistry(db);
    updateRegistryProfile(registry.registryId, {
      organizationName: 'Complete Org',
      buyerContactEmail: 'done@org.com',
      organizationWebsite: null,
      organizationCountry: null,
      organizationIndustry: null,
      organizationSize: null,
      organizationUseCase: null,
      buyerContactName: null,
      buyerContactRole: null,
    }, db);
    const updated = getRegistryByRegistryId(registry.registryId, db)!;
    assert.ok(updated.profileCompletedAt);
  });
});

// ---------------------------------------------------------------------------
// Admin access status
// ---------------------------------------------------------------------------

describe('getRegistryAdminAccessStatus', () => {
  let db: Database.Database;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('returns correct status for registry with recovery code', () => {
    const { registry } = makeRegistry(db);
    const status = getRegistryAdminAccessStatus(registry.registryId, db);
    assert.ok(status);
    assert.equal(status!.hasRecoveryCode, true);
    assert.ok(status!.recoveryCodeCreatedAt);
    assert.equal(status!.recoveryCodeUsedAt, null);
  });

  it('marks recovery code used after rotation via recovery code', () => {
    const { registry, recoveryCode } = makeRegistry(db, { buyerContactEmail: 'x@y.com' });
    rotateRegistryAdminToken({
      registryId: registry.registryId,
      recoveryCode,
      buyerContactEmail: 'x@y.com',
    }, db);
    // After rotation, a new recovery code is generated so used_at is cleared
    const status = getRegistryAdminAccessStatus(registry.registryId, db);
    // Recovery code is rotated, so hasRecoveryCode still true with a new code
    assert.equal(status!.hasRecoveryCode, true);
    assert.ok(status!.adminAccessTokenRotatedAt);
  });

  it('returns null for unknown registry', () => {
    const status = getRegistryAdminAccessStatus('reg_nonexistent', db);
    assert.equal(status, null);
  });
});

// ---------------------------------------------------------------------------
// Admin access token helpers (regression)
// ---------------------------------------------------------------------------

describe('admin access token helpers (regression)', () => {
  it('verifyRegistryAdminAccessToken accepts valid token', () => {
    const token = createRegistryAdminAccessToken();
    const hash = hashRegistryAdminAccessToken(token);
    assert.equal(verifyRegistryAdminAccessToken(token, hash), true);
  });

  it('verifyRegistryAdminAccessToken rejects wrong token', () => {
    const token = createRegistryAdminAccessToken();
    const hash = hashRegistryAdminAccessToken(token);
    assert.equal(verifyRegistryAdminAccessToken('wrongtoken', hash), false);
  });
});
