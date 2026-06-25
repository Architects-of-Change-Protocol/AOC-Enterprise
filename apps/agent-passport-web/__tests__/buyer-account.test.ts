import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDb } from '../src/lib/db.js';
import {
  createBuyerAccount,
  getBuyerAccountByEmail,
  getBuyerAccountByAccountId,
  toPublicBuyerAccount,
} from '../src/lib/buyer-account-repository.js';
import {
  hashBuyerPassword,
  verifyBuyerPassword,
  validateBuyerPassword,
} from '../src/lib/buyer-password.js';
import {
  normalizeBuyerEmail,
  validateBuyerEmail,
  sanitizeDisplayName,
} from '../src/lib/buyer-account-validation.js';
import {
  createBuyerAccountSession,
  verifyBuyerAccountSession,
  getBuyerAccountFromSessionToken,
  revokeBuyerAccountSession,
  BUYER_ACCOUNT_SESSION_COOKIE,
} from '../src/lib/buyer-account-session.js';
import {
  createRegistryMembership,
  getRegistryMembership,
  listRegistryMembershipsByRegistryId,
  listRegistryMembershipsByAccountId,
  removeRegistryMembership,
  hasActiveRegistryMembership,
} from '../src/lib/registry-membership-repository.js';
import {
  createRegistryTeamInvitation,
  getRegistryTeamInvitationByToken,
  acceptRegistryTeamInvitation,
  revokeRegistryTeamInvitation,
} from '../src/lib/registry-team-invitation-repository.js';
import {
  roleHasPermission,
  getRegistryRolePermissions,
} from '../src/lib/registry-role-policy.js';

let db: Database.Database;

before(() => {
  db = createTestDb();
});

after(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------
describe('buyer-password', () => {
  it('hashes password to non-plaintext', async () => {
    const hash = await hashBuyerPassword('testpassword1234');
    assert.ok(hash.startsWith('scrypt$'));
    assert.ok(!hash.includes('testpassword1234'));
  });

  it('verifies correct password', async () => {
    const hash = await hashBuyerPassword('correcthorsebattery');
    assert.ok(await verifyBuyerPassword('correcthorsebattery', hash));
  });

  it('rejects incorrect password', async () => {
    const hash = await hashBuyerPassword('correcthorsebattery');
    assert.ok(!(await verifyBuyerPassword('wrongpassword', hash)));
  });

  it('rejects weak password', () => {
    const result = validateBuyerPassword('short');
    assert.ok(!result.valid);
    assert.ok(result.errors.length > 0);
  });

  it('accepts strong password', () => {
    const result = validateBuyerPassword('strongpassword123');
    assert.ok(result.valid);
  });
});

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------
describe('buyer-account-validation', () => {
  it('normalizes email to lowercase', () => {
    assert.equal(normalizeBuyerEmail('USER@EXAMPLE.COM'), 'user@example.com');
  });

  it('trims email whitespace', () => {
    assert.equal(normalizeBuyerEmail('  user@example.com  '), 'user@example.com');
  });

  it('validates correct email', () => {
    assert.ok(validateBuyerEmail('user@example.com'));
  });

  it('rejects invalid email', () => {
    assert.ok(!validateBuyerEmail('notanemail'));
    assert.ok(!validateBuyerEmail(''));
  });

  it('sanitizes display name', () => {
    assert.equal(sanitizeDisplayName('John Doe'), 'John Doe');
    assert.equal(sanitizeDisplayName(null), null);
    assert.equal(sanitizeDisplayName(''), null);
    assert.equal(sanitizeDisplayName('\x00evil'), 'evil');
  });
});

// ---------------------------------------------------------------------------
// Buyer account repository
// ---------------------------------------------------------------------------
describe('buyer-account-repository', () => {
  it('creates account with hashed password', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'test1@example.com', displayName: 'Test', passwordHash: hash }, db);
    assert.ok(acc.account_id.startsWith('acct_'));
    assert.ok(acc.email === 'test1@example.com');
    assert.ok(!acc.password_hash.includes('password12345'));
  });

  it('fetches account by email', async () => {
    const hash = await hashBuyerPassword('password12345');
    createBuyerAccount({ email: 'test2@example.com', displayName: null, passwordHash: hash }, db);
    const found = getBuyerAccountByEmail('test2@example.com', db);
    assert.ok(found !== null);
    assert.equal(found!.email, 'test2@example.com');
  });

  it('rejects duplicate email', async () => {
    const hash = await hashBuyerPassword('password12345');
    createBuyerAccount({ email: 'dupe@example.com', displayName: null, passwordHash: hash }, db);
    assert.throws(() => {
      createBuyerAccount({ email: 'dupe@example.com', displayName: null, passwordHash: hash }, db);
    });
  });

  it('public account excludes password_hash', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'public@example.com', displayName: null, passwordHash: hash }, db);
    const pub = toPublicBuyerAccount(acc);
    assert.ok(!('password_hash' in pub));
  });
});

