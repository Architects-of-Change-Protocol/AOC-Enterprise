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
 * Ownership: Soberanía Enterprise (`@aoc-enterprise/provider-conformance-suite`).
 */
export const ENTERPRISE_PROVIDER_CONFORMANCE_SUITE_SCHEMA_VERSION = '1.0.0' as const;

const ISO_8601_SHAPE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Whether `value` is a genuinely valid ISO 8601 UTC timestamp -- not merely
 * digit-shaped. `ISO_8601_SHAPE_PATTERN` alone accepts calendar-impossible
 * strings like `'2026-99-99T99:99:99Z'` or `'2026-02-31T00:00:00Z'` (`Date`
 * silently rolls an out-of-range day/month over to the next month rather
 * than rejecting it, so `!Number.isNaN(Date.parse(value))` alone is not
 * enough either); this function range-checks every component (month 1-12,
 * hour 0-23, minute 0-59, second 0-60 to allow a leap second, and day
 * against the actual number of days in that month/year, accounting for leap
 * years) before accepting the value.
 */
function isValidIso8601UtcTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = ISO_8601_SHAPE_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59 || second > 60) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Whether `value` is a plain object -- `{}`-shaped or `Object.create(null)` -- never a class instance, `Map`, `Date`, array, or function. Class instances (e.g. a raw provider SDK client/response object) have a prototype other than `Object.prototype`/`null` and are rejected here even when every enumerable property they carry happens to be a primitive. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Whether a success result's `detail` is a JSON-safe, provider-neutral bag
 * of data: a plain object (never an array, a class instance, or a
 * function -- see `isPlainRecord`), carrying a non-empty string `kind`
 * discriminant, whose other values are each either a JSON primitive or a
 * flat plain object of JSON primitives (one level of nesting -- e.g. a
 * normalized metadata bag). This is a proxy for "no raw provider SDK object
 * leaked": a real provider SDK response is virtually never this shape (it
 * is a class instance, carries methods, or nests deeply), while every
 * legitimate normalized execution detail this suite has seen
 * (temporary-access URLs, flattened metadata, invalidation status) already
 * is.
 */
export function isEnterpriseProviderConformanceExecutionDetail(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (typeof value.kind !== 'string' || value.kind.length === 0) return false;
  return Object.entries(value).every(([key, entryValue]) => {
    if (key === 'kind') return true;
    if (isJsonPrimitive(entryValue)) return true;
    if (isPlainRecord(entryValue)) {
      return Object.values(entryValue).every((nested) => isJsonPrimitive(nested));
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
   * hook rather than a translation fixture. Required whenever
   * `SupportsExpiration` is declared -- an adapter that advertises the
   * capability but omits this hook fails the check rather than skipping it
   * (a declared capability must be provable, never merely claimed). Omit
   * only when `SupportsExpiration` is not declared -- the check is then
   * reported as `'skipped'`, never `'failed'`.
   */
  readonly translateExpiredGrant?: () => Promise<EnterpriseProviderConformanceExecutionResult>;
  /**
   * The result of running `evaluateEnterpriseProviderConformanceBoundary`
   * against a real filesystem scan of the adapter's own package (performed
   * by the adapter's own boundary script, since this suite performs no I/O
   * itself). Required for certification: omitting it reports the check as
   * `'failed'`, not `'skipped'` -- a Provider Adapter cannot be certified
   * without proving no provider SDK leaks outside its own declared file(s).
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

/**
 * Converts `value` to a display string without ever throwing. `String(value)`
 * itself throws for an object whose primitive-conversion path is broken --
 * e.g. `Object.create(null)` (no inherited `toString`/`valueOf`/
 * `Symbol.toPrimitive` to call) -- which is exactly the shape a malformed or
 * adversarial harness result can take. `Object.prototype.toString.call`
 * never throws for any object, so it is the true last-resort fallback here.
 */
function safeToDisplayString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return typeof value === 'object' && value !== null ? Object.prototype.toString.call(value) : 'unrepresentable value';
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return safeToDisplayString(error);
}

/** Formats `value` for a check's `detail` message; never throws even for circular or otherwise non-JSON-serializable values (a malformed/leaky harness result is exactly the case this suite must describe without itself crashing). */
function describeValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? safeToDisplayString(value);
  } catch {
    return `${safeToDisplayString(value)} (could not be JSON-serialized for this message)`;
  }
}

/** Derives the declared capability set defensively: a malformed harness (missing or non-array `capabilities`, e.g. from an untyped JS caller) must produce `'failed'` checks, never crash the suite by having `.includes`/`.every` called on a non-array. */
function getDeclaredCapabilities(harness: EnterpriseProviderConformanceHarness): readonly EnterpriseProviderCapability[] {
  const capabilities: unknown = harness.capabilityDeclaration?.capabilities;
  return Array.isArray(capabilities) ? (capabilities as readonly EnterpriseProviderCapability[]) : [];
}

/** Whether `value` is a genuine, dereferenceable `EnterpriseProviderConformanceExecutionResult`-shaped object -- never `null`, an array, or a primitive a badly-implemented harness resolved to instead of throwing. */
function isDereferenceableResult(value: unknown): value is EnterpriseProviderConformanceExecutionResult {
  return isPlainRecord(value);
}

function buildCanonicalResource(): ResourceRef {
  return { kind: 'conformance-resource', id: 'conformance-resource-id' };
}

function buildFixtureTranslation(
  harness: EnterpriseProviderConformanceHarness,
  executionIntent: EnterpriseProviderTranslationExecutionIntent,
  overrides: Partial<Pick<EnterpriseProviderTranslation, 'id' | 'providerSystem' | 'grantRef' | 'correlationId'>> = {},
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
    ...overrides,
  };
}

