import { ENTERPRISE_TOKENIZED_RIGHT_TYPES, type EnterpriseTokenizationTerms } from '@aoc-enterprise/tokenization-mandate';

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
import { createInMemoryTokenizationMandateStore } from '../tokenization-governance/in-memory-mandate-store.js';
import { createTokenizationGovernanceService, type TokenizationGovernanceService } from '../tokenization-governance/service.js';
import type { TokenizationMandateStore } from '../tokenization-governance/mandate-store.js';

/**
 * A real, seeded world for the `TOKENIZE` governed capability, wired exactly
 * as production is: Recognition Runtime composed with Authority Graph and
 * Approval Runtime, bridged onto Action Enforcement, hosted by `AocKernel`,
 * recorded by the canonical Governance Store. There is no fake decision
 * engine anywhere in this fixture -- every allow, deny and
 * approval-required outcome below is produced by the same runtimes the
 * Kernel's own characterization suite exercises.
 *
 * The scenario is the reference case from the capability documentation, kept
 * deliberately generic: a governed asset ("Building A") whose authority is
 * held by a steward, who may authorize tokenization of a *portion of
 * specified economic rights* -- never "the asset".
 */

export const TOKENIZATION_NOW = '2026-01-01T00:00:00.000Z';
export const TOKENIZATION_MANDATE_EXPIRES_AT = '2026-07-01T00:00:00.000Z';

export const TENANT_A = 'org-aurelia-holdings';
export const TENANT_B = 'org-northwind-estates';

export const TRUST_DOMAIN_ID = 'trust-domain-aurelia';

export const HOLDINGS_ACTOR_ID = 'actor-aurelia-holdings';
export const STEWARD_ACTOR_ID = 'actor-asset-steward';
export const DESK_ACTOR_ID = 'actor-tokenization-desk';
export const OUTSIDER_ACTOR_ID = 'actor-outside-party';

export const TOKENIZE_ACTION = 'tokenize';

export const BUILDING_ASSET = { kind: 'asset', id: 'building-a', tenantId: TENANT_A } as const;
export const BUILDING_SCOPE = `${BUILDING_ASSET.kind}:${BUILDING_ASSET.id}`;

export const TENANT_B_ASSET = { kind: 'asset', id: 'northwind-tower', tenantId: TENANT_B } as const;

export const STEWARD_TOKEN_ID = 'cap-steward-tokenize';
export const DESK_TOKEN_ID = 'cap-desk-tokenize';
export const STEWARD_PASSPORT_ID = 'passport-steward';
export const DESK_PASSPORT_ID = 'passport-desk';

export const EXECUTOR_REF = 'provider-tokenization-desk-x';

/** 20% of defined economic participation rights -- expressed in integer basis points, never a float. */
export function twentyPercentEconomicTerms(overrides: Partial<EnterpriseTokenizationTerms> = {}): EnterpriseTokenizationTerms {
  return {
    rights: [ENTERPRISE_TOKENIZED_RIGHT_TYPES.ECONOMIC_INTEREST, ENTERPRISE_TOKENIZED_RIGHT_TYPES.REVENUE_RIGHT],
    scope: { kind: 'proportional', basisPoints: 2000 },
    executorRef: EXECUTOR_REF,
    constraints: {
      maximumIssuedUnits: 2_000_000,
      permittedNetworks: ['network-alpha'],
      permittedTokenStandards: ['standard-registry-v1'],
      permittedJurisdictions: ['jurisdiction-a'],
      transferRestricted: true,
      additionalIssuanceAllowed: false,
    },
    ...overrides,
  };
}

export interface TokenizationWorld {
  readonly kernel: AocKernel;
  readonly governanceStore: GovernanceStore;
  readonly mandateStore: TokenizationMandateStore;
  readonly service: TokenizationGovernanceService;
  readonly enterpriseContext: () => GovernanceEnterpriseContext;
}

function testEnterpriseContext(): GovernanceEnterpriseContext {
  return {
    enterpriseVersion: '1.0.0-test',
    lifecycleState: 'ready',
    modules: [],
  };
}

