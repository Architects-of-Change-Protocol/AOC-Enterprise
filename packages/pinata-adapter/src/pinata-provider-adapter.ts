import type { CanonicalId, UtcDateTime } from '@aoc/protocol';
import type { EnterpriseAccessObligationType } from '@aoc-enterprise/access-obligation';
import { ENTERPRISE_ACCESS_OBLIGATION_TYPES } from '@aoc-enterprise/access-obligation';
import type { EnterpriseProviderCapability, EnterpriseProviderCapabilityDeclaration, EnterpriseProviderFailureReason } from '@aoc-enterprise/provider-adapter';
import { ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION, ENTERPRISE_PROVIDER_CAPABILITIES, ENTERPRISE_PROVIDER_FAILURE_REASONS } from '@aoc-enterprise/provider-adapter';
import type {
  EnterpriseProviderTranslation,
  EnterpriseProviderTranslationExecutionIntent,
  EnterpriseProviderTranslationMetadataValue,
} from '@aoc-enterprise/provider-translation';
import { ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS, enterpriseProviderTranslationRequiredCapability, validateEnterpriseProviderTranslation } from '@aoc-enterprise/provider-translation';
import type { PinataProviderClient, PinataResourceMetadata } from './pinata-provider-client.js';
import { PinataProviderClientError } from './pinata-provider-client.js';

/**
 * The first concrete Provider Adapter (R005.C): translates an already-produced
 * `EnterpriseProviderTranslation` (`@aoc-enterprise/provider-translation`,
 * R005.B) into a Pinata SDK operation, and normalizes whatever Pinata returns
 * -- success or failure -- into a canonical, provider-neutral execution
 * outcome. This module never reads an `EnterpriseAccessGrant` or
 * `EnterpriseGrantRevocation` directly, never evaluates policy, never emits
 * an `EnterpriseUsageEvent`, and never leaks a Pinata SDK type, HTTP status,
 * or stack trace across its own boundary. It exists to validate that the
 * frozen Provider Adapter architecture (R005.0/R005.A/R005.B) can be
 * implemented for a real provider without changing it -- see the package
 * README's "Architecture validation" section.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/pinata-adapter`).
 */
export const PINATA_PROVIDER_SYSTEM = 'pinata';

// ---------------------------------------------------------------------------
// Capability support (R005.C Phase 4) -- only what Pinata can genuinely
// satisfy. See the package README's "Supported capabilities" /
// "Unsupported capabilities" for the reasoning behind each entry.
// ---------------------------------------------------------------------------

export const PINATA_SUPPORTED_CAPABILITIES: readonly EnterpriseProviderCapability[] = [
  ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_TEMPORARY_ACCESS,
  ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_PROVIDER_METADATA,
  ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_GRANT_REVOCATION,
  ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_CAPABILITY_DISCOVERY,
  ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_CORRELATION,
  ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EVIDENCE_CONTRIBUTION,
];

export const PINATA_SUPPORTED_OBLIGATION_TYPES: readonly EnterpriseAccessObligationType[] = [
  ENTERPRISE_ACCESS_OBLIGATION_TYPES.READ_ONLY,
  ENTERPRISE_ACCESS_OBLIGATION_TYPES.TIME_LIMIT,
];

/**
 * Builds this adapter's own `EnterpriseProviderCapabilityDeclaration`
 * (`@aoc-enterprise/provider-adapter`) -- the frozen capability vocabulary,
 * never redefined here, populated with exactly what a Pinata-backed adapter
 * can honestly claim. Callable at runtime (not only referenced as a build-time
 * constant), which is itself why `SupportsCapabilityDiscovery` is included.
 */
