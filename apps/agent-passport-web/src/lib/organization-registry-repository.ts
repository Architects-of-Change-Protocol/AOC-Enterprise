import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import type {
  AgentOrganizationRegistryRecord,
  AgentRegistryEntitlementRecord,
  AgentRegistryPassportRecord,
  RegistryStatus,
  EntitlementStatus,
  RegistryPassportStatus,
} from './organization-registry-types.js';

// ---------------------------------------------------------------------------
// Row types (SQLite raw)
// ---------------------------------------------------------------------------

interface RegistryRow {
  id: string;
  registry_id: string;
  purchase_id: string;
  tier: string;
  organization_name: string;
  buyer_email: string | null;
  owner_name: string | null;
  owner_role: string | null;
  registry_status: string;
  governance_level: string;
  max_passports: number;
  issued_passports: number;
  remaining_passports: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  admin_access_token_hash: string | null;
  admin_access_token_created_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EntitlementRow {
  id: string;
  registry_id: string;
  purchase_id: string;
  entitlement_type: string;
  max_quantity: number;
  used_quantity: number;
  remaining_quantity: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface RegistryPassportRow {
  id: string;
  registry_id: string;
  passport_id: string;
  purchase_id: string | null;
  agent_name: string;
  agent_owner: string | null;
  status: string;
  governance_status: string | null;
  runtime_guard_ready: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToRegistry(row: RegistryRow): AgentOrganizationRegistryRecord {
  return {
    id: row.id,
    registryId: row.registry_id,
    purchaseId: row.purchase_id,
    tier: 'organization_agent_registry',
    organizationName: row.organization_name,
    buyerEmail: row.buyer_email,
    ownerName: row.owner_name,
    ownerRole: row.owner_role,
    registryStatus: row.registry_status as RegistryStatus,
    governanceLevel: 'organization',
    maxPassports: row.max_passports,
    issuedPassports: row.issued_passports,
    remainingPassports: row.remaining_passports,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    adminAccessTokenHash: row.admin_access_token_hash,
    adminAccessTokenCreatedAt: row.admin_access_token_created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEntitlement(row: EntitlementRow): AgentRegistryEntitlementRecord {
  return {
    id: row.id,
    registryId: row.registry_id,
    purchaseId: row.purchase_id,
    entitlementType: 'agent_passport_capacity',
    maxQuantity: row.max_quantity,
    usedQuantity: row.used_quantity,
    remainingQuantity: row.remaining_quantity,
    status: row.status as EntitlementStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRegistryPassport(row: RegistryPassportRow): AgentRegistryPassportRecord {
  return {
    id: row.id,
    registryId: row.registry_id,
    passportId: row.passport_id,
    purchaseId: row.purchase_id,
    agentName: row.agent_name,
    agentOwner: row.agent_owner,
    status: row.status as RegistryPassportStatus,
    governanceStatus: row.governance_status,
    runtimeGuardReady: row.runtime_guard_ready === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Registry CRUD
// ---------------------------------------------------------------------------

export interface CreateRegistryOptions {
  purchaseId: string;
  organizationName: string;
  buyerEmail?: string;
  ownerName?: string;
  ownerRole?: string;
  adminAccessTokenHash?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  maxPassports?: number;
}

export function createOrganizationRegistry(
  opts: CreateRegistryOptions,
  db?: Database.Database,
): AgentOrganizationRegistryRecord {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid('orgreg');
  const registryId = nanoid('registry');
  const max = opts.maxPassports ?? 10;

  database
    .prepare(
      `INSERT INTO organization_registries
        (id, registry_id, purchase_id, tier, organization_name, buyer_email,
         owner_name, owner_role, registry_status, governance_level,
         max_passports, issued_passports, remaining_passports,
         stripe_customer_id, stripe_subscription_id,
         admin_access_token_hash, admin_access_token_created_at,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      registryId,
      opts.purchaseId,
      'organization_agent_registry',
      opts.organizationName,
      opts.buyerEmail ?? null,
      opts.ownerName ?? null,
      opts.ownerRole ?? null,
      'active',
      'organization',
      max,
      0,
      max,
      opts.stripeCustomerId ?? null,
      opts.stripeSubscriptionId ?? null,
      opts.adminAccessTokenHash ?? null,
      opts.adminAccessTokenHash ? now : null,
      now,
      now,
    );

  return getRegistryById(id, database)!;
}

export function getRegistryById(
  id: string,
  db?: Database.Database,
): AgentOrganizationRegistryRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM organization_registries WHERE id = ?`)
    .get(id) as RegistryRow | undefined;
  return row ? rowToRegistry(row) : null;
}

export function getRegistryByRegistryId(
  registryId: string,
  db?: Database.Database,
): AgentOrganizationRegistryRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM organization_registries WHERE registry_id = ?`)
    .get(registryId) as RegistryRow | undefined;
  return row ? rowToRegistry(row) : null;
}

export function getRegistryByPurchaseId(
  purchaseId: string,
  db?: Database.Database,
): AgentOrganizationRegistryRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM organization_registries WHERE purchase_id = ?`)
    .get(purchaseId) as RegistryRow | undefined;
  return row ? rowToRegistry(row) : null;
}

export function updateRegistryStatus(
  registryId: string,
  status: RegistryStatus,
  db?: Database.Database,
): AgentOrganizationRegistryRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE organization_registries SET registry_status = ?, updated_at = ? WHERE registry_id = ?`,
    )
    .run(status, now, registryId);
  return getRegistryByRegistryId(registryId, database);
}

// ---------------------------------------------------------------------------
// Entitlement CRUD
// ---------------------------------------------------------------------------

export function createRegistryEntitlement(
  registryId: string,
  purchaseId: string,
  maxQuantity: number,
  db?: Database.Database,
): AgentRegistryEntitlementRecord {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid('ent');

  database
    .prepare(
      `INSERT INTO organization_registry_entitlements
        (id, registry_id, purchase_id, entitlement_type,
         max_quantity, used_quantity, remaining_quantity, status,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, registryId, purchaseId, 'agent_passport_capacity', maxQuantity, 0, maxQuantity, 'active', now, now);

  return getEntitlementByRegistryId(registryId, database)!;
}

export function getEntitlementByRegistryId(
  registryId: string,
  db?: Database.Database,
): AgentRegistryEntitlementRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(
      `SELECT * FROM organization_registry_entitlements WHERE registry_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(registryId) as EntitlementRow | undefined;
  return row ? rowToEntitlement(row) : null;
}

// ---------------------------------------------------------------------------
// Registry passport associations + capacity update (atomic)
// ---------------------------------------------------------------------------

export interface AddRegistryPassportOptions {
  registryId: string;
  passportId: string;
  purchaseId?: string;
  agentName: string;
  agentOwner?: string;
  governanceStatus?: string;
  runtimeGuardReady?: boolean;
}

export function addPassportToRegistry(
  opts: AddRegistryPassportOptions,
  db?: Database.Database,
): AgentRegistryPassportRecord {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid('regpp');

  // Atomic: insert association + decrement counts in a transaction
  const txn = database.transaction(() => {
    // Check entitlement still has capacity
    const ent = database
      .prepare(
        `SELECT * FROM organization_registry_entitlements WHERE registry_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(opts.registryId) as EntitlementRow | undefined;

    if (!ent) throw new Error('REGISTRY_ENTITLEMENT_NOT_FOUND');
    if (ent.status === 'exhausted' || ent.remaining_quantity <= 0) throw new Error('REGISTRY_CAPACITY_EXHAUSTED');
    if (ent.status !== 'active') throw new Error('REGISTRY_ENTITLEMENT_INACTIVE');

    const reg = database
      .prepare(`SELECT * FROM organization_registries WHERE registry_id = ?`)
      .get(opts.registryId) as RegistryRow | undefined;

    if (!reg) throw new Error('REGISTRY_NOT_FOUND');
    if (reg.registry_status !== 'active') throw new Error('REGISTRY_INACTIVE');
    if (reg.remaining_passports <= 0) throw new Error('REGISTRY_CAPACITY_EXHAUSTED');

    // Insert association
    database
      .prepare(
        `INSERT INTO organization_registry_passports
          (id, registry_id, passport_id, purchase_id, agent_name, agent_owner,
           status, governance_status, runtime_guard_ready, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        opts.registryId,
        opts.passportId,
        opts.purchaseId ?? null,
        opts.agentName,
        opts.agentOwner ?? null,
        'active',
        opts.governanceStatus ?? 'active',
        opts.runtimeGuardReady ? 1 : 0,
        now,
        now,
      );

    // Decrement registry counts
    database
      .prepare(
        `UPDATE organization_registries
         SET issued_passports = issued_passports + 1,
             remaining_passports = remaining_passports - 1,
             updated_at = ?
         WHERE registry_id = ?`,
      )
      .run(now, opts.registryId);

    // Increment entitlement usage
    const newUsed = ent.used_quantity + 1;
    const newRemaining = ent.remaining_quantity - 1;
    const newStatus: EntitlementStatus = newRemaining <= 0 ? 'exhausted' : 'active';

    database
      .prepare(
        `UPDATE organization_registry_entitlements
         SET used_quantity = ?, remaining_quantity = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(newUsed, newRemaining, newStatus, now, ent.id);
  });

  txn();

  return getRegistryPassportByPassportId(opts.passportId, database)!;
}

export function getRegistryPassportByPassportId(
  passportId: string,
  db?: Database.Database,
): AgentRegistryPassportRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM organization_registry_passports WHERE passport_id = ?`)
    .get(passportId) as RegistryPassportRow | undefined;
  return row ? rowToRegistryPassport(row) : null;
}

export function listRegistryPassports(
  registryId: string,
  db?: Database.Database,
): AgentRegistryPassportRecord[] {
  const database = db ?? getDb();
  const rows = database
    .prepare(
      `SELECT * FROM organization_registry_passports WHERE registry_id = ? ORDER BY created_at DESC`,
    )
    .all(registryId) as RegistryPassportRow[];
  return rows.map(rowToRegistryPassport);
}
