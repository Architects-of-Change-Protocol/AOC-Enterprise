export type ExternalCapabilityRequestStatus = 'requested' | 'allowed' | 'limited' | 'denied' | 'requires_approval';

export type ExternalCapabilityRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ExternalCapabilityRequest {
  readonly id: string;

  readonly externalAgentId: string;
  readonly handshakeRequestId: string;

  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];

  readonly requestedAt: string;

  readonly status: ExternalCapabilityRequestStatus;

  readonly riskLevel: ExternalCapabilityRiskLevel;

  readonly dataDomains?: readonly string[];

  readonly reasonCode?: string;
  readonly reason?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