export function createPinataProviderCapabilityDeclaration(input: {
  readonly id: CanonicalId;
  readonly declaredAt: UtcDateTime;
  readonly correlationId: CanonicalId;
  readonly description?: string;
}): EnterpriseProviderCapabilityDeclaration {
  return {
    schemaVersion: ENTERPRISE_PROVIDER_ADAPTER_SCHEMA_VERSION,
    id: input.id,
    providerSystem: PINATA_PROVIDER_SYSTEM,
    capabilities: PINATA_SUPPORTED_CAPABILITIES,
    supportedObligationTypes: PINATA_SUPPORTED_OBLIGATION_TYPES,
    declaredAt: input.declaredAt,
    correlationId: input.correlationId,
    ...(input.description === undefined ? {} : { description: input.description }),
  };
}

// ---------------------------------------------------------------------------
// Execution result (R005.C Phase 6) -- the canonical, normalized outcome of
// translating and executing one EnterpriseProviderTranslation against Pinata.
// Never a raw Pinata SDK response; never an Enterprise contract in its own
// right (no validate/serialize ceremony) -- this is Provider Execution
// output, which R005.0/R005.A/R005.B deliberately leave unmodeled and
// provider-specific.
// ---------------------------------------------------------------------------

export type PinataProviderExecutionDetail =
  | { readonly kind: 'temporary-access'; readonly accessUrl: string; readonly expiresAt: UtcDateTime }
  | { readonly kind: 'metadata'; readonly metadata: Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>> }
  | { readonly kind: 'grant-invalidated'; readonly providerResourceStatus: string };

export interface PinataProviderExecutionSuccess {
  readonly outcome: 'executed';
  readonly translationId: CanonicalId;
  readonly grantRef: CanonicalId;
  readonly correlationId: CanonicalId;
  readonly executionIntent: EnterpriseProviderTranslationExecutionIntent;
  readonly providerSystem: string;
  readonly detail: PinataProviderExecutionDetail;
  readonly executedAt: UtcDateTime;
}

export interface PinataProviderExecutionFailure {
  readonly outcome: 'failed';
  readonly translationId: CanonicalId;
  readonly grantRef: CanonicalId;
  readonly correlationId: CanonicalId;
  readonly executionIntent: EnterpriseProviderTranslationExecutionIntent;
  readonly providerSystem: string;
  readonly failureReason: EnterpriseProviderFailureReason;
  readonly message: string;
  readonly failedAt: UtcDateTime;
}

export type PinataProviderExecutionResult = PinataProviderExecutionSuccess | PinataProviderExecutionFailure;

/**
 * Thrown when the candidate given to `executePinataProviderTranslation` is
 * not a usable `EnterpriseProviderTranslation` for this adapter -- either
 * `validateEnterpriseProviderTranslation` (`@aoc-enterprise/provider-translation`)
 * rejects it, or it validly targets a `providerSystem` other than `'pinata'`.
 * This is a programming-contract violation, never a Pinata-side failure, so
 * it is thrown rather than returned as a `PinataProviderExecutionFailure`.
 */
export class PinataAdapterInputError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length === 0 ? message : `${message}: ${issues.join('; ')}`);
    this.name = 'PinataAdapterInputError';
    this.issues = issues;
  }
}

function successResult(
  translation: EnterpriseProviderTranslation,
  detail: PinataProviderExecutionDetail,
  executedAt: UtcDateTime,
): PinataProviderExecutionSuccess {
  return {
    outcome: 'executed',
    translationId: translation.id,
    grantRef: translation.grantRef,
    correlationId: translation.correlationId,
    executionIntent: translation.executionIntent,
    providerSystem: translation.providerSystem,
    detail,
    executedAt,
  };
}

function failureResult(
  translation: EnterpriseProviderTranslation,
  failureReason: EnterpriseProviderFailureReason,
  message: string,
  failedAt: UtcDateTime,
): PinataProviderExecutionFailure {
  return {
    outcome: 'failed',
    translationId: translation.id,
    grantRef: translation.grantRef,
    correlationId: translation.correlationId,
    executionIntent: translation.executionIntent,
    providerSystem: translation.providerSystem,
    failureReason,
    message,
    failedAt,
  };
}

