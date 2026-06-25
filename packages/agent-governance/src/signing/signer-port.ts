export interface AgentPassportSignature {
  readonly algorithm: string;
  readonly keyId: string;
  readonly signature: string;
  readonly signedAt: string;
  readonly issuer: string;
}

export interface AgentPassportSignerPort {
  sign(payload: string): Promise<AgentPassportSignature>;
  verify(payload: string, signature: AgentPassportSignature): Promise<boolean>;
}
