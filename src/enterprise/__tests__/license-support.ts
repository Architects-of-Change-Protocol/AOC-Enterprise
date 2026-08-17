import {
  ENTERPRISE_LICENSABLE_RIGHT_TYPES,
  ENTERPRISE_LICENSED_USE_TYPES,
  type EnterpriseLicenseTerms,
} from '@aoc-enterprise/license-mandate';

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
import { createInMemoryLicenseMandateStore } from '../license-governance/in-memory-mandate-store.js';
import { createLicenseGovernanceService, type LicenseGovernanceService, type RecordLicenseExecutionRequest } from '../license-governance/service.js';
import type { LicenseMandateStore } from '../license-governance/mandate-store.js';

/**
 * A real, seeded world for the `LICENSE` governed action, wired exactly as
 * production is: Recognition Runtime composed with Authority Graph and
 * Approval Runtime, bridged onto Action Enforcement, hosted by `AocKernel`,
 * recorded by the canonical Governance Store. There is no fake decision engine
 * anywhere in this fixture -- every allow, deny and approval-required outcome
 * below is produced by the same runtimes the Kernel's own characterization
 * suite exercises.
 *
 * The scenario is the reference case from the action documentation, kept
 * deliberately generic and asset-neutral: a governed digital work whose
 * authority is held by a rights manager, who may authorize licensing of
 * *specified governed rights for specified uses* -- never "the asset" -- to a
 * named licensee, within a named operating context, optionally executed by a
 * named licensing platform.
 *
 * Four identities are deliberately distinct, because keeping them apart is the
 * point of much of the suite:
 *
 * ```
 * requester   LICENSE_MANAGER_ACTOR_ID   asks
 * licensee    LICENSEE_REF               receives the permission
 * executor    LICENSE_EXECUTOR_REF       performs externally (a platform) -- OPTIONAL
 * asset       LICENSE_ASSET              is licensed (not a party at all)
 * ```
 *
 * The executor is optional for this action and the fixture provides terms both
 * ways (`webDisplayLicenseTerms` binds one, `directGrantLicenseTerms` does
 * not), because whether executor binding is genuinely generic across governed
 * actions is one of the questions this implementation exists to answer.
 *
 * None of these identities is a real party, none of the labels is resolvable,
 * and nothing in this fixture drafts an agreement, signs anything, charges
 * anything, or contacts any external system.
 */

export const LICENSE_NOW = '2026-01-01T00:00:00.000Z';
export const LICENSE_MANDATE_EXPIRES_AT = '2026-07-01T00:00:00.000Z';

export const LICENSE_TENANT_A = 'org-aurelia-studios';
export const LICENSE_TENANT_B = 'org-northwind-media';

export const LICENSE_TRUST_DOMAIN_ID = 'trust-domain-aurelia-studios';

export const LICENSE_STUDIO_ACTOR_ID = 'actor-aurelia-studios';
export const LICENSE_MANAGER_ACTOR_ID = 'actor-rights-manager';
export const LICENSE_DESK_ACTOR_ID = 'actor-licensing-desk';
export const LICENSE_OUTSIDER_ACTOR_ID = 'actor-outside-party';

export const LICENSE_ACTION = 'license';

export const LICENSE_ASSET = { kind: 'asset', id: 'digital-work-a', tenantId: LICENSE_TENANT_A } as const;
export const LICENSE_ASSET_SCOPE = `${LICENSE_ASSET.kind}:${LICENSE_ASSET.id}`;

export const LICENSE_TENANT_B_ASSET = { kind: 'asset', id: 'northwind-catalogue', tenantId: LICENSE_TENANT_B } as const;

export const LICENSE_MANAGER_TOKEN_ID = 'cap-manager-license';
export const LICENSE_DESK_TOKEN_ID = 'cap-desk-license';
export const LICENSE_MANAGER_PASSPORT_ID = 'passport-license-manager';
export const LICENSE_DESK_PASSPORT_ID = 'passport-license-desk';

/** The party receiving the permission. Distinct from both the requester and any executor. */
export const LICENSEE_REF = 'party-company-b';
/** An unauthorized substitute for the licensee. */
export const OTHER_LICENSEE_REF = 'party-company-c';
/** The party permitted to perform the external licensing act, when the authorization binds one. */
export const LICENSE_EXECUTOR_REF = 'provider-licensing-platform-c';
/** An unauthorized substitute for the executor. */
export const OTHER_LICENSE_EXECUTOR_REF = 'provider-licensing-platform-d';

