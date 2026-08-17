import { ENTERPRISE_TRANSFERABLE_RIGHT_TYPES, type EnterpriseTransferTerms } from '@aoc-enterprise/transfer-mandate';

import { bridgeRecognitionRuntime } from '../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { createManualEnforcementClock, createSequentialEnforcementIdGenerator } from '../../features/action-enforcement/runtime/enforcement-runtime-context.js';
import { ApprovalRuntime } from '../../features/approval-runtime/runtime/approval-runtime.js';
import { createApprovalRuntimeContext } from '../../features/approval-runtime/runtime/approval-runtime-context.js';
import { createAuthorityGraphRuntime } from '../../features/authority-graph/runtime/authority-graph-runtime.js';
import { createAuthorityRuntimeContext } from '../../features/authority-graph/runtime/authority-runtime-context.js';
import { createAocRecognitionRuntime } from '../../features/recognition-runtime/runtime/aoc-recognition-runtime.js';
import { createManualClock, createSequentialIdGenerator, type RuntimeContext } from '../../features/recognition-runtime/runtime/runtime-context.js';
import { createAocKernel, type AocKernel } from '../../kernel/index.js';
import { createInMemoryGovernanceStore } from '../governance-store/in-memory-governance-store.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import type { GovernanceEnterpriseContext } from '../governance-store/contracts.js';
import { createInMemoryTransferMandateStore } from '../transfer-governance/in-memory-mandate-store.js';
import { createTransferGovernanceService, type RecordTransferExecutionRequest, type TransferGovernanceService } from '../transfer-governance/service.js';
import type { TransferMandateStore } from '../transfer-governance/mandate-store.js';

/**
 * A real, seeded world for the `TRANSFER` governed action, wired exactly as
 * production is: Recognition Runtime composed with Authority Graph and
 * Approval Runtime, bridged onto Action Enforcement, hosted by `AocKernel`,
 * recorded by the canonical Governance Store. There is no fake decision engine
 * anywhere in this fixture -- every allow, deny and approval-required outcome
 * below is produced by the same runtimes the Kernel's own characterization
 * suite exercises.
 *
 * The scenario is the reference case from the action documentation, kept
 * deliberately generic and asset-neutral, and jurisdiction-free: a governed
 * digital asset in which Party A holds an economic interest, whose transfer
 * authority is held by a portfolio manager, who may authorize moving a defined
 * portion of that interest to Party B, optionally effected by a named transfer
 * provider.
 *
 * **Six identities are deliberately distinct**, and keeping them apart is the
 * point of much of the suite. `TRANSFER` is the first governed action with a
 * source party as well as a destination one, so the requester/holder split is
 * exercised throughout rather than assumed away:
 *
 * ```
 * requester    TRANSFER_MANAGER_ACTOR_ID   asks (a delegated administrator)
 * transferor   TRANSFEROR_REF              the rights leave this party
 * transferee   TRANSFEREE_REF              the rights arrive at this party
 * executor     TRANSFER_EXECUTOR_REF       effects it externally -- OPTIONAL
 * asset        TRANSFER_ASSET              the rights belong to it (not a party)
 * approver     TRANSFER_MANAGER_ACTOR_ID   approves the desk's requests
 * ```
 *
 * Note that `TRANSFER_MANAGER_ACTOR_ID` and `TRANSFEROR_REF` are different
 * identifiers on purpose: the manager is an authorized administrator, not the
 * holder of the interest, and no code path in this action may equate them.
 *
 * The executor is optional for this action and the fixture provides terms both
 * ways (`providerTransferTerms` binds one, `directTransferTerms` does not),
 * because whether executor binding is genuinely generic across governed
 * actions is one of the questions this implementation exists to answer.
 *
 * None of these identities is a real party, none of the labels is resolvable,
 * and nothing in this fixture moves a right, updates a registry, prices,
 * settles or escrows anything, or contacts any external system.
 */

export const TRANSFER_NOW = '2026-01-01T00:00:00.000Z';
export const TRANSFER_MANDATE_EXPIRES_AT = '2026-07-01T00:00:00.000Z';

