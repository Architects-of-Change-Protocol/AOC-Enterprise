'use server';

import { redirect } from 'next/navigation';
import { enrollAgent } from '@/lib/passport-adapter';

function splitLines(val: string): string[] {
  return val
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function enrollAgentAction(formData: FormData): Promise<void> {
  const get = (key: string) => (formData.get(key) as string | null) ?? '';

  const autonomyLevel = get('autonomyLevel') as 'low' | 'medium' | 'high';
  const riskTier = get('riskTier') as 'low' | 'medium' | 'high' | 'critical';

  const bundle = await enrollAgent({
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
  });

  redirect(`/passport/${bundle.passport.passportId}`);
}
