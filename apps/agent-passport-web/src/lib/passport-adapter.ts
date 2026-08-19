/**
 * Adapter layer between the web app and @aoc-enterprise/agent-governance.
 * All passport logic stays in the core package; this file only wires dependencies.
 */

import {
  issueAgentPassport,
  verifyAgentPassport,
  verifyAgentRuntimeSeal,
  createAgentPassportPublicVerificationPayload,
  evaluateAgentRuntimeGuard,
} from '@aoc-enterprise/agent-governance';
import type {
  AgentEnrollmentInput,
  IssuedAgentPassportBundle,
  AgentPassportPublicVerificationPayload,
  AgentPassportVerificationResult,
  AgentRuntimeSealVerificationResult,
  EvaluateAgentRuntimeGuardInput,
  AgentRuntimeGuardDecision,
} from '@aoc-enterprise/agent-governance';
import { createIssuerSignerFromEnv, ensureConfiguredIssuerKeyRegistered, getIssuerSignerConfigFromEnv } from './issuer/issuer-signer.js';
import { storePassportBundle, getPassportBundle, getAllPassportIds } from './store.js';
import { SqliteAuditEventRepository } from './persistence/sqlite-audit-event-repository.js';
import { PersistentRuntimeGuardEventSink } from './runtime-guard/persistent-event-sink.js';

