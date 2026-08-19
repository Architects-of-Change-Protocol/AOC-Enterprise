import type { CitationTargetType } from '../domain/citation.js';
import type { EvidenceEvent } from '../domain/evidence-event.js';
import type { EvidenceExportArtifact } from '../domain/evidence-export.js';
import type { EvidenceProof } from '../domain/evidence-proof.js';
import type { EvidenceRequirement } from '../domain/evidence-requirement.js';
import type { EvidenceValidationResult } from '../domain/evidence-validation.js';
import type { EvidenceRuntimeContext } from '../domain/evidence-runtime-context.js';
import { EvidenceRequirementNotFoundError } from './evidence-runtime-errors.js';
import { EvidenceStore } from './evidence-store.js';
import { EvidenceLedger } from './evidence-ledger.js';
import { SourceDocumentRegistry, type RegisterSourceDocumentInput } from './source-document-registry.js';
import { EvidenceArtifactRegistry, type SubmitEvidenceArtifactInput } from './evidence-artifact-registry.js';
import { EvidenceRequirementService, type CreateEvidenceRequirementInput } from './evidence-requirement-service.js';
import { EvidenceSatisfactionService, type SatisfyEvidenceRequirementInput } from './evidence-satisfaction-service.js';
import { EvidenceReviewService, type RecordEvidenceReviewInput } from './evidence-review-service.js';
import { CitationService, type CreateCitationInput } from './citation-service.js';
import { EvidenceLinkService, type CreateEvidenceLinkInput } from './evidence-link-service.js';
import { EvidenceProofService, type CreateEvidenceProofInput } from './evidence-proof-service.js';
import { EvidenceQueryService } from './evidence-query-service.js';
import { EvidenceExportService } from './evidence-export-service.js';

export type { RegisterSourceDocumentInput } from './source-document-registry.js';
export type { SubmitEvidenceArtifactInput } from './evidence-artifact-registry.js';
export type { CreateEvidenceRequirementInput } from './evidence-requirement-service.js';
export type { SatisfyEvidenceRequirementInput } from './evidence-satisfaction-service.js';
export type { RecordEvidenceReviewInput } from './evidence-review-service.js';
export type { CreateCitationInput } from './citation-service.js';
export type { CreateEvidenceLinkInput } from './evidence-link-service.js';
export type { CreateEvidenceProofInput } from './evidence-proof-service.js';

export interface ValidateEvidenceForTargetInput {
  readonly requirementIds: readonly string[];
  readonly targetType?: CitationTargetType;
  readonly targetId?: string;
  readonly createProof?: boolean;
}

export interface EvidenceTargetView {
  readonly citations: ReturnType<CitationService['listByTarget']>;
  readonly evidenceLinks: ReturnType<EvidenceLinkService['listByTarget']>;
  readonly proofs: readonly EvidenceProof[];
}

/**
 * Single composition root for the Evidence / Source / Citation Runtime.
 * Wires EvidenceStore, EvidenceLedger and every service together and
 * exposes the small, stable API surface other Soberanía runtimes and the demo/
 * control-plane adapters are expected to call. Sub-services remain
 * accessible directly (`runtime.sourceDocuments`, `runtime.proofs`, ...) for
 * callers that need finer control than the composed API offers.
 */
export class EvidenceRuntime {
  readonly store: EvidenceStore;
  readonly ledger: EvidenceLedger;
  readonly sourceDocuments: SourceDocumentRegistry;
  readonly evidenceArtifacts: EvidenceArtifactRegistry;
  readonly requirements: EvidenceRequirementService;
  readonly satisfactions: EvidenceSatisfactionService;
  readonly reviews: EvidenceReviewService;
  readonly citations: CitationService;
  readonly links: EvidenceLinkService;
  readonly proofs: EvidenceProofService;
  readonly query: EvidenceQueryService;
  readonly exportService: EvidenceExportService;

