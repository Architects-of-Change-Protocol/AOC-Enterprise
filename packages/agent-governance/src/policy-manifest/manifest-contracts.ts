import type { AutonomyLevel, RiskTier } from '../enrollment/enrollment-contracts.js';

export type AuditLevel = 'minimal' | 'standard' | 'enhanced';

export interface AuditConfig {
  readonly required: boolean;
  readonly retentionDays?: number;
  readonly level?: AuditLevel;
}

export interface AgentPolicyManifest {
  readonly manifestId: string;
  readonly passportId: string;
  readonly version: string;
  readonly allowedActions: readonly string[];
  readonly prohibitedActions: readonly string[];
  readonly dataAccess: readonly string[];
  readonly toolAccess: readonly string[];
  readonly humanApprovalRequiredFor: readonly string[];
  readonly riskTier: RiskTier;
  readonly autonomyLevel: AutonomyLevel;
  readonly audit: AuditConfig;
  readonly createdAt: string;
}
