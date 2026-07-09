import type { AocPMFreakGovernanceRequest, AocPMFreakGovernanceResponse } from '../pmfreak-governance-request-intake/index.js';

/**
 * AOC PMFreak Remote Governance Endpoint v1 -- domain types.
 *
 * This module exposes the already-merged AOC PMFreak Governance Request
 * Intake (`aoc.integration.pmfreak.governance_request_intake.v1`) through a
 * safe remote endpoint/handler boundary, so PMFreak can call AOC Governance
 * remotely in a later PMFreak-repo PR. Runtime direction is unchanged:
 * PMFreak consumes AOC Governance, never the reverse. This module never
 * mutates PMFreak data, never executes a PMFreak action, and never writes a
 * decision back into PMFreak.
 */

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

export interface AocPMFreakRemoteGovernanceEndpointDescriptor {
  readonly endpointId: string;
  readonly endpointName: string;
  readonly providerId: 'aoc';
  readonly consumerId: 'pmfreak';
  readonly version: 'v1';
  readonly mode: 'remote_governance_endpoint';
  readonly runtimeDirection: 'pmfreak_consumes_aoc_governance';
  readonly defaultPath: string;
  readonly productionMutationCapable: false;
  readonly pmfreakMutationCapable: false;
  readonly actionExecutionCapable: false;
  readonly invoiceCreationCapable: false;
  readonly communicationCapable: false;
  readonly capabilities: readonly string[];
  readonly forbiddenOperations: readonly string[];
  readonly safeLabels: readonly string[];
  readonly disclaimers: readonly string[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type AocPMFreakRemoteGovernanceEndpointEnvironment = 'demo' | 'development' | 'staging' | 'production';

export type AocPMFreakRemoteGovernanceAuthMode = 'none_demo' | 'shared_secret_header' | 'unsupported';

export type AocPMFreakRemoteGovernanceEndpointRedactionMode = 'none' | 'safe_demo' | 'strict';

export interface AocPMFreakRemoteGovernanceEndpointConfig {
  readonly endpointId: string;
  readonly environment: AocPMFreakRemoteGovernanceEndpointEnvironment;
  readonly path: string;

  readonly authMode: AocPMFreakRemoteGovernanceAuthMode;
  readonly sharedSecretHeaderName?: string;
  readonly sharedSecretValue?: string;

  readonly maxPayloadSizeKb: number;
  readonly allowedMethods: readonly string[];
  readonly allowedContentTypes: readonly string[];

  readonly allowPMFreakMutations: false;
  readonly allowActionExecution: false;
  readonly allowDecisionWriteback: false;
  readonly allowInvoiceCreation: false;
  readonly allowCommunications: false;

  readonly redactionMode: AocPMFreakRemoteGovernanceEndpointRedactionMode;

  readonly notes: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Loosened input shape for `createAocPMFreakRemoteGovernanceEndpointConfig`.
 * `allowPMFreakMutations`/`allowActionExecution`/`allowDecisionWriteback`/
 * `allowInvoiceCreation`/`allowCommunications` are widened to `boolean` (the
 * config type itself pins them to the literal `false`) so the factory can
 * detect -- and warn on -- a caller actually requesting `true`, including a
 * caller passing loosely-typed/external config data rather than a value the
 * type system already forbids. Mirrors the equivalent widening in
 * `AocPMFreakGovernanceRequestIntakeConfigInput`.
 */
export type AocPMFreakRemoteGovernanceEndpointConfigInput = Partial<
  Omit<AocPMFreakRemoteGovernanceEndpointConfig, 'allowPMFreakMutations' | 'allowActionExecution' | 'allowDecisionWriteback' | 'allowInvoiceCreation' | 'allowCommunications'>
> & {
  readonly allowPMFreakMutations?: boolean;
  readonly allowActionExecution?: boolean;
  readonly allowDecisionWriteback?: boolean;
  readonly allowInvoiceCreation?: boolean;
  readonly allowCommunications?: boolean;
};

// ---------------------------------------------------------------------------
// Endpoint request/response envelope
// ---------------------------------------------------------------------------

export interface AocPMFreakRemoteGovernanceEndpointRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string | undefined>;
  readonly body: unknown;
}

export interface AocPMFreakRemoteGovernanceEndpointResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export interface AocPMFreakRemoteGovernanceEndpointSuccessBody {
  readonly ok: true;
  readonly endpointId: string;
  readonly response: AocPMFreakGovernanceResponse;
  readonly safeLabels: readonly string[];
  readonly warnings: readonly string[];
}

export interface AocPMFreakRemoteGovernanceEndpointErrorBody {
  readonly ok: false;
  readonly endpointId: string;
  readonly error: AocPMFreakRemoteGovernanceEndpointError;
  readonly safeLabels: readonly string[];
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Guard result
// ---------------------------------------------------------------------------

export interface AocPMFreakRemoteGovernanceGuardResult {
  readonly valid: boolean;
  readonly error?: AocPMFreakRemoteGovernanceEndpointError;
}

// ---------------------------------------------------------------------------
// Parser result
// ---------------------------------------------------------------------------

export type AocPMFreakRemoteGovernanceParseResult =
  | { readonly ok: true; readonly request: AocPMFreakGovernanceRequest }
  | { readonly ok: false; readonly error: AocPMFreakRemoteGovernanceEndpointError };

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export type AocPMFreakRemoteGovernanceEndpointErrorCode =
  | 'invalid_method'
  | 'unsupported_content_type'
  | 'payload_too_large'
  | 'auth_required'
  | 'auth_failed'
  | 'unsafe_production_config'
  | 'invalid_request'
  | 'evaluation_failed'
  | 'serialization_failed'
  | 'unsafe_claim'
  | 'mutation_not_allowed'
  | 'unknown_error';

export interface AocPMFreakRemoteGovernanceEndpointError {
  readonly code: AocPMFreakRemoteGovernanceEndpointErrorCode;
  readonly message: string;
  readonly safe: true;
  readonly details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Health model
// ---------------------------------------------------------------------------

export type AocPMFreakRemoteGovernanceEndpointHealthStatus = 'healthy' | 'degraded' | 'unavailable';

export interface AocPMFreakRemoteGovernanceEndpointHealth {
  readonly endpointId: string;
  readonly path: string;
  readonly status: AocPMFreakRemoteGovernanceEndpointHealthStatus;
  readonly authMode: AocPMFreakRemoteGovernanceAuthMode;
  readonly productionMutationCapable: false;
  readonly pmfreakMutationCapable: false;
  readonly actionExecutionCapable: false;
  readonly invoiceCreationCapable: false;
  readonly communicationCapable: false;
  readonly checkedCapabilities: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// Claim safety
// ---------------------------------------------------------------------------

export interface AocPMFreakRemoteGovernanceEndpointClaimSafetyResult {
  readonly safe: boolean;
  readonly unsafePhrases: readonly string[];
  readonly checkedText: string;
}

// ---------------------------------------------------------------------------
// HTTP adapter placeholder (see aoc-pmfreak-remote-governance-http-adapter.ts)
// ---------------------------------------------------------------------------

export interface AocPMFreakRemoteGovernanceHttpAdapterPlaceholder {
  readonly implemented: false;
  readonly reason: string;
  readonly recommendedPath: string;
  readonly recommendedDelegate: string;
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Re-exported compatibility types from the already-merged intake module
// ---------------------------------------------------------------------------

export type { AocPMFreakGovernanceRequest, AocPMFreakGovernanceResponse };
