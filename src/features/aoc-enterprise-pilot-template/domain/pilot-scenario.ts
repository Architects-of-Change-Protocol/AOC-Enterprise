export type PilotScenarioExpectedOutcome =
  | 'passed'
  | 'blocked'
  | 'approval_required'
  | 'evidence_required'
  | 'executed'
  | 'warning_allowed';

export type PilotControlPlaneFocus =
  | 'overview'
  | 'recognition'
  | 'authority'
  | 'approvals'
  | 'external_agents'
  | 'enforcement'
  | 'policy_packs'
  | 'proofs_audit'
  | 'evidence'
  | 'export_packages';

export type PilotScenarioExportPackageType =
  | 'decision_packet'
  | 'audit_bundle'
  | 'policy_decision_packet'
  | 'enforcement_decision_packet'
  | 'approval_decision_packet'
  | 'evidence_packet'
  | 'enterprise_demo_packet';

/**
 * A pilot-authored scenario: it points at a real Enterprise Demo scenario
 * (`demoScenarioId`) rather than inventing its own runtime behavior. See
 * `services/pilot-scenario-binding-service.ts` for how `demoScenarioId` and
 * `expectedOutcome` get checked against the real scenario.
 */
export interface PilotScenario {
  readonly id: string;

  readonly name: string;
  readonly description: string;

  readonly demoScenarioId?: string;

  readonly actionIds: readonly string[];

  readonly expectedOutcome: PilotScenarioExpectedOutcome;

  readonly controlPlaneFocus: PilotControlPlaneFocus;

  readonly exportPackageType: PilotScenarioExportPackageType;

  readonly buyerMessage: string;
  readonly operatorMessage: string;
  readonly technicalMessage: string;

  readonly acceptanceCriterionIds: readonly string[];
  readonly successMetricIds: readonly string[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}
