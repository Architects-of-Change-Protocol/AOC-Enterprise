import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import { createEnforcementAdapter, type AdapterConfigInput } from './generic-adapter.js';

export function createWebhookAdapter(input: AdapterConfigInput): EnforcementAdapter {
  return createEnforcementAdapter('webhook', input);
}