  constructor(private readonly ctx: EvidenceRuntimeContext) {
    this.store = new EvidenceStore();
    this.ledger = new EvidenceLedger(ctx, this.store);
    this.sourceDocuments = new SourceDocumentRegistry(ctx, this.store, this.ledger);
    this.evidenceArtifacts = new EvidenceArtifactRegistry(ctx, this.store, this.ledger);
    this.requirements = new EvidenceRequirementService(ctx, this.store, this.ledger);
    this.links = new EvidenceLinkService(ctx, this.store, this.ledger);
    this.proofs = new EvidenceProofService(ctx, this.store, this.ledger);
    this.satisfactions = new EvidenceSatisfactionService(ctx, this.store, this.ledger, this.requirements, this.links, this.proofs);
    this.reviews = new EvidenceReviewService(ctx, this.store, this.ledger, this.evidenceArtifacts, this.requirements);
    this.citations = new CitationService(ctx, this.store, this.ledger);
    this.query = new EvidenceQueryService(this.store);
    this.exportService = new EvidenceExportService(ctx, this.store);
  }

  registerSourceDocument(input: RegisterSourceDocumentInput): ReturnType<SourceDocumentRegistry['register']> {
    return this.sourceDocuments.register(input);
  }

  submitEvidenceArtifact(input: SubmitEvidenceArtifactInput): ReturnType<EvidenceArtifactRegistry['submit']> {
    return this.evidenceArtifacts.submit(input);
  }

  createEvidenceRequirement(input: CreateEvidenceRequirementInput): EvidenceRequirement {
    return this.requirements.create(input);
  }

  satisfyEvidenceRequirement(input: SatisfyEvidenceRequirementInput): ReturnType<EvidenceSatisfactionService['satisfy']> {
    return this.satisfactions.satisfy(input);
  }

  reviewEvidence(input: RecordEvidenceReviewInput): ReturnType<EvidenceReviewService['recordReview']> {
    return this.reviews.recordReview(input);
  }

  createCitation(input: CreateCitationInput): ReturnType<CitationService['createCitation']> {
    return this.citations.createCitation(input);
  }

  linkEvidence(input: CreateEvidenceLinkInput): ReturnType<EvidenceLinkService['createLink']> {
    return this.links.createLink(input);
  }

  createEvidenceProof(input: CreateEvidenceProofInput): EvidenceProof {
    return this.proofs.createProof(input);
  }

