import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem, ExportPackageItemType } from '../domain/export-package-item.js';
import type { ExportPackageReference, ExportPackageReferenceType } from '../domain/export-package-reference.js';

interface ReferenceRule {
  readonly fromType: ExportPackageItemType;
  readonly field: string;
  readonly referenceType: ExportPackageReferenceType;
  readonly reasonCode: string;
}

/**
 * Every rule reads a single field already present on an ExportPackageItem's
 * payload (a verbatim copy of the source runtime record) and, if a package
 * item exists whose `sourceId` matches that field's value, creates a
 * reference between the two items. Nothing here infers a link the source
 * runtimes did not already record.
 */
const RULES: readonly ReferenceRule[] = [
  { fromType: 'policy_proof', field: 'decisionId', referenceType: 'verifies', reasonCode: 'POLICY_PROOF_VERIFIES_DECISION' },
  { fromType: 'evidence_proof', field: 'targetId', referenceType: 'supports', reasonCode: 'EVIDENCE_PROOF_SUPPORTS_TARGET' },
  { fromType: 'evidence_proof', field: 'sourceDocumentIds', referenceType: 'includes', reasonCode: 'EVIDENCE_PROOF_INCLUDES_SOURCE_DOCUMENT' },
  { fromType: 'evidence_proof', field: 'evidenceArtifactIds', referenceType: 'includes', reasonCode: 'EVIDENCE_PROOF_INCLUDES_EVIDENCE_ARTIFACT' },
  { fromType: 'evidence_proof', field: 'requirementIds', referenceType: 'includes', reasonCode: 'EVIDENCE_PROOF_INCLUDES_REQUIREMENT' },
  { fromType: 'evidence_proof', field: 'satisfactionIds', referenceType: 'includes', reasonCode: 'EVIDENCE_PROOF_INCLUDES_SATISFACTION' },
  { fromType: 'evidence_proof', field: 'reviewIds', referenceType: 'includes', reasonCode: 'EVIDENCE_PROOF_INCLUDES_REVIEW' },
  { fromType: 'evidence_proof', field: 'citationIds', referenceType: 'includes', reasonCode: 'EVIDENCE_PROOF_INCLUDES_CITATION' },
  { fromType: 'evidence_proof', field: 'evidenceLinkIds', referenceType: 'includes', reasonCode: 'EVIDENCE_PROOF_INCLUDES_EVIDENCE_LINK' },
  { fromType: 'approval_proof', field: 'approvalDecisionId', referenceType: 'verifies', reasonCode: 'APPROVAL_PROOF_VERIFIES_DECISION' },
  { fromType: 'approval_proof', field: 'approvalRequestId', referenceType: 'verifies', reasonCode: 'APPROVAL_PROOF_VERIFIES_REQUEST' },
  { fromType: 'approval_decision', field: 'approvalRequestId', referenceType: 'derived_from', reasonCode: 'APPROVAL_DECISION_DERIVED_FROM_REQUEST' },
  { fromType: 'enforcement_decision', field: 'authorityProofId', referenceType: 'requires', reasonCode: 'ENFORCEMENT_REQUIRES_AUTHORITY_PROOF' },
  { fromType: 'enforcement_decision', field: 'approvalProofId', referenceType: 'requires', reasonCode: 'ENFORCEMENT_REQUIRES_APPROVAL_PROOF' },
  { fromType: 'enforcement_decision', field: 'handshakeProofId', referenceType: 'requires', reasonCode: 'ENFORCEMENT_REQUIRES_HANDSHAKE_PROOF' },
  { fromType: 'enforcement_decision', field: 'policyDecisionId', referenceType: 'requires', reasonCode: 'ENFORCEMENT_REQUIRES_POLICY_DECISION' },
  { fromType: 'enforcement_decision', field: 'policyProofId', referenceType: 'requires', reasonCode: 'ENFORCEMENT_REQUIRES_POLICY_PROOF' },
  { fromType: 'enforcement_decision', field: 'recognitionDecisionId', referenceType: 'requires', reasonCode: 'ENFORCEMENT_REQUIRES_RECOGNITION_DECISION' },
  { fromType: 'enforcement_proof', field: 'enforcementDecisionId', referenceType: 'verifies', reasonCode: 'ENFORCEMENT_PROOF_VERIFIES_DECISION' },
  { fromType: 'enforcement_proof', field: 'executionResultId', referenceType: 'includes', reasonCode: 'ENFORCEMENT_PROOF_INCLUDES_EXECUTION_RESULT' },
  { fromType: 'execution_result', field: 'enforcementDecisionId', referenceType: 'derived_from', reasonCode: 'EXECUTION_DERIVED_FROM_DECISION' },
  { fromType: 'citation', field: 'sourceDocumentId', referenceType: 'cites', reasonCode: 'CITATION_CITES_SOURCE_DOCUMENT' },
  { fromType: 'citation', field: 'evidenceArtifactId', referenceType: 'cites', reasonCode: 'CITATION_CITES_EVIDENCE_ARTIFACT' },
  { fromType: 'evidence_link', field: 'evidenceArtifactId', referenceType: 'links_to', reasonCode: 'EVIDENCE_LINK_LINKS_ARTIFACT' },
  { fromType: 'evidence_satisfaction', field: 'requirementId', referenceType: 'satisfies', reasonCode: 'SATISFACTION_SATISFIES_REQUIREMENT' },
  { fromType: 'evidence_satisfaction', field: 'proofId', referenceType: 'verifies', reasonCode: 'SATISFACTION_VERIFIED_BY_PROOF' },
  { fromType: 'evidence_requirement', field: 'policyDecisionId', referenceType: 'requires', reasonCode: 'REQUIREMENT_REQUIRES_POLICY_DECISION' },
  { fromType: 'evidence_requirement', field: 'approvalRequestId', referenceType: 'requires', reasonCode: 'REQUIREMENT_REQUIRES_APPROVAL_REQUEST' },
  { fromType: 'evidence_requirement', field: 'recognitionDecisionId', referenceType: 'requires', reasonCode: 'REQUIREMENT_REQUIRES_RECOGNITION_DECISION' },
  { fromType: 'evidence_requirement', field: 'enforcementDecisionId', referenceType: 'requires', reasonCode: 'REQUIREMENT_REQUIRES_ENFORCEMENT_DECISION' },
  { fromType: 'recognition_decision', field: 'authorityProofId', referenceType: 'authorizes', reasonCode: 'RECOGNITION_AUTHORIZED_BY_AUTHORITY_PROOF' },
  { fromType: 'recognition_decision', field: 'approvalProofId', referenceType: 'approves', reasonCode: 'RECOGNITION_APPROVED_BY_APPROVAL_PROOF' },
  { fromType: 'authority_delegation', field: 'sourceAuthorityGrantId', referenceType: 'delegates', reasonCode: 'DELEGATION_DELEGATES_FROM_GRANT' },
];

