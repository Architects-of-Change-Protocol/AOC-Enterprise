import type { RuntimePersistenceEnvelope } from '../persistence';
import type { RuntimeOperationalSnapshot } from '../state';

export const RUNTIME_FEDERATION_COMPATIBILITY_VERSION = 1;

export type RuntimeFederationReconciliationStatus = 'accepted' | 'rejected' | 'partially_merged' | 'continuity_conflict' | 'replay_conflict' | 'lineage_conflict';

export interface RuntimeFederationIdentity { federationRuntimeId: string; federationNodeId: string; sovereignVaultId: string; trustDomain: string; federationEpoch: number; federationSequence: number; continuityLineageId: string; restorationLineageId: string; federationCompatibilityVersion: number; }
export interface RuntimeFederationLineage { lineageId: string; continuityAncestry: string[]; restorationAncestry: string[]; federationAncestry: string[]; lastOperationalSequenceNumber: number; continuityEpoch: number; continuityVersion: number; }
export interface RuntimeFederationReplayContext { deniedNonces: string[]; deniedNonceLineageId: string; lastDeniedAt?: string; replayDenialCount: number; }
export interface RuntimeFederationContinuityContext { operational: RuntimeOperationalSnapshot; persistence: RuntimePersistenceEnvelope; continuityEpoch: number; continuityVersion: number; operationalSequenceNumber: number; }
export interface RuntimeFederationAttestation { federationIntegrityFingerprint: string; continuityIntegrityFingerprint: string; replayIntegrityFingerprint: string; lineageIntegrityFingerprint: string; attestedAt: string; attestationVersion: number; }
export interface RuntimeFederationEnvelope { envelopeType: 'aoc.runtime.federation.envelope'; envelopeVersion: 1; createdAt: string; federationMetadata: RuntimeFederationIdentity; continuity: RuntimeFederationContinuityContext; replay: RuntimeFederationReplayContext; lineage: RuntimeFederationLineage; attestation: RuntimeFederationAttestation; }
export interface RuntimeFederationValidationReport { valid: boolean; errors: string[]; warnings: string[]; diagnostics: string[]; }
export interface RuntimeFederationReconciliationResult { status: RuntimeFederationReconciliationStatus; merged: RuntimeFederationEnvelope; diagnostics: string[]; validation: RuntimeFederationValidationReport; }
export interface RuntimeFederationAdapter { exportFederationEnvelope(now?: string): RuntimeFederationEnvelope; importFederationEnvelope(envelope: RuntimeFederationEnvelope): RuntimeFederationValidationReport; validateFederationEnvelope(envelope: RuntimeFederationEnvelope): RuntimeFederationValidationReport; reconcileFederationState(envelope: RuntimeFederationEnvelope): RuntimeFederationReconciliationResult; attestFederationIntegrity(envelope: RuntimeFederationEnvelope): RuntimeFederationAttestation; }
export interface RuntimeFederationManager extends RuntimeFederationAdapter {}
