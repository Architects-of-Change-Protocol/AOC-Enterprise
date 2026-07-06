import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { AuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { NON_DELEGABLE_ACTIONS, PROJECT_SCOPE, type DatasysAuthorityGraphWorld } from './datasys-authority-graph.fixture.js';

export const VICTOR_GRANT_ACTIONS = [
  'draft_closure_email',
  'summarize_project_status',
  'prepare_invoice_support',
  'send_client_follow_up',
];

export interface VictorAuthorityFixture {
  readonly victorGrant: AuthorityGrant;
}

/** Datasys grants Victor Project Manager authority over project:HMP-14665, delegable to agents up to one hop deep. */
export function buildVictorAuthorityFixture(
  runtime: AuthorityGraphRuntime,
  world: DatasysAuthorityGraphWorld,
): VictorAuthorityFixture {
  const victorGrant = runtime.issueAuthorityGrant({
    id: 'authority-grant-victor-project-manager',
    issuerActorId: world.datasysActorId,
    subjectActorId: world.victorActorId,
    trustDomainId: world.trustDomainId,
    roleId: 'role-project-manager',
    capability: 'project_closure.management',
    actions: VICTOR_GRANT_ACTIONS,
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
    nonDelegableActions: NON_DELEGABLE_ACTIONS,
  });

  return { victorGrant };
}
