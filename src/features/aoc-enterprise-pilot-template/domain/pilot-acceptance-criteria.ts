export type PilotAcceptanceCriterionType =
  | 'runtime'
  | 'control_plane'
  | 'policy'
  | 'evidence'
  | 'export_package'
  | 'operator'
  | 'buyer'
  | 'security';

export type PilotAcceptanceVerificationMethod =
  | 'automated_test'
  | 'demo_walkthrough'
  | 'operator_review'
  | 'export_package_verification'
  | 'customer_signoff';

/**
 * A single pilot acceptance criterion. `verificationMethod` decides how
 * `services/pilot-acceptance-service.ts` may resolve it -- `automated_test`
 * and `export_package_verification` can pass automatically from real
 * runtime data, everything else stays pending unless explicit metadata
 * (`metadata.manuallyCompleted === true`) says a human completed it.
 */
export interface PilotAcceptanceCriterion {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: PilotAcceptanceCriterionType;
  readonly required: boolean;
  readonly verificationMethod: PilotAcceptanceVerificationMethod;
  readonly expectedResult: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
