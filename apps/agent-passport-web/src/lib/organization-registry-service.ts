import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import {
  createOrganizationRegistry,
  createRegistryEntitlement,
  getRegistryByPurchaseId,
  getRegistryByRegistryId,
  getEntitlementByRegistryId,
} from './organization-registry-repository.js';
import type {
  AgentOrganizationRegistryRecord,
  AgentRegistryEntitlementRecord,
} from './organization-registry-types.js';
import {
  createRegistryAdminAccessToken,
  hashRegistryAdminAccessToken,
  verifyRegistryAdminAccessToken,
} from './registry-access-token.js';

const ORG_REGISTRY_TIER = 'organization_agent_registry';
const DEFAULT_MAX_PASSPORTS = 10;

export interface EnsureRegistryResult {
  registry: AgentOrganizationRegistryRecord;
  entitlement: AgentRegistryEntitlementRecord;
  adminAccessToken: string | null;
  wasCreated: boolean;
}

/**
 * Idempotently create an organization registry for a completed purchase.
 * Returns the plain-text admin access token only on first creation.
 */
export function ensureOrganizationRegistry(
  opts: {
    purchaseId: string;
    tier: string;
    organizationName?: string;
    buyerEmail?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  },
  db?: Database.Database,
): EnsureRegistryResult | null {
  if (opts.tier !== ORG_REGISTRY_TIER) return null;

  const database = db ?? getDb();

  // Idempotency: return existing registry if already created
  const existing = getRegistryByPurchaseId(opts.purchaseId, database);
  if (existing) {
    const entitlement = getEntitlementByRegistryId(existing.registryId, database);
    return {
      registry: existing,
      entitlement: entitlement!,
      adminAccessToken: null, // not shown again after first creation
      wasCreated: false,
    };
  }

  const token = createRegistryAdminAccessToken();
  const tokenHash = hashRegistryAdminAccessToken(token);

  const registry = createOrganizationRegistry(
    {
      purchaseId: opts.purchaseId,
      organizationName: opts.organizationName ?? 'My Organization',
      buyerEmail: opts.buyerEmail,
      adminAccessTokenHash: tokenHash,
      stripeCustomerId: opts.stripeCustomerId,
      stripeSubscriptionId: opts.stripeSubscriptionId,
      maxPassports: DEFAULT_MAX_PASSPORTS,
    },
    database,
  );

  const entitlement = createRegistryEntitlement(
    registry.registryId,
    opts.purchaseId,
    DEFAULT_MAX_PASSPORTS,
    database,
  );

  return { registry, entitlement, adminAccessToken: token, wasCreated: true };
}

export interface VerifyRegistryAccessResult {
  ok: boolean;
  errorCode?: string;
  registry?: AgentOrganizationRegistryRecord;
}

export function verifyRegistryAccess(
  registryId: string,
  accessToken: string,
  db?: Database.Database,
): VerifyRegistryAccessResult {
  const database = db ?? getDb();
  const registry = getRegistryByRegistryId(registryId, database);

  if (!registry) return { ok: false, errorCode: 'REGISTRY_NOT_FOUND' };

  if (!registry.adminAccessTokenHash) {
    return { ok: false, errorCode: 'REGISTRY_ACCESS_DENIED' };
  }

  const valid = verifyRegistryAdminAccessToken(accessToken, registry.adminAccessTokenHash);
  if (!valid) return { ok: false, errorCode: 'REGISTRY_ACCESS_DENIED' };

  return { ok: true, registry };
}
