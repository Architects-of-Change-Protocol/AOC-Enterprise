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
import { createDevSigner } from './dev-signer.js';
import { storePassportBundle, getPassportBundle, getAllPassportIds } from './store.js';

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
  const signer = createDevSigner();
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
  };

  const bundle = await issueAgentPassport(enrollmentInput, {
    signer,
    baseVerificationUrl: BASE_VERIFICATION_URL,
    issuer: 'AOC-Dev-Governance-Authority',
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

  const signer = createDevSigner();
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

  const signer = createDevSigner();
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

  return evaluateAgentRuntimeGuard(input, { signer });
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
    ownerName: 'AOC Demo Company',
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
