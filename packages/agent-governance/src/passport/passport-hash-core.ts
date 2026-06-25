import type { AgentGovernanceLevel } from './governance-level.js';
import type { AutonomyLevel, RiskTier } from '../enrollment/enrollment-contracts.js';
import type { AgentPassportId } from './passport-id.js';

export interface PassportHashableCore {
  readonly passportId: AgentPassportId;
  readonly agentName: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly purpose: string;
  readonly governanceLevel: AgentGovernanceLevel;
  readonly riskTier: RiskTier;
  readonly autonomyLevel: AutonomyLevel;
  readonly jurisdiction: string;
  readonly constitutionVersion: string;
  readonly constitutionHash: string;
  readonly policyManifestVersion: string;
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
    governanceLevel: passport.governanceLevel,
    riskTier: passport.riskTier,
    autonomyLevel: passport.autonomyLevel,
    jurisdiction: passport.jurisdiction,
    constitutionVersion: passport.constitutionVersion,
    constitutionHash: passport.constitutionHash,
    policyManifestVersion: passport.policyManifestVersion,
    policyManifestHash: passport.policyManifestHash,
    issuedAt: passport.issuedAt,
    issuer: passport.issuer,
  };
}
