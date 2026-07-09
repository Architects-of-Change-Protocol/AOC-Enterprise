import { AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_AUTH_HEADER_NAME, AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID } from './aoc-pmfreak-remote-governance-endpoint-constants.js';
import type { AocPMFreakRemoteGovernanceEndpointConfig, AocPMFreakRemoteGovernanceEndpointConfigInput } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Builds a safe-by-default endpoint config. `allowPMFreakMutations`,
 * `allowActionExecution`, `allowDecisionWriteback`, `allowInvoiceCreation`,
 * and `allowCommunications` are always forced to `false` regardless of what
 * the caller requests -- a caller attempting to enable any of them gets a
 * deterministic warning explaining why the request was ignored, rather than
 * a silent override.
 *
 * A config with `environment: "production"` and `authMode: "none_demo"` is
 * flagged with a deterministic warning here (surfaced by `getHealth` as
 * `unavailable`); the actual safe rejection of a request against that
 * combination happens in `handleAocPMFreakRemoteGovernanceRequest`, before
 * any request parsing or evaluation occurs.
 */
export function createAocPMFreakRemoteGovernanceEndpointConfig(input?: AocPMFreakRemoteGovernanceEndpointConfigInput): AocPMFreakRemoteGovernanceEndpointConfig {
  const warnings: string[] = [...(input?.warnings ?? [])];

  if (input?.allowPMFreakMutations === true) {
    warnings.push('allowPMFreakMutations was requested but is forced to false; this endpoint never mutates PMFreak data.');
  }
  if (input?.allowActionExecution === true) {
    warnings.push('allowActionExecution was requested but is forced to false; this endpoint never executes PMFreak actions.');
  }
  if (input?.allowDecisionWriteback === true) {
    warnings.push('allowDecisionWriteback was requested but is forced to false; this endpoint never writes decisions back to PMFreak.');
  }
  if (input?.allowInvoiceCreation === true) {
    warnings.push('allowInvoiceCreation was requested but is forced to false; this endpoint never creates invoices.');
  }
  if (input?.allowCommunications === true) {
    warnings.push('allowCommunications was requested but is forced to false; this endpoint never sends communications.');
  }

  const environment = input?.environment ?? 'demo';
  const authMode = input?.authMode ?? 'none_demo';

  if (environment === 'production' && authMode === 'none_demo') {
    warnings.push('authMode "none_demo" is not allowed in production; requests will be rejected with a safe configuration error rather than evaluated.');
  }

  return {
    endpointId: input?.endpointId ?? AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID,
    environment,
    path: input?.path ?? AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH,

    authMode,
    ...(input?.sharedSecretHeaderName !== undefined ? { sharedSecretHeaderName: input.sharedSecretHeaderName } : { sharedSecretHeaderName: AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_AUTH_HEADER_NAME }),
    ...(input?.sharedSecretValue !== undefined ? { sharedSecretValue: input.sharedSecretValue } : {}),

    maxPayloadSizeKb: input?.maxPayloadSizeKb ?? 256,
    allowedMethods: input?.allowedMethods ? [...input.allowedMethods] : ['POST'],
    allowedContentTypes: input?.allowedContentTypes ? [...input.allowedContentTypes] : ['application/json'],

    allowPMFreakMutations: false,
    allowActionExecution: false,
    allowDecisionWriteback: false,
    allowInvoiceCreation: false,
    allowCommunications: false,

    redactionMode: input?.redactionMode ?? 'safe_demo',

    notes: [...(input?.notes ?? [])],
    warnings,
  };
}
