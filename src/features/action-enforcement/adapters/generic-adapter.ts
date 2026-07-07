import type { EnforcementAdapter, EnforcementAdapterType } from '../domain/enforcement-adapter.js';

export interface AdapterConfigInput {
  readonly id: string;
  readonly name: string;
  readonly allowedActions?: readonly string[];
  readonly deniedActions?: readonly string[];
  readonly allowedCapabilities?: readonly string[];
  readonly deniedCapabilities?: readonly string[];
  readonly allowedResourceScopes?: readonly string[];
  readonly deniedResourceScopes?: readonly string[];
  readonly requiresIdempotencyKey?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Shared builder behind every typed adapter factory (tool call, API handler, workflow step, webhook, generic). */
export function createEnforcementAdapter(type: EnforcementAdapterType, input: AdapterConfigInput): EnforcementAdapter {
  return {
    id: input.id,
    type,
    name: input.name,
    requiresIdempotencyKey: input.requiresIdempotencyKey ?? false,
    ...(input.allowedActions !== undefined ? { allowedActions: input.allowedActions } : {}),
    ...(input.deniedActions !== undefined ? { deniedActions: input.deniedActions } : {}),
    ...(input.allowedCapabilities !== undefined ? { allowedCapabilities: input.allowedCapabilities } : {}),
    ...(input.deniedCapabilities !== undefined ? { deniedCapabilities: input.deniedCapabilities } : {}),
    ...(input.allowedResourceScopes !== undefined ? { allowedResourceScopes: input.allowedResourceScopes } : {}),
    ...(input.deniedResourceScopes !== undefined ? { deniedResourceScopes: input.deniedResourceScopes } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

export function createGenericAdapter(input: AdapterConfigInput): EnforcementAdapter {
  return createEnforcementAdapter('generic', input);
}