const BASE_VERIFICATION_URL =
  process.env.NEXT_PUBLIC_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/verify`
    : 'http://localhost:3000/verify';

export interface EnrollAgentInput {
  readonly agentName: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly purpose: string;
  readonly jurisdiction: string;
  readonly autonomyLevel: 'low' | 'medium' | 'high';
  readonly riskTier: 'low' | 'medium' | 'high' | 'critical';
  readonly dataAccess: readonly string[];
  readonly tools: readonly string[];
  readonly prohibitedActions: readonly string[];
  readonly humanApprovalRequiredActions: readonly string[];
  readonly escalationRules: readonly { trigger: string; action: string }[];
  readonly createdBy: string;
  readonly modelProvider?: string;
  readonly runtimeEnvironment?: string;
  readonly tags?: readonly string[];
}

export async function enrollAgent(input: EnrollAgentInput): Promise<IssuedAgentPassportBundle> {
  const signer = createIssuerSignerFromEnv();
  const issuerConfig = getIssuerSignerConfigFromEnv();
  await ensureConfiguredIssuerKeyRegistered();
  const hasHumanApproval = input.humanApprovalRequiredActions.length > 0;

  const enrollmentInput: AgentEnrollmentInput = {
    agentName: input.agentName,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    purpose: input.purpose,
    jurisdiction: input.jurisdiction,
    autonomyLevel: input.autonomyLevel,
    riskTier: input.riskTier,
    dataAccess: input.dataAccess,
    tools: input.tools,
    prohibitedActions: input.prohibitedActions,
    humanOversight: {
      requirement: hasHumanApproval ? 'required' : 'optional',
      description: hasHumanApproval
        ? `Human approval required for: ${input.humanApprovalRequiredActions.join(', ')}`
        : undefined,
    },
    escalationRules: input.escalationRules.map((r) => ({
      trigger: r.trigger,
      action: r.action,
    })),
    createdBy: input.createdBy,
    issuedAt: new Date().toISOString(),
    modelProvider: input.modelProvider,
    runtimeEnvironment: input.runtimeEnvironment,
    tags: input.tags,
    metadata: {
      issuerId: issuerConfig.issuerId,
      issuerKeyId: issuerConfig.keyId,
      issuerAlgorithm: issuerConfig.algorithm,
    },
  };

  const bundle = await issueAgentPassport(enrollmentInput, {
    signer,
    baseVerificationUrl: BASE_VERIFICATION_URL,
    issuer: issuerConfig.issuerId,
  });

  storePassportBundle(bundle);
  return bundle;
}

export function getAgentPassportBundle(passportId: string): IssuedAgentPassportBundle | undefined {
  return getPassportBundle(passportId);
}

export interface PassportVerificationBundle {
  readonly passportResult: AgentPassportVerificationResult;
  readonly runtimeSealResult: AgentRuntimeSealVerificationResult | null;
  readonly publicPayload: AgentPassportPublicVerificationPayload;
}

export async function verifyAgentPassportBundle(
  passportId: string,
): Promise<PassportVerificationBundle | null> {
  const bundle = getPassportBundle(passportId);
  if (!bundle) return null;

  const signer = createIssuerSignerFromEnv();
  const passportResult = await verifyAgentPassport(bundle.passport, { signer });

  let runtimeSealResult: AgentRuntimeSealVerificationResult | null = null;
  if (bundle.runtimeSeal) {
    // allowIssued: true because newly enrolled passports have status 'issued' until activated.
    runtimeSealResult = await verifyAgentRuntimeSeal(
      bundle.runtimeSeal,
      bundle.passport,
      { signer },
      { allowIssued: true },
    );
  }

  const publicPayload = createAgentPassportPublicVerificationPayload(bundle.passport);

  await new SqliteAuditEventRepository().recordPassportVerificationEvent({
    passportId,
    verificationResult: passportResult.valid && (runtimeSealResult === null || runtimeSealResult.valid) ? 'valid' : 'invalid',
    reasonCodes: [...passportResult.reasonCodes, ...(runtimeSealResult?.reasonCodes ?? [])],
  });

  return { passportResult, runtimeSealResult, publicPayload };
}

export async function runRuntimeGuardDemo(
  passportId: string,
  requestedAction: string,
  actionCategory: EvaluateAgentRuntimeGuardInput['request']['actionCategory'],
  toolName: string,
  dataCategories: string[],
): Promise<AgentRuntimeGuardDecision | null> {
  const bundle = getPassportBundle(passportId);
  if (!bundle) return null;

  const signer = createIssuerSignerFromEnv();
  const input: EvaluateAgentRuntimeGuardInput = {
    request: {
      requestId: `demo-${Date.now()}`,
      passportId,
      actorId: bundle.passport.ownerId,
      requestedAction,
      actionCategory,
      toolName,
      dataCategories,
      requestedAt: new Date().toISOString(),
    },
    passport: bundle.passport,
    runtimeSeal: bundle.runtimeSeal,
    policyManifest: bundle.policyManifest,
    options: {
      allowIssuedPassport: true,
    },
  };

  return evaluateAgentRuntimeGuard(input, { signer, eventSink: new PersistentRuntimeGuardEventSink() });
}

export async function createSampleAgentPassport(): Promise<IssuedAgentPassportBundle> {
  // Check if sample already exists to keep it stable across requests.
  const existing = getAllPassportIds()
    .map(getPassportBundle)
    .filter((b): b is IssuedAgentPassportBundle => b !== undefined)
    .find((b) => b.passport.agentName === 'SalesBot CR');

  if (existing) return existing;

  return enrollAgent({
    agentName: 'SalesBot CR',
    ownerId: 'aoc-demo-company',
    ownerName: 'Soberanía Demo Company',
    purpose:
      'Assist with sales conversations and CRM lead capture under human-supervised governance.',
    jurisdiction: 'CR',
    autonomyLevel: 'medium',
    riskTier: 'medium',
    dataAccess: ['product_catalog', 'approved_faq', 'crm_lead_notes'],
    tools: ['create_lead', 'classify_intent', 'draft_response'],
    prohibitedActions: [
      'offer_unapproved_discounts',
      'make_legal_claims',
      'access_payment_data',
      'delete_customer_records',
    ],
    humanApprovalRequiredActions: [
      'discount_above_10_percent',
      'contract_language',
      'refund_commitment',
      'customer_escalation',
    ],
    escalationRules: [
      { trigger: 'contract_language', action: 'escalate_to_legal' },
      { trigger: 'refund_commitment', action: 'escalate_to_finance' },
    ],
    createdBy: 'aoc-demo-setup',
    modelProvider: 'AOC-Compatible-LLM',
    runtimeEnvironment: 'production',
    tags: ['sales', 'crm', 'demo'],
  });
}


export type GovernanceProofScenarioKey =
  | 'allowed_action'
  | 'prohibited_action'
  | 'unauthorized_data_access'
  | 'tool_not_allowed'
  | 'human_approval_required'
  | 'tampered_runtime_seal'
  | 'revoked_passport';

export interface GovernanceProofScenarioResult {
  readonly scenarioKey: GovernanceProofScenarioKey;
  readonly title: string;
  readonly request: EvaluateAgentRuntimeGuardInput['request'];
  readonly passportStatus: string;
  readonly runtimeSealValid: boolean;
  readonly passportValid: boolean;
  readonly policyManifestSummary: {
    readonly toolAllowed: boolean;
    readonly dataAllowed: boolean;
    readonly actionProhibited: boolean;
    readonly humanApprovalConfigured: boolean;
  };
  readonly decision: AgentRuntimeGuardDecision;
  readonly executionResult: 'Allowed to proceed' | 'Blocked' | 'Paused pending human approval';
  readonly autonomousExecutionBlocked: boolean;
  readonly auditEvents: import('@aoc-enterprise/agent-governance').AgentRuntimeGuardEvent[];
  readonly expectedOutcome: AgentRuntimeGuardDecision['outcome'];
  readonly passed: boolean;
  readonly hashSnippets: {
    readonly passportHash: string;
    readonly runtimeSealPassportHash: string | null;
    readonly policyManifestHash: string;
  };
}

type ScenarioDefinition = {
  readonly title: string;
  readonly request: Omit<EvaluateAgentRuntimeGuardInput['request'], 'requestId' | 'passportId' | 'actorId' | 'requestedAt'>;
  readonly expectedOutcome: AgentRuntimeGuardDecision['outcome'];
  readonly expectedReasonCodes?: readonly string[];
  readonly mutateBundle?: (bundle: IssuedAgentPassportBundle) => IssuedAgentPassportBundle;
};

const GOVERNANCE_PROOF_SCENARIOS: Record<GovernanceProofScenarioKey, ScenarioDefinition> = {
  allowed_action: {
    title: 'Allowed action',
    request: { requestedAction: 'create_lead', actionCategory: 'create_record', toolName: 'create_lead', dataCategories: ['crm_lead_notes'] },
    expectedOutcome: 'allow',
  },
  prohibited_action: {
    title: 'Prohibited action',
    request: { requestedAction: 'offer_unapproved_discounts', actionCategory: 'send_message', toolName: 'draft_response', dataCategories: ['approved_faq'] },
    expectedOutcome: 'deny',
    expectedReasonCodes: ['runtime_guard.action_prohibited'],
  },
  unauthorized_data_access: {
    title: 'Unauthorized data access',
    request: { requestedAction: 'create_lead', actionCategory: 'create_record', toolName: 'create_lead', dataCategories: ['payment_data'] },
    expectedOutcome: 'deny',
    expectedReasonCodes: ['runtime_guard.data_access_not_allowed'],
  },
  tool_not_allowed: {
    title: 'Tool not allowed',
    request: { requestedAction: 'delete_customer_records', actionCategory: 'delete_record', toolName: 'delete_customer_records', dataCategories: ['crm_lead_notes'] },
    expectedOutcome: 'deny',
    expectedReasonCodes: ['runtime_guard.action_prohibited', 'runtime_guard.tool_not_allowed'],
  },
  human_approval_required: {
    title: 'Human approval required',
    request: { requestedAction: 'refund_commitment', actionCategory: 'financial_action', toolName: 'draft_response', dataCategories: ['crm_lead_notes'], riskTier: 'critical' },
    expectedOutcome: 'require_human_approval',
    expectedReasonCodes: ['runtime_guard.high_risk_requires_approval'],
  },
  tampered_runtime_seal: {
    title: 'Tampered runtime seal',
    request: { requestedAction: 'create_lead', actionCategory: 'create_record', toolName: 'create_lead', dataCategories: ['crm_lead_notes'] },
    expectedOutcome: 'deny',
    expectedReasonCodes: ['runtime_guard.invalid_runtime_seal'],
    mutateBundle: createTamperedRuntimeSealScenario,
  },
  revoked_passport: {
    title: 'Revoked passport',
    request: { requestedAction: 'create_lead', actionCategory: 'create_record', toolName: 'create_lead', dataCategories: ['crm_lead_notes'] },
    expectedOutcome: 'deny',
    expectedReasonCodes: ['runtime_guard.passport_revoked'],
    mutateBundle: createRevokedPassportScenario,
  },
};

export function createTamperedRuntimeSealScenario(bundle: IssuedAgentPassportBundle): IssuedAgentPassportBundle {
  return {
    ...bundle,
    runtimeSeal: bundle.runtimeSeal ? { ...bundle.runtimeSeal, passportHash: 'sha256:tampered-governance-proof' } : bundle.runtimeSeal,
  };
}

export function createRevokedPassportScenario(bundle: IssuedAgentPassportBundle): IssuedAgentPassportBundle {
  return {
    ...bundle,
    passport: { ...bundle.passport, status: 'revoked' },
  };
}

export async function runGovernanceProofScenario(
  scenarioKey: GovernanceProofScenarioKey,
): Promise<GovernanceProofScenarioResult> {
  const baseBundle = await createSampleAgentPassport();
  const definition = GOVERNANCE_PROOF_SCENARIOS[scenarioKey];
  const proofBaseBundle: IssuedAgentPassportBundle = {
    ...baseBundle,
    policyManifest: {
      ...baseBundle.policyManifest,
      humanApprovalRequiredFor: ['discount_above_10_percent', 'contract_language', 'refund_commitment', 'customer_escalation'],
    },
  };
  const bundle = definition.mutateBundle ? definition.mutateBundle(proofBaseBundle) : proofBaseBundle;
  const signer = createIssuerSignerFromEnv();
  const auditEvents: GovernanceProofScenarioResult['auditEvents'] = [];
  const request: EvaluateAgentRuntimeGuardInput['request'] = {
    requestId: `proof-${scenarioKey}`,
    passportId: bundle.passport.passportId,
    actorId: bundle.passport.ownerId,
    requestedAt: new Date().toISOString(),
    ...definition.request,
  };

  const [runtimeSealResult, passportResult] = await Promise.all([
    bundle.runtimeSeal
      ? verifyAgentRuntimeSeal(bundle.runtimeSeal, bundle.passport, { signer }, { allowIssued: true })
      : Promise.resolve({ valid: false, reasonCodes: ['runtime_seal.missing'] } as AgentRuntimeSealVerificationResult),
    verifyAgentPassport(bundle.passport, { signer }),
  ]);

  const decision = await evaluateAgentRuntimeGuard(
    { request, passport: bundle.passport, runtimeSeal: bundle.runtimeSeal, policyManifest: bundle.policyManifest, options: { allowIssuedPassport: true } },
    { signer, eventSink: { emit: (event) => { auditEvents.push(event); } } },
  );

  const executionResult = decision.outcome === 'allow'
    ? 'Allowed to proceed'
    : decision.outcome === 'require_human_approval'
    ? 'Paused pending human approval'
    : 'Blocked';
  const expectedReasonCodes = definition.expectedReasonCodes ?? [];
  const reasonCodesPassed = expectedReasonCodes.length === 0 || expectedReasonCodes.some((code) => decision.reasonCodes.includes(code as never));

  return {
    scenarioKey,
    title: definition.title,
    request,
    passportStatus: bundle.passport.status,
    runtimeSealValid: runtimeSealResult.valid,
    passportValid: passportResult.valid,
    policyManifestSummary: {
      toolAllowed: request.toolName ? bundle.policyManifest.toolAccess.includes(request.toolName) : true,
      dataAllowed: (request.dataCategories ?? []).every((cat) => bundle.policyManifest.dataAccess.includes(cat)),
      actionProhibited: bundle.policyManifest.prohibitedActions.includes(request.requestedAction),
      humanApprovalConfigured: bundle.policyManifest.humanApprovalRequiredFor.includes(request.requestedAction) || request.riskTier === 'critical',
    },
    decision,
    executionResult,
    autonomousExecutionBlocked: decision.outcome !== 'allow',
    auditEvents,
    expectedOutcome: definition.expectedOutcome,
    passed: decision.outcome === definition.expectedOutcome && reasonCodesPassed && auditEvents.length > 0,
    hashSnippets: {
      passportHash: bundle.passport.passportHash.slice(0, 20),
      runtimeSealPassportHash: bundle.runtimeSeal?.passportHash.slice(0, 20) ?? null,
      policyManifestHash: bundle.passport.policyManifestHash.slice(0, 20),
    },
  };
}

export async function runGovernanceProofScenarios(): Promise<GovernanceProofScenarioResult[]> {
  const keys = Object.keys(GOVERNANCE_PROOF_SCENARIOS) as GovernanceProofScenarioKey[];
  return Promise.all(keys.map((key) => runGovernanceProofScenario(key)));
}
