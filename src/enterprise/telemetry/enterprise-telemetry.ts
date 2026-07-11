import type { KernelDecisionStatus } from '../../kernel/index.js';

/**
 * Operational metrics the AOC Enterprise Host owns. The Kernel stays
 * deterministic and reports nothing about its own operational health --
 * these counters are derived entirely from the outside, by observing
 * `evaluate()` calls, never by asking the Kernel to instrument itself.
 */
export interface EnterpriseMetricsSnapshot {
  readonly evaluationCount: number;
  readonly averageEvaluationDurationMs: number;
  readonly deniedCount: number;
  readonly approvalRequiredCount: number;
  readonly allowedCount: number;
  readonly indeterminateCount: number;
  readonly enterpriseFailureCount: number;
  readonly persistenceFailureCount: number;
  readonly providerFailureCount: number;
  /** Lifecycle metrics (mission section 27): `enterprise_startup_total` / `enterprise_startup_failures_total`. */
  readonly startupCount: number;
  readonly startupFailureCount: number;
  /** `enterprise_shutdown_total` / `enterprise_shutdown_failures_total`. */
  readonly shutdownCount: number;
  readonly shutdownFailureCount: number;
  /** `enterprise_module_failures_total`. */
  readonly moduleFailureCount: number;
  /** `governance_store_append_total` / `governance_store_append_failures_total` / `governance_store_append_duration_ms` (PR-004 section 75). */
  readonly storeAppendCount: number;
  readonly storeAppendFailureCount: number;
  readonly averageStoreAppendDurationMs: number;
  /** `governance_store_idempotent_replays_total` / `governance_store_idempotency_conflicts_total`. */
  readonly storeIdempotentReplayCount: number;
  readonly storeIdempotencyConflictCount: number;
  /** `governance_store_queries_total` / `governance_store_query_duration_ms`. */
  readonly storeQueryCount: number;
  readonly averageStoreQueryDurationMs: number;
  /** `governance_store_integrity_verifications_total` / `governance_store_integrity_failures_total` / `governance_store_corrupted_records_total`. */
  readonly storeVerificationCount: number;
  readonly storeIntegrityFailureCount: number;
  readonly storeCorruptedRecordCount: number;
  /** PR-006 Agent Passport Runtime counters (mission section 57). */
  readonly passportIssuedCount: number;
  readonly passportActivationCount: number;
  readonly passportSuspensionCount: number;
  readonly passportReactivationCount: number;
  readonly passportRevocationCount: number;
  readonly passportExpirationCount: number;
  readonly passportRetirementCount: number;
  readonly passportEventAppendFailureCount: number;
  readonly passportReconstructionCount: number;
  readonly passportReconstructionFailureCount: number;
  readonly passportVerificationCount: number;
  readonly passportVerificationFailureCount: number;
  readonly passportEvidenceLinkCount: number;
  readonly passportGovernanceLinkCount: number;
  readonly passportViewGenerationCount: number;
  readonly passportIdempotentReplayCount: number;
  readonly passportIdempotencyConflictCount: number;
  /** PR-007 Assurance Runtime counters (mission section 70). */
  readonly assuranceAssessmentsCreatedCount: number;
  readonly assuranceAssessmentsCompletedCount: number;
  readonly assuranceAssessmentsFailedCount: number;
  readonly averageAssuranceAssessmentDurationMs: number;
  readonly assuranceControlsEvaluatedCount: number;
  readonly assuranceControlPassCount: number;
  readonly assuranceControlPartialCount: number;
  readonly assuranceControlFailCount: number;
  readonly assuranceControlUnknownCount: number;
  readonly assuranceControlManualReviewCount: number;
  readonly assuranceFindingsCreatedCount: number;
  readonly assuranceFindingsCriticalCount: number;
  readonly assuranceFindingsHighCount: number;
  readonly assuranceFindingsMediumCount: number;
  readonly assuranceFindingsLowCount: number;
  readonly assuranceFindingsClosedCount: number;
  readonly assuranceEvidenceResolutionsCount: number;
  readonly assuranceEvidenceRejectionsCount: number;
  readonly assuranceEvidenceInsufficientCount: number;
  readonly assuranceEvidenceContradictionsCount: number;
  readonly assuranceEligibilityEvaluationsCount: number;
  readonly assuranceEligibilityPassCount: number;
  readonly assuranceEligibilityFailCount: number;
  readonly assuranceEligibilityProvisionalCount: number;
  readonly assuranceSignalsReceivedCount: number;
  readonly assuranceAssessmentsMarkedStaleCount: number;
  readonly assuranceReassessmentsRequestedCount: number;
  readonly assuranceIntegrityVerificationsCount: number;
  readonly assuranceIntegrityFailuresCount: number;
}

