import type { PMFreakEvidenceRequirement } from './pmfreak-agent-passport-types.js';

/**
 * PMFreak evidence requirement catalog. Every entry describes an
 * operational evidence signal an action may require before Soberanía Enterprise
 * allows a PMFreak agent to proceed -- never a legal-completeness or
 * contractual-compliance certification. See this pack's README.
 */
export const PMFREAK_EVIDENCE_REQUIREMENTS: readonly PMFreakEvidenceRequirement[] = [
  {
    evidenceRequirementId: 'pmfreak.evidence.project_status_source',
    title: 'Project status source',
    description: 'A source reflecting current project status, used to detect schedule variance.',
    evidenceType: 'project_status_source',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.schedule_baseline',
    title: 'Schedule baseline',
    description: 'The project schedule baseline an agent compares current status against.',
    evidenceType: 'schedule_baseline',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.dependency_record',
    title: 'Dependency record',
    description: 'A record identifying a project dependency relevant to a schedule or risk assessment.',
    evidenceType: 'dependency_record',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.risk_record',
    title: 'Risk record',
    description: 'A recorded project risk, including its current status and any mitigation.',
    evidenceType: 'risk_record',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.deliverable_evidence',
    title: 'Deliverable evidence',
    description: 'Evidence that a project deliverable exists and matches its scope statement.',
    evidenceType: 'deliverable_evidence',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.customer_acceptance_record',
    title: 'Customer acceptance record',
    description: 'A record that the customer has acknowledged a deliverable -- an operational signal only, never a legal certification of acceptance.',
    evidenceType: 'customer_acceptance_record',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.pm_approval_record',
    title: 'PM approval record',
    description: 'A record that a project manager has reviewed and approved the action in question.',
    evidenceType: 'pm_approval_record',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.change_request_record',
    title: 'Change request record',
    description: 'A record of a submitted project change request.',
    evidenceType: 'change_request_record',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.billing_milestone_record',
    title: 'Billing milestone record',
    description: 'A record identifying the billing milestone under evaluation -- an operational signal, never a guarantee of invoice validity.',
    evidenceType: 'billing_milestone_record',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.client_communication_draft',
    title: 'Client communication draft',
    description: 'A drafted client-facing communication awaiting review before it may be sent.',
    evidenceType: 'client_communication_draft',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.meeting_minutes',
    title: 'Meeting minutes',
    description: 'Recorded minutes from a project meeting.',
    evidenceType: 'meeting_minutes',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.scope_statement',
    title: 'Scope statement',
    description: 'The project scope statement a deliverable or change request is evaluated against.',
    evidenceType: 'scope_statement',
    required: true,
  },
  {
    evidenceRequirementId: 'pmfreak.evidence.contract_reference',
    title: 'Contract reference',
    description: 'A reference to the governing contract -- surfaced for review routing only, never interpreted or certified by this pack.',
    evidenceType: 'contract_reference',
    required: true,
  },
];

export function findPMFreakEvidenceRequirement(evidenceRequirementId: string): PMFreakEvidenceRequirement | undefined {
  return PMFREAK_EVIDENCE_REQUIREMENTS.find((requirement) => requirement.evidenceRequirementId === evidenceRequirementId);
}
