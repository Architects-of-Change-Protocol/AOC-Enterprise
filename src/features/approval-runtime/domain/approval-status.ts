export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'cancelled'
  | 'superseded';

export type ApprovalProofStatus = 'valid' | 'expired' | 'revoked';
