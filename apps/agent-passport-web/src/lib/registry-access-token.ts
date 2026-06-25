import { createHash, randomBytes } from 'crypto';

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
  // Constant-time comparison to prevent timing attacks
  if (hash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}
