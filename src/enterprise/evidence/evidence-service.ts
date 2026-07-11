import type { EnterpriseConfiguration } from '../configuration/enterprise-configuration.js';
import type { GovernanceStore } from '../governance-store/governance-store.js';
import { resolveGovernanceAccessContext } from '../orchestration/governance-read-service.js';
import { getDisclosurePolicy } from './disclosure-policies.js';
import { EvidenceError } from './errors.js';
import { buildEvidenceBundle } from './projector.js';
import { verifyEvidenceBundle } from './verifier.js';
import type { EvidenceStore } from './evidence-store.js';
import type { EvidenceBundleRecord, EvidenceReference, EvidenceVerificationResult } from './contracts.js';

/**
 * The Evidence Bundle orchestration surface (mission section "Verification
 * API" / "Lifecycle": `Governance Record -> Bundle Generated -> Bundle
 * Stored -> Bundle Verified -> Bundle Exported`). This is what HTTP handlers
 * and embedders call -- neither builds a Bundle nor touches the Governance
 * Store or Bundle Store directly. Tenant scoping is resolved from the
 * caller's credential exactly the way `GovernanceReadService` does, so an
 * Evidence Bundle can never be built from, or read from, a Governance
 * Record outside the caller's own scope.
 */
export interface BuildEvidenceBundleInput {
  readonly evaluationId: string;
  readonly level: string;
  readonly createdBy?: string;
  readonly references?: readonly EvidenceReference[];
}

export interface EvidenceService {
  build(authorizationHeader: string | undefined, input: BuildEvidenceBundleInput): Promise<EvidenceBundleRecord>;
  getByBundleId(authorizationHeader: string | undefined, bundleId: string): Promise<EvidenceBundleRecord | null>;
  listByEvaluationId(authorizationHeader: string | undefined, evaluationId: string): Promise<readonly EvidenceBundleRecord[]>;
  listByDecisionId(authorizationHeader: string | undefined, decisionId: string): Promise<readonly EvidenceBundleRecord[]>;
  verify(authorizationHeader: string | undefined, bundleId: string): Promise<EvidenceVerificationResult>;
}

export interface EvidenceServiceDependencies {
  readonly governanceStore: GovernanceStore;
  readonly evidenceStore: EvidenceStore;
  readonly configuration: EnterpriseConfiguration;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
}

export function createEvidenceService(deps: EvidenceServiceDependencies): EvidenceService {
  const { governanceStore, evidenceStore, configuration, now, nextId } = deps;

  return {
    async build(authorizationHeader, input) {
      const context = resolveGovernanceAccessContext(authorizationHeader, configuration);
      if (typeof input.evaluationId !== 'string' || input.evaluationId.length === 0) {
        throw new EvidenceError('EVIDENCE_VALIDATION_ERROR', 'evaluationId is required.');
      }
      if (typeof input.level !== 'string' || input.level.length === 0) {
        throw new EvidenceError('EVIDENCE_VALIDATION_ERROR', 'level is required.');
      }
      const policy = getDisclosurePolicy(input.level);
      const record = await governanceStore.getByEvaluationId(context, input.evaluationId);
      if (record === null) {
        throw new EvidenceError('EVIDENCE_SOURCE_RECORD_NOT_FOUND', `No Governance Record for evaluationId '${input.evaluationId}' within this scope.`);
      }
      const bundle = buildEvidenceBundle(record, policy, {
        now,
        nextId,
        ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
        ...(input.references !== undefined ? { references: input.references } : {}),
      });
      return evidenceStore.store(bundle);
    },

    async getByBundleId(authorizationHeader, bundleId) {
      const context = resolveGovernanceAccessContext(authorizationHeader, configuration);
      return evidenceStore.getByBundleId(context, bundleId);
    },

    async listByEvaluationId(authorizationHeader, evaluationId) {
      const context = resolveGovernanceAccessContext(authorizationHeader, configuration);
      return evidenceStore.listByEvaluationId(context, evaluationId);
    },

    async listByDecisionId(authorizationHeader, decisionId) {
      const context = resolveGovernanceAccessContext(authorizationHeader, configuration);
      return evidenceStore.listByDecisionId(context, decisionId);
    },

    async verify(authorizationHeader, bundleId) {
      const context = resolveGovernanceAccessContext(authorizationHeader, configuration);
      const stored = await evidenceStore.getByBundleId(context, bundleId);
      if (stored === null) {
        throw new EvidenceError('EVIDENCE_BUNDLE_NOT_FOUND', `No Evidence Bundle for bundleId '${bundleId}' within this scope.`);
      }
      let sourceRecord;
      try {
        sourceRecord = await governanceStore.getByEvaluationId(context, stored.bundle.source.evaluationId);
      } catch {
        sourceRecord = null;
      }
      const result = verifyEvidenceBundle(stored.bundle, { ...(sourceRecord !== null ? { record: sourceRecord } : {}), now });
      if (result.valid) {
        await evidenceStore.markVerified(bundleId);
      }
      return result;
    },
  };
}
