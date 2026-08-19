import { ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES, type EnterpriseCollateralizationTerms } from '@aoc-enterprise/collateralization-mandate';

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
import { createInMemoryCollateralizationMandateStore } from '../collateralization-governance/in-memory-mandate-store.js';
import { createCollateralizationGovernanceService, type CollateralizationGovernanceService } from '../collateralization-governance/service.js';
import type { CollateralizationMandateStore } from '../collateralization-governance/mandate-store.js';

/**
 * A real, seeded world for the `COLLATERALIZE` governed action, wired exactly
 * as production is: Recognition Runtime composed with Authority Graph and
 * Approval Runtime, bridged onto Action Enforcement, hosted by `AocKernel`,
 * recorded by the canonical Governance Store. There is no fake decision
 * engine anywhere in this fixture -- every allow, deny and
 * approval-required outcome below is produced by the same runtimes the
 * Kernel's own characterization suite exercises.
 *
 * The scenario is the reference case from the action documentation, kept
 * deliberately generic: a governed asset ("Building A") whose authority is
 * held by a steward, who may authorize collateralization of a *portion of
 * specified economic rights* -- never "the asset" -- securing a referenced
 * obligation for a named secured party, executed by a named provider.
 *
 * Four identities are deliberately distinct, because keeping them apart is
 * the point of most of the suite:
 *
 * ```
 * requester      STEWARD_ACTOR_ID          asks
 * secured party  SECURED_PARTY_REF         benefits (a lender)
 * executor       COLLATERAL_EXECUTOR_REF   performs externally (a platform)
 * obligation     SECURED_OBLIGATION_REF    is secured (not a party)
 * ```
 *
 * None of them is a real institution, none of the labels is resolvable, and
 * nothing in this fixture originates a loan, prices anything, or contacts any
 * external system.
 */

export const COLLATERALIZATION_NOW = '2026-01-01T00:00:00.000Z';
export const COLLATERALIZATION_MANDATE_EXPIRES_AT = '2026-07-01T00:00:00.000Z';

export const COLLATERAL_TENANT_A = 'org-aurelia-holdings';
export const COLLATERAL_TENANT_B = 'org-northwind-estates';

export const COLLATERAL_TRUST_DOMAIN_ID = 'trust-domain-aurelia';

export const COLLATERAL_HOLDINGS_ACTOR_ID = 'actor-aurelia-holdings';
export const COLLATERAL_STEWARD_ACTOR_ID = 'actor-asset-steward';
export const COLLATERAL_DESK_ACTOR_ID = 'actor-treasury-desk';
export const COLLATERAL_OUTSIDER_ACTOR_ID = 'actor-outside-party';

export const COLLATERALIZE_ACTION = 'collateralize';

export const COLLATERAL_ASSET = { kind: 'asset', id: 'building-a', tenantId: COLLATERAL_TENANT_A } as const;
export const COLLATERAL_ASSET_SCOPE = `${COLLATERAL_ASSET.kind}:${COLLATERAL_ASSET.id}`;

export const COLLATERAL_TENANT_B_ASSET = { kind: 'asset', id: 'northwind-tower', tenantId: COLLATERAL_TENANT_B } as const;

export const COLLATERAL_STEWARD_TOKEN_ID = 'cap-steward-collateralize';
export const COLLATERAL_DESK_TOKEN_ID = 'cap-desk-collateralize';
export const COLLATERAL_STEWARD_PASSPORT_ID = 'passport-collateral-steward';
export const COLLATERAL_DESK_PASSPORT_ID = 'passport-collateral-desk';

/** The party permitted to create the external arrangement. Distinct from both the requester and the secured party. */
export const COLLATERAL_EXECUTOR_REF = 'provider-collateral-platform-c';
/** The party the collateral commitment benefits. Distinct from both the requester and the executor. */
export const SECURED_PARTY_REF = 'party-lender-b';
/** An unauthorized substitute for the secured party. */
export const OTHER_SECURED_PARTY_REF = 'party-lender-c';
/** The obligation the collateral secures. An opaque canonical reference -- Soberanía neither originates it nor judges its validity. */
export const SECURED_OBLIGATION_REF = 'obligation-001';
/** An unauthorized substitute for the secured obligation. */
export const OTHER_SECURED_OBLIGATION_REF = 'obligation-002';
/** An unauthorized substitute for the executor. */
export const OTHER_EXECUTOR_REF = 'provider-collateral-platform-d';

export const PERMITTED_REGISTRY = 'registry-alpha';
export const PERMITTED_JURISDICTION = 'jurisdiction-a';

