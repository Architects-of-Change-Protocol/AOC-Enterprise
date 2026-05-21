export const CLAIM_REASON_CODES = {
  CLAIM_SIGNATURE_INVALID: 'claim_signature_invalid',
  CLAIM_KEY_UNTRUSTED: 'claim_key_untrusted',
  CLAIM_EXPIRED: 'claim_expired',
  CLAIM_UNKNOWN: 'claim_unknown',
  CLAIM_REVOKED: 'claim_revoked',
  CLAIM_ACTOR_MISMATCH: 'claim_actor_mismatch',
  CLAIM_ORG_MISMATCH: 'claim_org_mismatch',
  CLAIM_TRUST_DOMAIN_MISMATCH: 'claim_trust_domain_mismatch',
  CLAIM_VERIFICATION_WINDOW_INVALID: 'claim_verification_window_invalid',
  CLAIM_ISSUED: 'claim_issued',
  CLAIM_VERIFIED: 'claim_verified',
  CLAIM_DENIED: 'claim_denied',
} as const;

export type ClaimReasonCode = typeof CLAIM_REASON_CODES[keyof typeof CLAIM_REASON_CODES];
