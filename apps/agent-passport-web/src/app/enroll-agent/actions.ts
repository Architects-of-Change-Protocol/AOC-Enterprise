'use server';

import { redirect } from 'next/navigation';
import { enrollAgent } from '@/lib/passport-adapter';
import {
  getPurchaseByStripeSessionId,
  canEnrollWithPurchase,
  markPurchaseEnrollmentStarted,
  markPurchasePassportIssued,
} from '@/lib/purchase-repository';
import { createPassportRecord } from '@/lib/passport-repository';
import { verifyRegistryAccess } from '@/lib/organization-registry-service';
import {
  getEntitlementByRegistryId,
  addPassportToRegistry,
} from '@/lib/organization-registry-repository';

function splitLines(val: string): string[] {
  return val
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildAgentInput(get: (key: string) => string) {
  const autonomyLevel = get('autonomyLevel') as 'low' | 'medium' | 'high';
  const riskTier = get('riskTier') as 'low' | 'medium' | 'high' | 'critical';
  return {
    agentName: get('agentName'),
    ownerId: get('ownerId') || 'unknown-owner',
    ownerName: get('ownerName'),
    purpose: get('purpose'),
    jurisdiction: get('jurisdiction') || 'GLOBAL',
    autonomyLevel,
    riskTier,
    dataAccess: splitLines(get('dataAccess')),
    tools: splitLines(get('toolAccess')),
    prohibitedActions: splitLines(get('prohibitedActions')),
    humanApprovalRequiredActions: splitLines(get('humanApprovalRequired')),
    escalationRules: splitLines(get('escalationRules')).map((r) => {
      const [trigger, ...rest] = r.split('->');
      return { trigger: (trigger ?? r).trim(), action: (rest.join('->') || 'escalate').trim() };
    }),
    createdBy: get('createdBy') || 'enrollment-form',
    modelProvider: get('modelProvider') || undefined,
    runtimeEnvironment: get('runtimeEnvironment') || undefined,
    tags: splitLines(get('tags')),
  };
}

export async function enrollAgentAction(formData: FormData): Promise<void> {
  const get = (key: string) => (formData.get(key) as string | null) ?? '';

  const sessionId = get('session_id');
  const registryId = get('registry_id');
  const accessToken = get('access_token');

  // -----------------------------------------------------------------------
  // Mode 2: Organization registry enrollment
  // -----------------------------------------------------------------------
  if (registryId && accessToken) {
    const registryResult = verifyRegistryAccess(registryId, accessToken);
    if (!registryResult.ok || !registryResult.registry) {
      throw new Error('Registry access denied. Use the admin URL from your checkout confirmation.');
    }

    const registry = registryResult.registry;
    if (registry.registryStatus !== 'active') {
      throw new Error('Registry is not active.');
    }

    const entitlement = getEntitlementByRegistryId(registryId);
    if (!entitlement || entitlement.status !== 'active' || entitlement.remainingQuantity <= 0) {
      throw new Error('Registry capacity exhausted.');
    }

    const agentInput = buildAgentInput(get);
    const bundle = await enrollAgent(agentInput);
    const passportId = bundle.passport.passportId;

    createPassportRecord(passportId, null, JSON.stringify(bundle), undefined, registryId);

    addPassportToRegistry({
      registryId,
      passportId,
      agentName: agentInput.agentName,
      agentOwner: agentInput.ownerName || undefined,
      governanceStatus: 'active',
      runtimeGuardReady: false,
    });

    redirect(`/passport/${passportId}`);
    return;
  }

  // -----------------------------------------------------------------------
  // Mode 1: Individual purchase enrollment
  // -----------------------------------------------------------------------
  if (!sessionId) {
    throw new Error('Payment required. Complete a purchase before enrolling.');
  }

  const purchase = getPurchaseByStripeSessionId(sessionId);
  if (!purchase) {
    throw new Error('Session not found. Complete a valid purchase before enrolling.');
  }

  if (!canEnrollWithPurchase(purchase.id)) {
    if (purchase.enrollmentStatus === 'passport_issued') {
      throw new Error('A passport has already been issued for this purchase.');
    }
    throw new Error(`Purchase is not eligible for enrollment (status: ${purchase.status}).`);
  }

  markPurchaseEnrollmentStarted(purchase.id);

  const agentInput = buildAgentInput(get);
  const bundle = await enrollAgent(agentInput);
  const passportId = bundle.passport.passportId;

  createPassportRecord(passportId, purchase.id, JSON.stringify(bundle));
  markPurchasePassportIssued(purchase.id, passportId);

  redirect(`/passport/${passportId}`);
}
