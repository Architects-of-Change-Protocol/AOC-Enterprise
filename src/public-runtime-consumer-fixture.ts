import {
  evaluateEnforcementPipeline,
  enforceEnforcementPipeline,
  type EnforcementEvaluationInput,
  type PolicyDecisionAdapter,
} from './index';
import { verifyCapabilityToken } from './runtime/crypto';

export type PublicRuntimeConsumerFixture = {
  evaluate: typeof evaluateEnforcementPipeline;
  enforce: typeof enforceEnforcementPipeline;
  verify: typeof verifyCapabilityToken;
  adapter: PolicyDecisionAdapter;
  input: EnforcementEvaluationInput;
};
