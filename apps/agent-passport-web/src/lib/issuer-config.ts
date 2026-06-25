/**
 * Passport issuer configuration.
 *
 * In development / non-production environments a safe fallback is used so the
 * app runs without any env setup.  In production the env vars MUST be set or
 * the server will throw at startup.
 *
 * Required env vars for production:
 *   PASSPORT_ISSUER_ID          e.g. "aoc-issuer-prod"
 *   PASSPORT_ISSUER_NAME        e.g. "AOC Governance Authority"
 *   PASSPORT_ISSUER_KEY_ID      e.g. "hmac-key-2024-01"
 *   PASSPORT_SIGNING_SECRET     high-entropy random string (min 32 chars)
 */

export interface PassportIssuerConfig {
  readonly issuerId: string;
  readonly issuerName: string;
  readonly issuerKeyId: string;
  readonly signingAlgorithm: 'HMAC-SHA256';
  readonly signingSecret: string;
  readonly isDevelopmentFallback: boolean;
}

export interface PublicIssuerMetadata {
  readonly issuerId: string;
  readonly issuerName: string;
  readonly issuerKeyId: string;
  readonly signingAlgorithm: 'HMAC-SHA256';
}

let _cached: PassportIssuerConfig | null = null;

export function getPassportIssuerConfig(): PassportIssuerConfig {
  if (_cached) return _cached;

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development fallback — safe, obvious, never mistaken for real keys
    _cached = {
      issuerId: process.env.PASSPORT_ISSUER_ID ?? 'dev-issuer',
      issuerName: process.env.PASSPORT_ISSUER_NAME ?? 'AOC Dev Issuer',
      issuerKeyId: process.env.PASSPORT_ISSUER_KEY_ID ?? 'dev-hmac-key',
      signingAlgorithm: 'HMAC-SHA256',
      signingSecret:
        process.env.PASSPORT_SIGNING_SECRET ?? 'dev-only-agent-passport-secret',
      isDevelopmentFallback: !process.env.PASSPORT_SIGNING_SECRET,
    };
    return _cached;
  }

  // Production: all vars required
  const required = {
    issuerId: process.env.PASSPORT_ISSUER_ID,
    issuerName: process.env.PASSPORT_ISSUER_NAME,
    issuerKeyId: process.env.PASSPORT_ISSUER_KEY_ID,
    signingSecret: process.env.PASSPORT_SIGNING_SECRET,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => {
      const envMap: Record<string, string> = {
        issuerId: 'PASSPORT_ISSUER_ID',
        issuerName: 'PASSPORT_ISSUER_NAME',
        issuerKeyId: 'PASSPORT_ISSUER_KEY_ID',
        signingSecret: 'PASSPORT_SIGNING_SECRET',
      };
      return envMap[k];
    });

  if (missing.length > 0) {
    throw new Error(
      `[PassportIssuerConfig] Missing required production env vars: ${missing.join(', ')}`,
    );
  }

  _cached = {
    issuerId: required.issuerId!,
    issuerName: required.issuerName!,
    issuerKeyId: required.issuerKeyId!,
    signingAlgorithm: 'HMAC-SHA256',
    signingSecret: required.signingSecret!,
    isDevelopmentFallback: false,
  };

  return _cached;
}

export function getPublicIssuerMetadata(): PublicIssuerMetadata {
  const config = getPassportIssuerConfig();
  return {
    issuerId: config.issuerId,
    issuerName: config.issuerName,
    issuerKeyId: config.issuerKeyId,
    signingAlgorithm: config.signingAlgorithm,
  };
}

/** For tests: reset the cached config so env changes take effect. */
export function _resetIssuerConfigCache(): void {
  _cached = null;
}
