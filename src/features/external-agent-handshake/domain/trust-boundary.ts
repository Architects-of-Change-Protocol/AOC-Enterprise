import type { ExternalAgentType } from './external-agent-descriptor.js';

export type TrustBoundaryStatus = 'active' | 'suspended' | 'revoked';

export type DataBoundaryDirection = 'inbound' | 'outbound' | 'bidirectional';

export interface DataBoundaryRule {
  readonly id: string;

  readonly allowedDataDomains: readonly string[];
  readonly prohibitedDataDomains: readonly string[];

  readonly allowedDirections: readonly DataBoundaryDirection[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TrustBoundary {
  readonly id: string;

  readonly localTrustDomainId: string;
  readonly externalTrustDomainId?: string;
  readonly externalIssuerId?: string;

  readonly status: TrustBoundaryStatus;

  readonly allowedExternalIssuerIds: readonly string[];
  readonly allowedAgentTypes: readonly ExternalAgentType[];

  readonly allowedCapabilities: readonly string[];
  readonly allowedResourceScopes: readonly string[];

  readonly prohibitedCapabilities: readonly string[];
  readonly prohibitedActions: readonly string[];
  readonly prohibitedResourceScopes: readonly string[];

  readonly requiresApprovalForUnknownIssuers: boolean;
  readonly requiresApprovalForHighRisk: boolean;

  readonly maxVisaTtlMinutes: number;

  readonly dataBoundaries: readonly DataBoundaryRule[];

  readonly createdAt: string;
  readonly updatedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
