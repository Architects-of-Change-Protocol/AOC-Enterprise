import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import type { GuardActionRequestInput } from '../sdk/aoc-guard.js';
import {
  APPROVE_PAYMENT,
  CHANGE_BANK_ACCOUNT,
  PMFREAK_ACTOR_ID,
  PMFREAK_PAYMENT_TOKEN_ID,
  PROJECT_SCOPE,
  TRUST_DOMAIN_ID,
  VICTOR_ACTOR_ID,
  VICTOR_FINANCIAL_TOKEN_ID,
} from './datasys-enforcement.fixture.js';

export const PAYMENTS_ADAPTER_ID = 'adapter-payments-workflow';

/** An adapter that denies approve_payment outright -- even when Recognition Runtime would allow it. */
export const paymentsAdapter: EnforcementAdapter = {
  id: PAYMENTS_ADAPTER_ID,
  type: 'workflow_step',
  name: 'Payments Workflow',
  deniedActions: [APPROVE_PAYMENT],
  requiresIdempotencyKey: false,
};

/**
 * PMFreak Closure Agent attempting approve_payment. Recognition Runtime
 * (via its own Authority Graph delegation) would allow it, but the adapter
 * registered above denies the action outright -- adapter deny always wins.
 */
export function buildApprovePaymentGuardInput(overrides: Partial<GuardActionRequestInput> = {}): GuardActionRequestInput {
  return {
    actorId: PMFREAK_ACTOR_ID,
    principalActorId: VICTOR_ACTOR_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    action: APPROVE_PAYMENT,
    resourceScope: PROJECT_SCOPE,
    capability: 'payments.approval',
    sideEffectType: 'financial',
    riskLevel: 'critical',
    adapterId: PAYMENTS_ADAPTER_ID,
    metadata: { passportId: 'passport-pmfreak', capabilityTokenId: PMFREAK_PAYMENT_TOKEN_ID },
    ...overrides,
  };
}

/**
 * Victor changing the bank account on file: Recognition Runtime allows it
 * outright (Victor holds direct authority, no approval requirement attached
 * to the capability token), but the side-effect-boundary policy still
 * requires a confirmed approval proof for a 'financial' side effect --
 * enforcement-level defense in depth beyond what Recognition alone demands.
 */
export function buildChangeBankAccountGuardInput(overrides: Partial<GuardActionRequestInput> = {}): GuardActionRequestInput {
  return {
    actorId: VICTOR_ACTOR_ID,
    trustDomainId: TRUST_DOMAIN_ID,
    action: CHANGE_BANK_ACCOUNT,
    resourceScope: PROJECT_SCOPE,
    capability: 'finance.bank_details',
    sideEffectType: 'financial',
    riskLevel: 'critical',
    metadata: { passportId: 'passport-victor', capabilityTokenId: VICTOR_FINANCIAL_TOKEN_ID },
    ...overrides,
  };
}
