import type { EnforcementAdapter } from '../domain/enforcement-adapter.js';
import { createEnforcementAdapter, type AdapterConfigInput } from './generic-adapter.js';

export function createWorkflowStepAdapter(input: AdapterConfigInput): EnforcementAdapter {
  return createEnforcementAdapter('workflow_step', input);
}
