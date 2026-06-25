import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const TOKEN_BYTE_LENGTH = 32;

export function createRegistryAdminAccessToken(): string {
  return randomBytes(TOKEN_BYTE_LENGTH).toString('hex');
}

export function hashRegistryAdminAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyRegistryAdminAccessToken(
  token: string,
  storedHash: string,
): boolean {
  const hash = hashRegistryAdminAccessToken(token);
  if (hash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

export function createRegistryRecoveryCode(): string {
  const bytes = randomBytes(8);
  const hex = bytes.toString('hex').toUpperCase();
  return `AOC-RECOVERY-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

export function hashRegistryRecoveryCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function verifyRegistryRecoveryCode(code: string, storedHash: string): boolean {
  const hash = hashRegistryRecoveryCode(code);
  if (hash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}