/** 20% of defined economic participation rights, committed as collateral -- expressed in integer basis points, never a float. */
export function twentyPercentCollateralTerms(overrides: Partial<EnterpriseCollateralizationTerms> = {}): EnterpriseCollateralizationTerms {
  return {
    rights: [ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.REVENUE_RIGHT],
    scope: { kind: 'proportional', basisPoints: 2000 },
    securedObligationRef: SECURED_OBLIGATION_REF,
    securedObligationKind: 'credit-facility',
    securedPartyRef: SECURED_PARTY_REF,
    executorRef: COLLATERAL_EXECUTOR_REF,
    constraints: {
      maximumSecuredAmount: { minorUnits: 5_000_000_00, currency: 'unit-alpha' },
      permittedJurisdictions: [PERMITTED_JURISDICTION],
      permittedRegistries: [PERMITTED_REGISTRY],
      requiredPriorityRank: 1,
      exclusive: true,
      releaseEvidenceRequired: true,
      additionalCollateralizationAllowed: false,
    },
    ...overrides,
  };
}

/** The same authorization, but permitting more than one external arrangement -- used to exercise cumulative scope containment. */
export function divisibleCollateralTerms(overrides: Partial<EnterpriseCollateralizationTerms> = {}): EnterpriseCollateralizationTerms {
  const base = twentyPercentCollateralTerms();
  return {
    ...base,
    constraints: { ...base.constraints, additionalCollateralizationAllowed: true },
    ...overrides,
  };
}

