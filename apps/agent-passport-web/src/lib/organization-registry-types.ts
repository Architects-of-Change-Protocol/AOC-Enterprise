export type RegistryStatus = 'active' | 'pending' | 'suspended' | 'canceled';
export type GovernanceLevel = 'basic' | 'governed' | 'organization';
export type EntitlementStatus = 'active' | 'exhausted' | 'suspended' | 'canceled';
export type RegistryPassportStatus = 'active' | 'revoked' | 'expired';

export interface AgentOrganizationRegistryRecord {
  id: string;
  registryId: string;
  purchaseId: string;
  tier: 'organization_agent_registry';
  organizationName: string;
  buyerEmail: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  registryStatus: RegistryStatus;
  governanceLevel: GovernanceLevel;
  maxPassports: number;
  issuedPassports: number;
  remainingPassports: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  adminAccessTokenHash: string | null;
  adminAccessTokenCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRegistryEntitlementRecord {
  id: string;
  registryId: string;
  purchaseId: string;
  entitlementType: 'agent_passport_capacity';
  maxQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  status: EntitlementStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRegistryPassportRecord {
  id: string;
  registryId: string;
  passportId: string;
  purchaseId: string | null;
  agentName: string;
  agentOwner: string | null;
  status: RegistryPassportStatus;
  governanceStatus: string | null;
  runtimeGuardReady: boolean;
  createdAt: string;
  updatedAt: string;
}
