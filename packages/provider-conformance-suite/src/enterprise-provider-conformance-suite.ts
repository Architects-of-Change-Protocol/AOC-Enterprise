import type { CanonicalId, ResourceRef, UtcDateTime } from '@aoc/protocol';
import type { EnterpriseProviderCapability, EnterpriseProviderCapabilityDeclaration, EnterpriseProviderFailureReason } from '@aoc-enterprise/provider-adapter';
import {
  ENTERPRISE_PROVIDER_CAPABILITIES,
  ENTERPRISE_PROVIDER_FAILURE_REASONS,
  deserializeEnterpriseProviderCapabilityDeclaration,
  enterpriseProviderCapabilityDeclarationEquals,
  serializeEnterpriseProviderCapabilityDeclaration,
  validateEnterpriseProviderCapabilityDeclaration,
} from '@aoc-enterprise/provider-adapter';
import type { EnterpriseProviderTranslation, EnterpriseProviderTranslationExecutionIntent, EnterpriseProviderTranslationMetadataValue } from '@aoc-enterprise/provider-translation';
import {
  ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS,
  ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
  deserializeEnterpriseProviderTranslation,
  enterpriseProviderTranslationEquals,
  enterpriseProviderTranslationRequiredCapability,
  serializeEnterpriseProviderTranslation,
  validateEnterpriseProviderTranslation,
} from '@aoc-enterprise/provider-translation';

/**
 * The canonical, provider-neutral **Provider Conformance Suite** (R005.D).
 *
 * `ADR-ACCESS-LIFECYCLE.md` (R005.0), `ADR-PROVIDER-ADAPTER-CONTRACT.md`
 * (R005.A), and `ADR-PROVIDER-TRANSLATION-MODEL.md` (R005.B) freeze what a
 * Provider Adapter may read and how it must report failure; R005.B's own
 * Phase 13 named exactly what was still missing: *"A future Provider
 * Conformance Suite (validating that any adapter implementation produces
 * well-formed `EnterpriseProviderTranslation` records before attempting
 * Provider Execution)."* This package is that suite.
 *
 * It is **not** a provider. It is **not** an adapter. It is **not** a test
 * for Pinata. `@aoc-enterprise/pinata-adapter` is consumed only by this
 * package's own `__tests__/reference-pinata-conformance.test.ts` -- the
 * one-time, explicitly-permitted Phase 10 reference execution proving the
 * suite actually certifies a real adapter -- never by `src/`, which stays
 * provider-neutral forever (proven by
 * `scripts/check-provider-conformance-boundary.mjs`).
 *
 * A future adapter (S3, Azure Blob, Google Drive, SharePoint, Dropbox, or
 * any other) becomes conformant by building an
 * `EnterpriseProviderConformanceHarness` around its own already-implemented
 * `execute`/capability-declaration functions -- exactly as the Pinata
 * reference execution does -- and calling
 * `runEnterpriseProviderConformanceSuite(harness)`. The suite is never
 * modified to accommodate a new provider; a new provider is accepted or
 * rejected against the suite exactly as it already stands.
 *
 * This is a pure, non-executing certification harness: no persistence, no
 * service, no API, no provider SDK, no HTTP client, no credential, no
 * signed/temporary URL, no retry logic, no telemetry, no logging, no
 * enforcement, no orchestration, no `EnterpriseUsageEvent` generation, no
 * governance, no authorization. See the package README for the full design
 * rationale.
 *
 * Ownership: AOC Enterprise (`@aoc-enterprise/provider-conformance-suite`).
 */
export const ENTERPRISE_PROVIDER_CONFORMANCE_SUITE_SCHEMA_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Canonical execution-result envelope (R005.D Phase 8) -- the suite's own,
// additive, non-frozen contribution. R005.A/R005.B deliberately model no
// Provider Execution output type ("provider-specific by construction"); a
// conformance suite that must certify "execution normalization" needs a
// minimal, provider-neutral shape to normalize *against*. This is that
// shape -- schemaVersion-carried, certification-only, never a redefinition
// or a widening of R005.A/R005.B's own frozen scope. It is deliberately
// close to (but independent of) `PinataProviderExecutionResult` -- the one
// reference implementation already converged on this shape independently.
// ---------------------------------------------------------------------------

