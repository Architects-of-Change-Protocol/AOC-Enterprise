/**
 * Soberanía PMFreak Governance Request Intake v1 -- domain types.
 *
 * Runtime direction: PMFreak agent attempts an action -> PMFreak builds a
 * governance request (PMFreak Governance Request Client v1's vocabulary) ->
 * Soberanía Enterprise receives and evaluates the request -> Soberanía Enterprise
 * returns a governed decision -> PMFreak receives the decision.
 *
 * This module owns its own Soberanía-side compatibility DTOs. It never imports
 * from the PMFreak repo, never mutates PMFreak data, never executes a
 * PMFreak action, and never writes a decision back into PMFreak.
 */

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

export interface AocPMFreakGovernanceRequestIntakeDescriptor {
  readonly intakeId: string;
  readonly intakeName: string;
  readonly providerId: 'aoc';
  readonly consumerId: 'pmfreak';
  readonly version: 'v1';
  readonly mode: 'governance_request_intake';
  readonly runtimeDirection: 'pmfreak_consumes_aoc_governance';
  readonly productionMutationCapable: false;
  readonly pmfreakMutationCapable: false;
  readonly actionExecutionCapable: false;
  readonly capabilities: readonly string[];
  readonly forbiddenOperations: readonly string[];
  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type AocPMFreakGovernanceIntakeEnvironment = 'demo' | 'development' | 'staging' | 'production';

export type AocPMFreakGovernanceEvaluationMode = 'deterministic_local' | 'passport_runtime' | 'unsupported';

export type AocPMFreakGovernanceIntakeRequestMode = 'dry_run' | 'evaluate_only';

export type AocPMFreakGovernanceIntakeRedactionMode = 'none' | 'safe_demo' | 'strict';

export interface AocPMFreakGovernanceRequestIntakeConfig {
  readonly intakeId: string;
  readonly environment: AocPMFreakGovernanceIntakeEnvironment;
  readonly evaluationMode: AocPMFreakGovernanceEvaluationMode;

  readonly requestMode: AocPMFreakGovernanceIntakeRequestMode;

  readonly allowPMFreakMutations: false;
  readonly allowActionExecution: false;
  readonly allowDecisionWriteback: false;

  readonly timeoutMs?: number;
  readonly maxPayloadSizeKb?: number;

  readonly redactionMode: AocPMFreakGovernanceIntakeRedactionMode;