function evaluateExecutionResultChecks(
  translation: EnterpriseProviderTranslation,
  result: EnterpriseProviderConformanceExecutionResult,
): EnterpriseProviderConformanceCheck[] {
  const checks: EnterpriseProviderConformanceCheck[] = [];
  const intent = translation.executionIntent;
  const outcome: unknown = (result as { readonly outcome?: unknown }).outcome;

  if (outcome !== 'executed' && outcome !== 'failed') {
    checks.push({
      category: 'execution-normalization',
      id: `result-outcome-valid-${intent}`,
      description: `The normalized execution result for '${intent}' has an 'outcome' that is exactly 'executed' or 'failed' -- never any other value.`,
      status: 'failed',
      detail: `outcome: ${describeValue(outcome)}`,
    });
    return checks;
  }

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

  // Re-read the discriminant off `result` itself (not the separately
  // extracted, `unknown`-typed `outcome` local above) so TypeScript's
  // control-flow narrowing over the EnterpriseProviderConformanceExecutionResult
  // union actually applies to every field access below.
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

    const executedAtValid = isValidIso8601UtcTimestamp(result.executedAt);
    checks.push({
      category: 'execution-normalization',
      id: `success-executed-at-valid-${intent}`,
      description: `The success 'executedAt' for '${intent}' is a well-formed ISO 8601 UTC timestamp.`,
      status: executedAtValid ? 'passed' : 'failed',
      ...(executedAtValid ? {} : { detail: describeValue(result.executedAt) }),
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

    const failedAtValid = isValidIso8601UtcTimestamp(result.failedAt);
    checks.push({
      category: 'failure-normalization',
      id: `failure-failed-at-valid-${intent}`,
      description: `The failure's 'failedAt' for '${intent}' is a well-formed ISO 8601 UTC timestamp.`,
      status: failedAtValid ? 'passed' : 'failed',
      ...(failedAtValid ? {} : { detail: describeValue(result.failedAt) }),
    });
  }

  return checks;
}

async function evaluateMalformedInputRejection(harness: EnterpriseProviderConformanceHarness): Promise<EnterpriseProviderConformanceCheck> {
  const malformedCandidate = { schemaVersion: ENTERPRISE_PROVIDER_TRANSLATION_SCHEMA_VERSION, providerSystem: harness.providerSystem };
  const description =
    'A structurally invalid translation candidate (missing required fields) is rejected by the adapter, never silently accepted as a fabricated result.';

  let threw = false;
  let resolvedResult: EnterpriseProviderConformanceExecutionResult | undefined;
  try {
    resolvedResult = await harness.execute(malformedCandidate);
  } catch {
    threw = true;
  }

  // A downstream formatting failure (e.g. execute() resolved to a circular
  // object or a BigInt field) must never be mistaken for the adapter having
  // thrown -- only the execute() call itself, above, may set `threw`.
  return {
    category: 'translation-acceptance',
    id: 'malformed-translation-rejected',
    description,
    status: threw ? 'passed' : 'failed',
    ...(threw ? {} : { detail: `execute() resolved instead of rejecting: ${describeValue(resolvedResult)}` }),
  };
}

async function evaluateForeignProviderSystemRejection(harness: EnterpriseProviderConformanceHarness): Promise<EnterpriseProviderConformanceCheck> {
  const executionIntent = ENTERPRISE_PROVIDER_TRANSLATION_EXECUTION_INTENTS.PROVIDE_METADATA;
  const foreignTranslation = buildFixtureTranslation(harness, executionIntent, {
    id: 'conformance-translation-foreign-provider-system',
    providerSystem: `${harness.providerSystem}-conformance-foreign`,
    grantRef: 'conformance-grant-foreign-provider-system',
    correlationId: 'conformance-correlation-foreign-provider-system',
  });
  const description =
    "A structurally valid translation whose providerSystem does not match the adapter's own is rejected, proving cross-provider isolation -- an adapter must never execute a translation targeting a different provider.";

  let threw = false;
  let resolvedResult: EnterpriseProviderConformanceExecutionResult | undefined;
  try {
    resolvedResult = await harness.execute(foreignTranslation);
  } catch {
    threw = true;
  }

  return {
    category: 'provider-neutrality',
    id: 'foreign-provider-system-rejected',
    description,
    status: threw ? 'passed' : 'failed',
    ...(threw ? {} : { detail: `execute() resolved instead of rejecting: ${describeValue(resolvedResult)}` }),
  };
}

async function evaluateExpiredGrantSupport(
  harness: EnterpriseProviderConformanceHarness,
  declaredCapabilities: readonly EnterpriseProviderCapability[],
): Promise<EnterpriseProviderConformanceCheck> {
  const declaresExpiration = declaredCapabilities.includes(ENTERPRISE_PROVIDER_CAPABILITIES.SUPPORTS_EXPIRATION);
  const description =
    "An adapter declaring 'SupportsExpiration' refuses to translate/honor an expired grant, reporting a canonical failure with failureReason 'grant-expired'.";

  if (!declaresExpiration) {
    return {
      category: 'dependency-validation',
      id: 'expired-grant-rejected',
      description: `${description} Not applicable -- this harness does not declare 'SupportsExpiration'.`,
      status: 'skipped',
    };
  }

  if (harness.translateExpiredGrant === undefined) {
    return {
      category: 'dependency-validation',
      id: 'expired-grant-rejected',
      description: `${description} This harness declares 'SupportsExpiration' but did not supply a 'translateExpiredGrant' hook -- a declared capability must be proven, never merely claimed.`,
      status: 'failed',
    };
  }

  try {
    const result = await harness.translateExpiredGrant();
    if (!isDereferenceableResult(result)) {
      return {
        category: 'dependency-validation',
        id: 'expired-grant-rejected',
        description,
        status: 'failed',
        detail: `translateExpiredGrant() resolved to a non-object value: ${describeValue(result)}`,
      };
    }

    const rejectedForRightReason = result.outcome === 'failed' && result.failureReason === ENTERPRISE_PROVIDER_FAILURE_REASONS.GRANT_EXPIRED;
    if (!rejectedForRightReason) {
      return {
        category: 'dependency-validation',
        id: 'expired-grant-rejected',
        description,
        status: 'failed',
        detail: describeValue(result),
      };
    }

    // Even a correctly-classified 'grant-expired' rejection must still be a
    // canonical, leak-free failure result -- reuse the same field-set,
    // message-shape, and timestamp rules the main execution-normalization
    // checks apply. There is no fixture translation to echo against here
    // (this hook is free-form, not tied to a canonical translation the way
    // the main per-intent loop is), so the equivalent of that echo check is
    // validating each identity field is well-typed and, where it has an
    // adapter-independent known value, that it actually matches: a
    // 'grant-expired' result claiming a foreign providerSystem, or carrying
    // a non-string/empty id, is exactly as non-canonical as a leaked field.
    const keys = Object.keys(result).sort();
    const exactFieldSet = keys.length === FAILURE_RESULT_FIELDS.length && keys.every((key) => FAILURE_RESULT_FIELDS.includes(key));
    const messageValid = typeof result.message === 'string' && result.message.length > 0;
    const failedAtValid = isValidIso8601UtcTimestamp(result.failedAt);
    const identityValid =
      isNonEmptyString(result.translationId) &&
      isNonEmptyString(result.grantRef) &&
      isNonEmptyString(result.correlationId) &&
      CLOSED_EXECUTION_INTENTS.includes(result.executionIntent) &&
      result.providerSystem === harness.providerSystem;
    const shapeValid = exactFieldSet && messageValid && failedAtValid && identityValid;

    return {
      category: 'dependency-validation',
      id: 'expired-grant-rejected',
      description,
      status: shapeValid ? 'passed' : 'failed',
      ...(shapeValid
        ? {}
        : {
            detail:
              `canonical failure shape violated -- fields: ${keys.join(', ')}; message: ${describeValue(result.message)}; ` +
              `failedAt: ${describeValue(result.failedAt)}; translationId: ${describeValue(result.translationId)}; grantRef: ${describeValue(result.grantRef)}; ` +
              `correlationId: ${describeValue(result.correlationId)}; executionIntent: ${describeValue(result.executionIntent)}; providerSystem: ${describeValue(result.providerSystem)} (expected '${harness.providerSystem}')`,
          }),
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
  const description = "No Enterprise contract or other adapter imports the provider SDK; only the adapter's own declared file(s) do.";

  if (harness.boundaryEvaluation === undefined) {
    return {
      category: 'boundary-validation',
      id: 'provider-sdk-import-boundary',
      description: `${description} Not provable -- no boundary evaluation was supplied by the harness. Wire a real filesystem scan through evaluateEnterpriseProviderConformanceBoundary (see the README's "Boundary validation" section) and pass its result as harness.boundaryEvaluation; certification requires proof, not an assumption.`,
      status: 'failed',
    };
  }
  return {
    category: 'boundary-validation',
    id: 'provider-sdk-import-boundary',
    description,
    status: harness.boundaryEvaluation.valid ? 'passed' : 'failed',
    ...(harness.boundaryEvaluation.valid ? {} : { detail: harness.boundaryEvaluation.issues.map((issue) => issue.message).join('; ') }),
  };
}

function evaluateProviderNeutralitySummary(
  harness: EnterpriseProviderConformanceHarness,
  declaredCapabilities: readonly EnterpriseProviderCapability[],
): EnterpriseProviderConformanceCheck {
  const allFromClosedVocabulary = declaredCapabilities.every((capability) => CLOSED_CAPABILITIES.includes(capability));
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
 * what did not conform rather than catching an exception. This holds even
 * when the harness itself is badly implemented (a malformed capability
 * declaration, an `execute` that resolves to `null` instead of throwing, a
 * non-JSON-serializable result) -- every such case is defensively guarded
 * and reported as a `'failed'` check, never an unhandled exception out of
 * this function itself.
 */
export async function runEnterpriseProviderConformanceSuite(
  harness: EnterpriseProviderConformanceHarness,
  deps: { readonly now?: () => UtcDateTime } = {},
): Promise<EnterpriseProviderConformanceReport> {
  const now = deps.now ?? defaultNow;
  const checks: EnterpriseProviderConformanceCheck[] = [];
  const declaredCapabilities = getDeclaredCapabilities(harness);

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
    status: harness.capabilityDeclaration?.providerSystem === harness.providerSystem ? 'passed' : 'failed',
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
    const isSupported = declaredCapabilities.includes(requiredCapability);
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

    let resolved: unknown;
    let thrown: unknown;
    let didThrow = false;
    try {
      resolved = await harness.execute(translation);
    } catch (error) {
      didThrow = true;
      thrown = error;
    }

    const accepted = !didThrow && isDereferenceableResult(resolved);
    checks.push({
      category: 'translation-acceptance',
      id: `${isSupported ? 'supported' : 'unsupported'}-translation-accepted-${executionIntent}`,
      description: `A valid '${executionIntent}' translation is accepted (execute() returns a normalized, dereferenceable result rather than throwing or resolving to a malformed value) regardless of whether its required capability ('${requiredCapability}') is declared.`,
      status: accepted ? 'passed' : 'failed',
      ...(accepted ? {} : { detail: didThrow ? describeError(thrown) : `execute() resolved to a non-object value: ${describeValue(resolved)}` }),
    });

    // Every produced result -- whether the intent's capability was declared
    // or not -- must still be shaped as a canonical, normalized result (no
    // provider leakage, closed failure vocabulary, exact field set, valid
    // timestamps). An adapter cannot excuse a leaky, malformed, or
    // fabricated result just because the underlying capability happens to
    // be unsupported.
    const result: EnterpriseProviderConformanceExecutionResult | undefined = accepted
      ? (resolved as EnterpriseProviderConformanceExecutionResult)
      : undefined;
    if (result !== undefined) {
      checks.push(...evaluateExecutionResultChecks(translation, result));
    }

    if (isSupported) {
      // A capability the adapter itself declared must never be reported as
      // unsupported at execution time -- that is a contradiction between
      // the declaration and observed behavior, not a legitimate failure.
      const misreportedAsUnsupported =
        accepted && result !== undefined && result.outcome === 'failed' && result.failureReason === ENTERPRISE_PROVIDER_FAILURE_REASONS.CAPABILITY_UNSUPPORTED;
      checks.push({
        category: 'capability-validation',
        id: `supported-capability-not-misreported-${executionIntent}`,
        description: `'${executionIntent}' (requires declared capability '${requiredCapability}') is never reported as 'capability-unsupported' -- a declared capability must be honored, not contradicted at execution time.`,
        status: misreportedAsUnsupported ? 'failed' : 'passed',
        ...(misreportedAsUnsupported ? { detail: describeValue(result) } : {}),
      });
    } else {
      const rejectedCorrectly =
        accepted && result !== undefined && result.outcome === 'failed' && result.failureReason === ENTERPRISE_PROVIDER_FAILURE_REASONS.CAPABILITY_UNSUPPORTED;
      checks.push({
        category: 'capability-validation',
        id: `unsupported-capability-rejected-${executionIntent}`,
        description: `'${executionIntent}' (requires undeclared capability '${requiredCapability}') is rejected with 'capability-unsupported', never faked as a success.`,
        status: rejectedCorrectly ? 'passed' : 'failed',
        ...(rejectedCorrectly
          ? {}
          : {
              detail: accepted ? `execute() returned: ${describeValue(result)}` : `execute() did not return a normalized failure: ${didThrow ? describeError(thrown) : describeValue(resolved)}`,
            }),
      });
    }
  }

  checks.push(await evaluateMalformedInputRejection(harness));
  checks.push(await evaluateForeignProviderSystemRejection(harness));
  checks.push(await evaluateExpiredGrantSupport(harness, declaredCapabilities));
  checks.push(evaluateBoundary(harness));
  checks.push(evaluateProviderNeutralitySummary(harness, declaredCapabilities));

  const passed = checks.every((check) => check.status !== 'failed');

  return {
    schemaVersion: ENTERPRISE_PROVIDER_CONFORMANCE_SUITE_SCHEMA_VERSION,
    providerSystem: harness.providerSystem,
    generatedAt: now(),
    checks,
    passed,
  };
}