export function buildTokenizationWorld(): TokenizationWorld {
  const recognitionCtx: RuntimeContext = { clock: createManualClock(TOKENIZATION_NOW), idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(TOKENIZATION_NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(TOKENIZATION_NOW), { authorityGraph: authorityRuntime });
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime);

  const holdings = recognitionRuntime.registerActor({ id: HOLDINGS_ACTOR_ID, type: 'organization', displayName: 'Aurelia Holdings' });
  const trustDomain = recognitionRuntime.createTrustDomain({
    id: TRUST_DOMAIN_ID,
    name: 'Aurelia Asset Authority',
    issuerActorId: holdings.id,
    acceptedIssuerIds: [holdings.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });

  const steward = recognitionRuntime.registerActor({
    id: STEWARD_ACTOR_ID,
    type: 'human',
    displayName: 'Asset Steward',
    issuerId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  const desk = recognitionRuntime.registerActor({
    id: DESK_ACTOR_ID,
    type: 'agent',
    displayName: 'Tokenization Desk Agent',
    issuerId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  // Registered but unknown to the trust domain: the canonical "no recognized
  // standing, therefore no authority" actor.
  recognitionRuntime.registerActor({ id: OUTSIDER_ACTOR_ID, type: 'external', displayName: 'Outside Party', status: 'unknown' });

  recognitionRuntime.issuePassport({
    id: STEWARD_PASSPORT_ID,
    type: 'human_passport',
    subjectActorId: steward.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
  });
  recognitionRuntime.issuePassport({
    id: DESK_PASSPORT_ID,
    type: 'agent_passport',
    subjectActorId: desk.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
  });

  recognitionRuntime.issueCapabilityToken({
    id: STEWARD_TOKEN_ID,
    subjectActorId: steward.id,
    principalActorId: steward.id,
    issuerActorId: holdings.id,
    trustDomainId: trustDomain.id,
    capability: TOKENIZE_ACTION,
    actions: [TOKENIZE_ACTION],
    resourceScopes: [BUILDING_SCOPE],
    riskLevel: 'critical',
  });

  // The delegated desk may request tokenization, but the policy layer -- not
  // this module -- requires the steward's approval before it is authorized.
  recognitionRuntime.issueCapabilityToken({
    id: DESK_TOKEN_ID,
    subjectActorId: desk.id,
    principalActorId: steward.id,
    issuerActorId: steward.id,
    trustDomainId: trustDomain.id,
    capability: TOKENIZE_ACTION,
    actions: [TOKENIZE_ACTION],
    resourceScopes: [BUILDING_SCOPE],
    approvalRequirement: { actions: [TOKENIZE_ACTION], requiredApproverActorIds: [steward.id] },
    riskLevel: 'critical',
  });

  authorityRuntime.registerRootIssuer(trustDomain.id, holdings.id);
  const stewardGrant = authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-steward-tokenize',
    issuerActorId: holdings.id,
    subjectActorId: steward.id,
    trustDomainId: trustDomain.id,
    roleId: 'role-asset-steward',
    capability: TOKENIZE_ACTION,
    actions: [TOKENIZE_ACTION],
    resourceScopes: [BUILDING_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
  });
  authorityRuntime.createDelegationGrant({
    id: 'delegation-grant-desk-tokenize',
    delegatorActorId: steward.id,
    delegateActorId: desk.id,
    delegateActorType: 'agent',
    trustDomainId: trustDomain.id,
    sourceAuthorityGrantId: stewardGrant.id,
    capability: TOKENIZE_ACTION,
    actions: [TOKENIZE_ACTION],
    resourceScopes: [BUILDING_SCOPE],
    canRedelegate: false,
  });

  approvalRuntime.registerApproverRecognitionStatus(steward.id, 'recognized');
  approvalRuntime.registerApproverRecognitionStatus(desk.id, 'agent');

  const kernel = createAocKernel({
    recognitionProvider: bridgeRecognitionRuntime(recognitionRuntime),
    clock: createManualEnforcementClock(TOKENIZATION_NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
  });

  const governanceStore = createInMemoryGovernanceStore();
  const mandateStore = createInMemoryTokenizationMandateStore({ now: () => TOKENIZATION_NOW });

  let counter = 0;
  const service = createTokenizationGovernanceService({
    store: mandateStore,
    kernel,
    governanceStore,
    enterpriseContext: testEnterpriseContext,
    now: () => TOKENIZATION_NOW,
    nextId: (prefix: string) => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  });

  return { kernel, governanceStore, mandateStore, service, enterpriseContext: testEnterpriseContext };
}

/** The canonical "authorized steward asks to tokenize 20% of economic rights" submission. */
export function buildStewardRequest(overrides: Record<string, unknown> = {}) {
  return {
    asset: BUILDING_ASSET,
    requestedBy: STEWARD_ACTOR_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    terms: twentyPercentEconomicTerms(),
    context: { passportId: STEWARD_PASSPORT_ID, capabilityTokenId: STEWARD_TOKEN_ID },
    mandateExpiresAt: TOKENIZATION_MANDATE_EXPIRES_AT,
    ...overrides,
  };
}
