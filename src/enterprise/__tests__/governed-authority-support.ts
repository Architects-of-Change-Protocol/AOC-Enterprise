import { GOVERNED_RIGHT_TYPES, type GovernedRightType, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';
import type {
  GovernedRepresentativeAuthority,
  GovernedRepresentativeBasis,
  GovernedRepresentativeScopeLimit,
} from '@aoc-enterprise/governed-authority';
import { ENTERPRISE_COLLATERALIZE_CAPABILITY, type EnterpriseCollateralizationTerms } from '@aoc-enterprise/collateralization-mandate';
import { ENTERPRISE_LICENSE_CAPABILITY, ENTERPRISE_LICENSED_USE_TYPES, type EnterpriseLicenseTerms } from '@aoc-enterprise/license-mandate';
import { ENTERPRISE_TOKENIZE_CAPABILITY, type EnterpriseTokenizationTerms } from '@aoc-enterprise/tokenization-mandate';
import { ENTERPRISE_TRANSFER_CAPABILITY, type EnterpriseTransferTerms } from '@aoc-enterprise/transfer-mandate';

import { bridgeRecognitionRuntime } from '../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { createManualEnforcementClock, createSequentialEnforcementIdGenerator } from '../../features/action-enforcement/runtime/enforcement-runtime-context.js';
import { ApprovalRuntime } from '../../features/approval-runtime/runtime/approval-runtime.js';
import { createApprovalRuntimeContext } from '../../features/approval-runtime/runtime/approval-runtime-context.js';
import { createAuthorityGraphRuntime, type AuthorityGraphRuntime } from '../../features/authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../features/authority-graph/runtime/authority-runtime-context.js';
import { createAocRecognitionRuntime } from '../../features/recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../features/recognition-runtime/runtime/runtime-context.js';
import { createAocKernel, type AocKernel } from '../../kernel/index.js';
import {
  createGovernedAuthorityResolver,
  createGovernedRepresentationResolver,
  createInMemoryGovernedAuthorityStore,
  createInMemoryGovernedRepresentationStore,
  type GovernedAuthorityStore,
  type GovernedRepresentationDelegationPort,
  type GovernedRepresentationStore,
  type UnenrolledResourcePolicy,
} from '../authority-governance/index.js';
import { createInMemoryCollateralizationMandateStore } from '../collateralization-governance/in-memory-mandate-store.js';
import { createCollateralizationGovernanceService, type CollateralizationGovernanceService } from '../collateralization-governance/service.js';
import type { GovernanceEnterpriseContext } from '../governance-store/contracts.js';
import { createInMemoryGovernanceStore } from '../governance-store/in-memory-governance-store.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { createInMemoryLicenseMandateStore } from '../license-governance/in-memory-mandate-store.js';
import { createLicenseGovernanceService, type LicenseGovernanceService } from '../license-governance/service.js';
import { createInMemoryTokenizationMandateStore } from '../tokenization-governance/in-memory-mandate-store.js';
import { createTokenizationGovernanceService, type TokenizationGovernanceService } from '../tokenization-governance/service.js';
import { createInMemoryTransferMandateStore } from '../transfer-governance/in-memory-mandate-store.js';
import type { TransferMandateStore } from '../transfer-governance/mandate-store.js';
import { createTransferGovernanceService, type RecordTransferExecutionRequest, type TransferGovernanceService } from '../transfer-governance/service.js';

/**
 * One seeded world in which **all four governed actions run over one Kernel,
 * one recognition/authority/approval stack, and one Governed Authority Store**.
 *
 * That sharing is the entire point of this fixture rather than an economy. The
 * claim this foundation has to make good on is *cross-action continuity*: that
 * authority Bob receives through a completed `TRANSFER` is the same authority a
 * later `LICENSE`, `TOKENIZE` or `COLLATERALIZE` consults, resolved by the same
 * generic resolver, with no action-specific special case anywhere. Four
 * separate worlds could not demonstrate it — each action would simply be
 * checking a store only it wrote to.
 *
 * Nothing here is a decision engine, a fake or a stub. Recognition Runtime,
 * Authority Graph, Approval Runtime, `AocKernel`, the Governance Store and the
 * four mandate stores are the real implementations, wired as production wires
 * them; the only addition is the Governed Authority Store and the resolver the
 * Kernel consults through its optional provider port.
 *
 * The reference world, kept deliberately generic, asset-neutral and
 * jurisdiction-free:
 *
 * ```
 * asset          asset:governed-asset-a     the rights belong to it
 * Alice          party-alice                holds 100% of the economic interest
 * Bob            party-bob                  holds nothing, initially
 * Carol          party-carol                a third party, for multi-recipient
 * manager        actor-rights-manager       a delegated administrator: holds nothing
 * usage holder   party-usage-only           holds the usage right and nothing else
 * ```
 *
 * `actor-rights-manager` and `party-alice` are different identifiers on
 * purpose, and keeping them apart is what the authority-basis-vs-action-target
 * distinction *is*: the manager is authorized to act, Alice is recognized as
 * holding, and neither fact implies the other.
 */

export const GA_NOW = '2026-01-01T00:00:00.000Z';
export const GA_MANDATE_EXPIRES_AT = '2026-07-01T00:00:00.000Z';
/**
 * Deliberately the same instant as `GA_NOW`.
 *
 * The runtimes here use a fixed manual clock, and a credited position becomes
 * effective when the movement did — so an execution dated after the clock
 * produces authority that is correctly *pending* and correctly refuses to
 * authorize anything yet. That is real behaviour rather than a fixture
 * problem, and it is asserted directly in
 * `governed-authority-resolver.test.ts`. Holding the reference scenario at one
 * instant keeps it about conservation and continuity, which is what it exists
 * to demonstrate.
 */
export const GA_EXECUTED_AT = GA_NOW;

export const GA_TENANT_A = 'org-meridian-holdings';
export const GA_TENANT_B = 'org-northwind-capital';

export const GA_TRUST_DOMAIN_ID = 'trust-domain-meridian-holdings';

export const GA_ORG_ACTOR_ID = 'actor-meridian-holdings';
/** The delegated administrator that submits every request below. Holds no governed right of its own, ever. */
export const GA_MANAGER_ACTOR_ID = 'actor-rights-manager';
/** Recognized, but holds no capability token and no authority grant. Proves that a valid representation rescues nothing. */
export const GA_UNAUTHORIZED_ACTOR_ID = 'actor-unauthorized-administrator';
export const GA_UNAUTHORIZED_PASSPORT_ID = 'passport-unauthorized-administrator';
/** A second representative, used to show that bindings to the same holder are independent of one another. */
export const GA_SECOND_MANAGER_ACTOR_ID = 'actor-rights-manager-two';

/**
 * An agent the manager can delegate to, for the derived-authority scenarios.
 *
 * An *agent* rather than a human on purpose: Recognition's `requiresAuthorityChain`
 * routes every agent request through the Authority Graph, so a request submitted
 * as this actor genuinely has to produce a valid delegation lineage rather than
 * being satisfied by its capability token alone.
 */
export const GA_DELEGATE_ACTOR_ID = 'actor-delegated-agent';
export const GA_DELEGATE_PASSPORT_ID = 'passport-delegated-agent';
export const GA_DELEGATE_TOKEN_ID = 'cap-delegated-agent-governed-actions';
/** A second agent, one hop further down, for the subdelegation scenarios. */
export const GA_SUBDELEGATE_ACTOR_ID = 'actor-subdelegated-agent';
export const GA_SUBDELEGATE_PASSPORT_ID = 'passport-subdelegated-agent';
export const GA_SUBDELEGATE_TOKEN_ID = 'cap-subdelegated-agent-governed-actions';
/** The manager's own asset-scoped grant, named so a test can revoke or subdelegate from it. */
export const GA_MANAGER_GRANT_ID = 'authority-grant-manager-governed-actions';

export const GA_ASSET = { kind: 'asset', id: 'governed-asset-a', tenantId: GA_TENANT_A } as const;
export const GA_ASSET_SCOPE = `${GA_ASSET.kind}:${GA_ASSET.id}`;
export const GA_TENANT_B_ASSET = { kind: 'asset', id: 'northwind-asset-b', tenantId: GA_TENANT_B } as const;

export const GA_MANAGER_PASSPORT_ID = 'passport-rights-manager';
export const GA_MANAGER_TOKEN_ID = 'cap-manager-governed-actions';
export const GA_ALICE_PASSPORT_ID = 'passport-alice';
export const GA_ALICE_TOKEN_ID = 'cap-alice-governed-actions';

/** Holds the whole economic interest at the start of the reference scenario. */
export const ALICE = 'party-alice';
/** Holds nothing at the start; receives 25% and must then be recognized for it. */
export const BOB = 'party-bob';
/** A third recipient, used to show that several transitions compose without a batch primitive. */
export const CAROL = 'party-carol';
/** Holds the usage right and nothing else — the actor that proves a right mismatch is denied. */
export const USAGE_ONLY_HOLDER = 'party-usage-only';
/** Holds a unitized position, proving conservation is not proportional-only. */
export const UNIT_HOLDER = 'party-unit-holder';

export const GA_EXECUTOR_REF = 'provider-transfer-agent-c';
export const GA_SECURED_PARTY_REF = 'party-lender-b';
export const GA_REGISTRY = 'registry-alpha';

export const FULL_INTEREST: GovernedRightsScope = { kind: 'proportional', basisPoints: 10_000 };
export const QUARTER_INTEREST: GovernedRightsScope = { kind: 'proportional', basisPoints: 2_500 };

function testEnterpriseContext(): GovernanceEnterpriseContext {
  return { enterpriseVersion: '1.0.0-test', lifecycleState: 'ready', modules: [] };
}

export interface GovernedAuthorityWorld {
  readonly kernel: AocKernel;
  /**
   * The Authority Graph runtime behind this world's Recognition provider.
   *
   * Exposed so a test can create, subdelegate and revoke `DelegationGrant`s and
   * observe the effect on a real governed request. Purely additive: every
   * pre-existing test ignores it and is unaffected.
   */
  readonly authorityRuntime: AuthorityGraphRuntime;
  readonly governanceStore: GovernanceStore;
  readonly authorityStore: GovernedAuthorityStore;
  /** Present only when the world was built with `withRepresentation`. Absent reproduces a deployment that has not adopted holder-bound representation. */
  readonly representationStore?: GovernedRepresentationStore;
  readonly transferStore: TransferMandateStore;
  readonly transfer: TransferGovernanceService;
  readonly license: LicenseGovernanceService;
  readonly tokenization: TokenizationGovernanceService;
  readonly collateralization: CollateralizationGovernanceService;
}

export interface GovernedAuthorityWorldOverrides {
  readonly governanceStore?: GovernanceStore;
  readonly authorityStore?: GovernedAuthorityStore;
  readonly transferStore?: TransferMandateStore;
  /** Overrides the id prefix counter seed so a second process's ids do not collide with the first's. */
  readonly idSeed?: number;
  /** Omits the Kernel's governed-authority provider entirely, reproducing a deployment that has not adopted right-scoped authority at all. */
  readonly withoutGovernedAuthority?: boolean;
  readonly unenrolledResourcePolicy?: UnenrolledResourcePolicy;
  /** Omits the transfer service's authority store, so executions record evidence and move no authority — the pre-foundation behaviour, kept reachable for the before/after comparison. */
  readonly withoutTransferAuthorityTransition?: boolean;
  /**
   * Configures the Kernel's holder-bound representation provider.
   *
   * Deliberately **off by default**, and that default is what makes the
   * before/after measurement possible rather than asserted: every existing test
   * in this directory builds a world without it and continues to observe the
   * pre-hardening behaviour, while the representation suite builds one with it
   * and observes the same requests denied. Turning it on globally would have
   * rewritten the prior foundation's findings instead of adding to them.
   */
  readonly withRepresentation?: boolean;
  readonly representationStore?: GovernedRepresentationStore;
  /** Lets a test ground representations in Authority Graph delegations, and revoke those delegations to prove the dependency is dynamic. */
  readonly delegations?: GovernedRepresentationDelegationPort;
  /**
   * Makes the manager's asset-scoped grant delegable, up to this many hops.
   *
   * Off by default so the grant keeps the exact legacy shape every existing
   * test observes -- `canDelegate: false`, which is what a grant that no one
   * ever delegated from has always looked like.
   */
  readonly managerDelegationDepth?: number;
}

export function buildGovernedAuthorityWorld(overrides: GovernedAuthorityWorldOverrides = {}): GovernedAuthorityWorld {
  const recognitionCtx: RuntimeContext = { clock: createManualClock(GA_NOW), idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(GA_NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(GA_NOW), { authorityGraph: authorityRuntime });
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime);

  const capabilities = [
    ENTERPRISE_TRANSFER_CAPABILITY,
    ENTERPRISE_LICENSE_CAPABILITY,
    ENTERPRISE_TOKENIZE_CAPABILITY,
    ENTERPRISE_COLLATERALIZE_CAPABILITY,
  ];

  const org = recognitionRuntime.registerActor({ id: GA_ORG_ACTOR_ID, type: 'organization', displayName: 'Meridian Holdings' });
  const trustDomain = recognitionRuntime.createTrustDomain({
    id: GA_TRUST_DOMAIN_ID,
    name: 'Meridian Holdings Governed Authority',
    issuerActorId: org.id,
    acceptedIssuerIds: [org.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });

  const manager = recognitionRuntime.registerActor({
    id: GA_MANAGER_ACTOR_ID,
    type: 'human',
    displayName: 'Rights Manager',
    issuerId: org.id,
    trustDomainId: trustDomain.id,
  });

  recognitionRuntime.issuePassport({
    id: GA_MANAGER_PASSPORT_ID,
    type: 'human_passport',
    subjectActorId: manager.id,
    issuerActorId: org.id,
    trustDomainId: trustDomain.id,
  });

  // Alice, additionally registered as an actor that can *call*.
  //
  // Holder refs and actor ids are different namespaces on purpose — a holder
  // "need not be an actor that can call anything" — but a holder that also
  // happens to be one is the ordinary case, and it is the only way to exercise
  // the direct-holder path for the reference holder. Purely additive: every
  // pre-existing test submits as the manager and is unaffected by Alice
  // gaining the ability to submit for herself.
  const aliceActor = recognitionRuntime.registerActor({
    id: ALICE,
    type: 'organization',
    displayName: 'Alice',
    issuerId: org.id,
    trustDomainId: trustDomain.id,
  });
  recognitionRuntime.issuePassport({
    id: GA_ALICE_PASSPORT_ID,
    type: 'organization_passport',
    subjectActorId: aliceActor.id,
    issuerActorId: org.id,
    trustDomainId: trustDomain.id,
  });
  recognitionRuntime.issueCapabilityToken({
    id: GA_ALICE_TOKEN_ID,
    subjectActorId: aliceActor.id,
    principalActorId: aliceActor.id,
    issuerActorId: org.id,
    trustDomainId: trustDomain.id,
    capability: ENTERPRISE_TRANSFER_CAPABILITY,
    actions: capabilities,
    resourceScopes: [GA_ASSET_SCOPE],
    riskLevel: 'critical',
  });
  approvalRuntime.registerApproverRecognitionStatus(aliceActor.id, 'recognized');

  // A recognized actor that is deliberately given **no** capability token and
  // **no** authority grant. It exists for one row of the dual-proof matrix:
  // an actor that can be granted a perfectly valid representation and still
  // must not get anywhere, because representation is not action authority and
  // never substitutes for it.
  const outsider = recognitionRuntime.registerActor({
    id: GA_UNAUTHORIZED_ACTOR_ID,
    type: 'human',
    displayName: 'Unauthorized Administrator',
    issuerId: org.id,
    trustDomainId: trustDomain.id,
  });
  recognitionRuntime.issuePassport({
    id: GA_UNAUTHORIZED_PASSPORT_ID,
    type: 'human_passport',
    subjectActorId: outsider.id,
    issuerActorId: org.id,
    trustDomainId: trustDomain.id,
  });

  // Two agents the manager may delegate to. They are registered and passported
  // unconditionally, and hold capability tokens covering the four actions, so
  // the *only* thing a derived-authority test has to arrange is the delegation
  // itself. Neither holds an `AuthorityGrant`, which is the point: an agent's
  // action authority has to arrive through a delegation or not at all.
  for (const agent of [
    { actorId: GA_DELEGATE_ACTOR_ID, passportId: GA_DELEGATE_PASSPORT_ID, tokenId: GA_DELEGATE_TOKEN_ID, name: 'Delegated Agent' },
    { actorId: GA_SUBDELEGATE_ACTOR_ID, passportId: GA_SUBDELEGATE_PASSPORT_ID, tokenId: GA_SUBDELEGATE_TOKEN_ID, name: 'Subdelegated Agent' },
  ]) {
    recognitionRuntime.registerActor({ id: agent.actorId, type: 'agent', displayName: agent.name, issuerId: org.id, trustDomainId: trustDomain.id });
    recognitionRuntime.issuePassport({ id: agent.passportId, type: 'agent_passport', subjectActorId: agent.actorId, issuerActorId: org.id, trustDomainId: trustDomain.id });
    recognitionRuntime.issueCapabilityToken({
      id: agent.tokenId,
      subjectActorId: agent.actorId,
      principalActorId: agent.actorId,
      issuerActorId: org.id,
      trustDomainId: trustDomain.id,
      capability: ENTERPRISE_TRANSFER_CAPABILITY,
      actions: capabilities,
      resourceScopes: [GA_ASSET_SCOPE],
      riskLevel: 'critical',
    });
    approvalRuntime.registerApproverRecognitionStatus(agent.actorId, 'recognized');
  }

  // One broad, bare *asset-scoped* capability and authority grant covering all
  // four actions. Deliberately broad: the manager can call anything on this
  // asset, so nothing below is denied by the capability chain and every denial
  // the tests observe is attributable to governed authority alone. This is also
  // exactly the legacy shape — a grant with no governed-right field, which is
  // the only shape `AuthorityGrant` has ever had.
  recognitionRuntime.issueCapabilityToken({
    id: GA_MANAGER_TOKEN_ID,
    subjectActorId: manager.id,
    principalActorId: manager.id,
    issuerActorId: org.id,
    trustDomainId: trustDomain.id,
    capability: ENTERPRISE_TRANSFER_CAPABILITY,
    actions: capabilities,
    resourceScopes: [GA_ASSET_SCOPE],
    riskLevel: 'critical',
  });

  authorityRuntime.registerRootIssuer(trustDomain.id, org.id);
  authorityRuntime.issueAuthorityGrant({
    id: GA_MANAGER_GRANT_ID,
    issuerActorId: org.id,
    subjectActorId: manager.id,
    trustDomainId: trustDomain.id,
    roleId: 'role-rights-manager',
    capability: ENTERPRISE_TRANSFER_CAPABILITY,
    actions: capabilities,
    resourceScopes: [GA_ASSET_SCOPE],
    canDelegate: overrides.managerDelegationDepth !== undefined,
    ...(overrides.managerDelegationDepth !== undefined
      ? { maxDelegationDepth: overrides.managerDelegationDepth, allowedDelegateActorTypes: ['agent', 'human', 'organization'] as const }
      : {}),
  });
  approvalRuntime.registerApproverRecognitionStatus(manager.id, 'recognized');
  authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-alice-governed-actions',
    issuerActorId: org.id,
    subjectActorId: ALICE,
    trustDomainId: trustDomain.id,
    capability: ENTERPRISE_TRANSFER_CAPABILITY,
    actions: capabilities,
    resourceScopes: [GA_ASSET_SCOPE],
    canDelegate: false,
  });

  const authorityStore = overrides.authorityStore ?? createInMemoryGovernedAuthorityStore({ now: () => GA_NOW });
  const representationStore =
    overrides.withRepresentation === true || overrides.representationStore !== undefined
      ? (overrides.representationStore ??
        createInMemoryGovernedRepresentationStore({
          now: () => GA_NOW,
          ...(overrides.delegations !== undefined ? { delegations: overrides.delegations } : {}),
        }))
      : undefined;

  const kernel = createAocKernel({
    recognitionProvider: bridgeRecognitionRuntime(recognitionRuntime),
    clock: createManualEnforcementClock(GA_NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
    ...(overrides.withoutGovernedAuthority === true
      ? {}
      : {
          governedAuthorityProvider: createGovernedAuthorityResolver(authorityStore, {
            ...(overrides.unenrolledResourcePolicy !== undefined ? { unenrolledResourcePolicy: overrides.unenrolledResourcePolicy } : {}),
          }),
        }),
    ...(representationStore === undefined
      ? {}
      : {
          governedRepresentationProvider: createGovernedRepresentationResolver(representationStore, {
            ...(overrides.delegations !== undefined ? { delegations: overrides.delegations } : {}),
          }),
        }),
  });

  const governanceStore = overrides.governanceStore ?? createInMemoryGovernanceStore();
  const transferStore = overrides.transferStore ?? createInMemoryTransferMandateStore({ now: () => GA_NOW });

  let counter = overrides.idSeed ?? 0;
  const nextId = (prefix: string): string => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
  const shared = { kernel, governanceStore, enterpriseContext: testEnterpriseContext, now: () => GA_NOW, nextId } as const;

  return {
    kernel,
    authorityRuntime,
    governanceStore,
    authorityStore,
    ...(representationStore !== undefined ? { representationStore } : {}),
    transferStore,
    transfer: createTransferGovernanceService({
      ...shared,
      store: transferStore,
      ...(overrides.withoutTransferAuthorityTransition === true ? {} : { authorityStore }),
    }),
    license: createLicenseGovernanceService({ ...shared, store: createInMemoryLicenseMandateStore({ now: () => GA_NOW }) }),
    tokenization: createTokenizationGovernanceService({ ...shared, store: createInMemoryTokenizationMandateStore({ now: () => GA_NOW }) }),
    collateralization: createCollateralizationGovernanceService({ ...shared, store: createInMemoryCollateralizationMandateStore({ now: () => GA_NOW }) }),
  };
}

/** The privileged administrative context. The only context that may create authority, and never reachable from any request path. */
export const ADMIN_CONTEXT = { system: true, actorId: 'actor-administrator' } as const;
/** The ordinary tenant-scoped context every governed request below runs under. */
export const TENANT_CONTEXT = { system: false, organizationId: GA_TENANT_A, actorId: 'actor-test' } as const;
export const TENANT_B_CONTEXT = { system: false, organizationId: GA_TENANT_B, actorId: 'actor-test-b' } as const;

/**
 * Seeds a starting position. The administrative bootstrap is the only way
 * authority enters a deployment, and it exists as a *store* operation reachable
 * only from a system context — never as a request an actor could submit about
 * itself.
 */
export async function seedPosition(
  world: GovernedAuthorityWorld,
  holderRef: string,
  governedRight: GovernedRightType,
  scope: GovernedRightsScope,
  options: { readonly tenantId?: string; readonly resource?: { kind: string; id: string }; readonly expiresAt?: string; readonly effectiveFrom?: string } = {},
): Promise<void> {
  await world.authorityStore.bootstrapPosition(ADMIN_CONTEXT, {
    tenantId: options.tenantId ?? GA_TENANT_A,
    holderRef,
    resource: options.resource ?? { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight,
    scope,
    basis: { kind: 'administrative-bootstrap', assertedBy: 'actor-administrator' },
    effectiveFrom: options.effectiveFrom ?? GA_NOW,
    ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
  });
}

/** Reads back how much of a right a party is currently recognized as controlling, as a plain number, so assertions read like the scenario they describe. */
export async function heldScope(
  world: GovernedAuthorityWorld,
  holderRef: string,
  governedRight: GovernedRightType,
  options: { readonly tenantId?: string; readonly resource?: { kind: string; id: string } } = {},
): Promise<GovernedRightsScope | null> {
  const position = await world.authorityStore.getPosition(
    ADMIN_CONTEXT,
    options.tenantId ?? GA_TENANT_A,
    holderRef,
    options.resource ?? { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRight,
  );
  return position === null ? null : position.scope;
}

// ---------------------------------------------------------------------------
// Terms builders. Each is the minimum valid terms object for its action, with
// the governed right and scope pulled out as parameters so a test can say what
// it means: "Alice transfers 2500 bp of the economic interest to Bob".
// ---------------------------------------------------------------------------

export function transferTerms(
  transferorRef: string,
  transfereeRef: string,
  rights: readonly GovernedRightType[],
  scope: GovernedRightsScope,
  overrides: Partial<EnterpriseTransferTerms> = {},
): EnterpriseTransferTerms {
  return {
    rights,
    transferorRef,
    transfereeRef,
    scope,
    executorRef: GA_EXECUTOR_REF,
    constraints: { partialTransferAllowed: false, onwardTransferAllowed: 'permitted', permittedRegistries: [GA_REGISTRY] },
    ...overrides,
  };
}

export function licenseTerms(rights: readonly GovernedRightType[], rightsScope?: GovernedRightsScope, overrides: Partial<EnterpriseLicenseTerms> = {}): EnterpriseLicenseTerms {
  return {
    rights,
    licenseeRef: 'party-licensee',
    permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY],
    exclusivity: 'non-exclusive',
    constraints: { sublicensing: 'prohibited', assignment: 'prohibited', additionalLicensesAllowed: true },
    ...(rightsScope !== undefined ? { rightsScope } : {}),
    ...overrides,
  };
}

export function tokenizationTerms(rights: readonly GovernedRightType[], scope: GovernedRightsScope, overrides: Partial<EnterpriseTokenizationTerms> = {}): EnterpriseTokenizationTerms {
  return {
    rights,
    scope,
    executorRef: 'provider-token-platform-c',
    constraints: { maximumIssuedUnits: 1_000_000, permittedNetworks: ['network-alpha'], transferRestricted: true, additionalIssuanceAllowed: false },
    ...overrides,
  };
}

export function collateralizationTerms(
  rights: readonly GovernedRightType[],
  scope: GovernedRightsScope,
  overrides: Partial<EnterpriseCollateralizationTerms> = {},
): EnterpriseCollateralizationTerms {
  return {
    rights,
    scope,
    securedObligationRef: 'obligation-001',
    securedObligationKind: 'credit-facility',
    securedPartyRef: GA_SECURED_PARTY_REF,
    executorRef: 'provider-collateral-platform-c',
    constraints: { permittedRegistries: [GA_REGISTRY], exclusive: true, releaseEvidenceRequired: false, additionalCollateralizationAllowed: false },
    ...overrides,
  };
}

/** The common request envelope every action below shares: submitted by the delegated manager, over the reference asset, under the reference trust domain. */
function baseRequest(requestId: string, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    requestId,
    correlationId: `corr-${requestId}`,
    asset: GA_ASSET,
    requestedBy: GA_MANAGER_ACTOR_ID,
    trustDomainId: GA_TRUST_DOMAIN_ID,
    context: { passportId: GA_MANAGER_PASSPORT_ID, capabilityTokenId: GA_MANAGER_TOKEN_ID },
    mandateExpiresAt: GA_MANDATE_EXPIRES_AT,
    ...overrides,
  };
}

export function transferRequest(requestId: string, terms: EnterpriseTransferTerms, overrides: Record<string, unknown> = {}) {
  return baseRequest(requestId, { terms, ...overrides }) as never;
}

/**
 * `authorityHolderRef` is explicit for the three non-transfer actions, because
 * their terms genuinely name no holder: the manager submits, and the party
 * whose authority is drawn on has to be stated. `TRANSFER` takes it from
 * `terms.transferorRef` and offers no override at all.
 */
export function licenseRequest(requestId: string, holderRef: string, terms: EnterpriseLicenseTerms, overrides: Record<string, unknown> = {}) {
  return baseRequest(requestId, { terms, authorityHolderRef: holderRef, ...overrides }) as never;
}

export function tokenizationRequest(requestId: string, holderRef: string, terms: EnterpriseTokenizationTerms, overrides: Record<string, unknown> = {}) {
  return baseRequest(requestId, { terms, authorityHolderRef: holderRef, ...overrides }) as never;
}

export function collateralizationRequest(requestId: string, holderRef: string, terms: EnterpriseCollateralizationTerms, overrides: Record<string, unknown> = {}) {
  return baseRequest(requestId, { terms, authorityHolderRef: holderRef, ...overrides }) as never;
}

/** The "the authorized provider reports it effected exactly what was authorized" execution report, for a mandate whose terms these arguments mirror. */
export function conformingExecution(
  mandateId: string,
  transferorRef: string,
  transfereeRef: string,
  rights: readonly GovernedRightType[],
  transferredScope: GovernedRightsScope,
  overrides: Partial<RecordTransferExecutionRequest> = {},
): RecordTransferExecutionRequest {
  return {
    mandateId,
    executedBy: GA_EXECUTOR_REF,
    executedAt: GA_EXECUTED_AT,
    transferorRef,
    transfereeRef,
    rights,
    transferredScope,
    transferEffectiveAt: GA_EXECUTED_AT,
    registry: GA_REGISTRY,
    externalSystem: 'transfer-agent-c',
    ...overrides,
  };
}

export { GOVERNED_RIGHT_TYPES };


// ---------------------------------------------------------------------------
// Holder-bound representation helpers.
//
// Granting is a *store* operation reachable only from a system context —
// never a request an actor could submit about itself, and never something a
// representative can do on its own behalf. These helpers make that shape
// visible at every call site rather than hiding it behind a service.
// ---------------------------------------------------------------------------

/** The world's representation store, or a clear failure. Every helper below goes through this so a test that forgot `withRepresentation` fails saying so. */
export function representationStoreOf(world: GovernedAuthorityWorld): GovernedRepresentationStore {
  const store = world.representationStore;
  if (store === undefined) throw new Error('This world was built without holder-bound representation; pass `withRepresentation: true`.');
  return store;
}

export interface GrantRepresentationOptions {
  readonly tenantId?: string;
  readonly resource?: { readonly kind: string; readonly id: string };
  readonly scopeLimit?: GovernedRepresentativeScopeLimit;
  readonly actions?: readonly string[];
  readonly effectiveFrom?: string;
  readonly expiresAt?: string;
  readonly canRedelegate?: boolean;
  readonly basis?: GovernedRepresentativeBasis;
  readonly context?: { readonly system: boolean; readonly organizationId?: string; readonly actorId?: string };
  readonly idempotencyKey?: string;
}

/**
 * Records "`representativeRef` may exercise `holderRef`'s authority", bounded
 * to the given rights, actions and ceiling.
 *
 * Defaults to a bounded ceiling and the `TRANSFER` capability, because those
 * are what the mandatory scenario needs; every dimension is overridable so a
 * negative test can vary exactly one of them and hold the rest fixed.
 */
export async function grantRepresentation(
  world: GovernedAuthorityWorld,
  representativeRef: string,
  holderRef: string,
  governedRights: readonly GovernedRightType[],
  options: GrantRepresentationOptions = {},
): Promise<GovernedRepresentativeAuthority> {
  const outcome = await representationStoreOf(world).grantRepresentativeAuthority(options.context ?? ADMIN_CONTEXT, {
    tenantId: options.tenantId ?? GA_TENANT_A,
    holderRef,
    representativeRef,
    resource: options.resource ?? { kind: GA_ASSET.kind, id: GA_ASSET.id },
    governedRights,
    scopeLimit: options.scopeLimit ?? { kind: 'bounded', maximum: { kind: 'proportional', basisPoints: 2_000 } },
    actions: options.actions ?? [ENTERPRISE_TRANSFER_CAPABILITY],
    effectiveFrom: options.effectiveFrom ?? GA_NOW,
    canRedelegate: options.canRedelegate ?? false,
    basis: options.basis ?? { kind: 'administrative-bootstrap', assertedBy: 'actor-administrator' },
    ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
  });
  return outcome.representation;
}

/** Withdraws a representation from the privileged context, so a test can say what it means without restating the tenancy plumbing. */
export async function revokeRepresentation(world: GovernedAuthorityWorld, representationId: string, tenantId: string = GA_TENANT_A): Promise<void> {
  await representationStoreOf(world).revokeRepresentativeAuthority(ADMIN_CONTEXT, tenantId, representationId);
}

/** A bounded proportional ceiling, so a test reads "up to 2000 bp" rather than restating the union. */
export function upTo(basisPoints: number): GovernedRepresentativeScopeLimit {
  return { kind: 'bounded', maximum: { kind: 'proportional', basisPoints } };
}

/** The deliberate "no numeric limit of its own" ceiling. Spelled out at call sites so an unbounded representation is never something a test created by omission. */
export const UNBOUNDED: GovernedRepresentativeScopeLimit = { kind: 'unbounded' };

export {
  ENTERPRISE_COLLATERALIZE_CAPABILITY,
  ENTERPRISE_LICENSE_CAPABILITY,
  ENTERPRISE_TOKENIZE_CAPABILITY,
  ENTERPRISE_TRANSFER_CAPABILITY,
};
