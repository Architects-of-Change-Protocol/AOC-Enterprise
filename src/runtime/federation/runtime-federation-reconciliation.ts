import type { RuntimeFederationEnvelope, RuntimeFederationReconciliationResult } from './runtime-federation-types.js';
import { validateRuntimeFederationEnvelope } from './runtime-federation-validation.js';

export function reconcileRuntimeFederationEnvelopes(local: RuntimeFederationEnvelope, foreign: RuntimeFederationEnvelope): RuntimeFederationReconciliationResult {
  const validation = validateRuntimeFederationEnvelope(foreign, local.federationMetadata.trustDomain);
  const diagnostics = [...validation.diagnostics];
  if (!validation.valid) return { status: validation.errors.some((e) => e.includes('replay')) ? 'replay_conflict' : 'rejected', merged: local, diagnostics: [...diagnostics, ...validation.errors], validation };
  if (foreign.federationMetadata.federationEpoch < local.federationMetadata.federationEpoch || foreign.federationMetadata.federationSequence < local.federationMetadata.federationSequence) {
    return { status: 'continuity_conflict', merged: local, diagnostics: [...diagnostics, 'stale_federation_import'], validation };
  }
  if (foreign.lineage.lineageId === local.lineage.lineageId) {
    return { status: 'lineage_conflict', merged: local, diagnostics: [...diagnostics, 'duplicate_federation_lineage'], validation };
  }
  if (foreign.continuity.operationalSequenceNumber < local.continuity.operationalSequenceNumber) {
    return { status: 'continuity_conflict', merged: local, diagnostics: [...diagnostics, 'operational_rollback_attempt'], validation };
  }
  const mergedNonces = [...new Set([...local.replay.deniedNonces, ...foreign.replay.deniedNonces])].sort();
  const merged = { ...foreign, replay: { ...foreign.replay, deniedNonces: mergedNonces, replayDenialCount: mergedNonces.length }, lineage: { ...foreign.lineage, federationAncestry: [...new Set([...local.lineage.federationAncestry, ...foreign.lineage.federationAncestry])].sort() } };
  const status = mergedNonces.length === foreign.replay.deniedNonces.length ? 'accepted' : 'partially_merged';
  return { status, merged, diagnostics: [...diagnostics, 'reconciliation_complete'], validation };
}
