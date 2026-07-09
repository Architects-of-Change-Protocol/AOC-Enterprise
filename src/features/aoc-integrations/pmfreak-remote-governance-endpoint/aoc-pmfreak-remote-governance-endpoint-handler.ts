import { createAocPMFreakGovernanceRequestIntakeClient, redactAocPMFreakGovernanceRequest } from '../pmfreak-governance-request-intake/index.js';
import { createAocPMFreakRemoteGovernanceEndpointConfig } from './aoc-pmfreak-remote-governance-endpoint-config.js';
import { validateAocPMFreakRemoteGovernanceMethod } from './aoc-pmfreak-remote-governance-method-guard.js';
import { validateAocPMFreakRemoteGovernanceContentType } from './aoc-pmfreak-remote-governance-content-type-guard.js';
import { validateAocPMFreakRemoteGovernancePayloadSize } from './aoc-pmfreak-remote-governance-payload-guard.js';
import { validateAocPMFreakRemoteGovernanceAuth } from './aoc-pmfreak-remote-governance-auth-guard.js';
import { parseAocPMFreakRemoteGovernanceRequestBody } from './aoc-pmfreak-remote-governance-parser.js';
import { serializeAocPMFreakRemoteGovernanceError, serializeAocPMFreakRemoteGovernanceSuccess } from './aoc-pmfreak-remote-governance-serializer.js';
import { createAocPMFreakRemoteGovernanceEndpointError } from './aoc-pmfreak-remote-governance-errors.js';
import { evaluateAocPMFreakRemoteGovernanceEndpointClaimSafety } from './aoc-pmfreak-remote-governance-claim-safety.js';
import type { AocPMFreakRemoteGovernanceEndpointConfigInput, AocPMFreakRemoteGovernanceEndpointRequest, AocPMFreakRemoteGovernanceEndpointResponse } from './aoc-pmfreak-remote-governance-endpoint-types.js';

export interface HandleAocPMFreakRemoteGovernanceRequestInput {
  readonly request: AocPMFreakRemoteGovernanceEndpointRequest;
  readonly config?: AocPMFreakRemoteGovernanceEndpointConfigInput;
}

/**
 * Pure endpoint handler for `aoc.integration.pmfreak.remote_governance_endpoint.v1`.
 * Testable without running an HTTP server: it only reads plain
 * method/path/headers/body data in and returns a plain status/headers/body
 * value out.
 *
 * Flow: build a safe config -> reject an unsafe production config -> guard
 * method/content-type/payload-size/auth -> parse the body -> redact it ->
 * delegate to the already-merged AOC PMFreak Governance Request Intake for
 * evaluation -> claim-safety scan the response -> serialize.
 *
 * Never mutates `input.request`. Never mutates PMFreak data, never executes
 * a PMFreak action, never writes a decision back into PMFreak, never sends a
 * communication, and never creates an invoice -- this handler only reads a
 * request and returns a governed decision.
 */
export async function handleAocPMFreakRemoteGovernanceRequest(input: HandleAocPMFreakRemoteGovernanceRequestInput): Promise<AocPMFreakRemoteGovernanceEndpointResponse> {
  const config = createAocPMFreakRemoteGovernanceEndpointConfig(input.config);
  const warnings = [...config.warnings];

  if (config.environment === 'production' && config.authMode === 'none_demo') {
    return serializeAocPMFreakRemoteGovernanceError(
      createAocPMFreakRemoteGovernanceEndpointError('unsafe_production_config', 'authMode "none_demo" is not allowed in production; this endpoint cannot safely evaluate requests in its current configuration.'),
      config,
      warnings,
    );
  }

  const methodResult = validateAocPMFreakRemoteGovernanceMethod(input.request.method, config);
  if (!methodResult.valid) {
    return serializeAocPMFreakRemoteGovernanceError(methodResult.error ?? createAocPMFreakRemoteGovernanceEndpointError('unknown_error', 'Method validation failed.'), config, warnings);
  }

  const contentTypeResult = validateAocPMFreakRemoteGovernanceContentType(input.request.headers, config);
  if (!contentTypeResult.valid) {
    return serializeAocPMFreakRemoteGovernanceError(contentTypeResult.error ?? createAocPMFreakRemoteGovernanceEndpointError('unknown_error', 'Content-Type validation failed.'), config, warnings);
  }

  const payloadResult = validateAocPMFreakRemoteGovernancePayloadSize(input.request.body, config);
  if (!payloadResult.valid) {
    return serializeAocPMFreakRemoteGovernanceError(payloadResult.error ?? createAocPMFreakRemoteGovernanceEndpointError('unknown_error', 'Payload size validation failed.'), config, warnings);
  }

  const authResult = validateAocPMFreakRemoteGovernanceAuth(input.request.headers, config);
  if (!authResult.valid) {
    return serializeAocPMFreakRemoteGovernanceError(authResult.error ?? createAocPMFreakRemoteGovernanceEndpointError('unknown_error', 'Authentication validation failed.'), config, warnings);
  }

  const parsed = parseAocPMFreakRemoteGovernanceRequestBody(input.request.body);
  if (!parsed.ok) {
    return serializeAocPMFreakRemoteGovernanceError(parsed.error, config, warnings);
  }

  const redactedRequest = redactAocPMFreakGovernanceRequest(parsed.request, config.redactionMode);

  try {
    const client = createAocPMFreakGovernanceRequestIntakeClient();
    const { response } = await client.receiveAndEvaluate(redactedRequest);

    const claimSafety = evaluateAocPMFreakRemoteGovernanceEndpointClaimSafety(response);
    if (!claimSafety.safe) {
      return serializeAocPMFreakRemoteGovernanceError(
        createAocPMFreakRemoteGovernanceEndpointError('unsafe_claim', 'The governance response failed a claim-safety scan and was not returned.', { unsafePhrases: [...claimSafety.unsafePhrases] }),
        config,
        warnings,
      );
    }

    return serializeAocPMFreakRemoteGovernanceSuccess(response, config, warnings);
  } catch {
    return serializeAocPMFreakRemoteGovernanceError(createAocPMFreakRemoteGovernanceEndpointError('evaluation_failed', 'Governance evaluation failed unexpectedly.'), config, warnings);
  }
}
