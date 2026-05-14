import { GovernanceTreaty } from './types';

export function createGovernanceTreaty(input: Omit<GovernanceTreaty, 'status' | 'createdAt' | 'effectiveAt' | 'revokedAt'>): GovernanceTreaty {
  return { ...input, status: 'proposed', createdAt: new Date().toISOString() };
}
export function activateGovernanceTreaty(treaty: GovernanceTreaty): GovernanceTreaty {
  if (treaty.status === 'revoked') throw new Error('revoked treaties cannot reactivate');
  if (treaty.status === 'expired') throw new Error('expired treaties require amendment/extension');
  return { ...treaty, status: 'active', effectiveAt: new Date().toISOString() };
}
export const suspendGovernanceTreaty = (treaty: GovernanceTreaty): GovernanceTreaty => ({ ...treaty, status: 'suspended' });
export const expireGovernanceTreaty = (treaty: GovernanceTreaty): GovernanceTreaty => ({ ...treaty, status: 'expired' });
export const revokeGovernanceTreaty = (treaty: GovernanceTreaty): GovernanceTreaty => ({ ...treaty, status: 'revoked', revokedAt: new Date().toISOString() });
export const disputeGovernanceTreaty = (treaty: GovernanceTreaty): GovernanceTreaty => ({ ...treaty, status: 'disputed' });
