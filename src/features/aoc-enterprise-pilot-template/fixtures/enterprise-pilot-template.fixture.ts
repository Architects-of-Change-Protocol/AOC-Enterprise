import type { PilotPersona } from '../domain/pilot-persona.js';
import { createPilotRuntimeContext, type PilotRuntimeContext } from '../domain/pilot-runtime-context.js';
import { createPilotRuntime, PilotRuntime } from '../services/pilot-runtime.js';

export const NOW = '2026-01-01T00:00:00.000Z';

function buyerPersona(id: string, title: string): PilotPersona {
  return {
    id,
    type: 'buyer',
    title,
    description: `${title}: the business buyer who owns the pain this pilot addresses and evaluates whether AOC solves it.`,
    concerns: ['Business risk exposure', 'Time to value', 'Auditability of the outcome'],
    successQuestions: [
      'Did AOC prevent at least one action that should not have executed unattended?',
      'Can I show this pilot to my own stakeholders as proof, not a promise?',
    ],
    messages: [`AOC gives ${title} a governed, auditable way to let autonomous agents act.`],
  };
}

function operatorPersona(id: string, title: string): PilotPersona {
  return {
    id,
    type: 'operator',
    title,
    description: `${title}: the operator who runs and inspects the pilot day to day.`,
    concerns: ['Clarity of the Control Plane walkthrough', 'Confidence that blocked actions really are blocked'],
    successQuestions: [
      'Can I explain why an action was blocked or allowed just from the Control Plane?',
      'Can I export proof of a decision without engineering help?',
    ],
    messages: [`${title} can walk every decision this pilot makes without trusting a screenshot.`],
  };
}

export const BUILT_IN_PILOT_PERSONAS: readonly PilotPersona[] = [
  buyerPersona('persona-buyer-coo-operations-director', 'COO / Operations Director'),
  buyerPersona('persona-buyer-pmo-director', 'PMO Director'),
  buyerPersona('persona-buyer-services-delivery-director', 'Services Delivery Director'),
  buyerPersona('persona-buyer-cio', 'CIO'),
  buyerPersona('persona-buyer-ciso', 'CISO'),
  buyerPersona('persona-buyer-compliance-officer', 'Compliance Officer'),
  buyerPersona('persona-buyer-operations-risk-director', 'Operations Risk Director'),
  buyerPersona('persona-buyer-digital-transformation-director', 'Digital Transformation Director'),
  buyerPersona('persona-buyer-healthcare-operations-director', 'Healthcare Operations Director'),
  buyerPersona('persona-buyer-data-protection-officer', 'Data Protection Officer'),
  buyerPersona('persona-buyer-compliance-lead', 'Compliance Lead'),
  buyerPersona('persona-buyer-sports-league-operator', 'Sports League Operator'),
  buyerPersona('persona-buyer-event-platform-founder', 'Event Platform Founder'),
  buyerPersona('persona-buyer-payments-partner', 'Payments Partner'),
  buyerPersona('persona-buyer-smart-contract-product-lead', 'Smart Contract Product Lead'),
  buyerPersona('persona-buyer-risk-compliance-reviewer', 'Risk / Compliance Reviewer'),
  operatorPersona('persona-operator-project-manager', 'Project Manager'),
  operatorPersona('persona-operator-pmo-analyst', 'PMO Analyst'),
  operatorPersona('persona-operator-delivery-manager', 'Delivery Manager'),
  operatorPersona('persona-operator-finance-operator', 'Finance Operator'),
  operatorPersona('persona-operator-compliance-reviewer', 'Compliance Reviewer'),
  operatorPersona('persona-operator-security-analyst', 'Security Analyst'),
  operatorPersona('persona-operator-process-owner', 'Process Owner'),
  operatorPersona('persona-operator-operations-coordinator', 'Operations Coordinator'),
  operatorPersona('persona-operator-data-steward', 'Data Steward'),
  operatorPersona('persona-operator-event-operations-manager', 'Event Operations Manager'),
  operatorPersona('persona-operator-settlement-reviewer', 'Settlement Reviewer'),
  operatorPersona('persona-operator-partner-operations-analyst', 'Partner Operations Analyst'),
];

export interface EnterprisePilotTemplateFixture {
  readonly ctx: PilotRuntimeContext;
  readonly runtime: PilotRuntime;
  readonly personas: readonly PilotPersona[];
}

/**
 * Bare-foundation fixture: a deterministic `PilotRuntime`/`PilotTemplateStore`
 * seeded with the built-in personas, but with an otherwise empty template
 * registry. Per-pilot fixtures (`datasys-project-governance-pilot.fixture.ts`,
 * ...) build their own `PilotRuntime` wired to real Enterprise
 * Demo/Verifiable Export Package/Evidence Runtime dependencies and register
 * a template into it.
 */
export function buildEnterprisePilotTemplateFixture(): EnterprisePilotTemplateFixture {
  const ctx = createPilotRuntimeContext(NOW);
  const runtime = createPilotRuntime(ctx);
  for (const persona of BUILT_IN_PILOT_PERSONAS) {
    runtime.store.savePersona(persona);
  }
  return { ctx, runtime, personas: BUILT_IN_PILOT_PERSONAS };
}
