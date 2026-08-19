import type { PolicyPackManifest, PolicyPackSourceStatus, PolicyPackValidationStatus } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { createPolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-factory.js';
import {
  PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID,
  PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_NAME,
  PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_VERSION,
} from './pmfreak-project-governance-scenario-constants.js';
import { PMFREAK_SCENARIO_CONTROL_PLANE_REQUIREMENT } from './pmfreak-scenario-control-plane-summary.js';

/**
 * Soberanía PMFreak Project Governance Scenario Pack v1 (`aoc.demo.pmfreak.project_governance_scenarios.v1`).
 *
 * A deterministic demo pack showing what happens when PMFreak project agents
 * attempt actions inside realistic project-governance scenarios: billing
 * readiness, milestone acceptance, schedule change, risk escalation, client
 * communication, and change control.
 *
 * Built entirely on the Policy Pack Foundation's `createPolicyPackManifest`
 * -- this pack never re-implements the manifest standard, the
 * validation-status lattice, or the safe-framing shape. Every scenario is
 * decided by `resolvePMFreakAgentPassportAction` from the real
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` package (a workspace
 * code dependency, not a `PolicyPackManifest`-shaped pack, so it is not
 * listed in `requiredPackIds`), never by a duplicate resolver in this
 * module.
 *
 * Default `status`/`sourceStatus` are the safe, non-production baseline
 * (`demo_baseline` / `system_authored`). This pack does not integrate with
 * PMFreak production, does not access real PMFreak/Datasys data, does not
 * mutate real projects/schedules/billing, and does not send real client
 * communications -- see this directory's README for the full safety
 * framing.
 */
export interface CreatePMFreakProjectGovernanceScenarioPackManifestInput {
  readonly status?: PolicyPackValidationStatus;
  readonly sourceStatus?: PolicyPackSourceStatus;
  readonly labels?: readonly string[];
  readonly notes?: readonly string[];
}

const DESCRIPTION =
  'Soberanía PMFreak Project Governance Scenario Pack v1 demonstrates how Soberanía Enterprise governs PMFreak project agents inside realistic project-governance scenarios: billing readiness, milestone acceptance, schedule change, risk escalation, client communication, and change control. It builds on the real @aoc-enterprise/pmfreak-agent-passport-foundation package -- every scenario decision comes from that package\'s resolver, never a duplicate. It does not integrate with PMFreak production, does not access real PMFreak/Datasys data, does not mutate real projects, schedules, or billing, and does not send real client communications.';

const SAFETY_NOTE =
  'This pack does not implement real PMFreak API integration, real PMFreak authentication, real project/schedule/billing mutation, real communication sending, or real invoice creation. It does not certify customer acceptance, does not certify invoice or billing readiness, does not provide legal advice, and does not certify compliance -- including Costa Rica jurisdiction context, which is carried only as an opaque routing reference.';

export function createPMFreakProjectGovernanceScenarioPackManifest(input?: CreatePMFreakProjectGovernanceScenarioPackManifestInput): PolicyPackManifest {
  const status: PolicyPackValidationStatus = input?.status ?? 'demo_baseline';
  const sourceStatus: PolicyPackSourceStatus = input?.sourceStatus ?? 'system_authored';

  return createPolicyPackManifest({
    id: PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID,
    name: PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_NAME,
    version: PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_VERSION,
    kind: 'demo_pack',
    domain: 'project_governance',
    status,
    sourceStatus,
    description: DESCRIPTION,
    requiredPackIds: [],
    scope: {
      global: false,
      jurisdictionSpecific: false,
      domainSpecific: true,
      useCaseSpecific: true,
      customerSpecific: false,
      demoOnly: true,
      systemAuthored: true,
    },
    // Every flag below is forced true regardless of status/sourceStatus, and createPolicyPackManifest
    // additionally re-forces the five core flags for any system-authored/demo pack -- this pack never
    // opts out of its own safe framing.
    safeFraming: {
      notLegalAdvice: true,
      notComplianceCertification: true,
      noCompletenessClaim: true,
      noJurisdictionalComplianceClaim: true,
      partialPolicyModel: true,
      requiresCustomerValidation: true,
      requiresDomainExpertReviewWhenApplicable: true,
    },
    controlPlaneRequirements: [PMFREAK_SCENARIO_CONTROL_PLANE_REQUIREMENT],
    labels: [
      'pmfreak',
      'project_governance',
      'scenario_pack',
      'aoc_enterprise_demo',
      'agent_passport',
      'billing_readiness',
      'milestone_acceptance',
      'schedule_change',
      'risk_escalation',
      'client_communication',
      'change_control',
      'evidence_required',
      'approval_required',
      'audit_trail',
      'not_production_integration',
      'demo_baseline',
      ...(input?.labels ?? []),
    ],
    notes: [SAFETY_NOTE, ...(input?.notes ?? [])],
  });
}
