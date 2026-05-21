export const DELEGATION_REASON_CODES = {
  DELEGATION_SIGNATURE_INVALID: 'delegation_signature_invalid',
  DELEGATION_KEY_UNTRUSTED: 'delegation_key_untrusted',
  DELEGATION_EXPIRED: 'delegation_expired',
  DELEGATION_INVALID: 'delegation_invalid',
  DELEGATION_REVOKED: 'delegation_revoked',
  DELEGATION_SCOPE_MISMATCH: 'delegation_scope_mismatch',
  DELEGATION_POLICY_DENIED: 'delegation_policy_denied',
  DELEGATION_ISSUED: 'delegation_issued',
  DELEGATION_VALIDATED: 'delegation_validated',
  DELEGATION_DENIED: 'delegation_denied',
} as const;

export type DelegationReasonCode = typeof DELEGATION_REASON_CODES[keyof typeof DELEGATION_REASON_CODES];
