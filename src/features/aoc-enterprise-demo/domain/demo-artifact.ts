export type DemoArtifactReferenceKind =
  | 'recognition_decision'
  | 'authority_proof'
  | 'approval_proof'
  | 'handshake_proof'
  | 'enforcement_decision'
  | 'enforcement_proof'
  | 'execution_result';

/** A display-safe pointer to a real runtime object id, used to label proof/decision references in exports and snapshots without duplicating runtime state. */
export interface DemoArtifactReference {
  readonly id: string;
  readonly kind: DemoArtifactReferenceKind;
  readonly label: string;
  readonly refId: string;
}
