export type AuthorityEdgeType =
  | 'owns'
  | 'employs'
  | 'assigns_role'
  | 'grants_authority'
  | 'delegates_to'
  | 'acts_on_behalf_of'
  | 'issues_passport'
  | 'issues_capability'
  | 'revokes'
  | 'supervises'
  | 'approves';

export type AuthorityEdgeStatus = 'active' | 'expired' | 'suspended' | 'revoked';

export interface AuthorityEdge {
  readonly id: string;
  readonly type: AuthorityEdgeType;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly trustDomainId: string;
  readonly status: AuthorityEdgeStatus;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
