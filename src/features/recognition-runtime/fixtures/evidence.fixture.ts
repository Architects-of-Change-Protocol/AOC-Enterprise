import type { EvidenceItem } from '../domain/evidence.js';

export const emailThreadEvidence: EvidenceItem = {
  type: 'email_thread',
  reference: 'thread:HMP-14665-closure',
  description: 'Email thread confirming project closure details.',
};

export const projectContextEvidence: EvidenceItem = {
  type: 'project_context',
  reference: 'project:HMP-14665/context',
  description: 'Project status snapshot for HMP-14665.',
};

export const closureEmailEvidence: readonly EvidenceItem[] = [emailThreadEvidence, projectContextEvidence];
