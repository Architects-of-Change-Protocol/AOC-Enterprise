import type { ExternalAgentType } from './external-agent-descriptor.js';

export type ExternalTrustIssuerStatus = 'trusted' | 'limited' | 'unknown' | 'suspended' | 'revoked';

export interface ExternalTrustIssuer {
  readonly id: string;

  readonly displayName: string;

  readonly status: ExternalTrustIssuerStatus;

  readonly externalTrustDomainId?: string;

  readonly acceptedByTrustDomainId: string;

  readonly allowedAgentTypes: readonly ExternalAgentType[];

  readonly allowedCapabilities: readonly string[];
  readonly allowedResourceScopes: readonly string[];

  readonly requiresApproval: boolean;

  readonly maxVisaTtlMinutes: number;

  readonly metadata?: Readonly<Record<string, unknown>>;

  readonly createdAt: string;
  readonly updatedAt: string;
}
