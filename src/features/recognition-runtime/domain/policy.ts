import type { Actor } from './actor.js';
import type { ActionRequest } from './action-request.js';
import type { RecognitionCapabilityToken } from './capability-token.js';
import type { Passport } from './passport.js';
import type { PolicyResult, RecognitionDecisionType } from './recognition-decision.js';
import type { RevocationCheckResult } from './revocation.js';
import type { TrustDomain } from './trust-domain.js';

export interface CapabilityCheckResult {
  readonly actionGranted: boolean;
  readonly prohibited: boolean;
  readonly inResourceScope: boolean;
}

export interface PolicyContext {
  readonly now: string;
  readonly actor?: Actor;
  readonly principalActor?: Actor;
  readonly trustDomain?: TrustDomain;
  readonly passport?: Passport;
  readonly capabilityToken?: RecognitionCapabilityToken;
  readonly issuerAccepted: boolean;
  readonly capabilityCheck?: CapabilityCheckResult;
  readonly revocation: RevocationCheckResult;
}

export interface PolicyOutcome extends PolicyResult {
  readonly decisionType?: RecognitionDecisionType;
  readonly riskLevel?: RecognitionCapabilityToken['riskLevel'];
  readonly requiredEvidence?: readonly string[];
  readonly requiredApproverActorIds?: readonly string[];
}

export interface Policy {
  readonly id: string;
  evaluate(request: ActionRequest, context: PolicyContext): PolicyOutcome;
}
