export class EvidenceRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SourceDocumentNotFoundError extends EvidenceRuntimeError {
  constructor(sourceDocumentId: string) {
    super(`Source document not found: ${sourceDocumentId}`);
  }
}

export class SourceDocumentDuplicateIdError extends EvidenceRuntimeError {
  constructor(sourceDocumentId: string) {
    super(`Duplicate source document id: ${sourceDocumentId}`);
  }
}

export class EvidenceArtifactNotFoundError extends EvidenceRuntimeError {
  constructor(evidenceArtifactId: string) {
    super(`Evidence artifact not found: ${evidenceArtifactId}`);
  }
}

export class EvidenceArtifactDuplicateIdError extends EvidenceRuntimeError {
  constructor(evidenceArtifactId: string) {
    super(`Duplicate evidence artifact id: ${evidenceArtifactId}`);
  }
}

export class EvidenceRequirementNotFoundError extends EvidenceRuntimeError {
  constructor(requirementId: string) {
    super(`Evidence requirement not found: ${requirementId}`);
  }
}

export class EvidenceSatisfactionInvalidError extends EvidenceRuntimeError {
  constructor(reason: string) {
    super(`Evidence satisfaction invalid: ${reason}`);
  }
}

export class EvidenceProofNotFoundError extends EvidenceRuntimeError {
  constructor(proofId: string) {
    super(`Evidence proof not found: ${proofId}`);
  }
}
