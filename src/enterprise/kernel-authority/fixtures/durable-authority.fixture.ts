import type {
  KernelAuthorityAccessContext,
  ProvisionActorInput,
  ProvisionAuthorityGrantInput,
  ProvisionCapabilityTokenInput,
  ProvisionDelegationGrantInput,
  ProvisionPassportInput,
  ProvisionRootIssuerInput,
  ProvisionTrustDomainInput,
} from '../contracts.js';
import type { KernelAuthorityProvisioningService } from '../provisioning-service.js';

/**
 * A generic, application-neutral authority world shaped like the real
 * downstream case: **an authenticated external principal, a workspace-like
 * resource boundary, and one explicit action.**
 *
 * Deliberately generic. It models the *shape* a product integration needs --
 * a human owner, an agent acting for that owner, a scoped resource, a named
 * action -- without naming any product, importing any application's types, or
 * encoding any application's role vocabulary. Frontera can express "actor X
 * may perform action Y on resource Z" on its own terms, and this fixture is
 * the proof; a downstream consumer supplies its own ids for the same shape.
 *
 * It is also the narrow positive control. Nothing here is a wildcard: one
 * action, one resource scope, one delegation of depth one. Widening any of
 * them would make the ALLOW easier to obtain and the negative controls weaker.
 */

export const DURABLE_FIXTURE_ORGANIZATION_ID = 'org-acme';
export const DURABLE_FIXTURE_TRUST_DOMAIN_ID = 'trust-domain-acme';

export const DURABLE_FIXTURE_ISSUER_ACTOR_ID = 'actor-org-acme';
/** The human principal. In a product integration this is the authenticated end user. */
export const DURABLE_FIXTURE_OWNER_ACTOR_ID = 'actor-alice';
/** The agent acting for that principal. In a product integration this is the automation performing the governed action. */
export const DURABLE_FIXTURE_AGENT_ACTOR_ID = 'actor-agent-1';
/** A second human with no authority at all -- the "recognized but unauthorized" negative control. */
export const DURABLE_FIXTURE_OUTSIDER_ACTOR_ID = 'actor-bob';

export const DURABLE_FIXTURE_RESOURCE_SCOPE = 'resource-project-1';
export const DURABLE_FIXTURE_OTHER_RESOURCE_SCOPE = 'resource-project-2';
export const DURABLE_FIXTURE_ACTION = 'execute.material-action';
export const DURABLE_FIXTURE_OTHER_ACTION = 'delete.material-action';
export const DURABLE_FIXTURE_CAPABILITY = 'material-action.execute';

export const DURABLE_FIXTURE_PASSPORT_ID = 'passport-agent-1';
export const DURABLE_FIXTURE_CAPABILITY_TOKEN_ID = 'cap-agent-1';
export const DURABLE_FIXTURE_AUTHORITY_GRANT_ID = 'authority-grant-alice';
export const DURABLE_FIXTURE_DELEGATION_GRANT_ID = 'delegation-grant-agent-1';

/** The external identity system the owner's application principal comes from. An opaque label -- Frontera reads no semantics from it. */
export const DURABLE_FIXTURE_EXTERNAL_SYSTEM = 'example-app';
export const DURABLE_FIXTURE_EXTERNAL_SUBJECT_ID = 'external-user-42';

/** The operator context every provisioning call in this fixture is made under. Never available to an evaluation. */
export const DURABLE_FIXTURE_OPERATOR: KernelAuthorityAccessContext = { system: true, actorId: 'operator-acme-admin' };

export interface DurableAuthorityFixtureIds {
  readonly organizationId: string;
  readonly trustDomainId: string;
  readonly issuerActorId: string;
  readonly ownerActorId: string;
  readonly agentActorId: string;
  readonly resourceScope: string;
  readonly action: string;
  readonly capability: string;
  readonly passportId: string;
  readonly capabilityTokenId: string;
  readonly authorityGrantId: string;
  readonly delegationGrantId: string;
}