export interface MissingReference {
  readonly fromItemId: string;
  readonly field: string;
  readonly targetSourceId: string;
  readonly reasonCode: string;
}

export interface ResolveReferencesResult {
  readonly references: readonly ExportPackageReference[];
  readonly missing: readonly MissingReference[];
}

function fieldValues(payload: Readonly<Record<string, unknown>>, field: string): readonly string[] {
  const raw = payload[field];
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === 'string');
  return typeof raw === 'string' ? [raw] : [];
}

/**
 * Resolves references purely from fields already present on each item's
 * payload -- it never re-evaluates a decision, never fetches additional
 * facts, and never invents a link between two items that the source
 * runtimes did not already record.
 */
export function resolveReferences(ctx: ExportRuntimeContext, items: readonly ExportPackageItem[]): ResolveReferencesResult {
  const bySourceId = new Map<string, ExportPackageItem>();
  for (const item of items) {
    bySourceId.set(item.sourceId, item);
  }

  const references: ExportPackageReference[] = [];
  const missing: MissingReference[] = [];

  for (const item of items) {
    for (const rule of RULES) {
      if (rule.fromType !== item.type) continue;
      for (const targetSourceId of fieldValues(item.payload, rule.field)) {
        const target = bySourceId.get(targetSourceId);
        if (target === undefined) {
          missing.push({ fromItemId: item.id, field: rule.field, targetSourceId, reasonCode: rule.reasonCode });
          continue;
        }
        if (target.id === item.id) continue;
        references.push({
          id: ctx.ids.nextId('export-reference'),
          type: rule.referenceType,
          fromItemId: item.id,
          toItemId: target.id,
          fromSourceId: item.sourceId,
          toSourceId: target.sourceId,
          reasonCode: rule.reasonCode,
          reason: `${item.type} "${item.sourceId}" ${rule.referenceType} ${target.type} "${target.sourceId}".`,
          createdAt: ctx.clock.now(),
        });
      }
    }
  }

  return { references, missing };
}