// ---------------------------------------------------------------------------
// Account sessions
// ---------------------------------------------------------------------------
describe('buyer-account-session', () => {
  it('creates session and verifies it', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'sess1@example.com', displayName: null, passwordHash: hash }, db);
    const { sessionToken } = createBuyerAccountSession(acc.account_id, db);
    const session = verifyBuyerAccountSession(sessionToken, db);
    assert.ok(session !== null);
    assert.equal(session!.account_id, acc.account_id);
  });

  it('session stores only token hash (not raw token)', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'sess2@example.com', displayName: null, passwordHash: hash }, db);
    const { sessionToken } = createBuyerAccountSession(acc.account_id, db);
    const session = verifyBuyerAccountSession(sessionToken, db);
    assert.ok(session !== null);
    assert.notEqual(session!.session_token_hash, sessionToken);
  });

  it('resolves account from session token', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'sess3@example.com', displayName: null, passwordHash: hash }, db);
    const { sessionToken } = createBuyerAccountSession(acc.account_id, db);
    const pub = getBuyerAccountFromSessionToken(sessionToken, db);
    assert.ok(pub !== null);
    assert.equal(pub!.email, 'sess3@example.com');
  });

  it('revoked session is rejected', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'sess4@example.com', displayName: null, passwordHash: hash }, db);
    const { sessionToken } = createBuyerAccountSession(acc.account_id, db);
    revokeBuyerAccountSession(sessionToken, db);
    const session = verifyBuyerAccountSession(sessionToken, db);
    assert.equal(session, null);
  });

  it('cookie name is correct', () => {
    assert.equal(BUYER_ACCOUNT_SESSION_COOKIE, 'aoc_buyer_account_session');
  });
});

// ---------------------------------------------------------------------------
// Registry memberships
// ---------------------------------------------------------------------------
describe('registry-membership-repository', () => {
  it('creates owner membership', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'mem1@example.com', displayName: null, passwordHash: hash }, db);
    const m = createRegistryMembership({ registryId: 'reg_test1', accountId: acc.account_id, role: 'owner' }, db);
    assert.equal(m.role, 'owner');
    assert.equal(m.status, 'active');
  });

  it('rejects duplicate membership', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'mem2@example.com', displayName: null, passwordHash: hash }, db);
    createRegistryMembership({ registryId: 'reg_test2', accountId: acc.account_id, role: 'owner' }, db);
    assert.throws(() => {
      createRegistryMembership({ registryId: 'reg_test2', accountId: acc.account_id, role: 'admin' }, db);
    });
  });

  it('lists memberships by registry', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'mem3@example.com', displayName: null, passwordHash: hash }, db);
    createRegistryMembership({ registryId: 'reg_test3', accountId: acc.account_id, role: 'member' }, db);
    const list = listRegistryMembershipsByRegistryId('reg_test3', db);
    assert.ok(list.length >= 1);
  });

  it('lists memberships by account', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'mem4@example.com', displayName: null, passwordHash: hash }, db);
    createRegistryMembership({ registryId: 'reg_test4', accountId: acc.account_id, role: 'viewer' }, db);
    const list = listRegistryMembershipsByAccountId(acc.account_id, db);
    assert.ok(list.length >= 1);
  });

  it('removes membership', async () => {
    const hash = await hashBuyerPassword('password12345');
    const acc = createBuyerAccount({ email: 'mem5@example.com', displayName: null, passwordHash: hash }, db);
    createRegistryMembership({ registryId: 'reg_test5', accountId: acc.account_id, role: 'member' }, db);
    removeRegistryMembership({ registryId: 'reg_test5', accountId: acc.account_id }, db);
    assert.ok(!hasActiveRegistryMembership('reg_test5', acc.account_id, db));
  });
});

