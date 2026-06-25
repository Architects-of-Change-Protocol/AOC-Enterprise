import type { AgentPassportStatus } from './passport-status.js';
import type { AgentGovernanceLevel } from './governance-level.js';
import type { AutonomyLevel, RiskTier } from '../enrollment/enrollment-contracts.js';
import type { AgentPassportId } from './passport-id.js';

export interface PassportHashableCore {
  readonly passportId: AgentPassportId;
  readonly agentName: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly purpose: string;
  readonly status: AgentPassportStatus;
  readonly governanceLevel: AgentGovernanceLevel;
  readonly riskTier: RiskTier;
  readonly autonomyLevel: AutonomyLevel;
  readonly jurisdiction: string;
  readonly constitutionHash: string;
  readonly policyManifestHash: string;
  readonly issuedAt: string;
  readonly issuer: string;
}

export function extractPassportHashableCore(passport: PassportHashableCore): PassportHashableCore {
  return {
    passportId: passport.passportId,
    agentName: passport.agentName,
    ownerId: passport.ownerId,
    ownerName: passport.ownerName,
    purpose: passport.purpose,
    status: passport.status,
    governanceLevel: passport.governanceLevel,
    riskTier: passport.riskTier,
    autonomyLevel: passport.autonomyLevel,
    jurisdiction: passport.jurisdiction,
    constitutionHash: passport.constitutionHash,
    policyManifestHash: passport.policyManifestHash,
    issuedAt: passport.issuedAt,
    issuer: passport.issuer,
  };
}
