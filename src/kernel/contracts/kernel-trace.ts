export type KernelTraceStepStatus = 'passed' | 'failed' | 'skipped' | 'pending';

export interface KernelTraceStep {
  readonly sequence: number;
  readonly operator: string;
  readonly status: KernelTraceStepStatus;
  readonly reasonCodes: readonly string[];
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * An operational execution trace, not the Soberanía Evidence Bundle: it explains
 * which stages ran and what each one decided, built entirely from data the
 * wrapped engine already produced (`EnforcementDecision.policyResults`,
 * `RecognitionVerificationResult`). It never carries secrets, tokens, raw
 * capability-token payloads, or unnecessary policy pack payloads --
 * `traceLevel: 'full'` (`KernelEvaluationOptions`) only ever exposes each
 * policy step's own already-public `metadata`, never anything sourced
 * outside `decision.policyResults`.
 */
export interface KernelTrace {
  readonly steps: readonly KernelTraceStep[];
  readonly decisionId: string;
  readonly kernelVersion: string;
}
