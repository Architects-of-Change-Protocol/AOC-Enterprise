import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { AuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { buildDatasysAuthorityGraphWorld, PROJECT_SCOPE, type DatasysAuthorityGraphWorld } from './datasys-authority-graph.fixture.js';
import { buildPmfreakDelegationFixture } from './pmfreak-delegation.fixture.js';
import { buildVictorAuthorityFixture, VICTOR_GRANT_ACTIONS } from './victor-authority.fixture.js';

const EXPIRED_AT = '2025-01-01T00:00:00.000Z';

export interface AncestorAuthorityScenario {
  readonly world: DatasysAuthorityGraphWorld;
  readonly victorGrant: AuthorityGrant;
  readonly pmfreakDelegation: DelegationGrant;
}

/** Datasys grants Victor authority, Victor delegates to PMFreak, then Datasys revokes Victor's grant. */
export function buildRevokedAncestorScenario(runtime: AuthorityGraphRuntime): AncestorAuthorityScenario {
  const world = buildDatasysAuthorityGraphWorld(runtime);
  const victorAuthority = buildVictorAuthorityFixture(runtime, world);
  const pmfreakDelegation = buildPmfreakDelegationFixture(runtime, world, victorAuthority);

  const victorGrant = runtime.revokeAuthorityGrant(
    victorAuthority.victorGrant.id,
    world.datasysActorId,
    "Datasys revoked Victor's project manager authority.",
  );

  return { world, victorGrant, pmfreakDelegation: pmfreakDelegation.pmfreakDelegation };
}

/** Same shape as the valid Victor -> PMFreak chain, but Victor's own grant already expired. */
export function buildExpiredAncestorScenario(runtime: AuthorityGraphRuntime): AncestorAuthorityScenario {
  const world = buildDatasysAuthorityGraphWorld(runtime);

  const victorGrant = runtime.issueAuthorityGrant({
    id: 'authority-grant-victor-project-manager-expired',
    issuerActorId: world.datasysActorId,
    subjectActorId: world.victorActorId,
    trustDomainId: world.trustDomainId,
    capability: 'project_closure.management',
    actions: VICTOR_GRANT_ACTIONS,
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
    expiresAt: EXPIRED_AT,
  });

  const pmfreakDelegation = runtime.createDelegationGrant({
    id: 'delegation-grant-pmfreak-closure-from-expired',
    delegatorActorId: world.victorActorId,
    delegateActorId: world.pmfreakActorId,
    delegateActorType: 'agent',
    trustDomainId: world.trustDomainId,
    sourceAuthorityGrantId: victorGrant.id,
    capability: 'project_closure.drafting',
    actions: ['draft_closure_email', 'summarize_project_status', 'prepare_invoice_support'],
    resourceScopes: [PROJECT_SCOPE],
    canRedelegate: false,
  });

  return { world, victorGrant, pmfreakDelegation };
}
