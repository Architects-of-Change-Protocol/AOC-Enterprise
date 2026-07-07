import type { AuthorityGrant } from '../../authority-graph/domain/authority-grant.js';
import type { AuthorityGraphRuntime } from '../../authority-graph/runtime/authority-graph-runtime.js';
import type { Actor } from '../../recognition-runtime/domain/actor.js';
import type { Passport } from '../../recognition-runtime/domain/passport.js';
import type { TrustDomain } from '../../recognition-runtime/domain/trust-domain.js';
import type { AocRecognitionRuntime } from '../../recognition-runtime/runtime/aoc-recognition-runtime.js';
import type { ApprovalRuntime } from '../runtime/approval-runtime.js';

export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';

export const DATASYS_ACTOR_ID = 'actor-datasys';
export const VICTOR_ACTOR_ID = 'actor-victor-valverde';
export const FINANCE_APPROVER_ACTOR_ID = 'actor-finance-approver';
export const PMFREAK_ACTOR_ID = 'actor-pmfreak-closure-agent';
export const UNKNOWN_AGENT_ACTOR_ID = 'actor-unknown-external-agent';

export const PROJECT_SCOPE = 'project:HMP-14665';
export const OTHER_PROJECT_SCOPE = 'project:GCH-15992';
export const FINANCE_SCOPE = 'finance:global';

export const APPROVE_PROJECT_ACTION = 'approve_project_action';
export const APPROVE_CLIENT_COMMUNICATION = 'approve_client_communication';
export const APPROVE_FINANCIAL_ACTION = 'approve_financial_action';
export const APPROVE_CRITICAL_ACTION = 'approve_critical_action';

export interface DatasysApprovalWorld {
  readonly trustDomainId: string;
  readonly trustDomain: TrustDomain;
  readonly datasys: Actor;
  readonly victor: Actor;
  readonly pmfreak: Actor;
  readonly unknownAgent: Actor;
  readonly victorPassport: Passport;
  readonly pmfreakPassport: Passport;
  readonly victorGrant: AuthorityGrant;
  readonly financeApproverGrant: AuthorityGrant;
}

/**
 * Establishes the Datasys Agent Republic across all three runtimes:
 * - Recognition Runtime: actors, trust domain, passports.
 * - Authority Graph: root issuer + authority grants proving Victor's PM
 *   authority and the Finance Approver's finance authority.
 * - Approval Runtime: which humans are recognized approvers.
 *
 * Deliberately does NOT wire Approval Runtime's actor recognition to
 * Recognition Runtime's ActorRegistry -- constructing AocRecognitionRuntime
 * already requires the (immutable) ApprovalRuntimeIntegration up front, so
 * threading its own ActorRegistry back into that same ApprovalRuntime would
 * be circular. Approval Runtime's store-backed recognition registry (see
 * services/approval-actor-recognition-integration.ts) is the deterministic,
 * fixture-driven alternative used here and is exercised directly by its own
 * dedicated integration in a live ActorRegistry elsewhere.
 */
export function buildDatasysApprovalWorld(
  recognitionRuntime: AocRecognitionRuntime,
  authorityRuntime: AuthorityGraphRuntime,
  approvalRuntime: ApprovalRuntime,
): DatasysApprovalWorld {
  const datasys = recognitionRuntime.registerActor({ id: DATASYS_ACTOR_ID, type: 'organization', displayName: 'Datasys' });

  const trustDomain = recognitionRuntime.createTrustDomain({
    id: TRUST_DOMAIN_ID,
    name: 'Datasys Agent Republic',
    issuerActorId: datasys.id,
    acceptedIssuerIds: [datasys.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });

  const victor = recognitionRuntime.registerActor({
    id: VICTOR_ACTOR_ID,
    type: 'human',
    displayName: 'Victor Valverde',
    issuerId: datasys.id,
    trustDomainId: trustDomain.id,
  });

  const pmfreak = recognitionRuntime.registerActor({
    id: PMFREAK_ACTOR_ID,
    type: 'agent',
    displayName: 'PMFreak Closure Agent',
    issuerId: datasys.id,
    trustDomainId: trustDomain.id,
  });

  const unknownAgent = recognitionRuntime.registerActor({
    id: UNKNOWN_AGENT_ACTOR_ID,
    type: 'external',
    displayName: 'Unknown External Agent',
    status: 'unknown',
  });

  const victorPassport = recognitionRuntime.issuePassport({
    id: 'passport-victor',
    type: 'human_passport',
    subjectActorId: victor.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    claims: { role: 'project-lead' },
  });

  const pmfreakPassport = recognitionRuntime.issuePassport({
    id: 'passport-pmfreak',
    type: 'agent_passport',
    subjectActorId: pmfreak.id,
    issuerActorId: datasys.id,
    trustDomainId: trustDomain.id,
    claims: { role: 'closure-agent' },
  });

  authorityRuntime.registerRootIssuer(trustDomain.id, datasys.id);

  const victorGrant = authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-victor-approval-authority',
    issuerActorId: datasys.id,
    subjectActorId: victor.id,
    trustDomainId: trustDomain.id,
    roleId: 'role-project-manager',
    capability: 'project_closure.approval',
    // Includes the drafting/communication actions (in addition to the approve_* capabilities) so
    // Victor can delegate performing them to PMFreak -- distinct from Victor's own authority to approve them.
    actions: [
      APPROVE_PROJECT_ACTION,
      APPROVE_CLIENT_COMMUNICATION,
      APPROVE_CRITICAL_ACTION,
      'send_client_follow_up',
      'draft_closure_email',
      'summarize_project_status',
    ],
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
  });

  const financeApproverGrant = authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-finance-approver-authority',
    issuerActorId: datasys.id,
    subjectActorId: FINANCE_APPROVER_ACTOR_ID,
    trustDomainId: trustDomain.id,
    roleId: 'role-finance-approver',
    capability: 'finance.approval',
    actions: [APPROVE_FINANCIAL_ACTION, APPROVE_CRITICAL_ACTION],
    resourceScopes: [PROJECT_SCOPE, FINANCE_SCOPE],
    canDelegate: false,
  });

  approvalRuntime.registerApproverRecognitionStatus(victor.id, 'recognized');
  approvalRuntime.registerApproverRecognitionStatus(FINANCE_APPROVER_ACTOR_ID, 'recognized');
  approvalRuntime.registerApproverRecognitionStatus(pmfreak.id, 'agent');
  approvalRuntime.registerApproverRecognitionStatus(unknownAgent.id, 'unknown');

  return {
    trustDomainId: trustDomain.id,
    trustDomain,
    datasys,
    victor,
    pmfreak,
    unknownAgent,
    victorPassport,
    pmfreakPassport,
    victorGrant,
    financeApproverGrant,
  };
}
