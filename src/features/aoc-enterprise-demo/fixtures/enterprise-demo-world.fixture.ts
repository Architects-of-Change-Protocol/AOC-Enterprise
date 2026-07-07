import {
  DATASYS_ACTOR_ID,
  PMFREAK_ACTOR_ID,
  PROJECT_SCOPE,
  TRUST_DOMAIN_ID,
  TRUSTED_PARTNER_AGENT_ID,
  UNKNOWN_AGENT_ACTOR_ID,
  VICTOR_ACTOR_ID,
  type DatasysEnforcementFixture,
} from '../../action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { buildPolicyPackEnforcementFixture, type PolicyPackEnforcementFixture } from '../../action-enforcement/fixtures/policy-pack-enforcement.fixture.js';
import { OTHER_PROJECT_SCOPE } from '../../external-agent-handshake/fixtures/datasys-handshake.fixture.js';

export const FINANCE_APPROVER_ACTOR_ID = 'actor-finance-approver';

export {
  DATASYS_ACTOR_ID,
  PMFREAK_ACTOR_ID,
  PROJECT_SCOPE,
  TRUST_DOMAIN_ID,
  TRUSTED_PARTNER_AGENT_ID,
  UNKNOWN_AGENT_ACTOR_ID,
  VICTOR_ACTOR_ID,
  OTHER_PROJECT_SCOPE,
};
export type { DatasysEnforcementFixture, PolicyPackEnforcementFixture };

/**
 * The full "Datasys Agent Republic" enterprise demo world. Wraps
 * `buildPolicyPackEnforcementFixture` -- itself a strict superset of
 * `buildDatasysEnforcementFixture`, the shared, real, five-runtime fixture
 * that Action Enforcement and the Control Plane already depend on -- which
 * additionally registers a real `PolicyPackRuntime` (all six Domain Policy
 * Pack Runtime demo packs) and a second, policy-pack-configured
 * `ActionEnforcementRuntime`/`AocGuard` (`policyPackEnforcementRuntime` /
 * `policyPackAocGuard`). It also adds one additional recognized actor (the
 * Finance Approver persona) so the demo pack's persona roster is fully
 * backed by real recognized actors. Every existing scenario keeps using
 * `fixture.aocGuard` (no policy pack integration, unchanged behavior); only
 * the policy-pack scenarios use `fixture.policyPackAocGuard`. Building this
 * fresh for every scenario run is what keeps scenario runs isolated: every
 * runtime instance and store inside is brand new, so nothing from a prior
 * scenario can leak into the next one.
 */
export interface EnterpriseDemoWorld {
  readonly fixture: PolicyPackEnforcementFixture;
  readonly trustDomainId: string;
  readonly projectScope: string;
  readonly secondaryProjectScope: string;
  readonly financeApproverActorId: string;
}

export function buildEnterpriseDemoWorld(): EnterpriseDemoWorld {
  const fixture = buildPolicyPackEnforcementFixture();

  const financeApprover = fixture.recognitionRuntime.registerActor({
    id: FINANCE_APPROVER_ACTOR_ID,
    type: 'human',
    displayName: 'Finance Approver',
    issuerId: fixture.world.datasys.id,
    trustDomainId: fixture.world.trustDomainId,
  });
  fixture.approvalRuntime.registerApproverRecognitionStatus(financeApprover.id, 'recognized');

  return {
    fixture,
    trustDomainId: fixture.world.trustDomainId,
    projectScope: PROJECT_SCOPE,
    secondaryProjectScope: OTHER_PROJECT_SCOPE,
    financeApproverActorId: financeApprover.id,
  };
}
