import type { AgentPassport } from '../passport/passport-contracts.js';
import type { AgentRuntimeSeal } from '../runtime-seal/runtime-seal-contracts.js';
import type { AgentPolicyManifest } from '../policy-manifest/manifest-contracts.js';
import type { AgentRuntimeActionRequest } from './runtime-action.js';
import type { RiskTier } from '../enrollment/enrollment-contracts.js';

export interface EvaluateAgentRuntimeGuardOptions {
  readonly allowIssuedPassport?: boolean;
  readonly requireRuntimeSeal?: boolean;
  readonly strictToolAccess?: boolean;
  readonly strictDataAccess?: boolean;
  readonly humanApprovalRiskTiers?: readonly RiskTier[];
  readonly unknownActionMode?: 'deny' | 'require_human_approval';
}

export interface EvaluateAgentRuntimeGuardInput {
  readonly request: AgentRuntimeActionRequest;
  readonly passport: AgentPassport;
  readonly runtimeSeal: AgentRuntimeSeal | null | undefined;
  readonly policyManifest: AgentPolicyManifest;
  readonly options?: EvaluateAgentRuntimeGuardOptions;
}
