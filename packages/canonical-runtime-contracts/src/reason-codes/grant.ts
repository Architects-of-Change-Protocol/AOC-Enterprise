export const GRANT_REASON_CODES = {
  GRANT_SIGNATURE_INVALID: 'grant_signature_invalid',
  GRANT_KEY_UNTRUSTED: 'grant_key_untrusted',
  GRANT_EXPIRED: 'grant_expired',
  GRANT_UNKNOWN: 'grant_unknown',
  GRANT_REVOKED: 'grant_revoked',
  GRANT_REPLAYED: 'grant_replayed',
  GRANT_SCOPE_MISMATCH: 'grant_scope_mismatch',
  GRANT_ISSUED: 'grant_issued',
  GRANT_VALIDATED: 'grant_validated',
  GRANT_CONSUMED: 'grant_consumed',
} as const;

export type GrantReasonCode = typeof GRANT_REASON_CODES[keyof typeof GRANT_REASON_CODES];
