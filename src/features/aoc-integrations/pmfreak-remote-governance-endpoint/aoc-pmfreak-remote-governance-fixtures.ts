import {
  demoAocPMFreakBillingAllowedRequest,
  demoAocPMFreakBillingMissingApprovalRequest,
  demoAocPMFreakBillingMissingEvidenceRequest,
  demoAocPMFreakCancelledActionRequest,
  evaluateAocPMFreakGovernanceRequest,
} from '../pmfreak-governance-request-intake/index.js';
import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH } from './aoc-pmfreak-remote-governance-endpoint-constants.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from './aoc-pmfreak-remote-governance-endpoint-config.js';
import { serializeAocPMFreakRemoteGovernanceSuccess } from './aoc-pmfreak-remote-governance-serializer.js';
import type { AocPMFreakRemoteGovernanceEndpointRequest } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Deterministic demo request/response fixtures, layered on top of the
 * already-merged AOC PMFreak Governance Request Intake's own fixtures so
 * request and response fixtures can never drift out of sync with each
 * other. Every id below is a fake, opaque literal -- never a real customer
 * name, Datasys project id, email, contract number, or invoice number.
 */

function buildDemoEndpointRequest(body: unknown, overrides?: Partial<AocPMFreakRemoteGovernanceEndpointRequest>): AocPMFreakRemoteGovernanceEndpointRequest {
  return {
    method: 'POST',
    path: AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH,
    headers: { 'content-type': 'application/json' },
    body,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Request fixtures
// ---------------------------------------------------------------------------

export const demoAocPMFreakRemoteBillingMissingEvidenceEndpointRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest(demoAocPMFreakBillingMissingEvidenceRequest);

export const demoAocPMFreakRemoteBillingMissingApprovalEndpointRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest(demoAocPMFreakBillingMissingApprovalRequest);

export const demoAocPMFreakRemoteBillingAllowedEndpointRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest(demoAocPMFreakBillingAllowedRequest);

export const demoAocPMFreakRemoteCancelledEndpointRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest(demoAocPMFreakCancelledActionRequest);

/** A well-formed request sent with a disallowed HTTP method, for exercising the method guard. */
export const demoAocPMFreakRemoteInvalidMethodRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest(demoAocPMFreakBillingAllowedRequest, { method: 'GET' });

/** A well-formed request sent with an unsupported content type, for exercising the content-type guard. */
export const demoAocPMFreakRemoteInvalidContentTypeRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest(demoAocPMFreakBillingAllowedRequest, {
  headers: { 'content-type': 'text/plain' },
});

/** A request whose body deterministically exceeds the default 256 KB payload limit, for exercising the payload-size guard. */
export const demoAocPMFreakRemotePayloadTooLargeRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest({
  ...demoAocPMFreakBillingAllowedRequest,
  actionAttempt: {
    ...demoAocPMFreakBillingAllowedRequest.actionAttempt,
    metadata: { oversizedDemoPayload: 'x'.repeat(300 * 1024) },
  },
});

/** A well-formed request carrying a deterministically incorrect shared-secret header, for exercising the auth guard. */
export const demoAocPMFreakRemoteAuthFailureRequest: AocPMFreakRemoteGovernanceEndpointRequest = buildDemoEndpointRequest(demoAocPMFreakBillingAllowedRequest, {
  headers: { 'content-type': 'application/json', 'x-aoc-governance-secret': 'demo-incorrect-shared-secret' },
});

// ---------------------------------------------------------------------------
// Response fixtures -- derived from the intake's deterministic evaluator and
// this endpoint's own serializer, so fixtures can never drift out of sync
// with the real evaluation/serialization code paths.
// ---------------------------------------------------------------------------

const demoEndpointConfig = createAocPMFreakRemoteGovernanceEndpointConfig();

export const demoAocPMFreakRemoteBillingMissingEvidenceEndpointResponse = serializeAocPMFreakRemoteGovernanceSuccess(
  evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingEvidenceRequest }),
  demoEndpointConfig,
);

export const demoAocPMFreakRemoteBillingMissingApprovalEndpointResponse = serializeAocPMFreakRemoteGovernanceSuccess(
  evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingMissingApprovalRequest }),
  demoEndpointConfig,
);

export const demoAocPMFreakRemoteBillingAllowedEndpointResponse = serializeAocPMFreakRemoteGovernanceSuccess(evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakBillingAllowedRequest }), demoEndpointConfig);

export const demoAocPMFreakRemoteCancelledEndpointResponse = serializeAocPMFreakRemoteGovernanceSuccess(evaluateAocPMFreakGovernanceRequest({ request: demoAocPMFreakCancelledActionRequest }), demoEndpointConfig);
