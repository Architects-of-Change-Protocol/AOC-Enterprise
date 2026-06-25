import type { AgentPassportId } from '../passport/passport-id.js';
import type { AgentPassportSignature } from '../signing/signer-port.js';

export interface AgentRuntimeSeal {
  readonly passportId: AgentPassportId;
  readonly passportHash: string;
  readonly constitutionHash: string;
  readonly policyManifestHash: string;
  readonly issuer: string;
  readonly statusCheckUrl: string;
  readonly issuedAt: string;
  readonly signature: AgentPassportSignature;
}

export interface AgentRuntimeSealVerificationResult {
  readonly valid: boolean;
  readonly reasonCodes: readonly string[];
}
