import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import {
  createOrganizationRegistry,
  createRegistryEntitlement,
  getRegistryByPurchaseId,
  getRegistryByRegistryId,
  getEntitlementByRegistryId,
  updateRegistryAdminToken,
  updateRegistryRecoveryCode,
  markRecoveryCodeUsed,
  revokeRegistryAdminSessions,
  recordAdminAccessEvent,
} from './organization-registry-repository.js';
import type {
  AgentOrganizationRegistryRecord,
  AgentRegistryEntitlementRecord,
  OrganizationProfile,
  RegistryAdminRecoveryResult,
} from './organization-registry-types.js';
import {
  createRegistryAdminAccessToken,
  hashRegistryAdminAccessToken,
  verifyRegistryAdminAccessToken,
  createRegistryRecoveryCode,
  hashRegistryRecoveryCode,
  verifyRegistryRecoveryCode,
} from './registry-access-token.js';

const ORG_REGISTRY_TIER = 'organization_agent_registry';
const DEFAULT_MAX_PASSPORTS = 10;

export interface EnsureRegistryResult {
  registry: AgentOrganizationRegistryRecord;
  entitlement: AgentRegistryEntitlementRecord;
  adminAccessToken: string | null;
  recoveryCode: string | null;
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
    organizationProfile?: OrganizationProfile | null;
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
      adminAccessToken: null,
      recoveryCode: null,
      wasCreated: false,
    };
  }

  const token = createRegistryAdminAccessToken();
  const tokenHash = hashRegistryAdminAccessToken(token);

  const recovery = createRegistryRecoveryCode();
  const recoveryHash = hashRegistryRecoveryCode(recovery);

  const profile = opts.organizationProfile;
  const orgName = profile?.organizationName || opts.organizationName || 'My Organization';
  const hasProfile = Boolean(profile?.organizationName && profile?.buyerContactEmail);
  const now = new Date().toISOString();

  const registry = createOrganizationRegistry(
    {
      purchaseId: opts.purchaseId,
      organizationName: orgName,
      buyerEmail: opts.buyerEmail,
      adminAccessTokenHash: tokenHash,
      recoveryCodeHash: recoveryHash,
      stripeCustomerId: opts.stripeCustomerId,
      stripeSubscriptionId: opts.stripeSubscriptionId,
      maxPassports: DEFAULT_MAX_PASSPORTS,
      organizationWebsite: profile?.organizationWebsite ?? null,
      organizationCountry: profile?.organizationCountry ?? null,
      organizationIndustry: profile?.organizationIndustry ?? null,
      organizationSize: profile?.organizationSize ?? null,
      organizationUseCase: profile?.organizationUseCase ?? null,
      buyerContactName: profile?.buyerContactName ?? null,
      buyerContactEmail: profile?.buyerContactEmail ?? null,
      buyerContactRole: profile?.buyerContactRole ?? null,
      profileCompletedAt: hasProfile ? now : null,
    },
    database,
  );

  const entitlement = createRegistryEntitlement(
    registry.registryId,
    opts.purchaseId,
    DEFAULT_MAX_PASSPORTS,
    database,
  );

  recordAdminAccessEvent(registry.registryId, 'admin_token_created', { reason: 'registry_creation' }, database);
  recordAdminAccessEvent(registry.registryId, 'recovery_code_created', { reason: 'registry_creation' }, database);

  return { registry, entitlement, adminAccessToken: token, recoveryCode: recovery, wasCreated: true };
}

export interface RotateRegistryAdminTokenOptions {
  registryId: string;
  currentAccessToken?: string;
  recoveryCode?: string;
  buyerContactEmail?: string;
  reason?: string;
}

export function rotateRegistryAdminToken(
  opts: RotateRegistryAdminTokenOptions,
  db?: Database.Database,
): RegistryAdminRecoveryResult | { error: string; code: string } {
  const database = db ?? getDb();
  const registry = getRegistryByRegistryId(opts.registryId, database);

  if (!registry) return { error: 'Registry not found', code: 'REGISTRY_NOT_FOUND' };

  // Verify authorization: current token OR recovery code
  let authorized = false;
  let viaRecovery = false;

  if (opts.currentAccessToken && registry.adminAccessTokenHash) {
    authorized = verifyRegistryAdminAccessToken(opts.currentAccessToken, registry.adminAccessTokenHash);
  }

  if (!authorized && opts.recoveryCode && registry.recoveryCodeHash) {
    const codeValid = verifyRegistryRecoveryCode(opts.recoveryCode, registry.recoveryCodeHash);
    if (codeValid) {
      // Also verify buyer email if provided
      if (opts.buyerContactEmail) {
        const storedEmail = registry.buyerContactEmail || registry.buyerEmail;
        const emailMatch = storedEmail
          ? storedEmail.toLowerCase() === opts.buyerContactEmail.toLowerCase()
          : false;
        if (!emailMatch) {
          recordAdminAccessEvent(registry.registryId, 'recovery_failed', { reason: 'email_mismatch' }, database);
          return { error: 'Buyer contact email does not match', code: 'REGISTRY_RECOVERY_EMAIL_MISMATCH' };
        }
      }
      authorized = true;
      viaRecovery = true;
    }
  }

  if (!authorized) {
    recordAdminAccessEvent(registry.registryId, 'recovery_failed', { reason: 'invalid_credentials' }, database);
    return { error: 'Access denied', code: 'REGISTRY_ACCESS_DENIED' };
  }

  // Generate new token and recovery code
  const newToken = createRegistryAdminAccessToken();
  const newTokenHash = hashRegistryAdminAccessToken(newToken);
  const newRecovery = createRegistryRecoveryCode();
  const newRecoveryHash = hashRegistryRecoveryCode(newRecovery);

  const now = new Date().toISOString();

  updateRegistryAdminToken(opts.registryId, newTokenHash, database);
  if (viaRecovery) {
    markRecoveryCodeUsed(opts.registryId, database);
  }
  updateRegistryRecoveryCode(opts.registryId, newRecoveryHash, database);
  revokeRegistryAdminSessions(opts.registryId, database);
  recordAdminAccessEvent(
    opts.registryId,
    viaRecovery ? 'recovery_code_used' : 'admin_token_rotated',
    { reason: opts.reason ?? 'rotation' },
    database,
  );
  recordAdminAccessEvent(opts.registryId, 'recovery_code_rotated', { reason: 'post_rotation' }, database);

  const baseUrl = process.env.NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL || 'http://localhost:3000';
  const adminUrl = `${baseUrl}/registry/admin?registry_id=${encodeURIComponent(opts.registryId)}&access_token=${encodeURIComponent(newToken)}`;

  return {
    registryId: opts.registryId,
    newAccessToken: newToken,
    newRecoveryCode: newRecovery,
    adminUrl,
    rotatedAt: now,
  };
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
