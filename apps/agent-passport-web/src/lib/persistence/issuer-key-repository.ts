export type IssuerKeyStatus = 'active' | 'retired' | 'revoked';

export interface IssuerPublicKeyRecord {
  readonly issuerId: string;
  readonly keyId: string;
  readonly algorithm: string;
  readonly publicKeyPem: string;
  readonly status: IssuerKeyStatus;
  readonly createdAt: string;
  readonly activatedAt?: string;
  readonly retiredAt?: string;
  readonly revokedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RegisterIssuerKeyInput {
  readonly issuerId: string;
  readonly keyId: string;
  readonly algorithm: string;
  readonly publicKeyPem: string;
  readonly status?: IssuerKeyStatus;
  readonly createdAt?: string;
  readonly activatedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface RetireIssuerKeyInput { readonly issuerId: string; readonly keyId: string; readonly reason?: string; readonly actorId?: string; readonly occurredAt?: string; }
export interface RevokeIssuerKeyInput { readonly issuerId: string; readonly keyId: string; readonly reason?: string; readonly actorId?: string; readonly occurredAt?: string; }

export interface IssuerKeyRepository {
  registerKey(input: RegisterIssuerKeyInput): Promise<void>;
  getActiveKey(issuerId: string): Promise<IssuerPublicKeyRecord | undefined>;
  getKey(issuerId: string, keyId: string): Promise<IssuerPublicKeyRecord | undefined>;
  listKeys(issuerId: string): Promise<IssuerPublicKeyRecord[]>;
  retireKey(input: RetireIssuerKeyInput): Promise<void>;
  revokeKey(input: RevokeIssuerKeyInput): Promise<void>;
}