export const TRANSFER_TENANT_A = 'org-meridian-holdings';
export const TRANSFER_TENANT_B = 'org-northwind-capital';

export const TRANSFER_TRUST_DOMAIN_ID = 'trust-domain-meridian-holdings';

export const TRANSFER_HOLDINGS_ACTOR_ID = 'actor-meridian-holdings';
export const TRANSFER_MANAGER_ACTOR_ID = 'actor-portfolio-manager';
export const TRANSFER_DESK_ACTOR_ID = 'actor-transfer-desk';
export const TRANSFER_OUTSIDER_ACTOR_ID = 'actor-outside-party';

export const TRANSFER_ACTION = 'transfer';

export const TRANSFER_ASSET = { kind: 'asset', id: 'digital-asset-a', tenantId: TRANSFER_TENANT_A } as const;
export const TRANSFER_ASSET_SCOPE = `${TRANSFER_ASSET.kind}:${TRANSFER_ASSET.id}`;

/** A second governed asset in the same tenant, used to prove authority is asset-bound. */
export const TRANSFER_OTHER_ASSET = { kind: 'asset', id: 'digital-asset-b', tenantId: TRANSFER_TENANT_A } as const;

export const TRANSFER_TENANT_B_ASSET = { kind: 'asset', id: 'northwind-portfolio', tenantId: TRANSFER_TENANT_B } as const;

export const TRANSFER_MANAGER_TOKEN_ID = 'cap-manager-transfer';
export const TRANSFER_DESK_TOKEN_ID = 'cap-desk-transfer';
export const TRANSFER_MANAGER_PASSPORT_ID = 'passport-transfer-manager';
export const TRANSFER_DESK_PASSPORT_ID = 'passport-transfer-desk';

/** The party whose right moves. Deliberately NOT the requester -- a delegated manager submits on its behalf. */
export const TRANSFEROR_REF = 'party-company-a';
/** The party the right moves to. */
export const TRANSFEREE_REF = 'party-company-b';
/** An unauthorized substitute for the recipient. */
export const OTHER_TRANSFEREE_REF = 'party-company-c';
/** An unauthorized substitute for the source holder. */
export const OTHER_TRANSFEROR_REF = 'party-company-d';
/** The party permitted to effect the movement, when the authorization binds one. */
export const TRANSFER_EXECUTOR_REF = 'provider-transfer-agent-c';
/** An unauthorized substitute for the executor. */
export const OTHER_TRANSFER_EXECUTOR_REF = 'provider-transfer-agent-d';

/** Opaque registry labels. AOC never resolves or contacts a registry. */
export const PERMITTED_REGISTRY = 'registry-alpha';
export const OTHER_REGISTRY = 'registry-beta';

/**
 * The canonical reference authorization: 25% of Party A's economic interest in
 * a governed digital asset may move to Party B, effected by a named transfer
 * provider through an approved registry, in a single movement of exactly that
 * portion, with recipient acceptance and an agreement reference required, and
 * onward transfer prohibited.
 *
 * Note what this carries that no sibling action has: a `transferorRef`, and a
 * `scope` that is *required* rather than optional. A transfer that declined to
 * say how much moves would be ambiguous about the only thing distinguishing a
 * full transfer from a partial one.
 */
export function quarterInterestTransferTerms(overrides: Partial<EnterpriseTransferTerms> = {}): EnterpriseTransferTerms {
  return {
    rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
    transferorRef: TRANSFEROR_REF,
    transfereeRef: TRANSFEREE_REF,
    scope: { kind: 'proportional', basisPoints: 2500 },
    executorRef: TRANSFER_EXECUTOR_REF,
    constraints: {
      partialTransferAllowed: false,
      onwardTransferAllowed: 'prohibited',
      recipientAcceptanceRequired: true,
      externalAgreementReferenceRequired: true,
      permittedRegistries: [PERMITTED_REGISTRY],
    },
    ...overrides,
  };
}

/** The same authorization with a bound provider, used interchangeably with the reference terms for clarity at call sites. */
export const providerTransferTerms = quarterInterestTransferTerms;

