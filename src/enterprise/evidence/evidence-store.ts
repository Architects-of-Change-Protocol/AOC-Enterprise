import type { GovernanceStoreAccessContext } from '../governance-store/contracts.js';
import { EvidenceError } from './errors.js';
import type { EvidenceBundle, EvidenceBundleRecord, EvidenceBundleState } from './contracts.js';

/**
 * The Bundle Store (mission section "Bundle Store"): storage for Evidence
 * Bundles, deliberately independent of the Governance Store -- "No guardar
 * Bundles dentro del Governance Store." Bundles themselves are immutable;
 * this store's only mutable state is lifecycle bookkeeping
 * (`EvidenceBundleState`), tracked per `bundleId`, never a rewrite of the
 * bundle's own content. There is no update method and none may be added.
 *
 * Query surface is deliberately bounded to a Bundle's own identifiers
 * (mission: "No exponer queries masivas") -- there is no arbitrary filter or
 * cross-tenant listing here.
 */
export interface EvidenceStore {
  readonly providerKind: 'memory';

  /** Stores a newly built, immutable Bundle. Throws `EVIDENCE_BUNDLE_ALREADY_EXISTS` if `bundleId` was already stored -- Bundles are never overwritten. */
  store(bundle: EvidenceBundle): Promise<EvidenceBundleRecord>;

  getByBundleId(context: GovernanceStoreAccessContext, bundleId: string): Promise<EvidenceBundleRecord | null>;
  listByEvaluationId(context: GovernanceStoreAccessContext, evaluationId: string): Promise<readonly EvidenceBundleRecord[]>;
  listByDecisionId(context: GovernanceStoreAccessContext, decisionId: string): Promise<readonly EvidenceBundleRecord[]>;

  /** Records that this Bundle has been successfully verified. Never mutates the Bundle itself -- only the store's lifecycle bookkeeping. */
  markVerified(bundleId: string): Promise<EvidenceBundleRecord>;
  /** Records that this Bundle has been exported to a consumer. */
  markExported(bundleId: string): Promise<EvidenceBundleRecord>;
  /**
   * Records that this Bundle has been superseded by a newly built
   * replacement -- the mission's "Supersession": a changed disclosure
   * policy never updates an existing Bundle, it always produces a new one,
   * and the old one is marked superseded rather than deleted.
   */
  supersede(bundleId: string, replacementBundleId: string): Promise<EvidenceBundleRecord>;

  close(): Promise<void>;
}

export interface CreateEvidenceStoreOptions {
  readonly now?: () => string;
}

function canSeeBundle(context: GovernanceStoreAccessContext, bundleOrganizationId: string | undefined): boolean {
  if (context.system) return true;
  return bundleOrganizationId !== undefined && bundleOrganizationId === context.organizationId;
}

function requireReadScope(context: GovernanceStoreAccessContext): void {
  if (!context.system && (context.organizationId === undefined || context.organizationId.length === 0)) {
    throw new EvidenceError('EVIDENCE_TENANT_SCOPE_REQUIRED', 'A non-system caller must provide an organization scope for Evidence Bundle reads.');
  }
}

/** In-memory Bundle Store. Atomicity comes from the synchronous commit sections (single-threaded JS) -- no `await` sits between a lookup and its corresponding index update. */
export function createInMemoryEvidenceStore(options: CreateEvidenceStoreOptions = {}): EvidenceStore {
  const now = options.now ?? (() => new Date().toISOString());
  const bundlesById = new Map<string, EvidenceBundleRecord>();
  const bundleIdsByEvaluationId = new Map<string, string[]>();
  const bundleIdsByDecisionId = new Map<string, string[]>();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new EvidenceError('EVIDENCE_STORE_UNAVAILABLE', 'The Evidence Bundle Store has been closed.');
  }

  function requireStored(bundleId: string): EvidenceBundleRecord {
    const existing = bundlesById.get(bundleId);
    if (existing === undefined) {
      throw new EvidenceError('EVIDENCE_BUNDLE_NOT_FOUND', `No Evidence Bundle for bundleId '${bundleId}'.`);
    }
    return existing;
  }

  function transition(bundleId: string, state: EvidenceBundleState, supersededBy?: string): EvidenceBundleRecord {
    assertOpen();
    const existing = requireStored(bundleId);
    const updated: EvidenceBundleRecord = { ...existing, state, ...(supersededBy !== undefined ? { supersededBy } : {}) };
    bundlesById.set(bundleId, updated);
    return updated;
  }

  return {
    providerKind: 'memory',

    async store(bundle: EvidenceBundle): Promise<EvidenceBundleRecord> {
      assertOpen();
      if (bundlesById.has(bundle.bundleId)) {
        throw new EvidenceError('EVIDENCE_BUNDLE_ALREADY_EXISTS', `bundleId '${bundle.bundleId}' was already stored; Bundles are immutable and never overwritten.`);
      }
      const record: EvidenceBundleRecord = { bundle, state: 'GENERATED', storedAt: now() };

      // Synchronous commit section -- the bundle and both indices commit together.
      bundlesById.set(bundle.bundleId, record);
      const byEvaluation = bundleIdsByEvaluationId.get(bundle.source.evaluationId) ?? [];
      bundleIdsByEvaluationId.set(bundle.source.evaluationId, [...byEvaluation, bundle.bundleId]);
      const byDecision = bundleIdsByDecisionId.get(bundle.source.decisionId) ?? [];
      bundleIdsByDecisionId.set(bundle.source.decisionId, [...byDecision, bundle.bundleId]);

      return record;
    },

    async getByBundleId(context, bundleId) {
      assertOpen();
      requireReadScope(context);
      const record = bundlesById.get(bundleId);
      if (record === undefined) return null;
      return canSeeBundle(context, record.bundle.source.organizationId) ? record : null;
    },

    async listByEvaluationId(context, evaluationId) {
      assertOpen();
      requireReadScope(context);
      const ids = bundleIdsByEvaluationId.get(evaluationId) ?? [];
      return ids
        .map((id) => bundlesById.get(id))
        .filter((record): record is EvidenceBundleRecord => record !== undefined && canSeeBundle(context, record.bundle.source.organizationId));
    },

    async listByDecisionId(context, decisionId) {
      assertOpen();
      requireReadScope(context);
      const ids = bundleIdsByDecisionId.get(decisionId) ?? [];
      return ids
        .map((id) => bundlesById.get(id))
        .filter((record): record is EvidenceBundleRecord => record !== undefined && canSeeBundle(context, record.bundle.source.organizationId));
    },

    async markVerified(bundleId) {
      return transition(bundleId, 'VERIFIED');
    },
    async markExported(bundleId) {
      return transition(bundleId, 'EXPORTED');
    },
    async supersede(bundleId, replacementBundleId) {
      return transition(bundleId, 'SUPERSEDED', replacementBundleId);
    },

    async close() {
      closed = true;
    },
  };
}