export interface EnterpriseTelemetry {
  recordEvaluation(status: KernelDecisionStatus, durationMs: number): void;
  recordEnterpriseFailure(): void;
  recordPersistenceFailure(): void;
  recordProviderFailure(): void;
  /** `enterprise_startup_total` / `enterprise_startup_failures_total` / `enterprise_startup_duration_ms` (mission section 27). */
  recordStartup(success: boolean): void;
  /** `enterprise_shutdown_total` / `enterprise_shutdown_failures_total` / `enterprise_shutdown_duration_ms`. */
  recordShutdown(success: boolean): void;
  /** `enterprise_module_failures_total`, tagged by module id via the log line this call triggers -- the counter itself stays a flat total, matching every other counter in this snapshot. */
  recordModuleFailure(moduleId: string): void;
  /** One committed-or-replayed Governance Store append. `idempotentReplay: true` means an equivalent aggregate already existed and nothing new was written. */
  recordStoreAppend(durationMs: number, idempotentReplay: boolean): void;
  recordStoreAppendFailure(): void;
  recordStoreIdempotencyConflict(): void;
  recordStoreQuery(durationMs: number): void;
  /** One integrity verification run; `valid: false` also increments the integrity-failure counter. */
  recordStoreVerification(valid: boolean): void;
  recordStoreCorruptedRecord(): void;

  /** PR-006 Agent Passport Runtime counters (mission section 57). One call per successful lifecycle transition; idempotent replays are not double-counted as new issuances. */
  recordPassportIssued(): void;
  recordPassportActivation(): void;
  recordPassportSuspension(): void;
  recordPassportReactivation(): void;
  recordPassportRevocation(): void;
  recordPassportExpiration(): void;
  recordPassportRetirement(): void;
  recordPassportEventAppendFailure(): void;
  recordPassportReconstruction(success: boolean): void;
  recordPassportVerification(valid: boolean): void;
  recordPassportEvidenceLink(): void;
  recordPassportGovernanceLink(): void;
  recordPassportViewGeneration(): void;
  recordPassportIdempotentReplay(): void;
  recordPassportIdempotencyConflict(): void;

