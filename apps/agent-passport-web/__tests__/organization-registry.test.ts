import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDb } from '../src/lib/db.js';
import {
  createOrganizationRegistry,
  createRegistryEntitlement,
  getRegistryByRegistryId,
  getRegistryByPurchaseId,
  getEntitlementByRegistryId,
  listRegistryPassports,
  addPassportToRegistry,
} from '../src/lib/organization-registry-repository.js';
import {
  ensureOrganizationRegistry,
  verifyRegistryAccess,
} from '../src/lib/organization-registry-service.js';
import {
  createRegistryAdminAccessToken,
  hashRegistryAdminAccessToken,
  verifyRegistryAdminAccessToken,
} from '../src/lib/registry-access-token.js';
import {
  createPurchaseRecord,
  markPurchaseCompleted,
} from '../src/lib/purchase-repository.js';
import {
  createPassportRecord,
} from '../src/lib/passport-repository.js';

function makeDb(): Database.Database {
  return createTestDb();
}

// ---------------------------------------------------------------------------
// Access token helpers
// ---------------------------------------------------------------------------
describe('Registry Access Token', () => {
  it('creates a non-empty token', () => {
    const token = createRegistryAdminAccessToken();
    assert.ok(token.length >= 32);
  });

  it('hashes token deterministically', () => {
    const token = 'test-token-abc';
    const h1 = hashRegistryAdminAccessToken(token);
    const h2 = hashRegistryAdminAccessToken(token);
    assert.equal(h1, h2);
  });

  it('verifies a valid token against its hash', () => {
    const token = createRegistryAdminAccessToken();
    const hash = hashRegistryAdminAccessToken(token);
    assert.equal(verifyRegistryAdminAccessToken(token, hash), true);
  });

  it('rejects an invalid token', () => {
    const token = createRegistryAdminAccessToken();
    const hash = hashRegistryAdminAccessToken(token);
    assert.equal(verifyRegistryAdminAccessToken('wrong-token', hash), false);
  });
});

