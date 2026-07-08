import type { PolicyPackManifest, PolicyPackSourceStatus, PolicyPackValidationStatus } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { createPolicyPackManifest } from '../../policy-pack-foundation/manifest/policy-pack-manifest-factory.js';
import { PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID, PMFREAK_AGENT_PASSPORT_DEMO_PACK_NAME, PMFREAK_AGENT_PASSPORT_DEMO_PACK_VERSION } from './pmfreak-agent-passport-constants.js';
import { PMFREAK_CONTROL_PLANE_REQUIREMENT } from './pmfreak-control-plane-summary.js';

/**
 * AOC PMFreak Agent Passport Demo Pack v1 (`aoc.demo.pmfreak.agent_passport.v1`).
 *
 * A deterministic demo pack showing how PMFreak project-management agents
 * can operate with AOC Enterprise passports: recognized identity, a
 * role-specific authority scope, an active capability token, sufficient
 * evidence, required approvals, and a non-revoked status -- never merely
 * because they are technically able to act.
 *
 * Built entirely on the Policy Pack Foundation's `createPolicyPackManifest`:
 * a real `PolicyPackManifest`, the shared safe-framing guarantees, and the
 * shared overclaim scanner. This module never re-implements the manifest
 * standard, the validation-status lattice, or the safe-framing shape.
 *
 * Default `status`/`sourceStatus` are the safe, non-production baseline
 * (`demo_baseline` / `system_authored`). This pack does not integrate with
 * PMFreak production, does not access real PMFreak data, does not mutate
 * real projects/schedules/billing, and does not send real communications --
 * see this directory's README for the full safety framing.
 */
export interface CreatePMFreakAgentPassportDemoPackManifestInput {
  readonly status?: PolicyPackValidationStatus;
  readonly sourceStatus?: PolicyPackSourceStatus;
  readonly labels?: readonly string[];
  readonly notes?: readonly string[];
}

const DESCRIPTION =
  'AOC PMFreak Agent Passport Demo Pack v1 demonstrates how PMFreak project-management agents can operate as AOC-governed actors: identity, passport status, role-specific authority scope, capability tokens, evidence requirements, approval requirements, policy decisions, Control Plane summaries, and export metadata. It does not integrate with PMFreak production, does not access real PMFreak/Datasys data, does not mutate real projects, schedules, or billing, and does not send real client communications.';

const SAFETY_NOTE =
  'This pack does not implement real PMFreak API integration, real PMFreak authentication, real project/schedule/billing mutation, real communication sending, or real invoice creation. A passport granting authority never substitutes for a required approval -- approvals still gate execution. This pack does not provide legal advice and does not certify compliance.';

export function createPMFreakAgentPassportDemoPackManifest(input?: CreatePMFreakAgentPassportDemoPackManifestInput): PolicyPackManifest {
  const status: PolicyPackValidationStatus = input?.status ?? 'demo_baseline';
  const sourceStatus: PolicyPackSourceStatus = input?.sourceStatus ?? 'system_authored';

  return createPolicyPackManifest({
    id: PMFREAK_AGENT_PASSPORT_DEMO_PACK_ID,
    name: PMFREAK_AGENT_PASSPORT_DEMO_PACK_NAME,
    version: PMFREAK_AGENT_PASSPORT_DEMO_PACK_VERSION,
    kind: 'demo_pack',
    domain: 'project_governance',
    status,
    sourceStatus,
    description: DESCRIPTION,
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
    controlPlaneRequirements: [PMFREAK_CONTROL_PLANE_REQUIREMENT],
    labels: [
      'pmfreak',
      'agent_passport',
      'aoc_enterprise_demo',
      'project_governance',
      'identity_governance',
      'authority_scope',
      'capability_tokens',
      'evidence_required',
      'approval_required',
      'audit_trail',
      'demo_baseline',
      'not_production_integration',
      ...(input?.labels ?? []),
    ],
    notes: [SAFETY_NOTE, ...(input?.notes ?? [])],
  });
}
