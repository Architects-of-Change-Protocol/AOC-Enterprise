export { RecognizedActorPolicy } from './recognized-actor-policy.js';
export { RogueActorPolicy } from './rogue-actor-policy.js';
export { RevocationPolicy } from './revocation-policy.js';
export { ValidPassportPolicy } from './valid-passport-policy.js';
export { ValidCapabilityPolicy } from './valid-capability-policy.js';
export { ProhibitedActionPolicy } from './prohibited-action-policy.js';
export { ScopePolicy } from './scope-policy.js';
export { DelegationPolicy } from './delegation-policy.js';
export { EvidencePolicy } from './evidence-policy.js';
export { ApprovalPolicy } from './approval-policy.js';

import { RecognizedActorPolicy } from './recognized-actor-policy.js';
import { RogueActorPolicy } from './rogue-actor-policy.js';
import { RevocationPolicy } from './revocation-policy.js';
import { ValidPassportPolicy } from './valid-passport-policy.js';
import { ValidCapabilityPolicy } from './valid-capability-policy.js';
import { ProhibitedActionPolicy } from './prohibited-action-policy.js';
import { ScopePolicy } from './scope-policy.js';
import { DelegationPolicy } from './delegation-policy.js';
import { EvidencePolicy } from './evidence-policy.js';
import { ApprovalPolicy } from './approval-policy.js';
import type { Policy } from '../domain/policy.js';

// Precedence order: recognition, then revocation, then passport/capability validity, then scope/delegation/evidence/approval.
export function createDefaultPolicyChain(): readonly Policy[] {
  return [
    new RecognizedActorPolicy(),
    new RogueActorPolicy(),
    new RevocationPolicy(),
    new ValidPassportPolicy(),
    new ValidCapabilityPolicy(),
    new ProhibitedActionPolicy(),
    new ScopePolicy(),
    new DelegationPolicy(),
    new EvidencePolicy(),
    new ApprovalPolicy(),
  ];
}
