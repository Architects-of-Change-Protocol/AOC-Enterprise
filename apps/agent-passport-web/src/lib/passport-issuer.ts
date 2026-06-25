/**
 * Passport signing and verification using HMAC-SHA256.
 *
 * Canonical JSON approach: keys are sorted alphabetically and the 'signature'
 * field is excluded before computing the HMAC.  This ensures the signature is
 * deterministic and independent of serialisation order.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { getPassportIssuerConfig } from './issuer-config.js';

export interface PassportSignatureResult {
  readonly signature: string;
  readonly issuerKeyId: string;
  readonly issuer: string;
  readonly algorithm: 'HMAC-SHA256';
  readonly signedAt: string;
}

export interface PassportVerifyResult {
  readonly valid: boolean;
  readonly issuerKeyId: string;
  readonly issuer: string;
}

/**
 * Produce a canonical, deterministic JSON string from an object.
 * Keys are sorted recursively; the 'signature' top-level field is excluded.
 */
export function canonicalJson(obj: Record<string, unknown>): string {
  function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as object).sort()) {
        sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return value;
  }

  // Exclude 'signature' before signing
  const { signature: _sig, ...rest } = obj;
  void _sig; // intentionally excluded
  return JSON.stringify(sortKeys(rest));
}

function computeHmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

export function signAgentPassportPayload(
  payload: Record<string, unknown>,
): PassportSignatureResult {
  const config = getPassportIssuerConfig();
  const canonical = canonicalJson(payload);
  const signature = computeHmac(config.signingSecret, canonical);
  return {
    signature,
    issuerKeyId: config.issuerKeyId,
    issuer: config.issuerId,
    algorithm: 'HMAC-SHA256',
    signedAt: new Date().toISOString(),
  };
}

export function verifyAgentPassportPayload(
  payload: Record<string, unknown>,
  signature: string,
): PassportVerifyResult {
  const config = getPassportIssuerConfig();
  const canonical = canonicalJson(payload);
  const expected = computeHmac(config.signingSecret, canonical);

  // Constant-time comparison to prevent timing attacks
  let valid = false;
  try {
    valid = timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    valid = false;
  }

  return {
    valid,
    issuerKeyId: config.issuerKeyId,
    issuer: config.issuerId,
  };
}
