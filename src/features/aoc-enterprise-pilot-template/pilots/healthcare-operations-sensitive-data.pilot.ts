import type { PilotTemplate } from '../domain/pilot-template.js';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN_ID = 'trust-domain-healthcare-agent-republic';

const BUYER_OPS_DIRECTOR_PERSONA_ID = 'persona-buyer-healthcare-operations-director';
const BUYER_CIO_PERSONA_ID = 'persona-buyer-cio';
const BUYER_DPO_PERSONA_ID = 'persona-buyer-data-protection-officer';
const BUYER_COMPLIANCE_LEAD_PERSONA_ID = 'persona-buyer-compliance-lead';
const OPERATOR_OPS_COORDINATOR_PERSONA_ID = 'persona-operator-operations-coordinator';
const OPERATOR_COMPLIANCE_REVIEWER_PERSONA_ID = 'persona-operator-compliance-reviewer';
const OPERATOR_DATA_STEWARD_PERSONA_ID = 'persona-operator-data-steward';
const OPERATOR_SECURITY_ANALYST_PERSONA_ID = 'persona-operator-security-analyst';

/**
 * Healthcare Operations / Sensitive Data / Approval Pilot -- shows how AOC
 * governs sensitive operational actions in a healthcare-like setting
 * WITHOUT claiming HIPAA, GDPR or any other healthcare regulatory
 * compliance: low-risk reads are allowed with a policy warning, sensitive
 * data export requires compliance approval, prohibited exports are denied
 * outright, and evidence gates operational handoffs. Orchestrates existing
 * runtime truth only.
 */