/**
 * The same movement effected *directly* by the holder, with no external
 * provider. Used to prove executor binding is genuinely optional for this
 * action rather than a field every governed action must carry -- and, unlike
 * `LICENSE`, that the *same* action has one in some arrangements and not in
 * others.
 */
export function directTransferTerms(overrides: Partial<EnterpriseTransferTerms> = {}): EnterpriseTransferTerms {
  const base = quarterInterestTransferTerms();
  const { executorRef: _executorRef, ...withoutExecutor } = base;
  return {
    ...withoutExecutor,
    constraints: {
      partialTransferAllowed: false,
      onwardTransferAllowed: 'permitted',
    },
    ...overrides,
  };
}

/**
 * An authorization that permits the 25% to move in tranches. Used to exercise
 * the cumulative containment that makes transferred scope a *conserved*
 * quantity rather than a ceiling.
 */
export function trancheTransferTerms(overrides: Partial<EnterpriseTransferTerms> = {}): EnterpriseTransferTerms {
  const base = quarterInterestTransferTerms();
  return {
    ...base,
    constraints: { ...base.constraints, partialTransferAllowed: true },
    ...overrides,
  };
}

/** An authorization over an ownership interest rather than an economic one, used for the rights-containment tests. */
export function ownershipTransferTerms(overrides: Partial<EnterpriseTransferTerms> = {}): EnterpriseTransferTerms {
  const base = quarterInterestTransferTerms();
  return {
    ...base,
    rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.OWNERSHIP_INTEREST],
    ...overrides,
  };
}

/** A unitized authorization -- 10 of a named entitlement unit -- proving the scope type is not proportional-only. */
export function unitizedTransferTerms(overrides: Partial<EnterpriseTransferTerms> = {}): EnterpriseTransferTerms {
  const base = quarterInterestTransferTerms();
  return {
    ...base,
    scope: { kind: 'unitized', units: 10, unitDenomination: 'participation-unit' },
    constraints: { ...base.constraints, partialTransferAllowed: true },
    ...overrides,
  };
}

export interface TransferWorld {
  readonly kernel: AocKernel;
  readonly governanceStore: GovernanceStore;
  readonly mandateStore: TransferMandateStore;
  readonly service: TransferGovernanceService;
  readonly enterpriseContext: () => GovernanceEnterpriseContext;
}

function testEnterpriseContext(): GovernanceEnterpriseContext {
  return {
    enterpriseVersion: '1.0.0-test',
    lifecycleState: 'ready',
    modules: [],
  };
}

/**
 * Substitutes durable stores for the default in-memory ones, so the same
 * seeded world (same actors, authority, approvals, Kernel) can be driven
 * against a real on-disk backend. This is what makes a restart test a restart
 * test rather than two instantiations of the same object graph:
 * `buildTransferWorld` is called again with stores freshly opened over the same
 * database files, and nothing else is carried across.
 */
export interface TransferWorldOverrides {
  readonly governanceStore?: GovernanceStore;
  readonly mandateStore?: TransferMandateStore;
  /** Overrides the id prefix counter seed so a second process's ids do not collide with the first's. */
  readonly idSeed?: number;
  /**
   * Grants the manager a *right-scoped* resource scope
   * (`asset:digital-asset-a:usage-right`) instead of the bare asset scope.
   * Used only by `transfer-authority-transition.test.ts` to measure whether
   * the existing authority model can express right-scoped authority at all.
   */
  readonly managerResourceScopes?: readonly string[];
  /**
   * Registers `TRANSFEREE_REF` as a recognized actor with its own transfer
   * authority over the asset. Used only to demonstrate what it *would* take
   * for AOC to recognize a recipient -- an explicit administrative act that no
   * transfer execution performs.
   */
  readonly grantTransfereeAuthority?: boolean;
}