export interface CollateralizationWorld {
  readonly kernel: AocKernel;
  readonly governanceStore: GovernanceStore;
  readonly mandateStore: CollateralizationMandateStore;
  readonly service: CollateralizationGovernanceService;
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
 * against a real on-disk backend. This is what makes a restart test a
 * restart test rather than two instantiations of the same object graph:
 * `buildCollateralizationWorld` is called again with stores freshly opened
 * over the same database files, and nothing else is carried across.
 */
export interface CollateralizationWorldOverrides {
  readonly governanceStore?: GovernanceStore;
  readonly mandateStore?: CollateralizationMandateStore;
  /** Overrides the id prefix counter seed so a second process's ids do not collide with the first's. */
  readonly idSeed?: number;
}

export function buildCollateralizationWorld(overrides: CollateralizationWorldOverrides = {}): CollateralizationWorld {
  const recognitionCtx: RuntimeContext = { clock: createManualClock(COLLATERALIZATION_NOW), idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(COLLATERALIZATION_NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(COLLATERALIZATION_NOW), { authorityGraph: authorityRuntime });
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime);

  const holdings = recognitionRuntime.registerActor({ id: COLLATERAL_HOLDINGS_ACTOR_ID, type: 'organization', displayName: 'Aurelia Holdings' });
  const trustDomain = recognitionRuntime.createTrustDomain({
    id: COLLATERAL_TRUST_DOMAIN_ID,
    name: 'Aurelia Asset Authority',
    issuerActorId: holdings.id,
    acceptedIssuerIds: [holdings.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });

  const steward = recognitionRuntime.registerActor({
    id: COLLATERAL_STEWARD_ACTOR_ID,
    type: 'human',
    displayName: 'Asset Steward',
    issuerId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  const desk = recognitionRuntime.registerActor({
    id: COLLATERAL_DESK_ACTOR_ID,
    type: 'agent',
    displayName: 'Treasury Desk Agent',
    issuerId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  // Registered but unknown to the trust domain: the canonical "no recognized
  // standing, therefore no authority" actor.
  recognitionRuntime.registerActor({ id: COLLATERAL_OUTSIDER_ACTOR_ID, type: 'external', displayName: 'Outside Party', status: 'unknown' });

  recognitionRuntime.issuePassport({
    id: COLLATERAL_STEWARD_PASSPORT_ID,
    type: 'human_passport',
    subjectActorId: steward.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  recognitionRuntime.issuePassport({
    id: COLLATERAL_DESK_PASSPORT_ID,
    type: 'agent_passport',
    subjectActorId: desk.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
  });

  recognitionRuntime.issueCapabilityToken({
    id: COLLATERAL_STEWARD_TOKEN_ID,
    subjectActorId: steward.id,
    principalActorId: steward.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
    capability: COLLATERALIZE_ACTION,
    actions: [COLLATERALIZE_ACTION],
    resourceScopes: [COLLATERAL_ASSET_SCOPE],
    riskLevel: 'critical',
  });

  // The delegated desk may request collateralization, but the policy layer --
  // not this module -- requires the steward's approval before it is
  // authorized.
  recognitionRuntime.issueCapabilityToken({
    id: COLLATERAL_DESK_TOKEN_ID,
    subjectActorId: desk.id,
    principalActorId: steward.id,
    issuerActorId: steward.id,
    trustDomainId: trustDomain.id,
    capability: COLLATERALIZE_ACTION,
    actions: [COLLATERALIZE_ACTION],
    resourceScopes: [COLLATERAL_ASSET_SCOPE],
    approvalRequirement: { actions: [COLLATERALIZE_ACTION], requiredApproverActorIds: [steward.id] },
    riskLevel: 'critical',
  });

  authorityRuntime.registerRootIssuer(trustDomain.id, holdings.id);
  const stewardGrant = authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-steward-collateralize',
    issuerActorId: holdings.id,
    subjectActorId: steward.id,
    trustDomainId: trustDomain.id,
    roleId: 'role-asset-steward',
    capability: COLLATERALIZE_ACTION,
    actions: [COLLATERALIZE_ACTION],
    resourceScopes: [COLLATERAL_ASSET_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
  });
  authorityRuntime.createDelegationGrant({
    id: 'delegation-grant-desk-collateralize',
    delegatorActorId: steward.id,
    delegateActorId: desk.id,
    delegateActorType: 'agent',
    trustDomainId: trustDomain.id,
    sourceAuthorityGrantId: stewardGrant.id,
    capability: COLLATERALIZE_ACTION,
    actions: [COLLATERALIZE_ACTION],
    resourceScopes: [COLLATERAL_ASSET_SCOPE],
    canRedelegate: false,
  });

  approvalRuntime.registerApproverRecognitionStatus(steward.id, 'recognized');
  approvalRuntime.registerApproverRecognitionStatus(desk.id, 'agent');

  const kernel = createAocKernel({
    recognitionProvider: bridgeRecognitionRuntime(recognitionRuntime),
    clock: createManualEnforcementClock(COLLATERALIZATION_NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
  });

  const governanceStore = overrides.governanceStore ?? createInMemoryGovernanceStore();
  const mandateStore = overrides.mandateStore ?? createInMemoryCollateralizationMandateStore({ now: () => COLLATERALIZATION_NOW });

  let counter = overrides.idSeed ?? 0;
  const service = createCollateralizationGovernanceService({
    store: mandateStore,
    kernel,
    governanceStore,
    enterpriseContext: testEnterpriseContext,
    now: () => COLLATERALIZATION_NOW,
    nextId: (prefix: string) => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  });

  return { kernel, governanceStore, mandateStore, service, enterpriseContext: testEnterpriseContext };
}

/** The canonical "authorized steward asks to collateralize 20% of economic rights" submission. */
export function buildCollateralStewardRequest(overrides: Record<string, unknown> = {}) {
  return {
    asset: COLLATERAL_ASSET,
    requestedBy: COLLATERAL_STEWARD_ACTOR_ID,
    trustDomainId: COLLATERAL_TRUST_DOMAIN_ID,
    terms: twentyPercentCollateralTerms(),
    context: { passportId: COLLATERAL_STEWARD_PASSPORT_ID, capabilityTokenId: COLLATERAL_STEWARD_TOKEN_ID },
    mandateExpiresAt: COLLATERALIZATION_MANDATE_EXPIRES_AT,
    ...overrides,
  };
}

/** The canonical "the authorized executor reports it created the arrangement, exactly as authorized" execution report. */
export function buildConformingExecution(mandateId: string, overrides: Record<string, unknown> = {}) {
  return {
    mandateId,
    executorRef: COLLATERAL_EXECUTOR_REF,
    executedAt: '2026-02-01T00:00:00.000Z',
    securedObligationRef: SECURED_OBLIGATION_REF,
    securedPartyRef: SECURED_PARTY_REF,
    committedScope: { kind: 'proportional', basisPoints: 2000 } as const,
    rights: [ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_COLLATERALIZABLE_RIGHT_TYPES.REVENUE_RIGHT],
    securedAmount: { minorUnits: 4_000_000_00, currency: 'unit-alpha' },
    externalSystem: 'collateral-platform-c',
    externalRegistry: PERMITTED_REGISTRY,
    externalAgreementReference: 'agreement-2026-0001',
    externalFilingReference: 'filing-2026-0001',
    jurisdiction: PERMITTED_JURISDICTION,
    priorityRank: 1,
    ...overrides,
  };
}
