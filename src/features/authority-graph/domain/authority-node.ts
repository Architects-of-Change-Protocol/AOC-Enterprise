export type AuthorityNodeType =
  | 'human'
  | 'organization'
  | 'agent'
  | 'system'
  | 'role'
  | 'trust_domain'
  | 'authority_grant'
  | 'delegation_grant';

export interface AuthorityNode {
  readonly id: string;
  readonly type: AuthorityNodeType;
  readonly label: string;
  readonly trustDomainId?: string;
  readonly actorId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
