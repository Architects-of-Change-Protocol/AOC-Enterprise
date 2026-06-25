import type { NextRequest } from 'next/server';
import type Database from 'better-sqlite3';
import { getBuyerAccountFromSessionToken, BUYER_ACCOUNT_SESSION_COOKIE } from './buyer-account-session.js';
import { getRegistryMembership } from './registry-membership-repository.js';
import { getRegistryRolePermissions, roleHasPermission } from './registry-role-policy.js';
import { resolveAdminAccessFromRequest } from './registry-admin-access.js';
import type { BuyerAccountPublic, RegistryAccessContext, RegistryPermission } from './buyer-account-types.js';

export function resolveBuyerAccountFromRequest(
  request: NextRequest,
  db?: Database.Database,
): BuyerAccountPublic | null {
  const sessionToken = request.cookies.get(BUYER_ACCOUNT_SESSION_COOKIE)?.value;
  if (!sessionToken) return null;
  return getBuyerAccountFromSessionToken(sessionToken, db);
}

export function resolveRegistryAccessFromRequest(opts: {
  registryId: string;
  request: NextRequest;
  requiredPermission?: RegistryPermission;
  db?: Database.Database;
}): RegistryAccessContext | null {
  const { registryId, request, requiredPermission, db } = opts;

  // 1. Try buyer account session
  const account = resolveBuyerAccountFromRequest(request, db);
  if (account) {
    const membership = getRegistryMembership(registryId, account.accountId, db);
    if (membership && membership.status === 'active') {
      const permissions = getRegistryRolePermissions(membership.role);
      if (!requiredPermission || roleHasPermission(membership.role, requiredPermission)) {
        return {
          registryId,
          accessMode: 'buyer_account',
          account,
          membership: { role: membership.role, permissions },
        };
      }
      // Has account membership but lacks permission
      return null;
    }
    // Has account but no active membership - fall through to legacy
  }

  // 2. Try legacy registry admin session / token
  const legacyAccess = resolveAdminAccessFromRequest(registryId, request, db);
  if (legacyAccess.ok) {
    const accessMode = legacyAccess.via === 'session' ? 'registry_admin_session' : 'registry_access_token';
    return {
      registryId,
      accessMode,
      legacyAccess: true,
      // Legacy access is treated as owner-equivalent
      membership: {
        role: 'owner',
        permissions: getRegistryRolePermissions('owner'),
      },
    };
  }

  return null;
}

export function requireRegistryAccess(opts: {
  registryId: string;
  request: NextRequest;
  requiredPermission: RegistryPermission;
  db?: Database.Database;
}): RegistryAccessContext | null {
  return resolveRegistryAccessFromRequest(opts);
}
