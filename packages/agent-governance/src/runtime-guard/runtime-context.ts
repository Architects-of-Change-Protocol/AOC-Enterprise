import type { AgentPassport } from '../passport/passport-contracts.js';
import type { AgentRuntimeSeal } from '../runtime-seal/runtime-seal-contracts.js';
import type { AgentPolicyManifest } from '../policy-manifest/manifest-contracts.js';
import type { AgentRuntimeActionRequest } from './runtime-action.js';
import type { RiskTier } from '../enrollment/enrollment-contracts.js';

export interface EvaluateAgentRuntimeGuardOptions {
  /** Allow passports in 'issued' status (not yet activated). Default: false */
  readonly allowIssuedPassport?: boolean;
  /** Require a valid runtime seal. Default: true */
  readonly requireRuntimeSeal?: boolean;
  /** Deny any tool not explicitly listed in toolAccess. Default: true */
  readonly strictToolAccess?: boolean;
  /** Deny any data category not in dataAccess. Default: true */
  readonly strictDataAccess?: boolean;
  /** Risk tiers that require human approval. Default: ['critical'] */
  readonly humanApprovalRiskTiers?: readonly RiskTier[];
  /** How to handle unknown actions. Default: 'require_human_approval' */
  readonly unknownActionMode?: 'deny' | 'require_human_approval';
}

export interface EvaluateAgentRuntimeGuardInput {
  readonly request: AgentRuntimeActionRequest;
  readonly passport: AgentPassport;
  readonly runtimeSeal: AgentRuntimeSeal | null | undefined;
  readonly policyManifest: AgentPolicyManifest;
  readonly options?: EvaluateAgentRuntimeGuardOptions;
}