function normalizeMetadata(metadata: PinataResourceMetadata): Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>> {
  const normalized: Record<string, EnterpriseProviderTranslationMetadataValue> = {
    resourceId: metadata.id,
    cid: metadata.cid,
    sizeBytes: metadata.sizeBytes,
    mimeType: metadata.mimeType,
    createdAt: metadata.createdAt,
  };
  if (metadata.name !== null) normalized.name = metadata.name;
  for (const [key, value] of Object.entries(metadata.keyvalues)) {
    normalized[`keyvalue.${key}`] = value;
  }
  return normalized;
}

function defaultNow(): UtcDateTime {
  return new Date().toISOString();
}

/**
 * GAP-012 fix: a content CID and Pinata's own internal file id are two
 * different identities, and must never be conflated by sharing one field.
 * `translation.resource.id` (`EnterpriseProviderTranslation.resource`,
 * a Protocol `ResourceRef`) is treated exclusively as the Pinata CID this
 * package's `ProvideTemporaryAccess`/`ProvideReadOnlyAccess` arms already
 * use it as (`gateways.private.createAccessLink({ cid: resource.id, ... })`).
 * `ProvideMetadata`/`InvalidateGrant` need Pinata's own file id instead --
 * a distinct provider-side handle a CID cannot substitute for -- which this
 * function reads from `translation.providerMetadata.pinataFileId`, the
 * provider-neutral, already-validated extension point R005.B's own
 * `EnterpriseProviderTranslation.providerMetadata` was designed to carry
 * (see the package README's "Pinata-specific decisions"). Throws
 * `PinataAdapterInputError` -- a programming-contract violation, never a
 * Pinata-side failure -- when it is missing, matching this package's
 * existing treatment of a missing `requestedDurationSeconds`.
 */
function requirePinataFileId(translation: EnterpriseProviderTranslation): string {
  const pinataFileId = translation.providerMetadata?.pinataFileId;
  if (typeof pinataFileId !== 'string' || pinataFileId.length === 0) {
    throw new PinataAdapterInputError(
      `providerMetadata.pinataFileId (Pinata's own file id, distinct from the CID carried in resource.id) is required for a '${translation.executionIntent}' translation.`,
    );
  }
  return pinataFileId;
}

/**
 * Consumes an `EnterpriseProviderTranslation` and produces Provider
 * Execution against Pinata -- nothing else (R005.C's own "Primary
 * Objective"). Never reads an `EnterpriseAccessGrant` or
 * `EnterpriseGrantRevocation` directly, never emits an `EnterpriseUsageEvent`,
 * never performs governance, authorization, or auditing.
 *
 * Accepts `unknown` so it can guard a translation arriving from storage, a
 * queue, or any other external boundary, matching the "accepts unknown"
 * convention already established by `validateEnterpriseProviderTranslation`
 * itself. Steps, in order:
 *
 * 1. **Translation consumption / validation** -- `validateEnterpriseProviderTranslation`
 *    must accept the candidate, and its `providerSystem` must be `'pinata'`;
 *    otherwise this throws `PinataAdapterInputError` (a programming-contract
 *    violation, never a Pinata-side failure).
 * 2. **Capability validation** -- the capability
 *    `enterpriseProviderTranslationRequiredCapability(executionIntent)`
 *    requires must be one of `PINATA_SUPPORTED_CAPABILITIES`; otherwise this
 *    returns a `PinataProviderExecutionFailure` with `failureReason:
 *    'capability-unsupported'`, per R005.C Phase 4 -- never faked.
 * 3. **Execution intent mapping / Pinata SDK invocation** -- the canonical
 *    mapping this package implements (see the README's "Execution flow").
 * 4. **Execution result normalization / failure mapping** -- every outcome,
 *    success or failure, is returned as a `PinataProviderExecutionResult`;
 *    no raw Pinata SDK response, HTTP status, or exception ever escapes this
 *    function.
 */
