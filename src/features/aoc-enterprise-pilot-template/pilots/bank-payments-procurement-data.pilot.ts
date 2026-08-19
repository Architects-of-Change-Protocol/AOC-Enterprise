import type { PilotTemplate } from '../domain/pilot-template.js';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN_ID = 'trust-domain-bank-agent-republic';

const BUYER_CIO_PERSONA_ID = 'persona-buyer-cio';
const BUYER_CISO_PERSONA_ID = 'persona-buyer-ciso';
const BUYER_COMPLIANCE_OFFICER_PERSONA_ID = 'persona-buyer-compliance-officer';
const BUYER_RISK_DIRECTOR_PERSONA_ID = 'persona-buyer-operations-risk-director';
const BUYER_TRANSFORMATION_DIRECTOR_PERSONA_ID = 'persona-buyer-digital-transformation-director';
const OPERATOR_FINANCE_PERSONA_ID = 'persona-operator-finance-operator';
const OPERATOR_COMPLIANCE_REVIEWER_PERSONA_ID = 'persona-operator-compliance-reviewer';
const OPERATOR_SECURITY_ANALYST_PERSONA_ID = 'persona-operator-security-analyst';
const OPERATOR_PROCESS_OWNER_PERSONA_ID = 'persona-operator-process-owner';

/**
 * Bank Payments / Procurement / Data Boundary Pilot -- shows how Soberanía governs
 * financial, procurement and data-sensitive autonomous actions: payments and
 * bank-account changes gated on approval, invoice support gated on evidence,
 * and client data exports gated on compliance approval or denied outright
 * when prohibited. Orchestrates existing runtime truth only.
 */