export const HEALTHCARE_OPERATIONS_SENSITIVE_DATA_PILOT_TEMPLATE: PilotTemplate = {
  id: 'healthcare-operations-sensitive-data',
  name: 'Healthcare Operations / Sensitive Data / Approval Pilot',
  description:
    'A bounded pilot showing how AOC creates enforceable guardrails for sensitive operational agents in a healthcare-like setting: low-risk reads are recognized and policy-warned, sensitive data exports require compliance approval, prohibited exports are denied, and evidence gates operational handoffs -- all without claiming healthcare regulatory compliance.',
  status: 'draft',
  industry: 'healthcare',
  primaryUseCase: 'Sensitive operational actions in a healthcare-like setting governed end-to-end by AOC, without any regulatory compliance claim.',
  businessPain:
    'Healthcare operations leadership cannot let an autonomous agent read, export, or hand off sensitive operational data without policy-enforced guardrails, human approval where required, and an auditable evidence trail -- and they cannot accept a vendor claiming regulatory compliance it has not actually earned.',
  aocValueProposition:
    'AOC can create enforceable guardrails for sensitive operational agents while preserving operator visibility and audit trails -- the Domain Policy Pack Runtime, Evidence / Source / Citation Runtime, Approval Runtime and Action Enforcement jointly decide, and the Control Plane and Verifiable Export Package prove, that every sensitive action was actually gated.',
  targetBuyerPersonaIds: [BUYER_OPS_DIRECTOR_PERSONA_ID, BUYER_CIO_PERSONA_ID, BUYER_DPO_PERSONA_ID, BUYER_COMPLIANCE_LEAD_PERSONA_ID],
  targetOperatorPersonaIds: [OPERATOR_OPS_COORDINATOR_PERSONA_ID, OPERATOR_COMPLIANCE_REVIEWER_PERSONA_ID, OPERATOR_DATA_STEWARD_PERSONA_ID, OPERATOR_SECURITY_ANALYST_PERSONA_ID],
  trustDomainId: TRUST_DOMAIN_ID,
  scope: {
    inScope: [
      'Reading an operational summary (low-risk, policy-warned, allowed)',
      'Exporting sensitive operational data, gated on compliance approval',
      'Blocking export of a prohibited operational-data category outright',
      'Requiring evidence (a data classification record) before an operational handoff proceeds',
    ],
    outOfScope: [
      'Not a determination of HIPAA, GDPR, Costa Rica health-data law, EU AI Act, or other healthcare regulatory compliance',
      'Real patient or protected health information -- synthetic operational data only',
      'Real clinical decision-making of any kind',
    ],
    durationDays: 21,
    environments: 'sandbox',
    dataSensitivity: 'synthetic_only',
    legalCompleteness: 'demo_policy_model',
    assumptions: ['A compliance reviewer role is staffed for the pilot duration.', 'All operational data used is synthetic and non-clinical.'],
    constraints: ['No production healthcare system access.', 'No real patient data of any kind.'],
  },
  actors: [
    { id: 'healthcare-actor-ops-agent', name: 'Operations Agent', actorType: 'internal_agent', role: 'Autonomous operations agent', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
    { id: 'healthcare-actor-compliance-reviewer', name: 'Compliance Reviewer', actorType: 'human', role: 'Compliance approval role', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
    { id: 'healthcare-actor-data-steward', name: 'Data Steward', actorType: 'human', role: 'Data classification / evidence reviewer', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
  ],
  agents: [
    {
      id: 'healthcare-agent-ops-agent',
      name: 'Operations Agent',
      agentType: 'data_agent',
      ownerActorId: 'healthcare-actor-ops-agent',
      trustDomainId: TRUST_DOMAIN_ID,
      allowedActions: ['read_project_summary'],
      deniedActions: ['export_client_data'],
      requiredCapabilities: ['healthcare-capability-read-operational-summary'],
    },
  ],
  capabilities: [
    { id: 'healthcare-capability-read-operational-summary', name: 'Read operational summary', description: 'Low-risk, recognized read of an operational summary record.', action: 'read_project_summary', resourceScope: 'operational-record:demo-0001', riskLevel: 'low', requiredAuthority: false, requiredApproval: false, requiredEvidence: false, policyPackSensitive: true },
    { id: 'healthcare-capability-export-sensitive-data', name: 'Export sensitive operational data', description: 'Exports sensitive operational data; gated on compliance approval, denied when prohibited.', action: 'export_client_data', resourceScope: 'dataset:operational-records', riskLevel: 'high', requiredAuthority: true, requiredApproval: true, requiredEvidence: true, policyPackSensitive: true },
    { id: 'healthcare-capability-prepare-handoff-support', name: 'Prepare operational handoff support', description: 'Assembles operational handoff material; gated on data classification evidence.', action: 'prepare_invoice_support', resourceScope: 'operational-record:demo-0001', riskLevel: 'medium', requiredAuthority: true, requiredApproval: false, requiredEvidence: true, policyPackSensitive: true },
  ],
  authorityModel: {
    authorityGrantIds: ['healthcare-authority-grant-ops-agent'],
    delegationGrantIds: [],
    authorityProofIds: [],
    requiredCapabilities: ['healthcare-capability-export-sensitive-data', 'healthcare-capability-prepare-handoff-support'],
    description: 'Every sensitive-data-export or handoff-support action is checked against an explicit Authority Graph grant before policy/approval gates are evaluated.',
    walkthrough: ['Open Authority in the Control Plane and confirm the Operations Agent has a grant covering the operational dataset.'],
  },
  approvalModel: {
    approvalRoleIds: ['healthcare-approval-role-compliance-reviewer'],
    approvalRequestIds: [],
    approvalDecisionIds: [],
    approvalProofIds: [],
    approvalScenarios: [{ action: 'export_client_data', expectedApprovalBehavior: 'required', description: 'Exporting sensitive operational data requires a compliance approval unless the category is prohibited from export entirely.' }],
    walkthrough: ['Open Approvals in the Control Plane and locate the pending compliance approval request for the sensitive data export.'],
  },
  policyModel: {
    policyPackIds: ['policy-pack-data-boundary-basic', 'policy-pack-jurisdictional-baseline-demo'],
    policyPackVersionIds: ['policy-pack-data-boundary-basic-v1', 'policy-pack-jurisdictional-baseline-demo-v1'],
    demoOnly: true,
    legalCompleteness: 'demo_policy_model',
    policyScenarios: [
      { action: 'read_project_summary', expectedPolicyBehavior: 'warning', description: 'Low-risk operational reads are allowed with a policy warning, never blocked.' },
      { action: 'export_client_data', expectedPolicyBehavior: 'requires_approval', description: 'data-boundary-basic requires compliance approval for sensitive operational data export.' },
      { action: 'prepare_invoice_support', expectedPolicyBehavior: 'requires_evidence', description: 'A data classification record is required before operational handoff support may proceed.' },
    ],
    walkthrough: ['Open Policy Packs in the Control Plane and confirm data-boundary-basic (and, if bound, jurisdictional-baseline-demo) are active and explicitly demo-only.'],
  },
  evidenceModel: {
    sourceDocumentIds: [],
    evidenceArtifactIds: [],
    evidenceRequirementIds: [],
    evidenceSatisfactionIds: [],
    evidenceProofIds: [],
    citationIds: [],
    evidenceScenarios: [
      { action: 'export_client_data', requiredEvidenceTypes: ['data_classification', 'risk_assessment'], expectedEvidenceBehavior: 'satisfied', description: 'A data classification record and risk assessment support the compliance approval decision for sensitive data export.' },
      { action: 'prepare_invoice_support', requiredEvidenceTypes: ['data_classification'], expectedEvidenceBehavior: 'satisfied', description: 'A data classification record must be attached before operational handoff support proceeds -- illustrated with the same evidence-gating pattern the Evidence Runtime already exercises for invoice support.' },
    ],
    walkthrough: ['Open Evidence and confirm the data classification record and approval memo are accepted and cited against the compliance approval decision.'],
  },
  actions: [
    { id: 'healthcare-action-read-operational-summary', name: 'Read operational summary', description: 'A low-risk read of an operational summary.', actorId: 'healthcare-actor-ops-agent', agentId: 'healthcare-agent-ops-agent', action: 'read_project_summary', capability: 'healthcare-capability-read-operational-summary', resourceScope: 'operational-record:demo-0001', riskLevel: 'low', expectedRecognition: 'allowed', expectedAuthority: 'not_required', expectedApproval: 'not_required', expectedPolicy: 'warning', expectedEvidence: 'not_required', expectedEnforcement: 'execute_allowed', expectedExecution: 'executed' },
    { id: 'healthcare-action-export-sensitive-data', name: 'Export sensitive operational data', description: 'Exporting sensitive operational data requires compliance approval.', actorId: 'healthcare-actor-compliance-reviewer', action: 'export_client_data', capability: 'healthcare-capability-export-sensitive-data', resourceScope: 'dataset:operational-records', riskLevel: 'high', expectedRecognition: 'allowed', expectedAuthority: 'valid', expectedApproval: 'required', expectedPolicy: 'requires_approval', expectedEvidence: 'not_required', expectedEnforcement: 'approval_required', expectedExecution: 'not_executed' },
    { id: 'healthcare-action-export-prohibited-data', name: 'Export prohibited operational data', description: 'Exporting a prohibited operational-data category is denied outright.', actorId: 'healthcare-actor-ops-agent', agentId: 'healthcare-agent-ops-agent', action: 'export_client_data', capability: 'healthcare-capability-export-sensitive-data', resourceScope: 'dataset:operational-records-restricted', riskLevel: 'high', expectedRecognition: 'denied', expectedAuthority: 'not_required', expectedApproval: 'not_required', expectedPolicy: 'denied', expectedEvidence: 'not_required', expectedEnforcement: 'execution_blocked', expectedExecution: 'not_executed' },
    { id: 'healthcare-action-prepare-handoff-support', name: 'Prepare operational handoff support', description: 'Operational handoff support is blocked until a data classification record is attached.', actorId: 'healthcare-actor-ops-agent', agentId: 'healthcare-agent-ops-agent', action: 'prepare_invoice_support', capability: 'healthcare-capability-prepare-handoff-support', resourceScope: 'operational-record:demo-0001', riskLevel: 'medium', expectedRecognition: 'requires_evidence', expectedAuthority: 'valid', expectedApproval: 'not_required', expectedPolicy: 'requires_evidence', expectedEvidence: 'missing', expectedEnforcement: 'evidence_required', expectedExecution: 'not_executed' },
  ],
  scenarios: [
    {
      id: 'healthcare-scenario-low-risk-read',
      name: 'Operational summary read (allowed with policy warning)',
      description: 'A low-risk operational read is recognized, policy-warned but allowed, and executed.',
      demoScenarioId: 'policy-pack-low-risk-read-warning-allowed',
      actionIds: ['healthcare-action-read-operational-summary'],
      expectedOutcome: 'warning_allowed',
      controlPlaneFocus: 'enforcement',
      exportPackageType: 'decision_packet',
      buyerMessage: 'Even routine operational reads flow through the same governed pipeline.',
      operatorMessage: 'Open Enforcement to see the execute_allowed decision and the policy warning that matched.',
      technicalMessage: 'AocGuard.enforce() returns execute_allowed with a policy warning reason code; the executor runs.',
      acceptanceCriterionIds: ['healthcare-acceptance-scenarios-pass'],
      successMetricIds: ['healthcare-metric-operator-visibility'],
    },
    {
      id: 'healthcare-scenario-sensitive-export-requires-approval',
      name: 'Sensitive data export requires compliance approval',
      description: 'export_client_data for sensitive operational data is blocked until a compliance approval exists.',
      demoScenarioId: 'policy-pack-sensitive-data-export-requires-compliance',
      actionIds: ['healthcare-action-export-sensitive-data'],
      expectedOutcome: 'approval_required',
      controlPlaneFocus: 'approvals',
      exportPackageType: 'approval_decision_packet',
      buyerMessage: 'Sensitive operational data never leaves the boundary without a compliance reviewer signing off.',
      operatorMessage: 'Open Approvals to see the pending compliance request, then Policy Packs to see the matched data-boundary rule.',
      technicalMessage: 'data-boundary-basic requires a compliance approval; Action Enforcement returns approval_required.',
      acceptanceCriterionIds: ['healthcare-acceptance-scenarios-pass', 'healthcare-acceptance-export-verified'],
      successMetricIds: ['healthcare-metric-risk-reduction', 'healthcare-metric-policy-enforcement'],
    },
    {
      id: 'healthcare-scenario-prohibited-export-denied',
      name: 'Prohibited operational data export denied',
      description: 'export_client_data for a prohibited operational-data category is denied outright.',
      demoScenarioId: 'policy-pack-prohibited-data-export-denied',
      actionIds: ['healthcare-action-export-prohibited-data'],
      expectedOutcome: 'blocked',
      controlPlaneFocus: 'policy_packs',
      exportPackageType: 'policy_decision_packet',
      buyerMessage: 'Some operational data categories are not exportable at all -- no approval workflow overrides that.',
      operatorMessage: 'Open Policy Packs to see the deny rule for prohibited categories, then Enforcement to see the block.',
      technicalMessage: 'data-boundary-basic returns a deny effect for the prohibited category; Action Enforcement returns execution_blocked.',
      acceptanceCriterionIds: ['healthcare-acceptance-scenarios-pass'],
      successMetricIds: ['healthcare-metric-risk-reduction'],
    },
    {
      id: 'healthcare-scenario-handoff-requires-evidence',
      name: 'Operational handoff support requires data classification evidence',
      description: 'Handoff support is blocked until a data classification record is attached, illustrated via the same evidence-required governance pattern the Evidence Runtime exercises for invoice support.',
      demoScenarioId: 'policy-pack-invoice-evidence-required',
      actionIds: ['healthcare-action-prepare-handoff-support'],
      expectedOutcome: 'evidence_required',
      controlPlaneFocus: 'evidence',
      exportPackageType: 'evidence_packet',
      buyerMessage: 'Operational handoffs require real classification evidence, not an assumption about data sensitivity.',
      operatorMessage: 'Open Evidence to see the open data-classification requirement, then Enforcement to see the block.',
      technicalMessage: 'Domain Policy Pack Runtime returns requires_evidence; Action Enforcement blocks with evidence_required; Evidence Runtime tracks the open requirement.',
      acceptanceCriterionIds: ['healthcare-acceptance-scenarios-pass'],
      successMetricIds: ['healthcare-metric-evidence-readiness'],
    },
    {
      id: 'healthcare-scenario-governance-walkthrough-and-export',
      name: 'Full governance walkthrough and verifiable export',
      description: 'An operator walks the Control Plane end to end and exports a verifiable decision packet.',
      demoScenarioId: 'policy-pack-control-plane-walkthrough',
      actionIds: ['healthcare-action-export-sensitive-data'],
      expectedOutcome: 'executed',
      controlPlaneFocus: 'export_packages',
      exportPackageType: 'enterprise_demo_packet',
      buyerMessage: 'Every sensitive-data decision above can be exported as a verifiable, hash-chained packet for audit.',
      operatorMessage: 'Open Export Packages / Proofs and Audit to see the packet manifest, hash, and verification status.',
      technicalMessage: 'ExportPackageRuntime seals and verifies a decision packet referencing policy/approval/enforcement proofs.',
      acceptanceCriterionIds: ['healthcare-acceptance-export-verified'],
      successMetricIds: ['healthcare-metric-auditability'],
    },
  ],
  controlPlaneWalkthrough: {
    id: 'healthcare-control-plane-walkthrough',
    sections: [
      { section: 'overview', title: 'Overview', whatToShow: ['Overall decision/health summary for the healthcare operations trust domain.'], whyItMatters: 'Gives the buyer a single glance at how many sensitive-data actions were governed and how many required intervention.', expectedRowsOrReferences: ['Overview status cards'] },
      { section: 'policy_packs', title: 'Policy Packs', whatToShow: ['data-boundary-basic rules and the decisions they produced.'], whyItMatters: 'Shows the enterprise policy layer independent of recognition/authority, without claiming regulatory compliance.', expectedRowsOrReferences: ['Matched rule ids for the warning/require-approval/deny rules'] },
      { section: 'evidence', title: 'Evidence', whatToShow: ['Data classification and risk assessment evidence requirements and their status.'], whyItMatters: 'Proves sensitive-data decisions were backed by real evidence, not assumed.', expectedRowsOrReferences: ['Evidence requirement rows for export_client_data and prepare_invoice_support'] },
      { section: 'approvals', title: 'Approvals', whatToShow: ['The compliance approval request and decision for sensitive data export.'], whyItMatters: 'Proves a human compliance reviewer, not the agent, made the final call.', expectedRowsOrReferences: ['Approval request/decision rows for export_client_data'] },
      { section: 'enforcement', title: 'Enforcement', whatToShow: ['The execute_allowed, approval_required, execution_blocked and evidence_required enforcement decisions.'], whyItMatters: 'Proves execution was actually gated by real Action Enforcement decisions.', expectedRowsOrReferences: ['Enforcement decision rows for every scenario above'] },
      { section: 'proofs_audit', title: 'Proofs / Audit', whatToShow: ['The proof chain linking policy, approval and enforcement decisions.'], whyItMatters: 'An auditor can walk this chain without trusting the UI.', expectedRowsOrReferences: ['Proof chain entries for every scenario above'] },
      { section: 'export_packages', title: 'Export Packages', whatToShow: ['The sealed, verified decision packet for the sensitive-data-export scenario.'], whyItMatters: 'Gives the buyer a portable, hash-verifiable artifact -- without claiming it proves regulatory compliance.', expectedRowsOrReferences: ['Decision packet manifest + verification status = verified'] },
    ],
    operatorScript: [
      'Open Policy Packs first to show the data-boundary rules, explicitly noting they are demo-only.',
      'Open Evidence and Approvals to show why the sensitive export was gated.',
      'Close on Enforcement, Proofs / Audit and Export Packages to show the exportable, verifiable trail.',
    ],
  },
  exportPackages: [
    { id: 'healthcare-export-sensitive-data-approval-packet', name: 'Sensitive data export approval packet', packageType: 'approval_decision_packet', targetType: 'enforcement_decision', targetId: 'healthcare-action-export-sensitive-data', expectedSections: ['summary', 'approval', 'policy', 'enforcement'], expectedVerificationStatus: 'verified_with_warnings', buyerPurpose: 'Gives compliance leadership a hash-verifiable record that the sensitive export was blocked pending approval.' },
    { id: 'healthcare-export-handoff-evidence-packet', name: 'Operational handoff evidence packet', packageType: 'evidence_packet', targetType: 'enforcement_decision', targetId: 'healthcare-action-prepare-handoff-support', expectedSections: ['summary', 'evidence', 'enforcement'], expectedVerificationStatus: 'verified_with_warnings', buyerPurpose: 'Shows an auditor which evidence was required, and its current status, before the operational handoff could proceed.' },
  ],
  acceptanceCriteria: [
    { id: 'healthcare-acceptance-scenarios-pass', title: 'All pilot scenarios run against real AOC runtimes and match expected outcomes', description: 'Every declared pilot scenario binds to a real Enterprise Demo scenario and its runtime outcome matches the pilot expected outcome.', type: 'runtime', required: true, verificationMethod: 'automated_test', expectedResult: 'Every scenario binding reports bound: true.' },
    { id: 'healthcare-acceptance-export-verified', title: 'Approval/evidence export packets verify successfully', description: 'The sensitive-data-export approval packet and handoff evidence packet bind to real, verified Verifiable Export Package output.', type: 'export_package', required: true, verificationMethod: 'export_package_verification', expectedResult: 'Bound export packages report verification status verified or verified_with_warnings.' },
    { id: 'healthcare-acceptance-no-compliance-overclaim', title: 'No generated artifact claims regulatory compliance', description: 'Every generated pilot artifact carries the healthcare disclaimer and never claims HIPAA/GDPR/EU AI Act or other regulatory compliance.', type: 'security', required: true, verificationMethod: 'automated_test', expectedResult: 'No generated artifact contains a forbidden compliance claim.' },
    { id: 'healthcare-acceptance-customer-signoff', title: 'Healthcare stakeholder signs off on pilot scope and outcomes', description: 'A healthcare buyer persona confirms the pilot demonstrated the value proposition within its stated non-goals.', type: 'buyer', required: false, verificationMethod: 'customer_signoff', expectedResult: 'Signed pilot acceptance record from a healthcare stakeholder.' },
  ],
  successMetrics: [
    { id: 'healthcare-metric-risk-reduction', label: 'Ungoverned sensitive-data actions prevented', description: 'Number of sensitive/prohibited data-export attempts blocked pending approval/policy.', category: 'risk_reduction', targetValue: '100% of denied/approval-required exports actually blocked until the gate clears', measurementMethod: 'Count of blocked/approval_required enforcement decisions vs. total export attempts.' },
    { id: 'healthcare-metric-auditability', label: 'Exportable, verified decision packets', description: 'Share of governed actions with a verified export packet.', category: 'auditability', targetValue: 'Every approval-gated decision has a verified export packet', measurementMethod: 'Count of verified export packages vs. total scenarios requiring one.' },
    { id: 'healthcare-metric-operator-visibility', label: 'Operator walkthrough completeness', description: 'Control Plane sections an operator can inspect for this pilot.', category: 'operator_visibility', targetValue: 'All 6 walkthrough sections backed by real Control Plane rows', measurementMethod: 'Control Plane section availability check.' },
    { id: 'healthcare-metric-execution-safety', label: 'No unauthorized execution occurred', description: 'Share of blocked/approval-required scenarios where the real executor never ran.', category: 'execution_safety', targetValue: '0 executed side effects for blocked/approval-required scenarios', measurementMethod: 'Executor-run count on blocked/approval-required enforcement outcomes.' },
    { id: 'healthcare-metric-policy-enforcement', label: 'Policy-pack-gated actions enforced', description: 'Share of policy-flagged actions actually blocked/approval-gated by Action Enforcement.', category: 'policy_enforcement', targetValue: '100% of policy-flagged actions reflected in the enforcement decision', measurementMethod: 'Cross-check policyDecisionId on enforcement decisions.' },
    { id: 'healthcare-metric-evidence-readiness', label: 'Evidence requirement resolution', description: 'Share of evidence requirements eventually satisfied with accepted evidence.', category: 'evidence_readiness', targetValue: 'Data classification/risk assessment evidence requirements satisfied before dependent actions proceed', measurementMethod: 'Evidence Runtime requirement/satisfaction status check.' },
    { id: 'healthcare-metric-buyer-confidence', label: 'Buyer confidence in governed sensitive-data actions', description: 'Qualitative buyer confidence after the pilot.', category: 'buyer_confidence', targetValue: 'Buyer persona affirms AOC prevented at least one ungoverned sensitive-data action', measurementMethod: 'Buyer walkthrough sign-off.' },
  ],
  risks: [
    { id: 'healthcare-risk-regulatory-overclaim', title: 'Stakeholders mistake this pilot for a regulatory compliance determination', description: 'Buyers may assume passing this pilot proves HIPAA/GDPR/EU AI Act compliance.', severity: 'critical', mitigation: 'Every artifact and walkthrough explicitly states this pilot does not prove healthcare regulatory compliance and requires counsel/customer validation for any compliance claim.', ownerPersonaId: BUYER_COMPLIANCE_LEAD_PERSONA_ID },
    { id: 'healthcare-risk-synthetic-data-realism', title: 'Synthetic operational data may not reflect real sensitivity boundaries', description: 'The demo data classification is illustrative and may understate real-world sensitivity.', severity: 'medium', mitigation: 'Scope explicitly states data is synthetic and non-clinical; a real pilot requires customer-provided classification.', ownerPersonaId: BUYER_DPO_PERSONA_ID },
  ],
  script: {
    id: 'healthcare-pilot-script',
    executiveTalkTrack: ['Sensitive operational data is exactly where autonomy needs the clearest guardrails -- and exactly where AOC proves them, without ever claiming to be your compliance program.'],
    operatorTalkTrack: ['Watch four real actions: a low-risk read, a compliance-gated export, a denied prohibited export, and an evidence-gated handoff.'],
    technicalTalkTrack: ['Every decision carries policyDecisionId/policyProofId/approvalProofId you can trace in Proofs / Audit.', 'The closing export packet is a hash-chained, independently verifiable artifact.'],
    buyerTalkTrack: ['This is what governed autonomy looks like around sensitive data: agents move on what is allowed, and stop cleanly -- and provably -- on what is not, with no compliance overclaim.'],
    demoFlow: [
      { step: 1, title: 'Low-risk read', instruction: 'Run the low-risk-read-warning-allowed scenario.', expectedObservation: 'Execution allowed with a policy warning.' },
      { step: 2, title: 'Sensitive export gated', instruction: 'Run the sensitive-data-export-requires-compliance scenario.', expectedObservation: 'Execution blocked pending compliance approval.' },
      { step: 3, title: 'Prohibited export denied', instruction: 'Run the prohibited-data-export-denied scenario.', expectedObservation: 'Execution denied outright.' },
      { step: 4, title: 'Handoff blocked pending evidence', instruction: 'Run the invoice-evidence-required scenario (illustrating the handoff-evidence pattern).', expectedObservation: 'Execution blocked pending data classification evidence.' },
      { step: 5, title: 'Control Plane + export', instruction: 'Walk the Control Plane and export a verified decision packet.', expectedObservation: 'Verified export package with matching proof references.' },
    ],
    closingStatement: 'AOC proves sensitive-data guardrails held, decision by decision -- it never claims, on its own, that your organization is regulatorily compliant.',
    legalDisclaimer: 'This demo script uses demo-only policy packs and synthetic operational data. It does not claim HIPAA, GDPR, Costa Rica health-data, EU AI Act, or any other healthcare regulatory compliance, and it is not legal advice.',
  },
  nonGoals: [
    'This pilot does not implement a standalone SaaS product, billing, or multi-tenant infrastructure.',
    'This pilot does not claim HIPAA, GDPR, Costa Rica health-data, EU AI Act, or any other healthcare regulatory compliance.',
    'This pilot does not process real patient or protected health information.',
  ],
  legalDisclaimer:
    'This pilot template uses demo-only policy packs (data-boundary-basic, jurisdictional-baseline-demo) and synthetic operational data. It does not claim HIPAA, GDPR, Costa Rica health-data, EU AI Act, or any other healthcare regulatory compliance; it is not legal advice; and evidence presence does not prove legal sufficiency unless explicitly marked verified_by_customer or verified_by_counsel.',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};