export interface EnterpriseProviderConformanceExecutionSuccess {
  readonly outcome: 'executed';
  readonly translationId: CanonicalId;
  readonly grantRef: CanonicalId;
  readonly correlationId: CanonicalId;
  readonly executionIntent: EnterpriseProviderTranslationExecutionIntent;
  readonly providerSystem: string;
  /**
   * Provider Execution's own, unmodeled output (R005.A/R005.B) -- validated
   * at runtime by this suite (see `isEnterpriseProviderConformanceExecutionDetail`)
   * rather than fixed in the type, since every provider's own execution
   * detail is legitimately shaped differently. Never a raw provider SDK
   * response, HTTP client, or credential -- the runtime check is what
   * enforces that, not the type.
   */
  readonly detail: unknown;
  readonly executedAt: UtcDateTime;
}

export interface EnterpriseProviderConformanceExecutionFailure {
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

export type EnterpriseProviderConformanceExecutionResult =
  | EnterpriseProviderConformanceExecutionSuccess
  | EnterpriseProviderConformanceExecutionFailure;

const SUCCESS_RESULT_FIELDS: readonly string[] = [
  'outcome',
  'translationId',
  'grantRef',
  'correlationId',
  'executionIntent',
  'providerSystem',
  'detail',
  'executedAt',
];

const FAILURE_RESULT_FIELDS: readonly string[] = [
  'outcome',
  'translationId',
  'grantRef',
  'correlationId',
  'executionIntent',
  'providerSystem',
  'failureReason',
  'message',
  'failedAt',
];

const CLOSED_FAILURE_REASONS: readonly EnterpriseProviderFailureReason[] = Object.values(ENTERPRISE_PROVIDER_FAILURE_REASONS);
const CLOSED_CAPABILITIES: readonly EnterpriseProviderCapability[] = Object.values(ENTERPRISE_PROVIDER_CAPABILITIES);
const CLOSED_EXECUTION_INTENTS: readonly EnterpriseProviderTranslationExecutionIntent[] = Object.values(
  ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS,
);

function isJsonPrimitive(value: unknown): value is EnterpriseProviderTranslationMetadataValue {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Whether a success result's `detail` is a JSON-safe, provider-neutral bag
 * of data: a plain object (never an array, a class instance, or a
 * function), carrying a non-empty string `kind` discriminant, whose other
 * values are each either a JSON primitive or a flat object of JSON
 * primitives (one level of nesting -- e.g. a normalized metadata bag). This
 * is a proxy for "no raw provider SDK object leaked": a real provider SDK
 * response is virtually never this shape (it carries methods, symbols, or
 * deep nesting), while every legitimate normalized execution detail this
 * suite has seen (temporary-access URLs, flattened metadata, invalidation
 * status) already is.
 */
export function isEnterpriseProviderConformanceExecutionDetail(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.kind !== 'string' || record.kind.length === 0) return false;
  return Object.entries(record).every(([key, entryValue]) => {
    if (key === 'kind') return true;
    if (isJsonPrimitive(entryValue)) return true;
    if (typeof entryValue === 'object' && entryValue !== null && !Array.isArray(entryValue)) {
      return Object.values(entryValue as Record<string, unknown>).every((nested) => isJsonPrimitive(nested));
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Boundary evaluation (R005.D Phase 4/8) -- a pure comparison function any
// adapter's own filesystem-scanning boundary script (e.g.
// `packages/pinata-adapter/scripts/check-pinata-boundary.mjs`) can reuse.
// This suite deliberately performs no filesystem access itself (a
// provider-neutral certification library has no business walking a
// repository's directory tree); it only fixes what "boundary-clean" means,
// given already-collected import-scan results.
// ---------------------------------------------------------------------------

export type EnterpriseProviderConformanceBoundaryIssueCode =
  | 'FOREIGN_IMPORTER_FOUND'
  | 'UNEXPECTED_ADAPTER_IMPORTER'
  | 'MISSING_EXPECTED_ADAPTER_IMPORTER';

export interface EnterpriseProviderConformanceBoundaryIssue {
  readonly code: EnterpriseProviderConformanceBoundaryIssueCode;
  readonly message: string;
}

export type EnterpriseProviderConformanceBoundaryResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly issues: readonly EnterpriseProviderConformanceBoundaryIssue[] };

export interface EnterpriseProviderConformanceBoundaryInput {
  /** The provider SDK module specifier under scan (e.g. `'pinata'`, `'@aws-sdk/client-s3'`). */
  readonly providerModuleName: string;
  /** Repo-relative file paths, within the adapter's own package, permitted to import it. */
  readonly allowedImporterFiles: readonly string[];
  /** Repo-relative file paths, within the adapter's own package, that actually do import it. */
  readonly actualImporterFilesWithinAdapter: readonly string[];
  /** Repo-relative file paths outside the adapter's own package that import it -- always a violation. */
  readonly foreignImporterFiles: readonly string[];
}

/**
 * Whether an SDK-import scan satisfies the Provider Boundary
 * (`ADR-ACCESS-LIFECYCLE.md` Phase 4): the provider SDK is imported only by
 * exactly the adapter's own declared file(s), and nowhere else in the
 * repository. Pure and total -- performs no I/O; the caller (an adapter's
 * own boundary script) is responsible for producing the three file lists
 * from a real scan.
 */
export function evaluateEnterpriseProviderConformanceBoundary(
  input: EnterpriseProviderConformanceBoundaryInput,
): EnterpriseProviderConformanceBoundaryResult {
  const issues: EnterpriseProviderConformanceBoundaryIssue[] = [];

  for (const file of input.foreignImporterFiles) {
    issues.push({
      code: 'FOREIGN_IMPORTER_FOUND',
      message: `'${file}' imports '${input.providerModuleName}' outside the adapter's own package -- Enterprise contracts and other adapters must never import a provider SDK.`,
    });
  }

  const allowed = new Set(input.allowedImporterFiles);
  const actual = new Set(input.actualImporterFilesWithinAdapter);

  for (const file of actual) {
    if (!allowed.has(file)) {
      issues.push({
        code: 'UNEXPECTED_ADAPTER_IMPORTER',
        message: `'${file}' imports '${input.providerModuleName}' but is not one of the adapter's declared allowed importer files.`,
      });
    }
  }

  for (const file of allowed) {
    if (!actual.has(file)) {
      issues.push({
        code: 'MISSING_EXPECTED_ADAPTER_IMPORTER',
        message: `Declared allowed importer '${file}' does not actually import '${input.providerModuleName}'.`,
      });
    }
  }

  return issues.length === 0 ? { valid: true } : { valid: false, issues };
}

// ---------------------------------------------------------------------------
// Certification harness (R005.D Phase 2/3) -- what an adapter under test
// must supply. Deliberately mirrors the shape `@aoc-enterprise/pinata-adapter`
// already exposes (an `execute(candidate: unknown)` function accepting an
// unvalidated candidate, and a capability declaration record) -- this suite
// certifies the "translation-consuming Provider Adapter" shape R005.C's own
// reference implementation established, never a redesign of it. See the
// README's "Adapter shapes this version certifies" for the documented scope
// boundary (a future grant-consuming adapter shape is a known, honest
// extension point, not something this version silently assumes away).
// ---------------------------------------------------------------------------

export interface EnterpriseProviderConformanceHarness {
  /** Free-text provider identifier under test (mirrors `EnterpriseResourceEnvelope.location.system`) -- never a closed enum. */
  readonly providerSystem: string;
  /** The adapter's own, already-built `EnterpriseProviderCapabilityDeclaration`. */
  readonly capabilityDeclaration: EnterpriseProviderCapabilityDeclaration;
  /**
   * The adapter's own translation-consuming execution entrypoint. Accepts
   * `unknown` -- mirroring `executePinataProviderTranslation`'s own
   * convention -- so the suite can also exercise malformed-candidate
   * rejection (R005.D Phase 6, "Malformed translation rejected").
   */
  readonly execute: (candidate: unknown) => Promise<EnterpriseProviderConformanceExecutionResult>;
  /**
   * Provider-specific `providerMetadata` a canonical fixture translation
   * needs to succeed for a given execution intent (e.g. Pinata's own
   * `requestedDurationSeconds`). The suite is provider-neutral and cannot
   * guess this; returning `undefined` (the default) omits `providerMetadata`
   * entirely.
   */
  readonly providerMetadataFor?: (
    executionIntent: EnterpriseProviderTranslationExecutionIntent,
  ) => Readonly<Record<string, EnterpriseProviderTranslationMetadataValue>> | undefined;
  /**
   * Only relevant when `capabilityDeclaration.capabilities` includes
   * `SupportsExpiration`: a hook proving the adapter refuses to
   * translate/honor an expired grant (R005.D Phase 6, "Expired grant
   * rejected"). `EnterpriseProviderTranslation` itself carries no
   * `expiresAt` (R005.B's own design), so this is necessarily a distinct
   * hook rather than a translation fixture. Omit when the capability is not
   * declared -- the check is then reported as `'skipped'`, never `'failed'`.
   */
  readonly translateExpiredGrant?: () => Promise<EnterpriseProviderConformanceExecutionResult>;
  /**
   * The result of running `evaluateEnterpriseProviderConformanceBoundary`
   * against a real filesystem scan of the adapter's own package (performed
   * by the adapter's own boundary script, since this suite performs no I/O
   * itself). Omit when no such scan is wired in yet -- the check is then
   * reported as `'skipped'`, never `'failed'`.
   */
  readonly boundaryEvaluation?: EnterpriseProviderConformanceBoundaryResult;
}

// ---------------------------------------------------------------------------
// Report shape (R005.D Phase 3) -- one check per named category, so a
// consumer (a future adapter's own test suite, or a CI gate) can inspect
// exactly what passed, failed, or was legitimately not applicable.
// ---------------------------------------------------------------------------

export type EnterpriseProviderConformanceCategory =
  | 'translation-acceptance'
  | 'capability-validation'
  | 'failure-normalization'
  | 'execution-normalization'
  | 'metadata-normalization'
  | 'boundary-validation'
  | 'dependency-validation'
  | 'serialization-consistency'
  | 'provider-neutrality';

export type EnterpriseProviderConformanceCheckStatus = 'passed' | 'failed' | 'skipped';

export interface EnterpriseProviderConformanceCheck {
  readonly category: EnterpriseProviderConformanceCategory;
  readonly id: string;
  readonly description: string;
  readonly status: EnterpriseProviderConformanceCheckStatus;
  readonly detail?: string;
}

export interface EnterpriseProviderConformanceReport {
  readonly schemaVersion: typeof ENTERPRISE_PROVIDER_CONFORMANCE_SUITE_SCHEMA_VERSION;
  readonly providerSystem: string;
  readonly generatedAt: UtcDateTime;
  readonly checks: readonly EnterpriseProviderConformanceCheck[];
  /** `true` iff no check has status `'failed'`. A `'skipped'` check never blocks certification -- it records a legitimately not-applicable case (see each check's own `description`). */
  readonly passed: boolean;
}

function defaultNow(): UtcDateTime {
  return new Date().toISOString();
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function buildCanonicalResource(): ResourceRef {
  return { kind: 'conformance-resource', id: 'conformance-resource-id' };
}

function buildFixtureTranslation(
  harness: EnterpriseProviderConformanceHarness,
  executionIntent: EnterpriseProviderTranslationExecutionIntent,
): EnterpriseProviderTranslation {
  const capability = enterpriseProviderTranslationRequiredCapability(executionIntent);
  const providerMetadata = harness.providerMetadataFor?.(executionIntent);
  return {
    schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION,
    id: `conformance-translation-${executionIntent}`,
    providerSystem: harness.providerSystem,
    capability,
    executionIntent,
    grantRef: 'conformance-grant-1',
    resource: buildCanonicalResource(),
    ...(providerMetadata === undefined ? {} : { providerMetadata }),
    translatedAt: '2026-01-01T00:00:00.000Z',
    correlationId: `conformance-correlation-${executionIntent}`,
    description: 'Provider Conformance Suite fixture translation.',
  };
}

function evaluateExecutionResultChecks(
  translation: EnterpriseProviderTranslation,
  result: EnterpriseProviderConformanceExecutionResult,
): EnterpriseProviderConformanceCheck[] {
  const checks: EnterpriseProviderConformanceCheck[] = [];
  const intent = translation.executionIntent;

  const echoesTranslation =
    result.translationId === translation.id &&
    result.grantRef === translation.grantRef &&
    result.correlationId === translation.correlationId &&
    result.executionIntent === translation.executionIntent &&
    result.providerSystem === translation.providerSystem;

  checks.push({
    category: 'execution-normalization',
    id: `result-echoes-translation-${intent}`,
    description: `The normalized execution result for '${intent}' echoes the originating translation's own translationId/grantRef/correlationId/executionIntent/providerSystem.`,
    status: echoesTranslation ? 'passed' : 'failed',
  });

  if (result.outcome === 'executed') {
    const keys = Object.keys(result).sort();
    const exactFieldSet = keys.length === SUCCESS_RESULT_FIELDS.length && keys.every((key) => SUCCESS_RESULT_FIELDS.includes(key));
    checks.push({
      category: 'execution-normalization',
      id: `success-field-set-${intent}`,
      description: `A successful '${intent}' execution result carries exactly the canonical success fields -- no extra, provider-specific field leaks.`,
      status: exactFieldSet ? 'passed' : 'failed',
      ...(exactFieldSet ? {} : { detail: keys.join(', ') }),
    });

    const detailValid = isEnterpriseProviderConformanceExecutionDetail(result.detail);
    checks.push({
      category: 'metadata-normalization',
      id: `success-detail-json-safe-${intent}`,
      description: `The success 'detail' for '${intent}' is a JSON-safe, provider-neutral bag of primitives carrying a 'kind' discriminant -- never a raw provider SDK object.`,
      status: detailValid ? 'passed' : 'failed',
    });
  } else {
    const keys = Object.keys(result).sort();
    const exactFieldSet = keys.length === FAILURE_RESULT_FIELDS.length && keys.every((key) => FAILURE_RESULT_FIELDS.includes(key));
    checks.push({
      category: 'failure-normalization',
      id: `failure-field-set-${intent}`,
      description: `A failed '${intent}' execution result carries exactly the canonical failure fields -- no HTTP status, stack trace, or SDK exception leaks.`,
      status: exactFieldSet ? 'passed' : 'failed',
      ...(exactFieldSet ? {} : { detail: keys.join(', ') }),
    });

    checks.push({
      category: 'failure-normalization',
      id: `failure-reason-closed-vocabulary-${intent}`,
      description: `The failure's 'failureReason' for '${intent}' is a member of the closed EnterpriseProviderFailureReason vocabulary.`,
      status: CLOSED_FAILURE_REASONS.includes(result.failureReason) ? 'passed' : 'failed',
    });

    checks.push({
      category: 'failure-normalization',
      id: `failure-message-plain-string-${intent}`,
      description: `The failure's 'message' for '${intent}' is a plain, non-empty string.`,
      status: typeof result.message === 'string' && result.message.length > 0 ? 'passed' : 'failed',
    });
  }

  return checks;
}

async function evaluateMalformedInputRejection(harness: EnterpriseProviderConformanceHarness): Promise<EnterpriseProviderConformanceCheck> {
  const malformedCandidate = { schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION, providerSystem: harness.providerSystem };
  let threw = false;
  let detail: string | undefined;
  try {
    const result = await harness.execute(malformedCandidate);
    detail = `execute() resolved instead of rejecting: ${JSON.stringify(result)}`;
  } catch (error) {
    threw = true;
    detail = describeError(error);
  }
  return {
    category: 'translation-acceptance',
    id: 'malformed-translation-rejected',
    description: 'A structurally invalid translation candidate (missing required fields) is rejected by the adapter, never silently accepted as a fabricated result.',
    status: threw ? 'passed' : 'failed',
    ...(threw ? {} : { detail: detail ?? 'no detail captured' }),
  };
}

async function evaluateExpiredGrantSupport(harness: EnterpriseProviderConformanceHarness): Promise<EnterpriseProviderConformanceCheck> {
  const declaresExpiration = harness.capabilityDeclaration.capabilities.includes(ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION);
  const description =
    "An adapter declaring 'SupportsExpiration' refuses to translate/honor an expired grant, reporting failureReason 'grant-expired'.";

  if (!declaresExpiration || harness.translateExpiredGrant === undefined) {
    return {
      category: 'dependency-validation',
      id: 'expired-grant-rejected',
      description: `${description} Not applicable -- this harness does not declare 'SupportsExpiration', or did not supply a 'translateExpiredGrant' hook.`,
      status: 'skipped',
    };
  }

  try {
    const result = await harness.translateExpiredGrant();
    const rejected = result.outcome === 'failed' && result.failureReason === ENTERPRISE_PROVIDER_FAILURE_REASONS.GRANT_EXPIRED;
    return {
      category: 'dependency-validation',
      id: 'expired-grant-rejected',
      description,
      status: rejected ? 'passed' : 'failed',
      ...(rejected ? {} : { detail: JSON.stringify(result) }),
    };
  } catch (error) {
    return {
      category: 'dependency-validation',
      id: 'expired-grant-rejected',
      description,
      status: 'failed',
      detail: describeError(error),
    };
  }
}

function evaluateBoundary(harness: EnterpriseProviderConformanceHarness): EnterpriseProviderConformanceCheck {
  if (harness.boundaryEvaluation === undefined) {
    return {
      category: 'boundary-validation',
      id: 'provider-sdk-import-boundary',
      description:
        'No provider-SDK import-boundary evaluation was supplied by the harness. Boundary scanning requires filesystem access this provider-neutral suite deliberately does not perform itself -- wire evaluateEnterpriseProviderConformanceBoundary into the adapter\'s own boundary script (see the README\'s "Boundary validation" section) to enable this check.',
      status: 'skipped',
    };
  }
  return {
    category: 'boundary-validation',
    id: 'provider-sdk-import-boundary',
    description: "No Enterprise contract or other adapter imports the provider SDK; only the adapter's own declared file(s) do.",
    status: harness.boundaryEvaluation.valid ? 'passed' : 'failed',
    ...(harness.boundaryEvaluation.valid ? {} : { detail: harness.boundaryEvaluation.issues.map((issue) => issue.message).join('; ') }),
  };
}

function evaluateProviderNeutralitySummary(harness: EnterpriseProviderConformanceHarness): EnterpriseProviderConformanceCheck {
  const allFromClosedVocabulary = harness.capabilityDeclaration.capabilities.every((capability) => CLOSED_CAPABILITIES.includes(capability));
  return {
    category: 'provider-neutrality',
    id: 'declared-capabilities-from-closed-vocabulary',
    description: `Every capability '${harness.providerSystem}' declares is a member of the closed, provider-neutral EnterpriseProviderCapability vocabulary -- never a provider-specific value.`,
    status: allFromClosedVocabulary ? 'passed' : 'failed',
  };
}

/**
 * Runs the full Provider Conformance Suite against one adapter harness.
 * Never throws for a non-conformant adapter -- every failure mode becomes a
 * `'failed'` check in the returned report, so a caller can inspect exactly
 * what did not conform rather than catching an exception. Only a defect in
 * the harness's own construction (e.g. `execute` throwing on a well-formed,
 * capability-supported candidate) can still surface as a `'failed'` check
 * with a captured `detail` message -- never an unhandled rejection out of
 * this function itself.
 */
export async function runEnterpriseProviderConformanceSuite(
  harness: EnterpriseProviderConformanceHarness,
  deps: { readonly now?: () => UtcDateTime } = {},
): Promise<EnterpriseProviderConformanceReport> {
  const now = deps.now ?? defaultNow;
  const checks: EnterpriseProviderConformanceCheck[] = [];

  // -- Capability declaration itself --
  const declarationValidation = validateEnterpriseProviderCapabilityDeclaration(harness.capabilityDeclaration);
  checks.push({
    category: 'capability-validation',
    id: 'capability-declaration-valid',
    description: "The adapter's own EnterpriseProviderCapabilityDeclaration validates against the closed capability vocabulary.",
    status: declarationValidation.valid ? 'passed' : 'failed',
    ...(declarationValidation.valid ? {} : { detail: declarationValidation.errors.map((issue) => issue.code).join(', ') }),
  });

  checks.push({
    category: 'provider-neutrality',
    id: 'capability-declaration-provider-system-matches',
    description: 'The capability declaration providerSystem matches the harness providerSystem (both free-text, never a closed provider enum).',
    status: harness.capabilityDeclaration.providerSystem === harness.providerSystem ? 'passed' : 'failed',
  });

  try {
    const roundTripped = deserializeEnterpriseProviderCapabilityDeclaration(
      JSON.parse(JSON.stringify(serializeEnterpriseProviderCapabilityDeclaration(harness.capabilityDeclaration))) as unknown,
    );
    const equal = enterpriseProviderCapabilityDeclarationEquals(harness.capabilityDeclaration, roundTripped);
    checks.push({
      category: 'serialization-consistency',
      id: 'capability-declaration-round-trip',
      description: 'serialize -> JSON round-trip -> deserialize reproduces a structurally-equal capability declaration.',
      status: equal ? 'passed' : 'failed',
    });
  } catch (error) {
    checks.push({
      category: 'serialization-consistency',
      id: 'capability-declaration-round-trip',
      description: 'serialize -> JSON round-trip -> deserialize reproduces a structurally-equal capability declaration.',
      status: 'failed',
      detail: describeError(error),
    });
  }

  // -- One pass per canonical, closed execution intent --
  for (const executionIntent of CLOSED_EXECUTION_INTENTS) {
    const requiredCapability = enterpriseProviderTranslationRequiredCapability(executionIntent);
    const isSupported = harness.capabilityDeclaration.capabilities.includes(requiredCapability);
    const translation = buildFixtureTranslation(harness, executionIntent);

    const translationValidation = validateEnterpriseProviderTranslation(translation);
    checks.push({
      category: 'translation-acceptance',
      id: `translation-valid-${executionIntent}`,
      description: `A canonical '${executionIntent}' translation targeting '${harness.providerSystem}' validates against the frozen Provider Translation Model.`,
      status: translationValidation.valid ? 'passed' : 'failed',
      ...(translationValidation.valid ? {} : { detail: translationValidation.errors.map((issue) => issue.code).join(', ') }),
    });

    checks.push({
      category: 'dependency-validation',
      id: `capability-execution-intent-dependency-${executionIntent}`,
      description: `'${executionIntent}' declares the capability its own execution intent requires ('${requiredCapability}').`,
      status: translation.capability === requiredCapability ? 'passed' : 'failed',
    });

    try {
      const roundTripped = deserializeEnterpriseProviderTranslation(
        JSON.parse(JSON.stringify(serializeEnterpriseProviderTranslation(translation))) as unknown,
      );
      const equal = enterpriseProviderTranslationEquals(translation, roundTripped);
      checks.push({
        category: 'serialization-consistency',
        id: `translation-round-trip-${executionIntent}`,
        description: `A '${executionIntent}' translation survives serialize -> JSON round-trip -> deserialize unchanged.`,
        status: equal ? 'passed' : 'failed',
      });
    } catch (error) {
      checks.push({
        category: 'serialization-consistency',
        id: `translation-round-trip-${executionIntent}`,
        description: `A '${executionIntent}' translation survives serialize -> JSON round-trip -> deserialize unchanged.`,
        status: 'failed',
        detail: describeError(error),
      });
    }

    let result: EnterpriseProviderConformanceExecutionResult | undefined;
    let thrown: unknown;
    try {
      result = await harness.execute(translation);
    } catch (error) {
      thrown = error;
    }

    const accepted = thrown === undefined && result !== undefined;
    checks.push({
      category: 'translation-acceptance',
      id: `${isSupported ? 'supported' : 'unsupported'}-translation-accepted-${executionIntent}`,
      description: `A valid '${executionIntent}' translation is accepted (execute() returns a normalized result rather than throwing) regardless of whether its required capability ('${requiredCapability}') is declared.`,
      status: accepted ? 'passed' : 'failed',
      ...(accepted ? {} : { detail: describeError(thrown) }),
    });

    // Every produced result -- whether the intent's capability was declared
    // or not -- must still be shaped as a canonical, normalized result (no
    // provider leakage, closed failure vocabulary, exact field set). An
    // adapter cannot excuse a leaky, malformed, or fabricated result just
    // because the underlying capability happens to be unsupported.
    if (accepted && result !== undefined) {
      checks.push(...evaluateExecutionResultChecks(translation, result));
    }

    if (!isSupported) {
      const rejectedCorrectly = accepted && result !== undefined && result.outcome === 'failed' && result.failureReason === ENTERPRISE_PROVIDER_FAILURE_REASONS.CAPABILITY_UNSUPPORTED;
      checks.push({
        category: 'capability-validation',
        id: `unsupported-capability-rejected-${executionIntent}`,
        description: `'${executionIntent}' (requires undeclared capability '${requiredCapability}') is rejected with 'capability-unsupported', never faked as a success.`,
        status: rejectedCorrectly ? 'passed' : 'failed',
        ...(rejectedCorrectly
          ? {}
          : {
              detail: accepted ? `execute() returned: ${JSON.stringify(result)}` : `execute() threw instead of returning a normalized failure: ${describeError(thrown)}`,
            }),
      });
    }
  }

  checks.push(await evaluateMalformedInputRejection(harness));
  checks.push(await evaluateExpiredGrantSupport(harness));
  checks.push(evaluateBoundary(harness));
  checks.push(evaluateProviderNeutralitySummary(harness));

  const passed = checks.every((check) => check.status !== 'failed');

  return {
    schemaVersion: ENTERPRISE_PROVIDER_CONFORMANCE_SUITE_SCHEMA_VERSION,
    providerSystem: harness.providerSystem,
    generatedAt: now(),
    checks,
    passed,
  };
}
