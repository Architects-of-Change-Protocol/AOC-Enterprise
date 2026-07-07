import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import { createEnforcementAdapter, type AdapterConfigInput } from './generic-adapter.js';

export function createApiHandlerAdapter(input: AdapterConfigInput): EnforcementAdapter {
  return createEnforcementAdapter('api_handler', input);
}