export function buildTransferWorld(overrides: TransferWorldOverrides = {}): TransferWorld {
  const recognitionCtx: RuntimeContext = { clock: createManualClock(TRANSFER_NOW), idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(TRANSFER_NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(TRANSFER_NOW), { authorityGraph: authorityRuntime });
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime);

  const managerScopes = overrides.managerResourceScopes ?? [TRANSFER_ASSET_SCOPE];

  const holdings = recognitionRuntime.registerActor({ id: TRANSFER_HOLDINGS_ACTOR_ID, type: 'organization', displayName: 'Meridian Holdings' });
  const trustDomain = recognitionRuntime.createTrustDomain({
    id: TRANSFER_TRUST_DOMAIN_ID,
    name: 'Meridian Holdings Transfer Authority',
    issuerActorId: holdings.id,
    acceptedIssuerIds: [holdings.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });

  const manager = recognitionRuntime.registerActor({
    id: TRANSFER_MANAGER_ACTOR_ID,
    type: 'human',
    displayName: 'Portfolio Manager',
    issuerId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  const desk = recognitionRuntime.registerActor({
    id: TRANSFER_DESK_ACTOR_ID,
    type: 'agent',
    displayName: 'Transfer Desk Agent',
    issuerId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  // Registered but unknown to the trust domain: the canonical "no recognized
  // standing, therefore no authority" actor.
  recognitionRuntime.registerActor({ id: TRANSFER_OUTSIDER_ACTOR_ID, type: 'external', displayName: 'Outside Party', status: 'unknown' });

  recognitionRuntime.issuePassport({
    id: TRANSFER_MANAGER_PASSPORT_ID,
    type: 'human_passport',
    subjectActorId: manager.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  recognitionRuntime.issuePassport({
    id: TRANSFER_DESK_PASSPORT_ID,
    type: 'agent_passport',
    subjectActorId: desk.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
  });

  recognitionRuntime.issueCapabilityToken({
    id: TRANSFER_MANAGER_TOKEN_ID,
    subjectActorId: manager.id,
    principalActorId: manager.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
    capability: TRANSFER_ACTION,
    actions: [TRANSFER_ACTION],
    resourceScopes: managerScopes,
    riskLevel: 'critical',
  });

  // The delegated desk may request a transfer, but the policy layer -- not this
  // module -- requires the portfolio manager's approval before it is
  // authorized.
  recognitionRuntime.issueCapabilityToken({
    id: TRANSFER_DESK_TOKEN_ID,
    subjectActorId: desk.id,
    principalActorId: manager.id,
    issuerActorId: manager.id,
    trustDomainId: trustDomain.id,
    capability: TRANSFER_ACTION,
    actions: [TRANSFER_ACTION],
    resourceScopes: managerScopes,
    approvalRequirement: { actions: [TRANSFER_ACTION], requiredApproverActorIds: [manager.id] },
    riskLevel: 'critical',
  });

  authorityRuntime.registerRootIssuer(trustDomain.id, holdings.id);
  const managerGrant = authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-manager-transfer',
    issuerActorId: holdings.id,
    subjectActorId: manager.id,
    trustDomainId: trustDomain.id,
    roleId: 'role-portfolio-manager',
    capability: TRANSFER_ACTION,
    actions: [TRANSFER_ACTION],
    resourceScopes: managerScopes,
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
  });
  authorityRuntime.createDelegationGrant({
    id: 'delegation-grant-desk-transfer',
    delegatorActorId: manager.id,
    delegateActorId: desk.id,
    delegateActorType: 'agent',
    trustDomainId: trustDomain.id,
    sourceAuthorityGrantId: managerGrant.id,
    capability: TRANSFER_ACTION,
    actions: [TRANSFER_ACTION],
    resourceScopes: managerScopes,
    canRedelegate: false,
  });

  // Deliberately opt-in and never performed by any transfer execution path:
  // this is the explicit administrative act that would be required for AOC to
  // recognize the recipient of a completed transfer as an authority holder.
  // See `transfer-authority-transition.test.ts`.
  if (overrides.grantTransfereeAuthority === true) {
    const transferee = recognitionRuntime.registerActor({
      id: TRANSFEREE_REF,
      type: 'organization',
      displayName: 'Company B',
      issuerId: holdings.id,
      trustDomainId: trustDomain.id,
    });
    recognitionRuntime.issuePassport({
      id: 'passport-transferee',
      type: 'organization_passport',
      subjectActorId: transferee.id,
      issuerActorId: holdings.id,
      trustDomainId: trustDomain.id,
    });
    recognitionRuntime.issueCapabilityToken({
      id: 'cap-transferee-transfer',
      subjectActorId: transferee.id,
      principalActorId: transferee.id,
      issuerActorId: holdings.id,
      trustDomainId: trustDomain.id,
      capability: TRANSFER_ACTION,
      actions: [TRANSFER_ACTION],
      resourceScopes: [TRANSFER_ASSET_SCOPE],
      riskLevel: 'critical',
    });
    authorityRuntime.issueAuthorityGrant({
      id: 'authority-grant-transferee-transfer',
      issuerActorId: holdings.id,
      subjectActorId: transferee.id,
      trustDomainId: trustDomain.id,
      roleId: 'role-holder',
      capability: TRANSFER_ACTION,
      actions: [TRANSFER_ACTION],
      resourceScopes: [TRANSFER_ASSET_SCOPE],
      canDelegate: false,
    });
    approvalRuntime.registerApproverRecognitionStatus(transferee.id, 'recognized');
  }

  approvalRuntime.registerApproverRecognitionStatus(manager.id, 'recognized');
  approvalRuntime.registerApproverRecognitionStatus(desk.id, 'agent');

  const kernel = createAocKernel({
    recognitionProvider: bridgeRecognitionRuntime(recognitionRuntime),
    clock: createManualEnforcementClock(TRANSFER_NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
  });

  const governanceStore = overrides.governanceStore ?? createInMemoryGovernanceStore();
  const mandateStore = overrides.mandateStore ?? createInMemoryTransferMandateStore({ now: () => TRANSFER_NOW });

  let counter = overrides.idSeed ?? 0;
  const service = createTransferGovernanceService({
    store: mandateStore,
    kernel,
    governanceStore,
    enterpriseContext: testEnterpriseContext,
    now: () => TRANSFER_NOW,
    nextId: (prefix: string) => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  });

  return { kernel, governanceStore, mandateStore, service, enterpriseContext: testEnterpriseContext };
}

/** The canonical "authorized portfolio manager asks to move 25% of Party A's economic interest to Party B" submission. */
export function buildTransferManagerRequest(overrides: Record<string, unknown> = {}) {
  return {
    asset: TRANSFER_ASSET,
    requestedBy: TRANSFER_MANAGER_ACTOR_ID,
    trustDomainId: TRANSFER_TRUST_DOMAIN_ID,
    terms: quarterInterestTransferTerms(),
    context: { passportId: TRANSFER_MANAGER_PASSPORT_ID, capabilityTokenId: TRANSFER_MANAGER_TOKEN_ID },
    mandateExpiresAt: TRANSFER_MANDATE_EXPIRES_AT,
    ...overrides,
  };
}

/**
 * The canonical "the authorized provider reports it effected the movement,
 * exactly as authorized" execution report.
 *
 * An override whose value is `undefined` *removes* the field rather than
 * setting it to `undefined`. The repository compiles with
 * `exactOptionalPropertyTypes`, and the distinction matters to the domain as
 * well as the compiler: "reported no acceptance" and "reported an acceptance
 * of `undefined`" are the same fact, and the containment checks read presence.
 */
export function buildConformingTransferExecution(mandateId: string, overrides: Record<string, unknown> = {}): RecordTransferExecutionRequest {
  const merged: Record<string, unknown> = {
    mandateId,
    executedBy: TRANSFER_EXECUTOR_REF,
    executedAt: '2026-02-01T00:00:00.000Z',
    transferorRef: TRANSFEROR_REF,
    transfereeRef: TRANSFEREE_REF,
    rights: [ENTERPRISE_TRANSFERABLE_RIGHT_TYPES.ECONOMIC_INTEREST],
    transferredScope: { kind: 'proportional', basisPoints: 2500 },
    transferEffectiveAt: '2026-02-01T00:00:00.000Z',
    registry: PERMITTED_REGISTRY,
    externalSystem: 'transfer-agent-c',
    externalAgreementReference: 'agreement-2026-0001',
    externalAcceptanceReference: 'acceptance-2026-0001',
    externalRegistrationReference: 'registration-2026-0001',
    ...overrides,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as unknown as RecordTransferExecutionRequest;
}
