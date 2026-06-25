export type AgentRuntimeGuardOutcome = 'allow' | 'deny' | 'require_human_approval';

export type AgentRuntimeGuardReasonCode =
  | 'runtime_guard.allowed'
  | 'runtime_guard.denied'
  | 'runtime_guard.human_approval_required'
  | 'runtime_guard.missing_runtime_seal'
  | 'runtime_guard.invalid_runtime_seal'
  | 'runtime_guard.invalid_passport'
  | 'runtime_guard.passport_not_active'
  | 'runtime_guard.passport_revoked'
  | 'runtime_guard.passport_expired'
  | 'runtime_guard.action_prohibited'
  | 'runtime_guard.tool_not_allowed'
  | 'runtime_guard.data_access_not_allowed'
  | 'runtime_guard.action_unknown'
  | 'runtime_guard.policy_manifest_missing'
  | 'runtime_guard.policy_manifest_mismatch'
  | 'runtime_guard.high_risk_requires_approval';

export interface AgentRuntimeGuardDecision {
  readonly decisionId: string;
  readonly requestId: string;
  readonly passportId: string;
  readonly outcome: AgentRuntimeGuardOutcome;
  readonly reasonCodes: readonly AgentRuntimeGuardReasonCode[];
  readonly requiredControls?: readonly string[];
  readonly evaluatedAt: string;
  readonly policyManifestHash?: string;
  readonly constitutionHash?: string;
  readonly passportHash?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentRuntimeGuardEnforcementResult {
  readonly decision: AgentRuntimeGuardDecision;
  readonly allowed: boolean;
  readonly requiresHumanApproval: boolean;
  readonly blocked: boolean;
}
