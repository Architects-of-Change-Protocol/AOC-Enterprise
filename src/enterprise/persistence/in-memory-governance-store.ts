import type {
  GovernanceEvaluationRecord,
  GovernanceRequestRecord,
  GovernanceStore,
  GovernanceTraceRecord,
  PersistEvaluationInput,
  PersistEvaluationResult,
  EnterpriseEventRecord,
  EnterpriseVersionRecord,
} from './governance-store.js';
import { isSameRequestPayload, toGovernanceEvaluationRecord, toGovernanceRequestRecord, toGovernanceTraceRecord } from './record-mappers.js';

/**
 * Default `GovernanceStore`. Zero new dependencies, always available --
 * this is what the AOC Enterprise Host boots with out of the box and what
 * its own test suite exercises against, in line with the mission's "keep
 * schema minimal, avoid premature normalization" guidance for a v1.
 */
export function createInMemoryGovernanceStore(): GovernanceStore {
  const requestsById = new Map<string, GovernanceRequestRecord>();
  const evaluationsByRequestId = new Map<string, GovernanceEvaluationRecord>();
  const evaluationsByDecisionId = new Map<string, GovernanceEvaluationRecord>();
  const tracesByDecisionId = new Map<string, GovernanceTraceRecord>();
  const events: EnterpriseEventRecord[] = [];
  const versions: EnterpriseVersionRecord[] = [];

  return {
    providerKind: 'memory',

    async persistEvaluation(input: PersistEvaluationInput): Promise<PersistEvaluationResult> {
      const { request, result, receivedAt } = input;
      const existingRequest = requestsById.get(request.requestId);

      if (existingRequest !== undefined) {
        if (!isSameRequestPayload(existingRequest.requestPayload, request)) {
          const existingEvaluation = evaluationsByRequestId.get(request.requestId);
          if (existingEvaluation !== undefined) {
            return { outcome: 'conflict', evaluation: existingEvaluation };
          }
        } else {
          const existingEvaluation = evaluationsByRequestId.get(request.requestId);
          if (existingEvaluation !== undefined) {
            return { outcome: 'idempotent_replay', evaluation: existingEvaluation };
          }
        }
      }

      const requestRecord = toGovernanceRequestRecord(request, receivedAt);
      const evaluationRecord = toGovernanceEvaluationRecord(result);
      const traceRecord = toGovernanceTraceRecord(result);

      requestsById.set(requestRecord.requestId, requestRecord);
      evaluationsByRequestId.set(requestRecord.requestId, evaluationRecord);
      evaluationsByDecisionId.set(evaluationRecord.decisionId, evaluationRecord);
      tracesByDecisionId.set(traceRecord.decisionId, traceRecord);

      return { outcome: 'stored', evaluation: evaluationRecord };
    },

    async getRequestById(requestId) {
      return requestsById.get(requestId);
    },
    async getEvaluationByRequestId(requestId) {
      return evaluationsByRequestId.get(requestId);
    },
    async getEvaluationByDecisionId(decisionId) {
      return evaluationsByDecisionId.get(decisionId);
    },
    async getTraceByDecisionId(decisionId) {
      return tracesByDecisionId.get(decisionId);
    },

    async appendEnterpriseEvent(record) {
      events.push(record);
    },
    async listEnterpriseEvents(filter) {
      if (!filter) return [...events];
      return events.filter(
        (event) =>
          (filter.requestId === undefined || event.requestId === filter.requestId) &&
          (filter.correlationId === undefined || event.correlationId === filter.correlationId),
      );
    },

    async recordEnterpriseVersion(record) {
      versions.push(record);
    },
    async getLatestEnterpriseVersion() {
      return versions.at(-1);
    },

    async checkConnectivity() {
      return true;
    },
    async close() {
      // Nothing to release for an in-memory store.
    },
  };
}