// ---------------------------------------------------------------------------
// Organization registry repository
// ---------------------------------------------------------------------------
describe('Organization Registry Repository', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  after(() => { db.close(); });

  it('createOrganizationRegistry persists a registry', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({
      purchaseId: p.id,
      organizationName: 'Acme Corp',
      buyerEmail: 'buyer@acme.com',
    }, db);

    assert.ok(reg.registryId.startsWith('registry_'));
    assert.equal(reg.organizationName, 'Acme Corp');
    assert.equal(reg.buyerEmail, 'buyer@acme.com');
    assert.equal(reg.registryStatus, 'active');
    assert.equal(reg.maxPassports, 10);
    assert.equal(reg.issuedPassports, 0);
    assert.equal(reg.remainingPassports, 10);
    assert.equal(reg.governanceLevel, 'organization');
    assert.equal(reg.tier, 'organization_agent_registry');
  });

  it('getRegistryByRegistryId retrieves registry', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'Test Org' }, db);
    const fetched = getRegistryByRegistryId(reg.registryId, db);
    assert.ok(fetched !== null);
    assert.equal(fetched!.registryId, reg.registryId);
  });

  it('getRegistryByPurchaseId retrieves registry', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'Test Org 2' }, db);
    const fetched = getRegistryByPurchaseId(p.id, db);
    assert.ok(fetched !== null);
    assert.equal(fetched!.registryId, reg.registryId);
  });

  it('createRegistryEntitlement creates with max_quantity=10 and status=active', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'Ent Corp' }, db);
    const ent = createRegistryEntitlement(reg.registryId, p.id, 10, db);

    assert.equal(ent.maxQuantity, 10);
    assert.equal(ent.usedQuantity, 0);
    assert.equal(ent.remainingQuantity, 10);
    assert.equal(ent.status, 'active');
    assert.equal(ent.entitlementType, 'agent_passport_capacity');
  });

  it('getEntitlementByRegistryId retrieves entitlement', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'Ent Fetch' }, db);
    createRegistryEntitlement(reg.registryId, p.id, 10, db);
    const ent = getEntitlementByRegistryId(reg.registryId, db);
    assert.ok(ent !== null);
    assert.equal(ent!.registryId, reg.registryId);
  });

  it('addPassportToRegistry links passport and decrements capacity', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'Cap Test' }, db);
    createRegistryEntitlement(reg.registryId, p.id, 10, db);

    createPassportRecord('pp_reg_001', null, '{}', db, reg.registryId);
    addPassportToRegistry({
      registryId: reg.registryId,
      passportId: 'pp_reg_001',
      agentName: 'TestBot',
      agentOwner: 'Owner',
    }, db);

    const updated = getRegistryByRegistryId(reg.registryId, db)!;
    assert.equal(updated.issuedPassports, 1);
    assert.equal(updated.remainingPassports, 9);

    const ent = getEntitlementByRegistryId(reg.registryId, db)!;
    assert.equal(ent.usedQuantity, 1);
    assert.equal(ent.remainingQuantity, 9);
    assert.equal(ent.status, 'active');
  });

  it('addPassportToRegistry marks entitlement exhausted when capacity reaches 0', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'Exhaust Test', maxPassports: 2 }, db);
    createRegistryEntitlement(reg.registryId, p.id, 2, db);

    for (let i = 0; i < 2; i++) {
      const pid = `pp_exhaust_${i}`;
      createPassportRecord(pid, null, '{}', db, reg.registryId);
      addPassportToRegistry({ registryId: reg.registryId, passportId: pid, agentName: `Bot${i}` }, db);
    }

    const ent = getEntitlementByRegistryId(reg.registryId, db)!;
    assert.equal(ent.remainingQuantity, 0);
    assert.equal(ent.status, 'exhausted');
  });

  it('addPassportToRegistry throws when capacity exhausted', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'Block Test', maxPassports: 1 }, db);
    createRegistryEntitlement(reg.registryId, p.id, 1, db);

    createPassportRecord('pp_block_1', null, '{}', db, reg.registryId);
    addPassportToRegistry({ registryId: reg.registryId, passportId: 'pp_block_1', agentName: 'Bot1' }, db);

    createPassportRecord('pp_block_2', null, '{}', db, reg.registryId);
    assert.throws(
      () => addPassportToRegistry({ registryId: reg.registryId, passportId: 'pp_block_2', agentName: 'Bot2' }, db),
      /REGISTRY_CAPACITY_EXHAUSTED/,
    );
  });

  it('listRegistryPassports returns associated passports', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const reg = createOrganizationRegistry({ purchaseId: p.id, organizationName: 'List Test', maxPassports: 5 }, db);
    createRegistryEntitlement(reg.registryId, p.id, 5, db);

    createPassportRecord('pp_list_a', null, '{}', db, reg.registryId);
    createPassportRecord('pp_list_b', null, '{}', db, reg.registryId);
    addPassportToRegistry({ registryId: reg.registryId, passportId: 'pp_list_a', agentName: 'AgentA' }, db);
    addPassportToRegistry({ registryId: reg.registryId, passportId: 'pp_list_b', agentName: 'AgentB' }, db);

    const list = listRegistryPassports(reg.registryId, db);
    assert.equal(list.length, 2);
    assert.ok(list.some(l => l.passportId === 'pp_list_a'));
    assert.ok(list.some(l => l.passportId === 'pp_list_b'));
  });
});