  readonly notes: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Loosened input shape for `createAocPMFreakGovernanceRequestIntakeConfig`.
 * `allowPMFreakMutations`/`allowActionExecution`/`allowDecisionWriteback`
 * are widened to `boolean` (the config type itself pins them to the literal
 * `false`) so the factory can detect -- and warn on -- a caller actually
 * requesting `true`, including a caller passing loosely-typed/external
 * config data rather than a value the type system already forbids.
 */
export type AocPMFreakGovernanceRequestIntakeConfigInput = Partial<Omit<AocPMFreakGovernanceRequestIntakeConfig, 'allowPMFreakMutations' | 'allowActionExecution' | 'allowDecisionWriteback'>> & {
  readonly allowPMFreakMutations?: boolean;
  readonly allowActionExecution?: boolean;
  readonly allowDecisionWriteback?: boolean;
};

// ---------------------------------------------------------------------------
// PMFreak governance request compatibility DTO (PMFreak Governance Request
// Client v1's request shape, mirrored here without importing the PMFreak repo)
// ---------------------------------------------------------------------------

export interface AocPMFreakGovernanceRequestActionAttempt {
  readonly actionAttemptId: string;
  readonly agentId: string;
  readonly agentRole: string;
  readonly passportId?: string;
  readonly projectId: string;
  readonly workspaceId?: string;
  readonly tenantId?: string;
  readonly customerId?: string;
  readonly actionId: string;
  readonly actionCategory: string;
  readonly actionTitle: string;
  readonly actionDescription?: string;
  readonly targetMilestoneId?: string;
  readonly targetTaskId?: string;
  readonly targetRiskId?: string;
  readonly targetChangeRequestId?: string;
  readonly status: string;
  readonly contextFlags: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly approvalReferenceIds: readonly string[];
  readonly sourceUpdatedAt?: string;
  readonly metadata: Record<string, unknown>;
}

export interface AocPMFreakGovernanceRequestProjectContext {
  readonly projectId: string;
  readonly workspaceId?: string;
  readonly tenantId?: string;
  readonly customerId?: string;
  readonly phase?: string;
  readonly status?: string;
}

export interface AocPMFreakGovernanceRequestAgentContext {
  readonly agentId: string;
  readonly agentRole: string;
  readonly passportId?: string;
}

export interface AocPMFreakGovernanceRequestActionContext {
  readonly actionId: string;
  readonly actionCategory: string;
  readonly actionTitle: string;
  readonly targetMilestoneId?: string;
  readonly targetTaskId?: string;
  readonly targetRiskId?: string;
  readonly targetChangeRequestId?: string;
  readonly contextFlags: readonly string[];
}

export interface AocPMFreakGovernanceRequestEvidenceContext {
  readonly evidenceReferenceIds: readonly string[];
  readonly providedEvidenceIds: readonly string[];
  readonly missingEvidenceIds: readonly string[];
}

export interface AocPMFreakGovernanceRequestApprovalContext {
  readonly approvalReferenceIds: readonly string[];
  readonly providedApprovalIds: readonly string[];
  readonly missingApprovalIds: readonly string[];
}

export type AocPMFreakGovernanceRequestRiskSeverity = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export interface AocPMFreakGovernanceRequestRiskContext {
  readonly riskIds: readonly string[];
  readonly maxSeverity?: AocPMFreakGovernanceRequestRiskSeverity;
}

export interface AocPMFreakGovernanceRequestBillingContext {
  readonly billingSensitive: boolean;
  readonly milestoneId?: string;
  readonly billingReviewReferenceIds: readonly string[];
}

export interface AocPMFreakGovernanceRequestPolicyContext {
  readonly requestedPolicyPackIds: readonly string[];
  readonly requestedJurisdictionPackIds: readonly string[];
}

export interface AocPMFreakGovernanceRequest {
  readonly requestId: string;
  readonly clientId: string;

  readonly providerId: 'pmfreak';
  readonly consumerOf: 'aoc';

  readonly requestMode: AocPMFreakGovernanceIntakeRequestMode;

  readonly actionAttempt: AocPMFreakGovernanceRequestActionAttempt;

  readonly projectContext: AocPMFreakGovernanceRequestProjectContext;
  readonly agentContext: AocPMFreakGovernanceRequestAgentContext;
  readonly actionContext: AocPMFreakGovernanceRequestActionContext;
  readonly evidenceContext: AocPMFreakGovernanceRequestEvidenceContext;
  readonly approvalContext: AocPMFreakGovernanceRequestApprovalContext;

  readonly riskContext?: AocPMFreakGovernanceRequestRiskContext;
  readonly billingContext?: AocPMFreakGovernanceRequestBillingContext;
  readonly policyContext?: AocPMFreakGovernanceRequestPolicyContext;

  readonly safeLabels: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// Soberanía governance response compatibility DTO
// ---------------------------------------------------------------------------

export type AocPMFreakGovernanceDecision =
  | 'allow'
  | 'deny'
  | 'hold'
  | 'require_evidence'
  | 'require_pm_approval'
  | 'require_customer_validation'
  | 'require_billing_review'
  | 'require_contract_review'
  | 'require_security_review'
  | 'require_executive_approval';

export type AocPMFreakGovernanceDecisionSeverity = 'success' | 'info' | 'warning' | 'danger';

export type AocPMFreakGovernanceResponseTraceStepStatus = 'passed' | 'warning' | 'blocked' | 'not_applicable';

export interface AocPMFreakGovernanceResponseTraceStep {
  readonly stepId: string;
  readonly label: string;
  readonly status: AocPMFreakGovernanceResponseTraceStepStatus;
  readonly summary: string;
}

export interface AocPMFreakGovernanceResponse {
  readonly responseId: string;
  readonly requestId: string;
  readonly clientId: string;

