import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { AuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { PROJECT_SCOPE, type DatasysAuthorityGraphWorld } from './datasys-authority-graph.fixture.js';
import type { VictorAuthorityFixture } from './victor-authority.fixture.js';

export const PMFREAK_DELEGATED_ACTIONS = ['draft_closure_email', 'summarize_project_status', 'prepare_invoice_support'];

export interface PmfreakDelegationFixture {
  readonly pmfreakDelegation: DelegationGrant;
}

/** Victor delegates limited project-closure authority to PMFreak Closure Agent; PMFreak cannot redelegate. */
export function buildPmfreakDelegationFixture(
  runtime: AuthorityGraphRuntime,
  world: DatasysAuthorityGraphWorld,
  victorAuthority: VictorAuthorityFixture,
): PmfreakDelegationFixture {
  const pmfreakDelegation = runtime.createDelegationGrant({
    id: 'delegation-grant-pmfreak-closure',
    delegatorActorId: world.victorActorId,
    delegateActorId: world.pmfreakActorId,
    delegateActorType: 'agent',
    trustDomainId: world.trustDomainId,
    sourceAuthorityGrantId: victorAuthority.victorGrant.id,
    capability: 'project_closure.drafting',
    actions: PMFREAK_DELEGATED_ACTIONS,
    resourceScopes: [PROJECT_SCOPE],
    canRedelegate: false,
  });

  return { pmfreakDelegation };
}