/** Opaque operating-context labels. AOC never interprets a dimension name or a value. */
export const PERMITTED_TERRITORY = 'territory-a';
export const OTHER_TERRITORY = 'territory-b';
export const PERMITTED_CHANNEL = 'channel-web';
export const OTHER_CHANNEL = 'channel-broadcast';

/** The latest the *external* license may run to. Deliberately different from `LICENSE_MANDATE_EXPIRES_AT`, which bounds AOC's authority. */
export const LICENSE_TERM_CEILING = '2027-01-01T00:00:00.000Z';

/**
 * The canonical reference authorization: Company B may display and reproduce a
 * governed digital work commercially, on an approved web channel in one
 * territory, non-exclusively, for a term ending no later than 2027, executed
 * by a named licensing platform, with model training explicitly excluded and
 * an external agreement reference required.
 *
 * Note what this deliberately does NOT carry: a `rightsScope`. The permission
 * is completely specified without expressing a portion of the underlying
 * rights, which is exactly the case `TOKENIZE` and `COLLATERALIZE` cannot
 * represent and the reason `rightsScope` is optional.
 */
export function webDisplayLicenseTerms(overrides: Partial<EnterpriseLicenseTerms> = {}): EnterpriseLicenseTerms {
  return {
    rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT],
    licenseeRef: LICENSEE_REF,
    permittedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY, ENTERPRISE_LICENSED_USE_TYPES.REPRODUCE, ENTERPRISE_LICENSED_USE_TYPES.COMMERCIAL_USE],
    exclusivity: 'non-exclusive',
    executorRef: LICENSE_EXECUTOR_REF,
    constraints: {
      prohibitedUses: [ENTERPRISE_LICENSED_USE_TYPES.MODEL_TRAINING],
      permittedContexts: { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] },
      maximumLicenseTermEndsAt: LICENSE_TERM_CEILING,
      maximumLicensedUnits: { units: 10, unitDenomination: 'seat' },
      sublicensing: 'prohibited',
      assignment: 'prohibited',
      additionalLicensesAllowed: false,
      externalAgreementReferenceRequired: true,
    },
    ...overrides,
  };
}

/**
 * The same asset licensed *without* an external executor -- the licensor
 * grants directly. Used to prove that executor binding is genuinely optional
 * for this action rather than a field every governed action must carry.
 */
export function directGrantLicenseTerms(overrides: Partial<EnterpriseLicenseTerms> = {}): EnterpriseLicenseTerms {
  const base = webDisplayLicenseTerms();
  const { executorRef: _executorRef, ...withoutExecutor } = base;
  return {
    ...withoutExecutor,
    constraints: { ...base.constraints, externalAgreementReferenceRequired: false },
    ...overrides,
  };
}

/**
 * An authorization that *does* express a portion of a divisible governed
 * right: 25% of a revenue right. Used to prove that when a license is
 * fractionally expressed, the same integer basis-point containment
 * `TOKENIZE`/`COLLATERALIZE` use applies unchanged.
 */
export function proportionalLicenseTerms(overrides: Partial<EnterpriseLicenseTerms> = {}): EnterpriseLicenseTerms {
  const base = webDisplayLicenseTerms();
  return {
    ...base,
    rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.REVENUE_RIGHT],
    rightsScope: { kind: 'proportional', basisPoints: 2500 },
    ...overrides,
  };
}

/** The same authorization, but permitting more than one external license -- used to exercise the exhaustion constraint. */
export function repeatableLicenseTerms(overrides: Partial<EnterpriseLicenseTerms> = {}): EnterpriseLicenseTerms {
  const base = webDisplayLicenseTerms();
  return {
    ...base,
    constraints: { ...base.constraints, additionalLicensesAllowed: true },
    ...overrides,
  };
}

