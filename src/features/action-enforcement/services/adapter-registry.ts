import type { EnforcementAdapter, EnforcementAdapterType } from '../domain/enforcement-adapter.js';
import type { EnforcementStore } from './enforcement-store.js';

export interface AdapterPermissionCheckInput {
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly idempotencyKey?: string;
}

export interface AdapterPermissionCheckResult {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Deny lists always win. An allow list, when present, is a closed set --
 * anything not on it is denied. This is a pure function (no store access) so
 * AdapterPermissionPolicy can call it directly against an already-resolved
 * EnforcementAdapter without taking a service dependency.
 */
export function evaluateAdapterPermission(adapter: EnforcementAdapter, input: AdapterPermissionCheckInput): AdapterPermissionCheckResult {
  if (adapter.deniedActions?.includes(input.action)) {
    return { allowed: false, reasonCode: 'ADAPTER_ACTION_DENIED', reason: `Adapter ${adapter.id} denies action ${input.action}.` };
  }
  if (input.capability !== undefined && adapter.deniedCapabilities?.includes(input.capability)) {
    return { allowed: false, reasonCode: 'ADAPTER_CAPABILITY_DENIED', reason: `Adapter ${adapter.id} denies capability ${input.capability}.` };
  }
  if (adapter.deniedResourceScopes?.includes(input.resourceScope)) {
    return { allowed: false, reasonCode: 'ADAPTER_SCOPE_DENIED', reason: `Adapter ${adapter.id} denies resource scope ${input.resourceScope}.` };
  }

  if (adapter.allowedActions !== undefined && !adapter.allowedActions.includes(input.action)) {
    return { allowed: false, reasonCode: 'ADAPTER_ACTION_NOT_ALLOWED', reason: `Adapter ${adapter.id} does not allow action ${input.action}.` };
  }
  if (adapter.allowedCapabilities !== undefined && input.capability !== undefined && !adapter.allowedCapabilities.includes(input.capability)) {
    return { allowed: false, reasonCode: 'ADAPTER_CAPABILITY_NOT_ALLOWED', reason: `Adapter ${adapter.id} does not allow capability ${input.capability}.` };
  }
  if (adapter.allowedResourceScopes !== undefined && !adapter.allowedResourceScopes.includes(input.resourceScope)) {
    return { allowed: false, reasonCode: 'ADAPTER_SCOPE_NOT_ALLOWED', reason: `Adapter ${adapter.id} does not allow resource scope ${input.resourceScope}.` };
  }

  if (adapter.requiresIdempotencyKey && input.idempotencyKey === undefined) {
    return { allowed: false, reasonCode: 'IDEMPOTENCY_KEY_REQUIRED', reason: `Adapter ${adapter.id} requires an idempotency key.` };
  }

  return { allowed: true, reasonCode: 'ADAPTER_PERMITTED', reason: `Adapter ${adapter.id} permits this request.` };
}

export class AdapterRegistry {
  constructor(private readonly store: EnforcementStore) {}

  register(adapter: EnforcementAdapter): EnforcementAdapter {
    return this.store.saveAdapter(adapter);
  }

  getAdapter(adapterId: string): EnforcementAdapter | undefined {
    return this.store.getAdapter(adapterId);
  }

  listByType(type: EnforcementAdapterType): readonly EnforcementAdapter[] {
    return this.store.getAdaptersByType(type);
  }

  checkPermission(adapter: EnforcementAdapter, input: AdapterPermissionCheckInput): AdapterPermissionCheckResult {
    return evaluateAdapterPermission(adapter, input);
  }
}
