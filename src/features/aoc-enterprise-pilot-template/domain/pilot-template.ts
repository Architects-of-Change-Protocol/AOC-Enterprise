import type { PilotScope } from './pilot-scope.js';
import type { PilotActor } from './pilot-actor.js';
import type { PilotAgent } from './pilot-agent.js';
import type { PilotCapability } from './pilot-capability.js';
import type { PilotAuthorityModel } from './pilot-authority.js';
import type { PilotApprovalModel } from './pilot-approval.js';
import type { PilotPolicyModel } from './pilot-policy.js';
import type { PilotEvidenceModel } from './pilot-evidence.js';
import type { PilotAction } from './pilot-action.js';
import type { PilotScenario } from './pilot-scenario.js';
import type { PilotControlPlaneWalkthrough } from './pilot-control-plane.js';
import type { PilotExportPackageDefinition } from './pilot-export-package.js';
import type { PilotAcceptanceCriterion } from './pilot-acceptance-criteria.js';
import type { PilotSuccessMetric } from './pilot-success-metric.js';
import type { PilotRisk } from './pilot-risk.js';
import type { PilotScript } from './pilot-script.js';

export type PilotTemplateId =
  | 'datasys-project-governance'
  | 'bank-payments-procurement-data'
  | 'healthcare-operations-sensitive-data'
  | 'sports-event-settlement';

export type PilotTemplateStatus = 'draft' | 'ready' | 'validated' | 'deprecated';

export type PilotTemplateIndustry =
  | 'technology_services'
  | 'banking'
  | 'healthcare'
  | 'sports_entertainment'
  | 'cross_industry';

/**
 * A reusable, enterprise-pilot-ready packaging of existing AOC runtime
 * capability around one bounded use case. A PilotTemplate is declarative
 * data only -- it orchestrates existing runtime truth, it never manufactures
 * its own recognition/authority/approval/policy/evidence/enforcement/export
 * decisions. See the module README, "A pilot template is not the runtime
 * truth."
 */
export interface PilotTemplate {
  readonly id: PilotTemplateId;

  readonly name: string;
  readonly description: string;

  readonly status: PilotTemplateStatus;

  readonly industry: PilotTemplateIndustry;

  readonly primaryUseCase: string;

  readonly businessPain: string;
  readonly aocValueProposition: string;

  readonly targetBuyerPersonaIds: readonly string[];
  readonly targetOperatorPersonaIds: readonly string[];

  readonly trustDomainId: string;

  readonly scope: PilotScope;

  readonly actors: readonly PilotActor[];
  readonly agents: readonly PilotAgent[];
  readonly capabilities: readonly PilotCapability[];

  readonly authorityModel: PilotAuthorityModel;
  readonly approvalModel: PilotApprovalModel;
  readonly policyModel: PilotPolicyModel;
  readonly evidenceModel: PilotEvidenceModel;

  readonly actions: readonly PilotAction[];
  readonly scenarios: readonly PilotScenario[];

  readonly controlPlaneWalkthrough: PilotControlPlaneWalkthrough;

  readonly exportPackages: readonly PilotExportPackageDefinition[];

  readonly acceptanceCriteria: readonly PilotAcceptanceCriterion[];
  readonly successMetrics: readonly PilotSuccessMetric[];
  readonly risks: readonly PilotRisk[];

  readonly script: PilotScript;

  readonly nonGoals: readonly string[];

  readonly legalDisclaimer: string;

  readonly createdAt: string;
  readonly updatedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
