import { createHash } from 'crypto';

import type { ExportPackageSection } from './export-package-section.js';
import type { ExportPackageRecipient } from './export-package-recipient.js';

export type ExportPackageType =
  | 'decision_packet'
  | 'audit_bundle'
  | 'policy_decision_packet'
  | 'enforcement_decision_packet'
  | 'approval_decision_packet'
  | 'evidence_packet'
  | 'control_plane_snapshot_packet'
  | 'enterprise_demo_packet';

export type ExportPackageStatus = 'draft' | 'sealed' | 'verified' | 'verification_failed' | 'revoked' | 'superseded';

export type ExportPackageTargetType =
  | 'recognition_decision'
  | 'authority_proof'
  | 'approval_request'
  | 'approval_decision'
  | 'approval_proof'
  | 'external_handshake'
  | 'policy_decision'
  | 'policy_proof'
  | 'evidence_proof'
  | 'enforcement_request'
  | 'enforcement_decision'
  | 'enforcement_proof'
  | 'execution_result'
  | 'demo_scenario'
  | 'control_plane_snapshot'
  | 'audit_scope';

export interface ExportPackage {
  readonly id: string;

  readonly type: ExportPackageType;

  readonly title: string;
  readonly description: string;

  readonly status: ExportPackageStatus;

  readonly trustDomainId: string;

  readonly targetType: ExportPackageTargetType;
  readonly targetId: string;

  readonly packageVersion: string;

  readonly sections: readonly ExportPackageSection[];

  readonly manifestId?: string;
  readonly integrityReportId?: string;
  readonly verificationId?: string;

  readonly packageHash?: string;
  readonly previousPackageHash?: string;

  readonly createdAt: string;
  readonly sealedAt?: string;
  readonly verifiedAt?: string;

  readonly createdByActorId?: string;

  readonly recipient?: ExportPackageRecipient;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// Recursively sorts object keys so hashing never depends on insertion order.
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortValue(entryValue);
    }
    return sorted;
  }
  return value;
}

export function createDigest(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