export const BANK_PAYMENTS_PROCUREMENT_DATA_PILOT_TEMPLATE: PilotTemplate = {
  id: 'bank-payments-procurement-data',
  name: 'Bank Payments / Procurement / Data Boundary Pilot',
  description:
    'A bounded pilot showing how Soberanía governs financial, procurement and data-sensitive autonomous actions: approve_payment and change_bank_account gated on approval/denial, prepare_invoice_support gated on evidence, and export_client_data gated on compliance approval or denied when prohibited.',
  status: 'draft',
  industry: 'banking',
  primaryUseCase: 'Autonomous payments, procurement and client-data-export actions governed end-to-end by Soberanía.',
  businessPain:
    'Banks cannot let an autonomous agent approve a payment, change a bank account, or export client data without a policy-enforced, approval-gated, auditable trail -- a trust exercise is not a control.',
  aocValueProposition:
    'Soberanía can prevent autonomous financial or data actions from executing unless authority, policy, evidence and approval gates are satisfied -- Action Enforcement, the Domain Policy Pack Runtime, Approval Runtime and Evidence / Source / Citation Runtime jointly decide, and the Control Plane and Verifiable Export Package prove, that every gate was actually checked.',
  targetBuyerPersonaIds: [BUYER_CIO_PERSONA_ID, BUYER_CISO_PERSONA_ID, BUYER_COMPLIANCE_OFFICER_PERSONA_ID, BUYER_RISK_DIRECTOR_PERSONA_ID, BUYER_TRANSFORMATION_DIRECTOR_PERSONA_ID],
  targetOperatorPersonaIds: [OPERATOR_FINANCE_PERSONA_ID, OPERATOR_COMPLIANCE_REVIEWER_PERSONA_ID, OPERATOR_SECURITY_ANALYST_PERSONA_ID, OPERATOR_PROCESS_OWNER_PERSONA_ID],
  trustDomainId: TRUST_DOMAIN_ID,
  scope: {
    inScope: [
      'approve_payment gated on finance_review approval',
      'change_bank_account denied outright under the payments-basic demo policy',
      'prepare_invoice_support gated on invoice/purchase-order evidence',
      'export_client_data gated on compliance approval, or denied when the data is prohibited from export',
    ],
    outOfScope: [
      'Real core-banking or payment-rail integration',
      'Real customer account data',
      'Any real money movement',
      'A determination of actual banking regulatory compliance',
    ],
    durationDays: 30,
    environments: 'sandbox',
    dataSensitivity: 'synthetic_only',
    legalCompleteness: 'demo_policy_model',
    assumptions: ['A finance reviewer and compliance reviewer role are staffed for the pilot duration.', 'All account/payment data used is synthetic.'],
    constraints: ['No production banking system access.', 'No real payment execution.'],
  },
  actors: [
    { id: 'bank-actor-payments-agent', name: 'Payments Agent', actorType: 'internal_agent', role: 'Autonomous payments/procurement agent', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
    { id: 'bank-actor-finance-reviewer', name: 'Finance Reviewer', actorType: 'human', role: 'Finance approval role', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
    { id: 'bank-actor-compliance-reviewer', name: 'Compliance Reviewer', actorType: 'human', role: 'Compliance approval role', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
  ],
  agents: [
    {
      id: 'bank-agent-payments-agent',
      name: 'Payments Agent',
      agentType: 'finance_agent',
      ownerActorId: 'bank-actor-payments-agent',
      trustDomainId: TRUST_DOMAIN_ID,
      allowedActions: ['prepare_invoice_support'],
      deniedActions: ['approve_payment', 'change_bank_account', 'export_client_data'],
      requiredCapabilities: ['bank-capability-prepare-invoice-support'],
    },
  ],
  capabilities: [
    { id: 'bank-capability-approve-payment', name: 'Approve payment', description: 'Approves a payment; requires finance_review approval.', action: 'approve_payment', resourceScope: 'account:demo-0001', riskLevel: 'critical', requiredAuthority: true, requiredApproval: true, requiredEvidence: false, policyPackSensitive: true },
    { id: 'bank-capability-change-bank-account', name: 'Change bank account', description: 'Changes a payee bank account; denied outright under payments-basic.', action: 'change_bank_account', resourceScope: 'account:demo-0001', riskLevel: 'critical', requiredAuthority: true, requiredApproval: true, requiredEvidence: false, policyPackSensitive: true },
    { id: 'bank-capability-prepare-invoice-support', name: 'Prepare invoice support', description: 'Assembles invoice support material; gated on invoice/PO evidence.', action: 'prepare_invoice_support', resourceScope: 'account:demo-0001', riskLevel: 'medium', requiredAuthority: true, requiredApproval: false, requiredEvidence: true, policyPackSensitive: true },
    { id: 'bank-capability-export-client-data', name: 'Export client data', description: 'Exports client data; gated on compliance approval, denied when prohibited.', action: 'export_client_data', resourceScope: 'dataset:client-records', riskLevel: 'high', requiredAuthority: true, requiredApproval: true, requiredEvidence: true, policyPackSensitive: true },
  ],
  authorityModel: {
    authorityGrantIds: ['bank-authority-grant-payments-agent'],
    delegationGrantIds: [],
    authorityProofIds: [],
    requiredCapabilities: ['bank-capability-approve-payment', 'bank-capability-change-bank-account', 'bank-capability-export-client-data'],
    description: 'Every payment, bank-account-change and client-data-export action is checked against an explicit Authority Graph grant before policy/approval gates are even evaluated.',
    walkthrough: ['Open Authority in the Control Plane and confirm each capability above has a corresponding authority grant.'],
  },
  approvalModel: {
    approvalRoleIds: ['bank-approval-role-finance-reviewer', 'bank-approval-role-compliance-reviewer'],
    approvalRequestIds: [],
    approvalDecisionIds: [],
    approvalProofIds: [],
    approvalScenarios: [
      { action: 'approve_payment', expectedApprovalBehavior: 'required', description: 'approve_payment requires a finance_review approval.' },
      { action: 'export_client_data', expectedApprovalBehavior: 'required', description: 'export_client_data requires a compliance approval unless the data is prohibited from export entirely.' },
    ],
    walkthrough: ['Open Approvals in the Control Plane and locate the finance_review and compliance approval requests.'],
  },
  policyModel: {
    policyPackIds: ['policy-pack-payments-basic', 'policy-pack-procurement-basic', 'policy-pack-data-boundary-basic', 'policy-pack-financial-approval-basic'],
    policyPackVersionIds: ['policy-pack-payments-basic-v1', 'policy-pack-procurement-basic-v1', 'policy-pack-data-boundary-basic-v1', 'policy-pack-financial-approval-basic-v1'],
    demoOnly: true,
    legalCompleteness: 'demo_policy_model',
    policyScenarios: [
      { action: 'approve_payment', expectedPolicyBehavior: 'requires_approval', description: 'payments-basic requires a finance_review approval before approve_payment may proceed.' },
      { action: 'change_bank_account', expectedPolicyBehavior: 'denied', description: 'payments-basic denies change_bank_account outright under this demo policy.' },
      { action: 'prepare_invoice_support', expectedPolicyBehavior: 'requires_evidence', description: 'procurement-basic requires invoice/purchase-order evidence before invoice support may proceed.' },
      { action: 'export_client_data', expectedPolicyBehavior: 'requires_approval', description: 'data-boundary-basic requires compliance approval for client data export, and denies prohibited categories outright.' },
    ],
    walkthrough: ['Open Policy Packs in the Control Plane and confirm payments-basic, procurement-basic and data-boundary-basic are active and demo-only.'],
  },
  evidenceModel: {
    sourceDocumentIds: [],
    evidenceArtifactIds: [],
    evidenceRequirementIds: [],
    evidenceSatisfactionIds: [],
    evidenceProofIds: [],
    citationIds: [],
    evidenceScenarios: [
      { action: 'prepare_invoice_support', requiredEvidenceTypes: ['invoice', 'purchase_order'], expectedEvidenceBehavior: 'satisfied', description: 'Invoice and purchase-order evidence must be accepted before invoice support proceeds.' },
      { action: 'export_client_data', requiredEvidenceTypes: ['data_classification', 'customer_policy'], expectedEvidenceBehavior: 'satisfied', description: "A data classification record and the customer's data policy support the compliance approval decision." },
    ],
    walkthrough: ['Open Evidence and confirm invoice/PO evidence and the data classification record are accepted and cited against the relevant policy decisions.'],
  },
  actions: [
    { id: 'bank-action-approve-payment', name: 'Approve payment', description: 'A payment requires finance approval before it can proceed.', actorId: 'bank-actor-finance-reviewer', action: 'approve_payment', capability: 'bank-capability-approve-payment', resourceScope: 'account:demo-0001', riskLevel: 'critical', expectedRecognition: 'allowed', expectedAuthority: 'valid', expectedApproval: 'required', expectedPolicy: 'requires_approval', expectedEvidence: 'not_required', expectedEnforcement: 'approval_required', expectedExecution: 'not_executed' },
    { id: 'bank-action-change-bank-account', name: 'Change bank account', description: 'Changing a payee bank account is denied outright under payments-basic.', actorId: 'bank-actor-payments-agent', agentId: 'bank-agent-payments-agent', action: 'change_bank_account', capability: 'bank-capability-change-bank-account', resourceScope: 'account:demo-0001', riskLevel: 'critical', expectedRecognition: 'allowed', expectedAuthority: 'valid', expectedApproval: 'not_required', expectedPolicy: 'denied', expectedEvidence: 'not_required', expectedEnforcement: 'execution_blocked', expectedExecution: 'not_executed' },
    { id: 'bank-action-prepare-invoice-support', name: 'Prepare invoice support', description: 'Invoice support is blocked until invoice/PO evidence is attached.', actorId: 'bank-actor-payments-agent', agentId: 'bank-agent-payments-agent', action: 'prepare_invoice_support', capability: 'bank-capability-prepare-invoice-support', resourceScope: 'account:demo-0001', riskLevel: 'medium', expectedRecognition: 'requires_evidence', expectedAuthority: 'valid', expectedApproval: 'not_required', expectedPolicy: 'requires_evidence', expectedEvidence: 'missing', expectedEnforcement: 'evidence_required', expectedExecution: 'not_executed' },
    { id: 'bank-action-export-client-data-compliance', name: 'Export client data (compliance approval required)', description: 'Exporting client data requires compliance approval.', actorId: 'bank-actor-compliance-reviewer', action: 'export_client_data', capability: 'bank-capability-export-client-data', resourceScope: 'dataset:client-records', riskLevel: 'high', expectedRecognition: 'allowed', expectedAuthority: 'valid', expectedApproval: 'required', expectedPolicy: 'requires_approval', expectedEvidence: 'not_required', expectedEnforcement: 'approval_required', expectedExecution: 'not_executed' },
    { id: 'bank-action-export-client-data-prohibited', name: 'Export client data (prohibited category)', description: 'Exporting a prohibited client-data category is denied outright.', actorId: 'bank-actor-payments-agent', agentId: 'bank-agent-payments-agent', action: 'export_client_data', capability: 'bank-capability-export-client-data', resourceScope: 'dataset:client-records-restricted', riskLevel: 'high', expectedRecognition: 'denied', expectedAuthority: 'not_required', expectedApproval: 'not_required', expectedPolicy: 'denied', expectedEvidence: 'not_required', expectedEnforcement: 'execution_blocked', expectedExecution: 'not_executed' },
  ],
  scenarios: [
    {
      id: 'bank-scenario-payment-requires-finance-approval',
      name: 'Payment approval blocked pending finance review',
      description: 'approve_payment is blocked until a finance_review approval exists.',
      demoScenarioId: 'policy-pack-payment-approval-required',
      actionIds: ['bank-action-approve-payment'],
      expectedOutcome: 'approval_required',
      controlPlaneFocus: 'approvals',
      exportPackageType: 'approval_decision_packet',
      buyerMessage: 'No autonomous agent moves money without a human finance reviewer approving it first.',
      operatorMessage: 'Open Approvals to see the pending finance_review request, then Enforcement to see the blocked decision.',
      technicalMessage: 'payments-basic requires finance_review; Action Enforcement returns approval_required.',
      acceptanceCriterionIds: ['bank-acceptance-scenarios-pass'],
      successMetricIds: ['bank-metric-risk-reduction'],
    },
    {
      id: 'bank-scenario-bank-account-change-denied',
      name: 'Bank account change denied outright',
      description: 'change_bank_account is denied under payments-basic, independent of approval.',
      demoScenarioId: 'policy-pack-bank-account-change-denied',
      actionIds: ['bank-action-change-bank-account'],
      expectedOutcome: 'blocked',
      controlPlaneFocus: 'policy_packs',
      exportPackageType: 'policy_decision_packet',
      buyerMessage: 'Changing a payee bank account is exactly the kind of action Soberanía refuses to let an agent execute unattended.',
      operatorMessage: 'Open Policy Packs to see the deny rule, then Enforcement to see the blocked decision.',
      technicalMessage: 'payments-basic returns a deny effect; Action Enforcement returns execution_blocked.',
      acceptanceCriterionIds: ['bank-acceptance-scenarios-pass'],
      successMetricIds: ['bank-metric-risk-reduction', 'bank-metric-policy-enforcement'],
    },
    {
      id: 'bank-scenario-invoice-support-requires-evidence',
      name: 'Invoice support blocked pending evidence',
      description: 'prepare_invoice_support is blocked until invoice/PO evidence is attached.',
      demoScenarioId: 'policy-pack-invoice-evidence-required',
      actionIds: ['bank-action-prepare-invoice-support'],
      expectedOutcome: 'evidence_required',
      controlPlaneFocus: 'evidence',
      exportPackageType: 'evidence_packet',
      buyerMessage: "Invoice support requires real invoice and purchase-order evidence, not an agent's say-so.",
      operatorMessage: 'Open Evidence to see the open requirements, then Enforcement to see the block.',
      technicalMessage: 'procurement-basic returns requires_evidence; Action Enforcement returns evidence_required.',
      acceptanceCriterionIds: ['bank-acceptance-scenarios-pass'],
      successMetricIds: ['bank-metric-evidence-readiness'],
    },
    {
      id: 'bank-scenario-data-export-requires-compliance',
      name: 'Client data export requires compliance approval',
      description: 'export_client_data requires a compliance approval before it may proceed.',
      demoScenarioId: 'policy-pack-sensitive-data-export-requires-compliance',
      actionIds: ['bank-action-export-client-data-compliance'],
      expectedOutcome: 'approval_required',
      controlPlaneFocus: 'approvals',
      exportPackageType: 'approval_decision_packet',
      buyerMessage: 'Client data never leaves the boundary without a compliance reviewer signing off.',
      operatorMessage: 'Open Approvals to see the pending compliance request, then Policy Packs to see the matched data-boundary rule.',
      technicalMessage: 'data-boundary-basic requires a compliance approval; Action Enforcement returns approval_required.',
      acceptanceCriterionIds: ['bank-acceptance-scenarios-pass', 'bank-acceptance-export-verified'],
      successMetricIds: ['bank-metric-policy-enforcement'],
    },
    {
      id: 'bank-scenario-prohibited-data-export-denied',
      name: 'Prohibited client data export denied',
      description: 'export_client_data for a prohibited category is denied outright.',
      demoScenarioId: 'policy-pack-prohibited-data-export-denied',
      actionIds: ['bank-action-export-client-data-prohibited'],
      expectedOutcome: 'blocked',
      controlPlaneFocus: 'policy_packs',
      exportPackageType: 'policy_decision_packet',
      buyerMessage: 'Some data categories are not exportable at all -- no approval workflow can override that.',
      operatorMessage: 'Open Policy Packs to see the deny rule for prohibited categories, then Enforcement to see the block.',
      technicalMessage: 'data-boundary-basic returns a deny effect for the prohibited category; Action Enforcement returns execution_blocked.',
      acceptanceCriterionIds: ['bank-acceptance-scenarios-pass'],
      successMetricIds: ['bank-metric-risk-reduction'],
    },
    {
      id: 'bank-scenario-governance-walkthrough-and-export',
      name: 'Full governance walkthrough and verifiable export',
      description: 'An operator walks the Control Plane end to end and exports a verifiable audit bundle.',
      demoScenarioId: 'policy-pack-control-plane-walkthrough',
      actionIds: ['bank-action-approve-payment'],
      expectedOutcome: 'executed',
      controlPlaneFocus: 'export_packages',
      exportPackageType: 'audit_bundle',
      buyerMessage: 'Every gate above rolls up into a single, exportable, hash-verifiable audit bundle.',
      operatorMessage: 'Open Export Packages / Proofs and Audit to see the audit bundle referencing every scenario above.',
      technicalMessage: 'ExportPackageRuntime seals and verifies an audit bundle referencing the enforcement/policy/approval proofs from every scenario.',
      acceptanceCriterionIds: ['bank-acceptance-export-verified'],
      successMetricIds: ['bank-metric-auditability'],
    },
  ],
  controlPlaneWalkthrough: {
    id: 'bank-control-plane-walkthrough',
    sections: [
      { section: 'overview', title: 'Overview', whatToShow: ['Overall decision/health summary for the Bank trust domain.'], whyItMatters: 'Gives the buyer a single glance at how many financial/data actions were governed and how many required intervention.', expectedRowsOrReferences: ['Overview status cards'] },
      { section: 'enforcement', title: 'Enforcement', whatToShow: ['Blocked/approval-required enforcement decisions for every scenario above.'], whyItMatters: 'Proves real Action Enforcement decisions, not scripted output, gated every action.', expectedRowsOrReferences: ['Enforcement rows for approve_payment, change_bank_account, prepare_invoice_support, export_client_data (x2)'] },
      { section: 'policy_packs', title: 'Policy Packs', whatToShow: ['payments-basic, procurement-basic, data-boundary-basic rules and matched decisions.'], whyItMatters: 'Shows the enterprise policy layer independent of recognition/authority.', expectedRowsOrReferences: ['Matched rule ids for deny/require-approval/require-evidence rules'] },
      { section: 'evidence', title: 'Evidence', whatToShow: ['Invoice/PO and data-classification evidence requirements and their status.'], whyItMatters: 'Proves invoice support and data-export decisions were backed by real evidence, not assumed.', expectedRowsOrReferences: ['Evidence requirement rows for prepare_invoice_support and export_client_data'] },
      { section: 'approvals', title: 'Approvals', whatToShow: ['finance_review and compliance approval requests and decisions.'], whyItMatters: 'Proves a human, not the agent, made the final call on money movement and data export.', expectedRowsOrReferences: ['Approval request/decision rows for approve_payment and export_client_data'] },
      { section: 'proofs_audit', title: 'Proofs / Audit', whatToShow: ['The proof chain linking policy, approval and enforcement decisions.'], whyItMatters: 'An auditor can walk this chain without trusting the UI.', expectedRowsOrReferences: ['Proof chain entries for every scenario above'] },
      { section: 'export_packages', title: 'Export Packages', whatToShow: ['The sealed, verified audit bundle referencing every scenario.'], whyItMatters: 'Gives risk/compliance leadership a portable, hash-verifiable artifact.', expectedRowsOrReferences: ['Audit bundle manifest + verification status = verified'] },
    ],
    operatorScript: [
      'Open Enforcement first to show every governed action and its outcome.',
      'Open Policy Packs, Evidence and Approvals in turn to show why each outcome happened.',
      'Close on Proofs / Audit and Export Packages to show the exportable, verifiable trail.',
    ],
  },
  exportPackages: [
    { id: 'bank-export-payment-approval-packet', name: 'Payment approval decision packet', packageType: 'approval_decision_packet', targetType: 'enforcement_decision', targetId: 'bank-action-approve-payment', expectedSections: ['summary', 'approval', 'policy', 'enforcement'], expectedVerificationStatus: 'verified_with_warnings', buyerPurpose: 'Gives risk leadership a hash-verifiable record that approve_payment was blocked pending approval.' },
    { id: 'bank-export-data-boundary-audit-bundle', name: 'Data boundary and payments audit bundle', packageType: 'audit_bundle', targetType: 'audit_scope', targetId: 'bank-pilot-audit-scope', expectedSections: ['summary'], expectedVerificationStatus: 'verified_with_warnings', buyerPurpose: 'Rolls every payments/data-boundary decision in this pilot into a single audit-ready bundle.' },
  ],
  acceptanceCriteria: [
    { id: 'bank-acceptance-scenarios-pass', title: 'All pilot scenarios run against real Soberanía runtimes and match expected outcomes', description: 'Every declared pilot scenario binds to a real Enterprise Demo scenario and its runtime outcome matches the pilot expected outcome.', type: 'runtime', required: true, verificationMethod: 'automated_test', expectedResult: 'Every scenario binding reports bound: true.' },
    { id: 'bank-acceptance-export-verified', title: 'Approval and audit export packets verify successfully', description: 'The payment-approval decision packet and audit bundle bind to real, verified Verifiable Export Package output.', type: 'export_package', required: true, verificationMethod: 'export_package_verification', expectedResult: 'Bound export packages report verification status verified or verified_with_warnings.' },
    { id: 'bank-acceptance-compliance-review', title: 'Compliance reviewer confirms data-boundary behavior', description: 'A compliance reviewer confirms export_client_data behaves as expected for both the compliance-approval and prohibited-category paths.', type: 'policy', required: true, verificationMethod: 'operator_review', expectedResult: 'Compliance reviewer signs off that both data-export paths matched expectations.' },
    { id: 'bank-acceptance-customer-signoff', title: 'Bank stakeholder signs off on pilot scope and outcomes', description: 'A bank buyer persona confirms the pilot demonstrated the value proposition within its stated non-goals.', type: 'buyer', required: false, verificationMethod: 'customer_signoff', expectedResult: 'Signed pilot acceptance record from a bank stakeholder.' },
  ],
  successMetrics: [
    { id: 'bank-metric-risk-reduction', label: 'Ungoverned financial/data actions prevented', description: 'Number of payment, bank-account-change or data-export attempts blocked pending approval/policy.', category: 'risk_reduction', targetValue: '100% of denied/approval-required actions actually blocked until the gate clears', measurementMethod: 'Count of blocked/approval_required enforcement decisions vs. total attempts.' },
    { id: 'bank-metric-auditability', label: 'Exportable, verified decision packets', description: 'Share of governed actions with a verified export packet or audit bundle entry.', category: 'auditability', targetValue: 'Every approval-gated decision has a verified export reference', measurementMethod: 'Count of verified export packages vs. total scenarios requiring one.' },
    { id: 'bank-metric-operator-visibility', label: 'Operator walkthrough completeness', description: 'Control Plane sections an operator can inspect for this pilot.', category: 'operator_visibility', targetValue: 'All 6 walkthrough sections backed by real Control Plane rows', measurementMethod: 'Control Plane section availability check.' },
    { id: 'bank-metric-execution-safety', label: 'No unauthorized execution occurred', description: 'Share of blocked/approval-required scenarios where the real executor never ran.', category: 'execution_safety', targetValue: '0 executed side effects for blocked/approval-required scenarios', measurementMethod: 'Executor-run count on blocked/approval-required enforcement outcomes.' },
    { id: 'bank-metric-policy-enforcement', label: 'Policy-pack-gated actions enforced', description: 'Share of policy-flagged actions actually blocked/approval-gated by Action Enforcement.', category: 'policy_enforcement', targetValue: '100% of policy-flagged actions reflected in the enforcement decision', measurementMethod: 'Cross-check policyDecisionId on enforcement decisions.' },
    { id: 'bank-metric-evidence-readiness', label: 'Evidence requirement resolution', description: 'Share of evidence requirements eventually satisfied with accepted evidence.', category: 'evidence_readiness', targetValue: 'Invoice/PO and data-classification evidence requirements satisfied before dependent actions proceed', measurementMethod: 'Evidence Runtime requirement/satisfaction status check.' },
    { id: 'bank-metric-buyer-confidence', label: 'Buyer confidence in governed autonomous finance actions', description: 'Qualitative buyer confidence after the pilot.', category: 'buyer_confidence', targetValue: 'Buyer persona affirms Soberanía prevented at least one ungoverned financial/data action', measurementMethod: 'Buyer walkthrough sign-off.' },
  ],
  risks: [
    { id: 'bank-risk-demo-only-confusion', title: 'Demo-only policy packs mistaken for real banking compliance', description: 'Stakeholders might assume payments-basic/data-boundary-basic reflect actual regulatory requirements.', severity: 'high', mitigation: 'Every artifact and walkthrough explicitly labels the policy packs demo-only and states this pilot does not prove banking regulatory compliance.', ownerPersonaId: BUYER_COMPLIANCE_OFFICER_PERSONA_ID },
    { id: 'bank-risk-data-boundary-misclassification', title: 'Synthetic data classification does not reflect real data sensitivity', description: 'The demo data-classification evidence is illustrative and may not reflect how the bank actually classifies data.', severity: 'medium', mitigation: 'Scope explicitly states data classification is synthetic and non-production; a real pilot requires customer-provided classification.', ownerPersonaId: BUYER_CISO_PERSONA_ID },
  ],
  script: {
    id: 'bank-pilot-script',
    executiveTalkTrack: ['Money movement and client data export are exactly where autonomy is riskiest -- and exactly where Soberanía draws its hardest lines.'],
    operatorTalkTrack: ['Watch five real actions: a gated payment, a denied account change, gated invoice support, a compliance-gated export, and a denied prohibited export.'],
    technicalTalkTrack: ['Every decision carries policyDecisionId/policyProofId/approvalProofId you can trace in Proofs / Audit.', 'The closing audit bundle is a hash-chained, independently verifiable artifact.'],
    buyerTalkTrack: ['This is what governed autonomy looks like in a bank: agents move on what is allowed, and stop cleanly -- and provably -- on what is not.'],
    demoFlow: [
      { step: 1, title: 'Payment approval blocked', instruction: 'Run the payment-approval-required scenario.', expectedObservation: 'Execution blocked pending finance_review approval.' },
      { step: 2, title: 'Bank account change denied', instruction: 'Run the bank-account-change-denied scenario.', expectedObservation: 'Execution denied outright.' },
      { step: 3, title: 'Invoice support blocked', instruction: 'Run the invoice-evidence-required scenario.', expectedObservation: 'Execution blocked pending evidence.' },
      { step: 4, title: 'Client data export gated', instruction: 'Run the data-export-requires-compliance scenario.', expectedObservation: 'Execution blocked pending compliance approval.' },
      { step: 5, title: 'Prohibited export denied', instruction: 'Run the prohibited-data-export-denied scenario.', expectedObservation: 'Execution denied outright.' },
      { step: 6, title: 'Control Plane + export', instruction: 'Walk the Control Plane and export a verified audit bundle.', expectedObservation: 'Verified audit bundle referencing every scenario.' },
    ],
    closingStatement: 'Soberanía does not ask a bank to trust an agent with money or data -- it proves, decision by decision, exactly where the line was held.',
    legalDisclaimer: 'This demo script uses demo-only policy packs and synthetic account/data records. It is not legal advice and does not prove banking regulatory compliance.',
  },
  nonGoals: [
    'This pilot does not implement a standalone SaaS product, billing, or multi-tenant infrastructure.',
    'This pilot does not integrate with a real core-banking or payment-rail system.',
    'This pilot does not constitute legal advice and does not prove banking regulatory compliance.',
  ],
  legalDisclaimer:
    'This pilot uses demo policy packs (payments-basic, procurement-basic, data-boundary-basic, financial-approval-basic) and synthetic account/data records. It does not prove banking regulatory compliance, is not legal advice, and evidence presence does not prove legal sufficiency unless explicitly marked verified_by_customer or verified_by_counsel.',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};