// ---------------------------------------------------------------------------
// Organization registry service
// ---------------------------------------------------------------------------
describe('Organization Registry Service', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  after(() => { db.close(); });

  it('ensureOrganizationRegistry creates registry for org tier', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    markPurchaseCompleted(p.id, {}, db);

    const result = ensureOrganizationRegistry({
      purchaseId: p.id,
      tier: 'organization_agent_registry',
      organizationName: 'Service Test Org',
      buyerEmail: 'buyer@test.com',
    }, db);

    assert.ok(result !== null);
    assert.equal(result!.wasCreated, true);
    assert.ok(result!.adminAccessToken !== null);
    assert.ok(result!.adminAccessToken!.length >= 32);
    assert.equal(result!.registry.organizationName, 'Service Test Org');
    assert.equal(result!.entitlement.maxQuantity, 10);
    assert.equal(result!.entitlement.status, 'active');
  });

  it('ensureOrganizationRegistry is idempotent (returns existing, no duplicate)', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    markPurchaseCompleted(p.id, {}, db);

    const r1 = ensureOrganizationRegistry({ purchaseId: p.id, tier: 'organization_agent_registry', organizationName: 'Idem Org' }, db);
    const r2 = ensureOrganizationRegistry({ purchaseId: p.id, tier: 'organization_agent_registry', organizationName: 'Idem Org' }, db);

    assert.ok(r1 !== null && r2 !== null);
    assert.equal(r1!.registry.registryId, r2!.registry.registryId);
    assert.equal(r2!.wasCreated, false);
    assert.equal(r2!.adminAccessToken, null); // not shown again
  });

  it('ensureOrganizationRegistry returns null for non-org tier', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    const result = ensureOrganizationRegistry({ purchaseId: p.id, tier: 'agent_passport_single' }, db);
    assert.equal(result, null);
  });

  it('stores hashed admin access token (not plain text)', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const result = ensureOrganizationRegistry({ purchaseId: p.id, tier: 'organization_agent_registry', organizationName: 'Hash Check' }, db)!;

    const plainToken = result.adminAccessToken!;
    const registry = getRegistryByRegistryId(result.registry.registryId, db)!;

    assert.ok(registry.adminAccessTokenHash !== null);
    assert.notEqual(registry.adminAccessTokenHash, plainToken);
    assert.equal(registry.adminAccessTokenHash!.length, 64); // SHA-256 hex
  });

  it('verifyRegistryAccess accepts valid token', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const result = ensureOrganizationRegistry({ purchaseId: p.id, tier: 'organization_agent_registry', organizationName: 'Verify Org' }, db)!;

    const access = verifyRegistryAccess(result.registry.registryId, result.adminAccessToken!, db);
    assert.equal(access.ok, true);
    assert.ok(access.registry !== undefined);
  });

  it('verifyRegistryAccess rejects invalid token', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const result = ensureOrganizationRegistry({ purchaseId: p.id, tier: 'organization_agent_registry', organizationName: 'Reject Org' }, db)!;

    const access = verifyRegistryAccess(result.registry.registryId, 'wrong-token', db);
    assert.equal(access.ok, false);
    assert.equal(access.errorCode, 'REGISTRY_ACCESS_DENIED');
  });

  it('verifyRegistryAccess returns REGISTRY_NOT_FOUND for unknown ID', () => {
    const access = verifyRegistryAccess('nonexistent_registry', 'any-token', db);
    assert.equal(access.ok, false);
    assert.equal(access.errorCode, 'REGISTRY_NOT_FOUND');
  });

  it('blocks enrollment when entitlement exhausted', () => {
    const p = createPurchaseRecord('organization_agent_registry', db);
    const result = ensureOrganizationRegistry({ purchaseId: p.id, tier: 'organization_agent_registry', organizationName: 'Exhaust Block' }, db)!;
    const reg = result.registry;

    // Manually exhaust by adding passports up to max
    for (let i = 0; i < 10; i++) {
      const pid = `pp_exhaust_block_${reg.registryId}_${i}`;
      createPassportRecord(pid, null, '{}', db, reg.registryId);
      addPassportToRegistry({ registryId: reg.registryId, passportId: pid, agentName: `Bot${i}` }, db);
    }

    const ent = getEntitlementByRegistryId(reg.registryId, db)!;
    assert.equal(ent.status, 'exhausted');
    assert.equal(ent.remainingQuantity, 0);

    const nextPid = `pp_over_${reg.registryId}`;
    createPassportRecord(nextPid, null, '{}', db, reg.registryId);
    assert.throws(
      () => addPassportToRegistry({ registryId: reg.registryId, passportId: nextPid, agentName: 'OverBot' }, db),
      /REGISTRY_CAPACITY_EXHAUSTED/,
    );
  });
});

// ---------------------------------------------------------------------------
// Passport repository — registry linkage
// ---------------------------------------------------------------------------
describe('Passport Repository — Registry Support', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  after(() => { db.close(); });

  it('createPassportRecord accepts null purchaseId with registryId', () => {
    const passport = createPassportRecord('pp_null_purchase', null, '{"test":true}', db, 'registry_test_id');
    assert.equal(passport.purchaseId, null);
    assert.equal(passport.registryId, 'registry_test_id');
  });

  it('createPassportRecord still works with purchaseId (individual flow)', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    const passport = createPassportRecord('pp_with_purchase', p.id, '{}', db);
    assert.equal(passport.purchaseId, p.id);
    assert.equal(passport.registryId, null);
  });
});