  readonly providerId: 'aoc';
  readonly evaluatedFor: 'pmfreak';

  readonly decision: AocPMFreakGovernanceDecision;
  readonly decisionLabel: string;
  readonly decisionSeverity: AocPMFreakGovernanceDecisionSeverity;

  readonly reasonCodes: readonly string[];
  readonly safeSummary: string;

  readonly requiredEvidenceIds: readonly string[];
  readonly requiredApprovalIds: readonly string[];

  readonly missingEvidenceIds: readonly string[];
  readonly missingApprovalIds: readonly string[];

  readonly trace: readonly AocPMFreakGovernanceResponseTraceStep[];

  readonly policyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];

  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export interface AocPMFreakGovernanceRequestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Request-to-evaluation adapter
// ---------------------------------------------------------------------------

export interface AocPMFreakGovernanceEvaluationInput {
  readonly requestId: string;
  readonly agentId: string;
  readonly agentRole: string;
  readonly passportId?: string;
  readonly projectId: string;
  readonly actionId: string;
  readonly actionCategory: string;
  readonly contextFlags: readonly string[];
  readonly providedEvidenceIds: readonly string[];
  readonly missingEvidenceIds: readonly string[];
  readonly providedApprovalIds: readonly string[];
  readonly missingApprovalIds: readonly string[];
  readonly billingSensitive: boolean;
  readonly policyPackIds: readonly string[];
  readonly jurisdictionPackIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Intake client / facade
// ---------------------------------------------------------------------------

export interface AocPMFreakGovernanceRequestIntakeClient {
  readonly descriptor: AocPMFreakGovernanceRequestIntakeDescriptor;
  readonly config: AocPMFreakGovernanceRequestIntakeConfig;

  getHealth(): Promise<AocPMFreakGovernanceIntakeHealth>;

  validateRequest(request: AocPMFreakGovernanceRequest): AocPMFreakGovernanceRequestValidationResult;

  evaluateRequest(request: AocPMFreakGovernanceRequest): Promise<AocPMFreakGovernanceResponse>;

  receiveAndEvaluate(request: AocPMFreakGovernanceRequest): Promise<{
    readonly request: AocPMFreakGovernanceRequest;
    readonly response: AocPMFreakGovernanceResponse;
  }>;
}

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export type AocPMFreakGovernanceIntakeErrorCode =
  | 'invalid_config'
  | 'invalid_request'
  | 'evaluation_failed'
  | 'mutation_not_allowed'
  | 'unsafe_claim'
  | 'redaction_failed'
  | 'unsupported_runtime'
  | 'unknown_error';

export interface AocPMFreakGovernanceIntakeError {
  readonly code: AocPMFreakGovernanceIntakeErrorCode;
  readonly message: string;
  readonly safe: true;
  readonly details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Health model
// ---------------------------------------------------------------------------

export type AocPMFreakGovernanceIntakeHealthStatus = 'healthy' | 'degraded' | 'unavailable';

export interface AocPMFreakGovernanceIntakeHealth {
  readonly intakeId: string;
  readonly evaluationMode: AocPMFreakGovernanceEvaluationMode;
  readonly status: AocPMFreakGovernanceIntakeHealthStatus;
  readonly productionMutationCapable: false;
  readonly pmfreakMutationCapable: false;
  readonly actionExecutionCapable: false;
  readonly checkedCapabilities: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// Claim safety
// ---------------------------------------------------------------------------

export interface AocPMFreakGovernanceIntakeClaimSafetyResult {
  readonly safe: boolean;
  readonly unsafePhrases: readonly string[];
  readonly checkedText: string;
}
