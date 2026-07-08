import type { PilotTemplate, PilotTemplateId } from './pilot-template.js';

export type PilotKitStatus = 'assembled' | 'ready' | 'validated' | 'failed_readiness';

export type PilotReadinessStatus = 'ready' | 'ready_with_warnings' | 'not_ready';

export type PilotReadinessIssueSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface PilotReadinessIssue {
  readonly id: string;
  readonly severity: PilotReadinessIssueSeverity;
  readonly reasonCode: string;
  readonly reason: string;
  readonly relatedTemplateId?: PilotTemplateId;
  readonly relatedScenarioId?: string;
  readonly relatedAcceptanceCriterionId?: string;
  readonly relatedExportPackageId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The output of `services/pilot-readiness-service.ts`. `ready` requires
 * every automated check (scenario bindings, export package bindings,
 * acceptance criteria, risks, legal disclaimer, non-goals) to pass;
 * `ready_with_warnings` allows only manual/`customer_signoff` items to
 * remain outstanding; `not_ready` means a required runtime-backed reference
 * is missing.
 */
export interface PilotReadinessReport {
  readonly id: string;
  readonly templateId: PilotTemplateId;
  readonly status: PilotReadinessStatus;
  readonly checkedAt: string;

  readonly passedCriteriaIds: readonly string[];
  readonly failedCriteriaIds: readonly string[];
  readonly warningCriteriaIds: readonly string[];

  readonly issues: readonly PilotReadinessIssue[];

  readonly readyScenarioIds: readonly string[];
  readonly missingScenarioIds: readonly string[];

  readonly verifiedExportPackageIds: readonly string[];
  readonly failedExportPackageIds: readonly string[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type PilotGeneratedArtifactType =
  | 'pilot_readme'
  | 'demo_script'
  | 'technical_setup'
  | 'acceptance_checklist'
  | 'buyer_summary'
  | 'operator_walkthrough'
  | 'pilot_json';

/**
 * A deterministic generated text artifact (see
 * `services/pilot-script-service.ts`). `contentHash` lets callers detect any
 * drift between two generations of the same content.
 */
export interface PilotGeneratedArtifact {
  readonly id: string;
  readonly type: PilotGeneratedArtifactType;
  readonly title: string;
  readonly content: string;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The assembled, runtime-bound package for one `PilotTemplate`: bound
 * scenario/policy-pack/evidence/export-package/Control-Plane-snapshot
 * references, a readiness report, and generated artifacts. Built only by
 * `services/pilot-kit-builder.ts`, never hand-constructed -- a `PilotKit`
 * whose `readiness.status` is `not_ready` must never be reported as ready.
 */
export interface PilotKit {
  readonly id: string;

  readonly templateId: PilotTemplateId;

  readonly status: PilotKitStatus;

  readonly template: PilotTemplate;

  readonly boundScenarioIds: readonly string[];

  readonly boundPolicyPackIds: readonly string[];
  readonly boundPolicyPackVersionIds: readonly string[];

  readonly boundEvidenceProofIds: readonly string[];
  readonly boundExportPackageIds: readonly string[];

  readonly controlPlaneSnapshotIds: readonly string[];

  readonly readiness: PilotReadinessReport;

  readonly generatedArtifacts: readonly PilotGeneratedArtifact[];

  readonly createdAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
