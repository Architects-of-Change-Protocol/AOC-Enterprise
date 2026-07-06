import type { AuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';

export const TRUST_DOMAIN_ID = 'trust-domain-datasys-agent-republic';

export const DATASYS_ACTOR_ID = 'actor-datasys';
export const VICTOR_ACTOR_ID = 'actor-victor-valverde';
export const PMFREAK_ACTOR_ID = 'actor-pmfreak-closure-agent';
export const UNKNOWN_AGENT_ACTOR_ID = 'actor-unknown-external-agent';

export const PROJECT_SCOPE = 'project:HMP-14665';
export const OTHER_PROJECT_SCOPE = 'project:GCH-15992';

export const NON_DELEGABLE_ACTIONS = ['send_final_invoice', 'approve_payment', 'sign_contract', 'change_bank_account'];

export interface DatasysAuthorityGraphWorld {
  readonly trustDomainId: string;
  readonly datasysActorId: string;
  readonly victorActorId: string;
  readonly pmfreakActorId: string;
  readonly unknownAgentActorId: string;
}

/**
 * Establishes the "Datasys Agent Republic" trust domain and registers Datasys
 * as its root issuer. Does not, by itself, grant anyone authority -- see
 * victor-authority.fixture.ts and pmfreak-delegation.fixture.ts for that.
 */
export function buildDatasysAuthorityGraphWorld(runtime: AuthorityGraphRuntime): DatasysAuthorityGraphWorld {
  runtime.registerRootIssuer(TRUST_DOMAIN_ID, DATASYS_ACTOR_ID);

  return {
    trustDomainId: TRUST_DOMAIN_ID,
    datasysActorId: DATASYS_ACTOR_ID,
    victorActorId: VICTOR_ACTOR_ID,
    pmfreakActorId: PMFREAK_ACTOR_ID,
    unknownAgentActorId: UNKNOWN_AGENT_ACTOR_ID,
  };
}