/** The seven provisioning payloads that compose one narrow ALLOW, exposed individually so a test can provision a *partial* world and prove the missing piece is what denies. */
export interface DurableAuthorityFixturePayloads {
  readonly issuerActor: ProvisionActorInput;
  readonly trustDomain: ProvisionTrustDomainInput;
  readonly ownerActor: ProvisionActorInput;
  readonly agentActor: ProvisionActorInput;
  readonly passport: ProvisionPassportInput;
  readonly capabilityToken: ProvisionCapabilityTokenInput;
  readonly rootIssuer: ProvisionRootIssuerInput;
  readonly authorityGrant: ProvisionAuthorityGrantInput;
  readonly delegationGrant: ProvisionDelegationGrantInput;
}

export function buildDurableAuthorityPayloads(
  organizationId: string = DURABLE_FIXTURE_ORGANIZATION_ID,
  trustDomainId: string = DURABLE_FIXTURE_TRUST_DOMAIN_ID,
): DurableAuthorityFixturePayloads {
  // `organizationId` deliberately participates only through the store's own
  // tenancy scope, never by being baked into an id: two organizations
  // provisioning the identical actor id is the exact collision the isolation
  // tests need to be able to construct.
  void organizationId;
  return {
    issuerActor: { actorId: DURABLE_FIXTURE_ISSUER_ACTOR_ID, type: 'organization', displayName: 'Acme' },
    trustDomain: {
      trustDomainId,
      name: 'Acme Trust Domain',
      issuerActorId: DURABLE_FIXTURE_ISSUER_ACTOR_ID,
      acceptedIssuerIds: [DURABLE_FIXTURE_ISSUER_ACTOR_ID],
      acceptedActorTypes: ['human', 'organization', 'agent'],
    },
    ownerActor: {
      actorId: DURABLE_FIXTURE_OWNER_ACTOR_ID,
      type: 'human',
      displayName: 'Alice',
      issuerId: DURABLE_FIXTURE_ISSUER_ACTOR_ID,
      trustDomainId,
      externalSubject: { system: DURABLE_FIXTURE_EXTERNAL_SYSTEM, subjectId: DURABLE_FIXTURE_EXTERNAL_SUBJECT_ID },
    },
    agentActor: {
      actorId: DURABLE_FIXTURE_AGENT_ACTOR_ID,
      type: 'agent',
      displayName: 'Acme Automation Agent',
      issuerId: DURABLE_FIXTURE_ISSUER_ACTOR_ID,
      trustDomainId,
    },
    passport: {
      passportId: DURABLE_FIXTURE_PASSPORT_ID,
      type: 'agent_passport',
      subjectActorId: DURABLE_FIXTURE_AGENT_ACTOR_ID,
      issuerActorId: DURABLE_FIXTURE_ISSUER_ACTOR_ID,
      trustDomainId,
    },
    capabilityToken: {
      capabilityTokenId: DURABLE_FIXTURE_CAPABILITY_TOKEN_ID,
      subjectActorId: DURABLE_FIXTURE_AGENT_ACTOR_ID,
      principalActorId: DURABLE_FIXTURE_OWNER_ACTOR_ID,
      issuerActorId: DURABLE_FIXTURE_OWNER_ACTOR_ID,
      trustDomainId,
      capability: DURABLE_FIXTURE_CAPABILITY,
      actions: [DURABLE_FIXTURE_ACTION],
      resourceScopes: [DURABLE_FIXTURE_RESOURCE_SCOPE],
      riskLevel: 'medium',
    },
    rootIssuer: { trustDomainId, actorId: DURABLE_FIXTURE_ISSUER_ACTOR_ID },
    authorityGrant: {
      authorityGrantId: DURABLE_FIXTURE_AUTHORITY_GRANT_ID,
      issuerActorId: DURABLE_FIXTURE_ISSUER_ACTOR_ID,
      subjectActorId: DURABLE_FIXTURE_OWNER_ACTOR_ID,
      trustDomainId,
      roleId: 'role-resource-owner',
      capability: 'material-action.manage',
      actions: [DURABLE_FIXTURE_ACTION],
      resourceScopes: [DURABLE_FIXTURE_RESOURCE_SCOPE],
      canDelegate: true,
      allowedDelegateActorTypes: ['agent'],
      maxDelegationDepth: 1,
    },
    delegationGrant: {
      delegationGrantId: DURABLE_FIXTURE_DELEGATION_GRANT_ID,
      delegatorActorId: DURABLE_FIXTURE_OWNER_ACTOR_ID,
      delegateActorId: DURABLE_FIXTURE_AGENT_ACTOR_ID,
      delegateActorType: 'agent',
      trustDomainId,
      sourceAuthorityGrantId: DURABLE_FIXTURE_AUTHORITY_GRANT_ID,
      capability: DURABLE_FIXTURE_CAPABILITY,
      actions: [DURABLE_FIXTURE_ACTION],
      resourceScopes: [DURABLE_FIXTURE_RESOURCE_SCOPE],
      canRedelegate: false,
    },
  };
}

