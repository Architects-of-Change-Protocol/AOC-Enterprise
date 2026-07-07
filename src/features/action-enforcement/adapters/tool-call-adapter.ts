import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import { createEnforcementAdapter, type AdapterConfigInput } from './generic-adapter.js';

export function createToolCallAdapter(input: AdapterConfigInput): EnforcementAdapter {
  return createEnforcementAdapter('tool_call', input);
}
