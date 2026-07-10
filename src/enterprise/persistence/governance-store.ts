import type { KernelEvaluationRequest, KernelEvaluationResult, KernelTrace } from '../../kernel/index.js';

/** Row shape for `GovernanceRequests` -- the caller-supplied request, verbatim, keyed by its own `requestId`. */
export interface GovernanceRequestRecord {
  readonly requestId: string;
  readonly correlationId?: string;
  readonly actorId: string;
  readonly actionType: string;
  readonly resourceScope: string;
  readonly organizationId?: string;
  readonly requestedAt: string;
  readonly receivedAt: string;
  readonly requestPayload: KernelEvaluationRequest;
}

/** Row shape for `GovernanceEvaluations` -- one row per `KernelEvaluationResult`, excluding the trace (kept in its own table). */
export interface GovernanceEvaluationRecord {
  readonly decisionId: string;
  readonly requestId: string;
  readonly status: KernelEvaluationResult['status'];
  readonly reasonCodes: readonly string[];
  readonly summary: string;
  readonly kernelVersion: string;
  readonly evaluatedAt: string;
  readonly correlationId?: string;
}

/** Row shape for `GovernanceTraces` -- kept separate from `GovernanceEvaluations` since traces are larger and optional to query. */
export interface GovernanceTraceRecord {
  readonly decisionId: string;
  readonly trace: KernelTrace;
}

/**
 * Row shape for the `RuntimeEvents` table -- an append-only ledger of every
 * published `EnterpriseEvent`, independent of the in-process publisher's own
 * subscribers. The table name stays `RuntimeEvents` (a schema is not
 * renamed without need); only the TypeScript type is `Enterprise`-prefixed
 * to avoid colliding with `src/runtime/`'s own, unrelated concepts.
 */
export interface EnterpriseEventRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly requestId: string;
  readonly decisionId?: string;
  readonly correlationId?: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Row shape for the `RuntimeVersions` table -- one row recorded per host
 * boot, so `/health` and audits can answer "what was running when this
 * decision was made." Table name unchanged for the same reason as above.
 */
export interface EnterpriseVersionRecord {
  readonly bootId: string;
  readonly enterpriseVersion: string;
  readonly kernelVersion: string;
  readonly recordedAt: string;
}

export type PersistEvaluationOutcome = 'stored' | 'idempotent_replay' | 'conflict';

export interface PersistEvaluationInput {
  readonly request: KernelEvaluationRequest;
  readonly result: KernelEvaluationResult;
  readonly receivedAt: string;
}

export interface PersistEvaluationResult {
  readonly outcome: PersistEvaluationOutcome;
  readonly evaluation: GovernanceEvaluationRecord;
}

/**
 * The AOC Enterprise Host's own persistence port -- Enterprise decision
 * persistence, deliberately scoped to exactly what PR-002 asks the
 * Enterprise Host to durably record (request, `KernelEvaluationResult`,
 * `KernelTrace`, reason codes, timestamp, kernel version, correlation id,
 * execution metadata). This is a minimal durable-or-in-memory decision
 * store, not the full Governance/Persistence Runtime: it does not (yet)
 * provide event sourcing, replay, Evidence Bundles, Passport history,
 * Assurance-grade audit preservation, retention governance, immutable
 * storage, or distributed consistency. Passport events, Evidence Bundles,
 * Constitutional results, and Jurisdiction decisions are explicitly out of
 * scope, deferred to PR-003.
 */
export interface GovernanceStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Persists the request/evaluation/trace as one transaction boundary. A
   * second call with the same `request.requestId` and byte-identical
   * request payload is a safe idempotent replay (returns the original
   * evaluation, writes nothing new); the same `requestId` with a
   * *different* payload is a genuine concurrency conflict (`'conflict'`)
   * and writes nothing -- the caller maps this to HTTP 409.
   */
  persistEvaluation(input: PersistEvaluationInput): Promise<PersistEvaluationResult>;

  getRequestById(requestId: string): Promise<GovernanceRequestRecord | undefined>;
  getEvaluationByRequestId(requestId: string): Promise<GovernanceEvaluationRecord | undefined>;
  getEvaluationByDecisionId(decisionId: string): Promise<GovernanceEvaluationRecord | undefined>;
  getTraceByDecisionId(decisionId: string): Promise<GovernanceTraceRecord | undefined>;

  appendEnterpriseEvent(record: EnterpriseEventRecord): Promise<void>;
  listEnterpriseEvents(filter?: { readonly requestId?: string; readonly correlationId?: string }): Promise<readonly EnterpriseEventRecord[]>;

  recordEnterpriseVersion(record: EnterpriseVersionRecord): Promise<void>;
  getLatestEnterpriseVersion(): Promise<EnterpriseVersionRecord | undefined>;

  checkConnectivity(): Promise<boolean>;
  close(): Promise<void>;
}
