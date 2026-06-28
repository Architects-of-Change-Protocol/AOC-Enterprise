import type { PublicIssuerMetadata } from './issuer-config.js';

export type RegistryExportType =
  | 'registry_inventory_csv'
  | 'registry_governance_json'
  | 'registry_evidence_bundle_json'
  | 'registry_governance_report_markdown'
  | 'registry_governance_report_html';

export type RegistryExportFormat = 'csv' | 'json' | 'markdown' | 'html';

export type RegistryStanding =
  | 'good_standing'
  | 'attention_required'
  | 'capacity_exhausted'
  | 'inactive';

export interface RegistryExportArtifactRecord {
  id: string;
  exportId: string;
  registryId: string;
  exportType: RegistryExportType;
  format: RegistryExportFormat;
  filename: string;
  contentType: string;
  contentText: string;
  checksumSha256: string;
  generatedBy: 'aoc_agent_passport';
  generatedAt: string;
  createdAt: string;
}

export interface RegistryExportGenerationResult {
  artifact: RegistryExportArtifactRecord;
  downloadUrl: string;
}

// ---------------------------------------------------------------------------
// Export content shapes
// ---------------------------------------------------------------------------

export interface RegistryGovernanceJsonExport {
  exportType: 'registry_governance_json';
  generatedAt: string;
  generatedBy: 'aoc_agent_passport';
  registry: {
    registryId: string;
    organizationName: string;
    registryStatus: string;
    governanceLevel: string;
    maxPassports: number;
    issuedPassports: number;
    remainingPassports: number;
    billingStatus?: string;
    operationalState?: string;
  };
  governanceSummary: {
    totalAgents: number;
    activeAgents: number;
    revokedAgents: number;
    expiredAgents: number;
    runtimeGuardReadyAgents: number;
    publicVerificationCoverage: number;
    capacityUtilizationPercent: number;
    registryStanding: RegistryStanding;
  };
  passports: Array<{
    passportId: string;
    agentName: string;
    agentOwner: string | null;
    status: string;
    governanceStatus: string | null;
    runtimeGuardReady: boolean;
    issuedAt: string | null;
    publicPassportUrl: string;
    publicVerificationUrl: string;
  }>;
  limitations: string[];
}

export interface RegistryEvidenceBundleExport {
  exportType: 'registry_evidence_bundle_json';
  generatedAt: string;
  generatedBy: 'aoc_agent_passport';
  registry: {
    registryId: string;
    organizationName: string;
    registryStatus: string;
    governanceLevel: string;
    tier: 'organization_agent_registry';
    billingStatus?: string;
    operationalState?: string;
    subscriptionCurrentPeriodEnd?: string | null;
  };
  entitlement: {
    maxQuantity: number;
    usedQuantity: number;
    remainingQuantity: number;
    status: string;
  };
  issuer: PublicIssuerMetadata;
  evidence: {
    passportCount: number;
    passportVerificationLinks: Array<{
      passportId: string;
      publicVerificationUrl: string;
    }>;
    runtimeGuardReadiness: {
      readyCount: number;
      notReadyCount: number;
      readyPercent: number;
    };
    governanceStatusBreakdown: Record<string, number>;
    publicVerificationCoverage: {
      totalPassports: number;
      verificationLinksAvailable: number;
      coveragePercent: number;
    };
  };
  passports: Array<{
    passportId: string;
    agentName: string;
    agentOwner: string | null;
    status: string;
    governanceStatus: string | null;
    runtimeGuardReady: boolean;
    registryId: string;
    publicPassportUrl: string;
    publicVerificationUrl: string;
  }>;
  securityNotes: string[];
  limitations: string[];
}

// Lightweight metadata returned in list responses (no content_text)
export interface RegistryExportArtifactMeta {
  exportId: string;
  exportType: RegistryExportType;
  filename: string;
  contentType: string;
  checksumSha256: string;
  generatedAt: string;
}