/**
 * Provisions the complete fixture world through the public operator surface --
 * never by writing store rows directly, so what a test proves is what an
 * operator can actually do.
 */
export async function provisionDurableAuthorityFixture(
  service: KernelAuthorityProvisioningService,
  options: { readonly trustDomainId?: string; readonly operator?: KernelAuthorityAccessContext } = {},
): Promise<DurableAuthorityFixtureIds> {
  const operator = options.operator ?? DURABLE_FIXTURE_OPERATOR;
  const trustDomainId = options.trustDomainId ?? DURABLE_FIXTURE_TRUST_DOMAIN_ID;
  const payloads = buildDurableAuthorityPayloads(service.organizationId, trustDomainId);

  await service.provisionActor(operator, payloads.issuerActor);
  await service.provisionTrustDomain(operator, payloads.trustDomain);
  await service.provisionActor(operator, payloads.ownerActor);
  await service.provisionActor(operator, payloads.agentActor);
  await service.provisionPassport(operator, payloads.passport);
  await service.provisionCapabilityToken(operator, payloads.capabilityToken);
  await service.provisionRootIssuer(operator, payloads.rootIssuer);
  await service.provisionAuthorityGrant(operator, payloads.authorityGrant);
  await service.provisionDelegationGrant(operator, payloads.delegationGrant);

  return {
    organizationId: service.organizationId,
    trustDomainId,
    issuerActorId: DURABLE_FIXTURE_ISSUER_ACTOR_ID,
    ownerActorId: DURABLE_FIXTURE_OWNER_ACTOR_ID,
    agentActorId: DURABLE_FIXTURE_AGENT_ACTOR_ID,
    resourceScope: DURABLE_FIXTURE_RESOURCE_SCOPE,
    action: DURABLE_FIXTURE_ACTION,
    capability: DURABLE_FIXTURE_CAPABILITY,
    passportId: DURABLE_FIXTURE_PASSPORT_ID,
    capabilityTokenId: DURABLE_FIXTURE_CAPABILITY_TOKEN_ID,
    authorityGrantId: DURABLE_FIXTURE_AUTHORITY_GRANT_ID,
    delegationGrantId: DURABLE_FIXTURE_DELEGATION_GRANT_ID,
  };
}

/** The canonical matching request: the agent acting for its principal, on the exact scope and action it was granted. */
export function buildDurableFixtureRequest(
  ids: DurableAuthorityFixtureIds,
  overrides: {
    readonly requestId?: string;
    readonly actorId?: string;
    readonly action?: string;
    readonly resourceScope?: string;
    readonly organizationId?: string;
    readonly requestedAt?: string;
  } = {},
) {
  return {
    requestId: overrides.requestId ?? 'req-durable-authority-1',
    actor: {
      id: overrides.actorId ?? ids.agentActorId,
      principalId: ids.ownerActorId,
      trustDomainId: ids.trustDomainId,
      type: 'agent',
    },
    action: {
      type: overrides.action ?? ids.action,
      resourceScope: overrides.resourceScope ?? ids.resourceScope,
      capability: ids.capability,
    },
    organization: { id: overrides.organizationId ?? ids.organizationId },
    requestedAt: overrides.requestedAt ?? '2026-01-01T00:00:00.000Z',
  };
}
