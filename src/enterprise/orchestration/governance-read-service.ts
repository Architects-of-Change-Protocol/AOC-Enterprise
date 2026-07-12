import { EnterpriseHttpErrors, mapGovernanceStoreErrorToHttp } from '../api/enterprise-http-errors.js';
import type { EnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import type { GovernanceRecord, GovernanceRecordVerificationResult, GovernanceStoreAccessContext, GovernanceStoreQuery, GovernanceStoreQueryResult } from '../governance-store/contracts.js';
import { isGovernanceStoreError } from '../governance-store/errors.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import type { EnterpriseTelemetry } from '../telemetry/enterprise-telemetry.js';
import { extractBearerToken, matchApiKey } from './credential-matching.js';

/**
 * The Enterprise Host's read/verify surface over the Governance Store.
 * This service — never the HTTP adapter — turns the caller's credential
 * into a `GovernanceStoreAccessContext` (PR-004 sections 34/35/73):
 *
 * - authentication disabled → system scope (local/dev posture, same trust
 *   model the evaluate endpoint already has);
 * - authenticated org-scoped key → that organization only;
 * - authenticated unscoped key → system scope.
 *
 * The Store itself enforces the resulting scope; handlers never build raw
 * queries.
 */
export interface GovernanceReadService {
  getByEvaluationId(authorizationHeader: string | undefined, evaluationId: string): Promise<GovernanceRecord | null>;
  getByDecisionId(authorizationHeader: string | undefined, decisionId: string): Promise<GovernanceRecord | null>;
  getByRequestId(authorizationHeader: string | undefined, requestId: string): Promise<GovernanceRecord | null>;
  query(authorizationHeader: string | undefined, query: GovernanceStoreQuery): Promise<GovernanceStoreQueryResult>;
  verify(authorizationHeader: string | undefined, evaluationId: string): Promise<GovernanceRecordVerificationResult>;
}

/** Resolves the caller's authenticated read scope. Throws 401 for missing/unknown credentials when authentication is required. */
export function resolveGovernanceAccessContext(authorizationHeader: string | undefined, configuration: EnterpriseConfiguration): GovernanceStoreAccessContext {
  if (!configuration.features.requireAuthentication) return { system: true };

  const token = extractBearerToken(authorizationHeader);
  if (token === undefined) throw EnterpriseHttpErrors.authenticationFailed('A Bearer token is required.');
  const matchedKey = matchApiKey(token, configuration.authentication.apiKeys);
  if (matchedKey === undefined) throw EnterpriseHttpErrors.authenticationFailed('The provided credential is not recognized.');

  return matchedKey.organizationId !== undefined ? { system: false, organizationId: matchedKey.organizationId } : { system: true };
}

export function createGovernanceReadService(
  store: GovernanceStore,
  configuration: EnterpriseConfiguration,
  telemetry: EnterpriseTelemetry,
): GovernanceReadService {
  async function run<T>(authorizationHeader: string | undefined, callerInput: boolean, operation: (context: GovernanceStoreAccessContext) => Promise<T>): Promise<T> {
    const context = resolveGovernanceAccessContext(authorizationHeader, configuration);
    try {
      return await operation(context);
    } catch (error) {
      if (isGovernanceStoreError(error)) {
        if (error.code === 'GOVERNANCE_RECORD_CORRUPTED') telemetry.recordStoreCorruptedRecord();
        throw mapGovernanceStoreErrorToHttp(error, { callerInput });
      }
      throw error;
    }
  }

  return {
    getByEvaluationId: (auth, evaluationId) => run(auth, false, (context) => store.getByEvaluationId(context, evaluationId)),
    getByDecisionId: (auth, decisionId) => run(auth, false, (context) => store.getByDecisionId(context, decisionId)),
    getByRequestId: (auth, requestId) => run(auth, false, (context) => store.getByRequestId(context, requestId)),
    query: (auth, query) =>
      run(auth, true, async (context) => {
        const startedAtMs = Date.now();
        const result = await store.query(context, query);
        telemetry.recordStoreQuery(Date.now() - startedAtMs);
        return result;
      }),
    verify: (auth, evaluationId) =>
      run(auth, false, async (context) => {
        const result = await store.verify(context, evaluationId);
        telemetry.recordStoreVerification(result.valid);
        return result;
      }),
  };
}