  /** PR-007 Assurance Runtime counters (mission section 70): `assurance_assessments_created_total` etc. Statuses/severities are flat counters, matching every other counter in this snapshot. */
  recordAssuranceAssessmentCreated(): void;
  recordAssuranceAssessmentCompleted(durationMs: number): void;
  recordAssuranceAssessmentFailed(): void;
  recordAssuranceControlEvaluated(status: 'pass' | 'partial' | 'fail' | 'unknown' | 'not_applicable' | 'manual_review_required'): void;
  recordAssuranceFindingCreated(severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'): void;
  recordAssuranceFindingClosed(): void;
  recordAssuranceEvidenceResolution(rejections: number, contradictions: number, insufficient: boolean): void;
  recordAssuranceEligibilityEvaluated(outcome: 'pass' | 'fail' | 'provisional'): void;
  recordAssuranceSignalReceived(): void;
  recordAssuranceAssessmentMarkedStale(): void;
  recordAssuranceReassessmentRequested(): void;
  recordAssuranceVerification(valid: boolean): void;

  snapshot(): EnterpriseMetricsSnapshot;
}

export function createEnterpriseTelemetry(): EnterpriseTelemetry {
  let evaluationCount = 0;
  let totalDurationMs = 0;
  let deniedCount = 0;
  let approvalRequiredCount = 0;
  let allowedCount = 0;
  let indeterminateCount = 0;
  let enterpriseFailureCount = 0;
  let persistenceFailureCount = 0;
  let providerFailureCount = 0;
  let startupCount = 0;
  let startupFailureCount = 0;
  let shutdownCount = 0;
  let shutdownFailureCount = 0;
  let moduleFailureCount = 0;
  let storeAppendCount = 0;
  let storeAppendFailureCount = 0;
  let storeAppendTotalDurationMs = 0;
  let storeIdempotentReplayCount = 0;
  let storeIdempotencyConflictCount = 0;
  let storeQueryCount = 0;
  let storeQueryTotalDurationMs = 0;
  let storeVerificationCount = 0;
  let storeIntegrityFailureCount = 0;
  let storeCorruptedRecordCount = 0;
  let passportIssuedCount = 0;
  let passportActivationCount = 0;
  let passportSuspensionCount = 0;
  let passportReactivationCount = 0;
  let passportRevocationCount = 0;
  let passportExpirationCount = 0;
  let passportRetirementCount = 0;
  let passportEventAppendFailureCount = 0;
  let passportReconstructionCount = 0;
  let passportReconstructionFailureCount = 0;
  let passportVerificationCount = 0;
  let passportVerificationFailureCount = 0;
  let passportEvidenceLinkCount = 0;
  let passportGovernanceLinkCount = 0;
  let passportViewGenerationCount = 0;
  let passportIdempotentReplayCount = 0;
  let passportIdempotencyConflictCount = 0;
  let assuranceAssessmentsCreatedCount = 0;
  let assuranceAssessmentsCompletedCount = 0;
  let assuranceAssessmentsFailedCount = 0;
  let assuranceAssessmentTotalDurationMs = 0;
  let assuranceControlsEvaluatedCount = 0;
  let assuranceControlPassCount = 0;
  let assuranceControlPartialCount = 0;
  let assuranceControlFailCount = 0;
  let assuranceControlUnknownCount = 0;
  let assuranceControlManualReviewCount = 0;
  let assuranceFindingsCreatedCount = 0;
  let assuranceFindingsCriticalCount = 0;
  let assuranceFindingsHighCount = 0;
  let assuranceFindingsMediumCount = 0;
  let assuranceFindingsLowCount = 0;
  let assuranceFindingsClosedCount = 0;
  let assuranceEvidenceResolutionsCount = 0;
  let assuranceEvidenceRejectionsCount = 0;
  let assuranceEvidenceInsufficientCount = 0;
  let assuranceEvidenceContradictionsCount = 0;
  let assuranceEligibilityEvaluationsCount = 0;
  let assuranceEligibilityPassCount = 0;
  let assuranceEligibilityFailCount = 0;
  let assuranceEligibilityProvisionalCount = 0;
  let assuranceSignalsReceivedCount = 0;
  let assuranceAssessmentsMarkedStaleCount = 0;
  let assuranceReassessmentsRequestedCount = 0;
  let assuranceIntegrityVerificationsCount = 0;
  let assuranceIntegrityFailuresCount = 0;

  return {
    recordEvaluation(status, durationMs) {
      evaluationCount += 1;
      totalDurationMs += durationMs;
      switch (status) {
        case 'denied':
          deniedCount += 1;
          break;
        case 'approval_required':
          approvalRequiredCount += 1;
          break;
        case 'allowed':
          allowedCount += 1;
          break;
        case 'indeterminate':
          indeterminateCount += 1;
          break;
      }
    },
    recordEnterpriseFailure() {
      enterpriseFailureCount += 1;
    },
    recordPersistenceFailure() {
      persistenceFailureCount += 1;
    },
    recordProviderFailure() {
      providerFailureCount += 1;
    },
    recordStartup(success) {
      startupCount += 1;
      if (!success) startupFailureCount += 1;
    },
    recordShutdown(success) {
      shutdownCount += 1;
      if (!success) shutdownFailureCount += 1;
    },
    recordModuleFailure() {
      moduleFailureCount += 1;
    },
    recordStoreAppend(durationMs, idempotentReplay) {
      storeAppendCount += 1;
      storeAppendTotalDurationMs += durationMs;
      if (idempotentReplay) storeIdempotentReplayCount += 1;
    },
    recordStoreAppendFailure() {
      storeAppendFailureCount += 1;
    },
    recordStoreIdempotencyConflict() {
      storeIdempotencyConflictCount += 1;
    },
    recordStoreQuery(durationMs) {
      storeQueryCount += 1;
      storeQueryTotalDurationMs += durationMs;
    },
    recordStoreVerification(valid) {
      storeVerificationCount += 1;
      if (!valid) storeIntegrityFailureCount += 1;
    },
    recordStoreCorruptedRecord() {
      storeCorruptedRecordCount += 1;
    },
    recordPassportIssued() {
      passportIssuedCount += 1;
    },
    recordPassportActivation() {
      passportActivationCount += 1;
    },
    recordPassportSuspension() {
      passportSuspensionCount += 1;
    },
    recordPassportReactivation() {
      passportReactivationCount += 1;
    },
    recordPassportRevocation() {
      passportRevocationCount += 1;
    },
    recordPassportExpiration() {
      passportExpirationCount += 1;
    },
    recordPassportRetirement() {
      passportRetirementCount += 1;
    },
    recordPassportEventAppendFailure() {
      passportEventAppendFailureCount += 1;
    },
    recordPassportReconstruction(success) {
      passportReconstructionCount += 1;
      if (!success) passportReconstructionFailureCount += 1;
    },
    recordPassportVerification(valid) {
      passportVerificationCount += 1;
      if (!valid) passportVerificationFailureCount += 1;
    },
    recordPassportEvidenceLink() {
      passportEvidenceLinkCount += 1;
    },
    recordPassportGovernanceLink() {
      passportGovernanceLinkCount += 1;
    },
    recordPassportViewGeneration() {
      passportViewGenerationCount += 1;
    },
    recordPassportIdempotentReplay() {
      passportIdempotentReplayCount += 1;
    },
    recordPassportIdempotencyConflict() {
      passportIdempotencyConflictCount += 1;
    },
    recordAssuranceAssessmentCreated() {
      assuranceAssessmentsCreatedCount += 1;
    },
    recordAssuranceAssessmentCompleted(durationMs) {
      assuranceAssessmentsCompletedCount += 1;
      assuranceAssessmentTotalDurationMs += durationMs;
    },
    recordAssuranceAssessmentFailed() {
      assuranceAssessmentsFailedCount += 1;
    },
    recordAssuranceControlEvaluated(status) {
      assuranceControlsEvaluatedCount += 1;
      switch (status) {
        case 'pass':
          assuranceControlPassCount += 1;
          break;
        case 'partial':
          assuranceControlPartialCount += 1;
          break;
        case 'fail':
          assuranceControlFailCount += 1;
          break;
        case 'unknown':
          assuranceControlUnknownCount += 1;
          break;
        case 'manual_review_required':
          assuranceControlManualReviewCount += 1;
          break;
        case 'not_applicable':
          break;
      }
    },
    recordAssuranceFindingCreated(severity) {
      assuranceFindingsCreatedCount += 1;
      switch (severity) {
        case 'critical':
          assuranceFindingsCriticalCount += 1;
          break;
        case 'high':
          assuranceFindingsHighCount += 1;
          break;
        case 'medium':
          assuranceFindingsMediumCount += 1;
          break;
        case 'low':
          assuranceFindingsLowCount += 1;
          break;
        case 'informational':
          break;
      }
    },
    recordAssuranceFindingClosed() {
      assuranceFindingsClosedCount += 1;
    },
    recordAssuranceEvidenceResolution(rejections, contradictions, insufficient) {
      assuranceEvidenceResolutionsCount += 1;
      assuranceEvidenceRejectionsCount += rejections;
      assuranceEvidenceContradictionsCount += contradictions;
      if (insufficient) assuranceEvidenceInsufficientCount += 1;
    },
    recordAssuranceEligibilityEvaluated(outcome) {
      assuranceEligibilityEvaluationsCount += 1;
      if (outcome === 'pass') assuranceEligibilityPassCount += 1;
      else if (outcome === 'fail') assuranceEligibilityFailCount += 1;
      else assuranceEligibilityProvisionalCount += 1;
    },
    recordAssuranceSignalReceived() {
      assuranceSignalsReceivedCount += 1;
    },
    recordAssuranceAssessmentMarkedStale() {
      assuranceAssessmentsMarkedStaleCount += 1;
    },
    recordAssuranceReassessmentRequested() {
      assuranceReassessmentsRequestedCount += 1;
    },
    recordAssuranceVerification(valid) {
      assuranceIntegrityVerificationsCount += 1;
      if (!valid) assuranceIntegrityFailuresCount += 1;
    },
    snapshot(): EnterpriseMetricsSnapshot {
      return {
        evaluationCount,
        averageEvaluationDurationMs: evaluationCount === 0 ? 0 : totalDurationMs / evaluationCount,
        deniedCount,
        approvalRequiredCount,
        allowedCount,
        indeterminateCount,
        enterpriseFailureCount,
        persistenceFailureCount,
        providerFailureCount,
        startupCount,
        startupFailureCount,
        shutdownCount,
        shutdownFailureCount,
        moduleFailureCount,
        storeAppendCount,
        storeAppendFailureCount,
        averageStoreAppendDurationMs: storeAppendCount === 0 ? 0 : storeAppendTotalDurationMs / storeAppendCount,
        storeIdempotentReplayCount,
        storeIdempotencyConflictCount,
        storeQueryCount,
        averageStoreQueryDurationMs: storeQueryCount === 0 ? 0 : storeQueryTotalDurationMs / storeQueryCount,
        storeVerificationCount,
        storeIntegrityFailureCount,
        storeCorruptedRecordCount,
        passportIssuedCount,
        passportActivationCount,
        passportSuspensionCount,
        passportReactivationCount,
        passportRevocationCount,
        passportExpirationCount,
        passportRetirementCount,
        passportEventAppendFailureCount,
        passportReconstructionCount,
        passportReconstructionFailureCount,
        passportVerificationCount,
        passportVerificationFailureCount,
        passportEvidenceLinkCount,
        passportGovernanceLinkCount,
        passportViewGenerationCount,
        passportIdempotentReplayCount,
        passportIdempotencyConflictCount,
        assuranceAssessmentsCreatedCount,
        assuranceAssessmentsCompletedCount,
        assuranceAssessmentsFailedCount,
        averageAssuranceAssessmentDurationMs: assuranceAssessmentsCompletedCount === 0 ? 0 : assuranceAssessmentTotalDurationMs / assuranceAssessmentsCompletedCount,
        assuranceControlsEvaluatedCount,
        assuranceControlPassCount,
        assuranceControlPartialCount,
        assuranceControlFailCount,
        assuranceControlUnknownCount,
        assuranceControlManualReviewCount,
        assuranceFindingsCreatedCount,
        assuranceFindingsCriticalCount,
        assuranceFindingsHighCount,
        assuranceFindingsMediumCount,
        assuranceFindingsLowCount,
        assuranceFindingsClosedCount,
        assuranceEvidenceResolutionsCount,
        assuranceEvidenceRejectionsCount,
        assuranceEvidenceInsufficientCount,
        assuranceEvidenceContradictionsCount,
        assuranceEligibilityEvaluationsCount,
        assuranceEligibilityPassCount,
        assuranceEligibilityFailCount,
        assuranceEligibilityProvisionalCount,
        assuranceSignalsReceivedCount,
        assuranceAssessmentsMarkedStaleCount,
        assuranceReassessmentsRequestedCount,
        assuranceIntegrityVerificationsCount,
        assuranceIntegrityFailuresCount,
      };
    },
  };
}
