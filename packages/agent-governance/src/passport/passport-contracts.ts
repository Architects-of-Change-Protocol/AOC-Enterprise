import type { AgentPassportId } from './passport-id.js';
import type { AgentPassportStatus } from './passport-status.js';
import type { AgentGovernanceLevel } from './governance-level.js';
import type { AutonomyLevel, RiskTier } from '../enrollment/enrollment-contracts.js';
import type { AgentPassportSignature } from '../signing/signer-port.js';
import type { AgentConstitution } from '../constitution/constitution-contracts.js';
import type { AgentPolicyManifest } from '../policy-manifest/manifest-contracts.js';
import type { AgentRuntimeSeal } from '../runtime-seal/runtime-seal-contracts.js';
import type { AgentPassportEvent } from '../events/passport-events.js';

export interface AgentPassport {
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
  readonly constitutionVersion: string;
  readonly constitutionHash: string;
  readonly policyManifestVersion: string;
  readonly policyManifestHash: string;
  readonly passportHash: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly lastVerifiedAt?: string;
  readonly issuer: string;
  readonly signature: AgentPassportSignature;
  readonly verificationUrl: string;
  readonly qrPayload: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface IssuedAgentPassportBundle {
  readonly passport: AgentPassport;
  readonly constitution: AgentConstitution;
  readonly policyManifest: AgentPolicyManifest;
  readonly runtimeSeal: AgentRuntimeSeal;
  readonly events: readonly AgentPassportEvent[];
}

export interface AgentPassportPublicVerificationPayload {
  readonly passportId: AgentPassportId;
  readonly agentName: string;
  readonly ownerName: string;
  readonly purpose: string;
  readonly status: AgentPassportStatus;
  readonly governanceLevel: AgentGovernanceLevel;
  readonly riskTier: RiskTier;
  readonly autonomyLevel: AutonomyLevel;
  readonly jurisdiction: string;
  readonly constitutionHash: string;
  readonly policyManifestHash: string;
  readonly passportHash: string;
  readonly issuer: string;
  readonly issuedAt: string;
  readonly lastVerifiedAt?: string;
  readonly verificationUrl: string;
}

export interface AgentPassportVerificationResult {
  readonly valid: boolean;
  readonly reasonCodes: readonly string[];
  readonly verifiedAt: string;
}
