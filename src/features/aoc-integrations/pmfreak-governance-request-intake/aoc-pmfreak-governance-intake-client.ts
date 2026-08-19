import { createAocPMFreakGovernanceRequestIntakeConfig } from './aoc-pmfreak-governance-intake-config.js';
import { createAocPMFreakGovernanceRequestIntakeDescriptor } from './aoc-pmfreak-governance-intake-descriptor.js';
import { evaluateAocPMFreakGovernanceRequest } from './aoc-pmfreak-governance-evaluator.js';
import { createAocPMFreakGovernanceIntakeHealth } from './aoc-pmfreak-governance-intake-health.js';
import { validateAocPMFreakGovernanceRequest } from './aoc-pmfreak-governance-intake-validator.js';
import type {
  AocPMFreakGovernanceIntakeHealth,
  AocPMFreakGovernanceRequest,
  AocPMFreakGovernanceRequestIntakeClient,
  AocPMFreakGovernanceRequestIntakeConfigInput,
  AocPMFreakGovernanceRequestValidationResult,
  AocPMFreakGovernanceResponse,
} from './aoc-pmfreak-governance-intake-types.js';

export interface CreateAocPMFreakGovernanceRequestIntakeClientInput {
  readonly config?: AocPMFreakGovernanceRequestIntakeConfigInput;
}

/**
 * Builds the intake client/facade PMFreak (or a test) interacts with.
 * Every method is read-only with respect to PMFreak and Soberanía state: it never
 * mutates PMFreak data, never executes a PMFreak action, and never writes a
 * decision back into PMFreak.
 */
export function createAocPMFreakGovernanceRequestIntakeClient(input?: CreateAocPMFreakGovernanceRequestIntakeClientInput): AocPMFreakGovernanceRequestIntakeClient {
  const descriptor = createAocPMFreakGovernanceRequestIntakeDescriptor();
  const config = createAocPMFreakGovernanceRequestIntakeConfig(input?.config);

  return {
    descriptor,
    config,

    getHealth(): Promise<AocPMFreakGovernanceIntakeHealth> {
      return Promise.resolve(createAocPMFreakGovernanceIntakeHealth(config));
    },

    validateRequest(request: AocPMFreakGovernanceRequest): AocPMFreakGovernanceRequestValidationResult {
      return validateAocPMFreakGovernanceRequest(request);
    },

    evaluateRequest(request: AocPMFreakGovernanceRequest): Promise<AocPMFreakGovernanceResponse> {
      return Promise.resolve(evaluateAocPMFreakGovernanceRequest({ request, config }));
    },

    async receiveAndEvaluate(request: AocPMFreakGovernanceRequest): Promise<{ request: AocPMFreakGovernanceRequest; response: AocPMFreakGovernanceResponse }> {
      const response = await evaluateAocPMFreakGovernanceRequest({ request, config });
      return { request, response };
    },
  };
}