  /**
   * Checks whether current evidence on file satisfies the given
   * requirements. This is a completeness check only, never a legal
   * conclusion -- `valid: true` means every required evidence requirement
   * has accepted, current evidence attached, nothing more.
   */
  validateEvidenceForTarget(input: ValidateEvidenceForTargetInput): EvidenceValidationResult {
    const requirements = input.requirementIds.map((id) => {
      const requirement = this.store.getRequirement(id);
      if (!requirement) {
        throw new EvidenceRequirementNotFoundError(id);
      }
      return requirement;
    });

    const missingRequirementIds: string[] = [];
    const satisfiedRequirementIds: string[] = [];
    const rejectedEvidenceArtifactIds = new Set<string>();
    const expiredEvidenceArtifactIds = new Set<string>();
    const staleSourceDocumentIds = new Set<string>();

    for (const requirement of requirements) {
      const satisfactions = this.store.listSatisfactionsByRequirement(requirement.id);
      let requirementHasRejectedEvidence = false;
      let requirementHasExpiredEvidence = false;
      for (const satisfaction of satisfactions) {
        for (const artifactId of satisfaction.evidenceArtifactIds) {
          const artifact = this.store.getEvidenceArtifact(artifactId);
          if (!artifact) {
            continue;
          }
          if (artifact.status === 'rejected' || artifact.status === 'revoked') {
            rejectedEvidenceArtifactIds.add(artifactId);
            requirementHasRejectedEvidence = true;
          }
          if (artifact.status === 'expired') {
            expiredEvidenceArtifactIds.add(artifactId);
            requirementHasExpiredEvidence = true;
          }
          if (artifact.sourceDocumentId !== undefined) {
            const sourceDocument = this.store.getSourceDocument(artifact.sourceDocumentId);
            if (sourceDocument && (sourceDocument.status === 'expired' || sourceDocument.status === 'revoked' || sourceDocument.status === 'superseded')) {
              staleSourceDocumentIds.add(sourceDocument.id);
            }
          }
        }
      }

      const isSatisfied = requirement.status === 'satisfied' || requirement.status === 'partially_satisfied' || requirement.status === 'waived';
      if (isSatisfied) {
        satisfiedRequirementIds.push(requirement.id);
      } else if (requirement.required && !requirementHasRejectedEvidence && !requirementHasExpiredEvidence) {
        // Only genuinely-unattempted requirements count as "missing" -- a requirement
        // with rejected/expired evidence already attached is reported via
        // rejectedEvidenceArtifactIds/expiredEvidenceArtifactIds instead, so a caller
        // (e.g. the Action Enforcement integration) can tell "never attempted" apart
        // from "attempted, but the evidence was no good".
        missingRequirementIds.push(requirement.id);
      }
    }

    const valid = missingRequirementIds.length === 0 && rejectedEvidenceArtifactIds.size === 0 && expiredEvidenceArtifactIds.size === 0;
    const reasonCode = valid ? 'EVIDENCE_SATISFIED' : missingRequirementIds.length > 0 ? 'EVIDENCE_MISSING' : rejectedEvidenceArtifactIds.size > 0 ? 'EVIDENCE_REJECTED' : 'EVIDENCE_EXPIRED';
    const reason = valid
      ? 'All required evidence requirements are satisfied with accepted, current evidence.'
      : `Evidence is not sufficient to satisfy every required requirement (${reasonCode}).`;

    let proofId: string | undefined;
    if (input.createProof === true) {
      const evidenceArtifactIds = [...new Set(requirements.flatMap((requirement) => this.store.listSatisfactionsByRequirement(requirement.id).flatMap((satisfaction) => satisfaction.evidenceArtifactIds)))];
      const proof = this.proofs.createProof({
        trustDomainId: requirements[0]?.trustDomainId ?? 'unknown',
        requirementIds: input.requirementIds,
        evidenceArtifactIds,
        ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
        ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      });
      proofId = proof.id;
    }

    return {
      id: this.ctx.ids.nextId('evidence-validation'),
      valid,
      reasonCode,
      reason,
      missingRequirementIds,
      rejectedEvidenceArtifactIds: [...rejectedEvidenceArtifactIds],
      expiredEvidenceArtifactIds: [...expiredEvidenceArtifactIds],
      staleSourceDocumentIds: [...staleSourceDocumentIds],
      requirementIds: input.requirementIds,
      satisfiedRequirementIds,
      createdAt: this.ctx.clock.now(),
      ...(proofId !== undefined ? { proofId } : {}),
    };
  }

  exportEvidenceTrail(requirementId: string): EvidenceExportArtifact {
    return this.exportService.exportEvidenceTraceMarkdown(requirementId);
  }

  getEvidenceTrail(proofId: string): readonly EvidenceEvent[] {
    return this.ledger.getTrailByProof(proofId);
  }

  getEvidenceProof(proofId: string): EvidenceProof {
    return this.proofs.getProof(proofId);
  }

  listEvidenceByTarget(targetType: CitationTargetType, targetId: string): EvidenceTargetView {
    return {
      citations: this.citations.listByTarget(targetType, targetId),
      evidenceLinks: this.links.listByTarget(targetType, targetId),
      proofs: this.store.listProofsByTarget(targetType, targetId),
    };
  }

  listOpenRequirements(): readonly EvidenceRequirement[] {
    return this.store.listOpenRequirements();
  }
}

export function createEvidenceRuntime(ctx: EvidenceRuntimeContext): EvidenceRuntime {
  return new EvidenceRuntime(ctx);
}
