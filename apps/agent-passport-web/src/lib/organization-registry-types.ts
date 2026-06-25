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
  // Profile fields
  organizationWebsite: string | null;
  organizationCountry: string | null;
  organizationIndustry: string | null;
  organizationSize: string | null;
  organizationUseCase: string | null;
  buyerContactName: string | null;
  buyerContactEmail: string | null;
  buyerContactRole: string | null;
  // Token/recovery metadata
  adminAccessTokenRotatedAt: string | null;
  adminAccessTokenLastUsedAt: string | null;
  recoveryCodeHash: string | null;
  recoveryCodeCreatedAt: string | null;
  recoveryCodeUsedAt: string | null;
  recoveryCodeRotatedAt: string | null;
  // Profile timestamps
  profileCompletedAt: string | null;
  profileUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationProfile = {
  organizationName: string;
  organizationWebsite?: string | null;
  organizationCountry?: string | null;
  organizationIndustry?: string | null;
  organizationSize?: string | null;
  organizationUseCase?: string | null;
  buyerContactName?: string | null;
  buyerContactEmail?: string | null;
  buyerContactRole?: string | null;
};

export type RegistryAdminRecoveryResult = {
  registryId: string;
  newAccessToken: string;
  newRecoveryCode: string;
  adminUrl: string;
  rotatedAt: string;
};

export type RegistryAdminAccessStatus = {
  registryId: string;
  hasRecoveryCode: boolean;
  recoveryCodeCreatedAt: string | null;
  recoveryCodeUsedAt: string | null;
  adminAccessTokenRotatedAt: string | null;
  adminAccessTokenLastUsedAt: string | null;
};

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