export async function executePinataProviderTranslation(
  candidate: unknown,
  client: PinataProviderClient,
  deps: { readonly now?: () => UtcDateTime } = {},
): Promise<PinataProviderExecutionResult> {
  const now = deps.now ?? defaultNow;

  const validation = validateEnterpriseProviderTranslation(candidate);
  if (!validation.valid) {
    throw new PinataAdapterInputError(
      'Malformed EnterpriseProviderTranslation',
      validation.errors.map((issue) => `${issue.code}: ${issue.message}`),
    );
  }

  const translation = candidate as EnterpriseProviderTranslation;

  if (translation.providerSystem !== PINATA_PROVIDER_SYSTEM) {
    throw new PinataAdapterInputError(
      `Translation targets providerSystem '${translation.providerSystem}', not '${PINATA_PROVIDER_SYSTEM}'.`,
    );
  }

  const requiredCapability = enterpriseProviderTranslationRequiredCapability(translation.executionIntent);
  if (!PINATA_SUPPORTED_CAPABILITIES.includes(requiredCapability)) {
    return failureResult(
      translation,
      ENTERPRISE_PROVIDER_FAILURE_REASONS.CAPABILITY_UNSUPPORTED,
      `The Pinata adapter does not support '${requiredCapability}' (required by executionIntent '${translation.executionIntent}').`,
      now(),
    );
  }

  try {
    switch (translation.executionIntent) {
      case ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_TEMPORARY_ACCESS:
      case ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_READ_ONLY_ACCESS: {
        const requestedDurationSeconds = translation.providerMetadata?.requestedDurationSeconds;
        if (typeof requestedDurationSeconds !== 'number' || !Number.isFinite(requestedDurationSeconds) || requestedDurationSeconds <= 0) {
          throw new PinataAdapterInputError(
            "providerMetadata.requestedDurationSeconds (a positive number of seconds) is required for a 'ProvideTemporaryAccess'/'ProvideReadOnlyAccess' translation.",
          );
        }
        const { url } = await client.createTemporaryAccessLink({ cid: translation.resource.id, expiresInSeconds: requestedDurationSeconds });
        const executedAt = now();
        const expiresAt = new Date(Date.parse(executedAt) + requestedDurationSeconds * 1000).toISOString();
        return successResult(translation, { kind: 'temporary-access', accessUrl: url, expiresAt }, executedAt);
      }

      case ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_METADATA: {
        const metadata = await client.getResourceMetadata({ resourceId: requirePinataFileId(translation) });
        return successResult(translation, { kind: 'metadata', metadata: normalizeMetadata(metadata) }, now());
      }

      case ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.INVALIDATE_GRANT: {
        const result = await client.invalidateResource({ resourceId: requirePinataFileId(translation) });
        return successResult(translation, { kind: 'grant-invalidated', providerResourceStatus: result.status }, now());
      }

      case ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.REGISTER_USAGE: {
        // Unreachable in practice: RegisterUsage requires SupportsUsageReporting,
        // which is deliberately absent from PINATA_SUPPORTED_CAPABILITIES (see
        // README "Unsupported capabilities") and is already filtered out above.
        // Kept as an explicit branch, rather than a default/never fallthrough,
        // so this switch stays exhaustive over the closed execution-intent
        // vocabulary without relying on capability filtering as its only proof.
        return failureResult(
          translation,
          ENTERPRISE_PROVIDER_FAILURE_REASONS.CAPABILITY_UNSUPPORTED,
          "Pinata has no provider-side operation for 'RegisterUsage'.",
          now(),
        );
      }

      default: {
        const exhaustive: never = translation.executionIntent;
        throw new PinataAdapterInputError(`Unhandled execution intent: ${String(exhaustive)}`);
      }
    }
  } catch (error) {
    if (error instanceof PinataAdapterInputError) throw error;

    const failureReason =
      error instanceof PinataProviderClientError ? error.failureReason : ENTERPRISE_PROVIDER_FAILURE_REASONS.UNEXPECTED_PROVIDER_FAILURE;
    const message = error instanceof Error ? error.message : 'Unknown Pinata provider failure.';
    return failureResult(translation, failureReason, message, now());
  }
}