// ---------------------------------------------------------------------------
// Role policies
// ---------------------------------------------------------------------------
describe('registry-role-policy', () => {
  it('owner has all permissions', () => {
    const perms = getRegistryRolePermissions('owner');
    assert.ok(perms.includes('registry:view'));
    assert.ok(perms.includes('registry:rotate_admin_access'));
    assert.ok(perms.includes('registry:manage_team'));
    assert.ok(perms.includes('registry:enroll_agent'));
  });

  it('viewer cannot enroll', () => {
    assert.ok(!roleHasPermission('viewer', 'registry:enroll_agent'));
  });

  it('auditor can generate exports but cannot enroll', () => {
    assert.ok(roleHasPermission('auditor', 'registry:generate_exports'));
    assert.ok(!roleHasPermission('auditor', 'registry:enroll_agent'));
  });

  it('admin cannot rotate admin access', () => {
    assert.ok(!roleHasPermission('admin', 'registry:rotate_admin_access'));
  });
});

// ---------------------------------------------------------------------------
// Team invitations
// ---------------------------------------------------------------------------
describe('registry-team-invitation-repository', () => {
  it('creates invitation and returns raw token', async () => {
    const { record, rawToken } = createRegistryTeamInvitation({
      registryId: 'reg_inv1',
      invitedEmail: 'invite1@example.com',
      role: 'viewer',
    }, db);
    assert.ok(rawToken.length > 0);
    assert.ok(!record.invitation_token_hash.includes(rawToken));
    assert.equal(record.status, 'pending');
  });

  it('finds invitation by token', async () => {
    const { record, rawToken } = createRegistryTeamInvitation({
      registryId: 'reg_inv2',
      invitedEmail: 'invite2@example.com',
      role: 'member',
    }, db);
    const found = getRegistryTeamInvitationByToken(rawToken, db);
    assert.ok(found !== null);
    assert.equal(found!.invitation_id, record.invitation_id);
  });

  it('invitation stores token hash only', async () => {
    const { record, rawToken } = createRegistryTeamInvitation({
      registryId: 'reg_inv3',
      invitedEmail: 'invite3@example.com',
      role: 'auditor',
    }, db);
    assert.notEqual(record.invitation_token_hash, rawToken);
  });

  it('accepts invitation', async () => {
    const { record, rawToken } = createRegistryTeamInvitation({
      registryId: 'reg_inv4',
      invitedEmail: 'invite4@example.com',
      role: 'viewer',
    }, db);
    acceptRegistryTeamInvitation({ invitationId: record.invitation_id }, db);
    // Accepted invitation won't be returned by getByToken (status = 'accepted', not 'pending')
    const found = getRegistryTeamInvitationByToken(rawToken, db);
    assert.equal(found, null);
    void rawToken;
  });

  it('revokes invitation', async () => {
    const { record, rawToken } = createRegistryTeamInvitation({
      registryId: 'reg_inv5',
      invitedEmail: 'invite5@example.com',
      role: 'member',
    }, db);
    revokeRegistryTeamInvitation({ invitationId: record.invitation_id }, db);
    const found = getRegistryTeamInvitationByToken(rawToken, db);
    assert.equal(found, null);
  });
});
