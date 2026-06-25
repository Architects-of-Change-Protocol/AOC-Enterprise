import type { NextRequest } from 'next/server';
import type Database from 'better-sqlite3';
import { getRegistryByRegistryId, getRegistryAdminSession } from './organization-registry-repository.js';
import { verifyRegistryAdminAccessToken } from './registry-access-token.js';
import { createHash } from 'crypto';

export type AdminAccessResult =
  | { ok: true; registryId: string; via: 'token' | 'session' }
  | { ok: false; errorCode: string };

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyRegistryAdminAccess(opts: {
  registryId: string;
  accessToken?: string | null;
  sessionToken?: string | null;
  db?: Database.Database;
}): AdminAccessResult {
  const registry = getRegistryByRegistryId(opts.registryId, opts.db);
  if (!registry) return { ok: false, errorCode: 'REGISTRY_NOT_FOUND' };

  if (opts.accessToken && registry.adminAccessTokenHash) {
    if (verifyRegistryAdminAccessToken(opts.accessToken, registry.adminAccessTokenHash)) {
      return { ok: true, registryId: opts.registryId, via: 'token' };
    }
  }

  if (opts.sessionToken) {
    const tokenHash = hashSessionToken(opts.sessionToken);
    const session = getRegistryAdminSession(tokenHash, opts.db);
    if (
      session &&
      session.registry_id === opts.registryId &&
      !session.revoked_at &&
      new Date(session.expires_at) > new Date()
    ) {
      return { ok: true, registryId: opts.registryId, via: 'session' };
    }
  }

  return { ok: false, errorCode: 'REGISTRY_ACCESS_DENIED' };
}

export function resolveAdminAccessFromRequest(
  registryId: string,
  request: NextRequest,
  db?: Database.Database,
): AdminAccessResult {
  const url = new URL(request.url);
  const accessToken = url.searchParams.get('access_token') ?? undefined;
  const sessionCookie = request.cookies.get('aoc_registry_admin_session')?.value ?? undefined;
  return verifyRegistryAdminAccess({ registryId, accessToken, sessionToken: sessionCookie, db });
}

export function requireRegistryAdminAccess(
  registryId: string,
  request: NextRequest,
  db?: Database.Database,
): AdminAccessResult {
  return resolveAdminAccessFromRequest(registryId, request, db);
}