export interface LicenseWorld {
  readonly kernel: AocKernel;
  readonly governanceStore: GovernanceStore;
  readonly mandateStore: LicenseMandateStore;
  readonly service: LicenseGovernanceService;
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
 * `buildLicenseWorld` is called again with stores freshly opened over the same
 * database files, and nothing else is carried across.
 */
export interface LicenseWorldOverrides {
  readonly governanceStore?: GovernanceStore;
  readonly mandateStore?: LicenseMandateStore;
  /** Overrides the id prefix counter seed so a second process's ids do not collide with the first's. */
  readonly idSeed?: number;
}

export function buildLicenseWorld(overrides: LicenseWorldOverrides = {}): LicenseWorld {
  const recognitionCtx: RuntimeContext = { clock: createManualClock(LICENSE_NOW), idGenerator: createSequentialIdGenerator() };
  const authorityRuntime = createAuthorityGraphRuntime(createAuthorityRuntimeContext(LICENSE_NOW));
  const approvalRuntime = new ApprovalRuntime(createApprovalRuntimeContext(LICENSE_NOW), { authorityGraph: authorityRuntime });
  const recognitionRuntime = createAocRecognitionRuntime(recognitionCtx, undefined, authorityRuntime, approvalRuntime);

  const studios = recognitionRuntime.registerActor({ id: LICENSE_STUDIO_ACTOR_ID, type: 'organization', displayName: 'Aurelia Studios' });
  const trustDomain = recognitionRuntime.createTrustDomain({
    id: LICENSE_TRUST_DOMAIN_ID,
    name: 'Aurelia Studios Rights Authority',
    issuerActorId: studios.id,
    acceptedIssuerIds: [studios.id],
    acceptedActorTypes: ['human', 'organization', 'agent', 'external'],
  });

  const manager = recognitionRuntime.registerActor({
    id: LICENSE_MANAGER_ACTOR_ID,
    type: 'human',
    displayName: 'Rights Manager',
    issuerId: studios.id,
    trustDomainId: trustDomain.id,
  });
  const desk = recognitionRuntime.registerActor({
    id: LICENSE_DESK_ACTOR_ID,
    type: 'agent',
    displayName: 'Licensing Desk Agent',
    issuerId: studios.id,
    trustDomainId: trustDomain.id,
  });
  // Registered but unknown to the trust domain: the canonical "no recognized
  // standing, therefore no authority" actor.
  recognitionRuntime.registerActor({ id: LICENSE_OUTSIDER_ACTOR_ID, type: 'external', displayName: 'Outside Party', status: 'unknown' });

  recognitionRuntime.issuePassport({
    id: LICENSE_MANAGER_PASSPORT_ID,
    type: 'human_passport',
    subjectActorId: manager.id,
    issuerActorId: studios.id,
    trustDomainId: trustDomain.id,
  });
  recognitionRuntime.issuePassport({
    id: LICENSE_DESK_PASSPORT_ID,
    type: 'agent_passport',
    subjectActorId: desk.id,
    issuerActorId: studios.id,
    trustDomainId: trustDomain.id,
  });

  recognitionRuntime.issueCapabilityToken({
    id: LICENSE_MANAGER_TOKEN_ID,
    subjectActorId: manager.id,
    principalActorId: manager.id,
    issuerActorId: studios.id,
    trustDomainId: trustDomain.id,
    capability: LICENSE_ACTION,
    actions: [LICENSE_ACTION],
    resourceScopes: [LICENSE_ASSET_SCOPE],
    riskLevel: 'critical',
  });

  // The delegated desk may request licensing, but the policy layer -- not this
  // module -- requires the rights manager's approval before it is authorized.
  recognitionRuntime.issueCapabilityToken({
    id: LICENSE_DESK_TOKEN_ID,
    subjectActorId: desk.id,
    principalActorId: manager.id,
    issuerActorId: manager.id,
    trustDomainId: trustDomain.id,
    capability: LICENSE_ACTION,
    actions: [LICENSE_ACTION],
    resourceScopes: [LICENSE_ASSET_SCOPE],
    approvalRequirement: { actions: [LICENSE_ACTION], requiredApproverActorIds: [manager.id] },
    riskLevel: 'critical',
  });

  authorityRuntime.registerRootIssuer(trustDomain.id, studios.id);
  const managerGrant = authorityRuntime.issueAuthorityGrant({
    id: 'authority-grant-manager-license',
    issuerActorId: studios.id,
    subjectActorId: manager.id,
    trustDomainId: trustDomain.id,
    roleId: 'role-rights-manager',
    capability: LICENSE_ACTION,
    actions: [LICENSE_ACTION],
    resourceScopes: [LICENSE_ASSET_SCOPE],
    canDelegate: true,
    allowedDelegateActorTypes: ['agent'],
    maxDelegationDepth: 1,
  });
  authorityRuntime.createDelegationGrant({
    id: 'delegation-grant-desk-license',
    delegatorActorId: manager.id,
    delegateActorId: desk.id,
    delegateActorType: 'agent',
    trustDomainId: trustDomain.id,
    sourceAuthorityGrantId: managerGrant.id,
    capability: LICENSE_ACTION,
    actions: [LICENSE_ACTION],
    resourceScopes: [LICENSE_ASSET_SCOPE],
    canRedelegate: false,
  });

  approvalRuntime.registerApproverRecognitionStatus(manager.id, 'recognized');
  approvalRuntime.registerApproverRecognitionStatus(desk.id, 'agent');

  const kernel = createAocKernel({
    recognitionProvider: bridgeRecognitionRuntime(recognitionRuntime),
    clock: createManualEnforcementClock(LICENSE_NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
  });

  const governanceStore = overrides.governanceStore ?? createInMemoryGovernanceStore();
  const mandateStore = overrides.mandateStore ?? createInMemoryLicenseMandateStore({ now: () => LICENSE_NOW });

  let counter = overrides.idSeed ?? 0;
  const service = createLicenseGovernanceService({
    store: mandateStore,
    kernel,
    governanceStore,
    enterpriseContext: testEnterpriseContext,
    now: () => LICENSE_NOW,
    nextId: (prefix: string) => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  });

  return { kernel, governanceStore, mandateStore, service, enterpriseContext: testEnterpriseContext };
}

/** The canonical "authorized rights manager asks to license web display to Company B" submission. */
export function buildLicenseManagerRequest(overrides: Record<string, unknown> = {}) {
  return {
    asset: LICENSE_ASSET,
    requestedBy: LICENSE_MANAGER_ACTOR_ID,
    trustDomainId: LICENSE_TRUST_DOMAIN_ID,
    terms: webDisplayLicenseTerms(),
    context: { passportId: LICENSE_MANAGER_PASSPORT_ID, capabilityTokenId: LICENSE_MANAGER_TOKEN_ID },
    mandateExpiresAt: LICENSE_MANDATE_EXPIRES_AT,
    ...overrides,
  };
}

/**
 * The canonical "the authorized platform reports it granted the license,
 * exactly as authorized" execution report.
 *
 * An override whose value is `undefined` *removes* the field rather than
 * setting it to `undefined`. The repository compiles with
 * `exactOptionalPropertyTypes`, and the distinction matters to the domain as
 * well as the compiler: "reported no expiry" and "reported an expiry of
 * `undefined`" are the same fact, and the containment checks read presence.
 */
export function buildConformingLicenseExecution(mandateId: string, overrides: Record<string, unknown> = {}): RecordLicenseExecutionRequest {
  const merged: Record<string, unknown> = {
    mandateId,
    executedBy: LICENSE_EXECUTOR_REF,
    executedAt: '2026-02-01T00:00:00.000Z',
    licenseeRef: LICENSEE_REF,
    rights: [ENTERPRISE_LICENSABLE_RIGHT_TYPES.USAGE_RIGHT],
    grantedUses: [ENTERPRISE_LICENSED_USE_TYPES.DISPLAY, ENTERPRISE_LICENSED_USE_TYPES.COMMERCIAL_USE],
    exclusivity: 'non-exclusive' as const,
    contexts: { territory: [PERMITTED_TERRITORY], channel: [PERMITTED_CHANNEL] },
    licenseEffectiveAt: '2026-02-01T00:00:00.000Z',
    licenseExpiresAt: '2026-12-01T00:00:00.000Z',
    licensedUnits: { units: 5, unitDenomination: 'seat' },
    externalSystem: 'licensing-platform-c',
    externalAgreementReference: 'agreement-2026-0001',
    externalAcceptanceReference: 'acceptance-2026-0001',
    ...overrides,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as unknown as RecordLicenseExecutionRequest;
}
