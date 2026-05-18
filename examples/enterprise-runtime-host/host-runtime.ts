import { createAocEnterpriseRuntime } from '@aoc-enterprise/runtime';
import { createMockRuntimePorts } from './mock-ports.js';

export function createHostRuntime() {
  return createAocEnterpriseRuntime(createMockRuntimePorts());
}
