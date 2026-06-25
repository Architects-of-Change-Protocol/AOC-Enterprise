import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function scryptAsync(password: string, salt: string, keylen: number, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N, r, p }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export async function hashBuyerPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = await scryptAsync(password, salt, KEY_BYTES, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString('hex')}`;
}

export async function verifyBuyerPassword(password: string, passwordHash: string): Promise<boolean> {
  const parts = passwordHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, storedHash] = parts;
  const hash = await scryptAsync(password, salt, KEY_BYTES, parseInt(N, 10), parseInt(r, 10), parseInt(p, 10));
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (hash.length !== storedBuf.length) return false;
  return timingSafeEqual(hash, storedBuf);
}

export function validateBuyerPassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!password || password.length < 10) {
    errors.push('Password must be at least 10 characters.');
  }
  if (password.length > 1000) {
    errors.push('Password is too long.');
  }
  return { valid: errors.length === 0, errors };
}
