import type { PilotTemplate } from '../domain/pilot-template.js';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const TRUST_DOMAIN_ID = 'trust-domain-sports-settlement-agent-republic';

const BUYER_LEAGUE_OPERATOR_PERSONA_ID = 'persona-buyer-sports-league-operator';
const BUYER_EVENT_PLATFORM_FOUNDER_PERSONA_ID = 'persona-buyer-event-platform-founder';
const BUYER_PAYMENTS_PARTNER_PERSONA_ID = 'persona-buyer-payments-partner';
const BUYER_SMART_CONTRACT_PRODUCT_LEAD_PERSONA_ID = 'persona-buyer-smart-contract-product-lead';
const BUYER_RISK_COMPLIANCE_REVIEWER_PERSONA_ID = 'persona-buyer-risk-compliance-reviewer';
const OPERATOR_EVENT_OPS_MANAGER_PERSONA_ID = 'persona-operator-event-operations-manager';
const OPERATOR_SETTLEMENT_REVIEWER_PERSONA_ID = 'persona-operator-settlement-reviewer';
const OPERATOR_FINANCE_PERSONA_ID = 'persona-operator-finance-operator';
const OPERATOR_PARTNER_OPS_ANALYST_PERSONA_ID = 'persona-operator-partner-operations-analyst';

/**
 * Sports Event Settlement Pilot -- shows how Soberanía governs event settlement /
 * smart-contract-like payment execution: settlement is blocked until event
 * record evidence exists, settlement payments follow the same
 * approval-gated pattern just like any other financial action, and every decision
 * is exportable for audit -- without claiming smart-contract legal
 * enforceability or payment regulatory compliance. Orchestrates existing
 * runtime truth only.
 */
export const SPORTS_EVENT_SETTLEMENT_PILOT_TEMPLATE: PilotTemplate = {
  id: 'sports-event-settlement',
  name: 'Sports Event Settlement Pilot',
  description:
    'A bounded pilot showing how Soberanía governs event settlement / smart-contract-like payment execution: settle_event_payment is blocked until event record evidence exists, settlement-adjacent payments require approval, and every decision produces a verifiable, exportable audit trail.',
  status: 'draft',
  industry: 'sports_entertainment',
  primaryUseCase: 'Autonomous event settlement / smart-contract-like payment execution governed end-to-end by Soberanía.',
  businessPain:
    'Event platforms and leagues cannot let an autonomous settlement agent pay out an event outcome without proof the event actually happened as claimed, and without a human approval gate on the payment itself -- a smart contract that pays on an unverified claim is a liability, not a feature.',
  aocValueProposition:
    'Soberanía can require event evidence and policy approval before autonomous settlement actions execute -- the Domain Policy Pack Runtime, Evidence / Source / Citation Runtime, Approval Runtime and Action Enforcement jointly decide, and the Control Plane and Verifiable Export Package prove, that no settlement paid out on an unverified event.',
  targetBuyerPersonaIds: [
    BUYER_LEAGUE_OPERATOR_PERSONA_ID,
    BUYER_EVENT_PLATFORM_FOUNDER_PERSONA_ID,
    BUYER_PAYMENTS_PARTNER_PERSONA_ID,
    BUYER_SMART_CONTRACT_PRODUCT_LEAD_PERSONA_ID,
    BUYER_RISK_COMPLIANCE_REVIEWER_PERSONA_ID,
  ],
  targetOperatorPersonaIds: [OPERATOR_EVENT_OPS_MANAGER_PERSONA_ID, OPERATOR_SETTLEMENT_REVIEWER_PERSONA_ID, OPERATOR_FINANCE_PERSONA_ID, OPERATOR_PARTNER_OPS_ANALYST_PERSONA_ID],
  trustDomainId: TRUST_DOMAIN_ID,
  scope: {
    inScope: [
      'settle_event_payment blocked until event_record evidence is attached',
      'Event record evidence satisfying the settlement evidence requirement (Evidence Runtime)',
      'Settlement-adjacent payments following the same approval-gated pattern just like any other financial action',
      'A verifiable, exportable settlement decision packet',
    ],
    outOfScope: [
      'Any claim of smart-contract legal enforceability',
      'Any claim of payment or gaming/betting regulatory compliance',
      'Real settlement payments or real event data',
    ],
    durationDays: 21,
    environments: 'sandbox',
    dataSensitivity: 'synthetic_only',
    legalCompleteness: 'demo_policy_model',
    assumptions: ['A settlement reviewer and finance approver role are staffed for the pilot duration.', 'All event/settlement data used is synthetic.'],
    constraints: ['No production payment-rail access.', 'No real event or wagering data.'],
  },
  actors: [
    { id: 'sports-actor-settlement-agent', name: 'Settlement Agent', actorType: 'internal_agent', role: 'Autonomous settlement agent', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
    { id: 'sports-actor-settlement-reviewer', name: 'Settlement Reviewer', actorType: 'human', role: 'Event record / settlement reviewer', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
    { id: 'sports-actor-finance-approver', name: 'Finance Approver', actorType: 'human', role: 'Finance approval role', trustDomainId: TRUST_DOMAIN_ID, expectedRecognitionState: 'recognized' },
  ],
  agents: [
    {
      id: 'sports-agent-settlement-agent',
      name: 'Settlement Agent',
      agentType: 'settlement_agent',
      ownerActorId: 'sports-actor-settlement-agent',
      trustDomainId: TRUST_DOMAIN_ID,
      allowedActions: [],
      deniedActions: ['settle_event_payment'],
      requiredCapabilities: ['sports-capability-settle-event-payment'],
    },
  ],
  capabilities: [
    { id: 'sports-capability-settle-event-payment', name: 'Settle event payment', description: 'Settles a payment tied to an event outcome; gated on event record evidence and approval.', action: 'settle_event_payment', resourceScope: 'event:demo-0001', riskLevel: 'critical', requiredAuthority: true, requiredApproval: true, requiredEvidence: true, policyPackSensitive: true },
    { id: 'sports-capability-verify-event-record', name: 'Verify event record', description: 'Verifies an event record used as settlement evidence.', action: 'verify_event_record', resourceScope: 'event:demo-0001', riskLevel: 'low', requiredAuthority: false, requiredApproval: false, requiredEvidence: true, policyPackSensitive: false },
  ],
  authorityModel: {
    authorityGrantIds: ['sports-authority-grant-settlement-agent'],
    delegationGrantIds: [],
    authorityProofIds: [],
    requiredCapabilities: ['sports-capability-settle-event-payment'],
    description: 'Every settlement payment is checked against an explicit Authority Graph grant before evidence/policy/approval gates are evaluated.',
    walkthrough: ['Open Authority in the Control Plane and confirm the Settlement Agent has a grant covering the event.'],
  },
  approvalModel: {
    approvalRoleIds: ['sports-approval-role-finance-reviewer'],
    approvalRequestIds: [],
    approvalDecisionIds: [],
    approvalProofIds: [],
    approvalScenarios: [{ action: 'settle_event_payment', expectedApprovalBehavior: 'required', description: 'High-value settlements require a finance_review approval, following the same approval-gated pattern used for any other financial action.' }],
    walkthrough: ['Open Approvals in the Control Plane and locate the finance_review request for the settlement payment.'],
  },
  policyModel: {
    policyPackIds: ['policy-pack-sports-event-settlement-basic', 'policy-pack-payments-basic', 'policy-pack-financial-approval-basic'],
    policyPackVersionIds: ['policy-pack-sports-event-settlement-basic-v1', 'policy-pack-payments-basic-v1', 'policy-pack-financial-approval-basic-v1'],
    demoOnly: true,
    legalCompleteness: 'demo_policy_model',
    policyScenarios: [
      { action: 'settle_event_payment', expectedPolicyBehavior: 'requires_evidence', description: 'sports-event-settlement-basic requires event_record evidence before settle_event_payment may proceed.' },
      { action: 'settle_event_payment', expectedPolicyBehavior: 'requires_approval', description: 'High-value settlements require a finance_review approval under sports-event-settlement-basic / financial-approval-basic.' },
    ],
    walkthrough: ['Open Policy Packs in the Control Plane and confirm sports-event-settlement-basic is active and explicitly demo-only.'],
  },
  evidenceModel: {
    sourceDocumentIds: [],
    evidenceArtifactIds: [],
    evidenceRequirementIds: [],
    evidenceSatisfactionIds: [],
    evidenceProofIds: [],
    citationIds: [],
    evidenceScenarios: [
      { action: 'settle_event_payment', requiredEvidenceTypes: ['event_record'], expectedEvidenceBehavior: 'missing', description: 'settle_event_payment is blocked with no event_record evidence attached.' },
      { action: 'settle_event_payment', requiredEvidenceTypes: ['event_record'], expectedEvidenceBehavior: 'satisfied', description: 'Once an accepted event_record evidence artifact is submitted and linked, the requirement is satisfied and the settlement can be reconsidered.' },
    ],
    walkthrough: ['Open Evidence and confirm the event_record requirement moves from open to satisfied once real event record evidence is accepted.'],
  },
  actions: [
    {
      id: 'sports-action-settle-payment-missing-evidence',
      name: 'Settle event payment (missing event record)',
      description: 'Settlement is blocked because no event record evidence has been attached.',
      actorId: 'sports-actor-settlement-agent',
      agentId: 'sports-agent-settlement-agent',
      action: 'settle_event_payment',
      capability: 'sports-capability-settle-event-payment',
      resourceScope: 'event:demo-0001',
      riskLevel: 'critical',
      expectedRecognition: 'requires_evidence',
      expectedAuthority: 'valid',
      expectedApproval: 'not_required',
      expectedPolicy: 'requires_evidence',
      expectedEvidence: 'missing',
      expectedEnforcement: 'evidence_required',
      expectedExecution: 'not_executed',
    },
    {
      id: 'sports-action-settlement-payment-approval',
      name: 'Settlement payment requires finance approval',
      description: 'A high-value settlement payment requires finance approval before it can proceed, following the same governance pattern just like any other approval-gated payment.',
      actorId: 'sports-actor-finance-approver',
      action: 'settle_event_payment',
      capability: 'sports-capability-settle-event-payment',
      resourceScope: 'event:demo-0001',
      riskLevel: 'critical',
      expectedRecognition: 'allowed',
      expectedAuthority: 'valid',
      expectedApproval: 'required',
      expectedPolicy: 'requires_approval',
      expectedEvidence: 'satisfied',
      expectedEnforcement: 'approval_required',
      expectedExecution: 'not_executed',
    },
  ],
  scenarios: [
    {
      id: 'sports-scenario-settlement-blocked-missing-evidence',
      name: 'Settlement blocked pending event record evidence',
      description: 'settle_event_payment is blocked until event_record evidence is attached.',
      demoScenarioId: 'policy-pack-sports-settlement-event-record-required',
      actionIds: ['sports-action-settle-payment-missing-evidence'],
      expectedOutcome: 'evidence_required',
      controlPlaneFocus: 'evidence',
      exportPackageType: 'evidence_packet',
      buyerMessage: 'No settlement pays out on an unverified event -- Soberanía requires real event record evidence first.',
      operatorMessage: 'Open Evidence to see the open event_record requirement, then Enforcement to see the evidence_required block.',
      technicalMessage: 'sports-event-settlement-basic returns requires_evidence; Action Enforcement blocks with evidence_required.',
      acceptanceCriterionIds: ['sports-acceptance-scenarios-pass'],
      successMetricIds: ['sports-metric-evidence-readiness', 'sports-metric-risk-reduction'],
    },
    {
      id: 'sports-scenario-settlement-payment-requires-approval',
      name: 'Settlement payment requires finance approval',
      description: 'A settlement-adjacent payment requires a finance_review approval before it may proceed, exercised via the same approval-required governance pattern as the payments pilot.',
      demoScenarioId: 'policy-pack-payment-approval-required',
      actionIds: ['sports-action-settlement-payment-approval'],
      expectedOutcome: 'approval_required',
      controlPlaneFocus: 'approvals',
      exportPackageType: 'approval_decision_packet',
      buyerMessage: 'Once the event is verified, the payment itself still needs a human financial approval before it moves.',
      operatorMessage: 'Open Approvals to see the pending finance_review request, then Enforcement to see the blocked decision.',
      technicalMessage: 'financial-approval-basic requires finance_review; Action Enforcement returns approval_required.',
      acceptanceCriterionIds: ['sports-acceptance-scenarios-pass', 'sports-acceptance-export-verified'],
      successMetricIds: ['sports-metric-policy-enforcement'],
    },
    {
      id: 'sports-scenario-governance-walkthrough-and-export',
      name: 'Full governance walkthrough and verifiable settlement export',
      description: 'An operator walks the Control Plane end to end and exports a verifiable settlement decision packet.',
      demoScenarioId: 'policy-pack-control-plane-walkthrough',
      actionIds: ['sports-action-settlement-payment-approval'],
      expectedOutcome: 'executed',
      controlPlaneFocus: 'export_packages',
      exportPackageType: 'enterprise_demo_packet',
      buyerMessage: 'Every settlement decision above can be exported as a verifiable, hash-chained packet for partners and auditors.',
      operatorMessage: 'Open Export Packages / Proofs and Audit to see the packet manifest, hash, and verification status.',
      technicalMessage: 'ExportPackageRuntime seals and verifies a decision packet referencing evidence/policy/approval/enforcement proofs.',
      acceptanceCriterionIds: ['sports-acceptance-export-verified'],
      successMetricIds: ['sports-metric-auditability'],
    },
  ],
  controlPlaneWalkthrough: {
    id: 'sports-control-plane-walkthrough',
    sections: [
      { section: 'overview', title: 'Overview', whatToShow: ['Overall decision/health summary for the sports settlement trust domain.'], whyItMatters: 'Gives the buyer a single glance at how many settlement actions were governed and how many required intervention.', expectedRowsOrReferences: ['Overview status cards'] },
      { section: 'policy_packs', title: 'Policy Packs', whatToShow: ['sports-event-settlement-basic rules and the decisions they produced.'], whyItMatters: 'Shows the settlement-specific policy layer independent of recognition/authority.', expectedRowsOrReferences: ['Matched rule ids for the event-record and value-threshold-approval rules'] },
      { section: 'evidence', title: 'Evidence', whatToShow: ['The event_record requirement moving from open to satisfied.'], whyItMatters: 'Proves the settlement was gated on a real, verifiable event record -- not an unverified claim.', expectedRowsOrReferences: ['Evidence requirement/satisfaction rows for settle_event_payment'] },
      { section: 'enforcement', title: 'Enforcement', whatToShow: ['The evidence_required and approval_required enforcement decisions for the settlement.'], whyItMatters: 'Proves execution was actually blocked by real Action Enforcement decisions.', expectedRowsOrReferences: ['Enforcement decision rows for settle_event_payment'] },
      { section: 'approvals', title: 'Approvals', whatToShow: ['The finance_review approval request and decision for the settlement payment.'], whyItMatters: 'Proves a human financial approver, not the agent or a smart contract alone, made the final call.', expectedRowsOrReferences: ['Approval request/decision rows for settle_event_payment'] },
      { section: 'proofs_audit', title: 'Proofs / Audit', whatToShow: ['The proof chain linking evidence, policy, approval and enforcement decisions.'], whyItMatters: 'A partner or auditor can walk this chain without trusting the UI.', expectedRowsOrReferences: ['Proof chain entries for the settlement scenarios'] },
      { section: 'export_packages', title: 'Export Packages', whatToShow: ['The sealed, verified settlement decision packet.'], whyItMatters: 'Gives partners a portable, hash-verifiable artifact -- without claiming smart-contract legal enforceability.', expectedRowsOrReferences: ['Decision packet manifest + verification status = verified'] },
    ],
    operatorScript: [
      'Open Policy Packs first to show the settlement-specific rules, explicitly noting they are demo-only.',
      'Open Evidence to show the event_record gate, then Enforcement and Approvals to show it enforced.',
      'Close on Proofs / Audit and Export Packages to show the exportable, verifiable settlement trail.',
    ],
  },
  exportPackages: [
    { id: 'sports-export-settlement-evidence-packet', name: 'Settlement event record evidence packet', packageType: 'evidence_packet', targetType: 'enforcement_decision', targetId: 'sports-action-settle-payment-missing-evidence', expectedSections: ['summary', 'evidence', 'enforcement'], expectedVerificationStatus: 'verified_with_warnings', buyerPurpose: 'Shows a partner or auditor exactly which event evidence was required before settlement could proceed.' },
    { id: 'sports-export-settlement-approval-packet', name: 'Settlement payment approval decision packet', packageType: 'approval_decision_packet', targetType: 'enforcement_decision', targetId: 'sports-action-settlement-payment-approval', expectedSections: ['summary', 'approval', 'policy', 'enforcement'], expectedVerificationStatus: 'verified_with_warnings', buyerPurpose: 'Gives payment partners a hash-verifiable record that the settlement payment was blocked pending finance approval.' },
  ],
  acceptanceCriteria: [
    { id: 'sports-acceptance-scenarios-pass', title: 'All pilot scenarios run against real Soberanía runtimes and match expected outcomes', description: 'Every declared pilot scenario binds to a real Enterprise Demo scenario and its runtime outcome matches the pilot expected outcome.', type: 'runtime', required: true, verificationMethod: 'automated_test', expectedResult: 'Every scenario binding reports bound: true.' },
    { id: 'sports-acceptance-export-verified', title: 'Settlement export packets verify successfully', description: 'The settlement evidence packet and approval decision packet bind to real, verified Verifiable Export Package output.', type: 'export_package', required: true, verificationMethod: 'export_package_verification', expectedResult: 'Bound export packages report verification status verified or verified_with_warnings.' },
    { id: 'sports-acceptance-no-smart-contract-overclaim', title: 'No generated artifact claims smart-contract legal enforceability', description: 'Every generated pilot artifact carries the settlement disclaimer and never claims smart-contract legal enforceability or payment regulatory compliance.', type: 'security', required: true, verificationMethod: 'automated_test', expectedResult: 'No generated artifact contains a forbidden smart-contract/compliance claim.' },
    { id: 'sports-acceptance-customer-signoff', title: 'League/platform stakeholder signs off on pilot scope and outcomes', description: 'A sports/event buyer persona confirms the pilot demonstrated the value proposition within its stated non-goals.', type: 'buyer', required: false, verificationMethod: 'customer_signoff', expectedResult: 'Signed pilot acceptance record from a league/platform stakeholder.' },
  ],
  successMetrics: [
    { id: 'sports-metric-risk-reduction', label: 'Unverified settlements prevented', description: 'Number of settlement attempts blocked pending event record evidence.', category: 'risk_reduction', targetValue: '100% of settlement attempts blocked until event_record evidence exists', measurementMethod: 'Count of evidence_required enforcement decisions vs. total settlement attempts.' },
    { id: 'sports-metric-auditability', label: 'Exportable, verified settlement decision packets', description: 'Share of settlement decisions with a verified export packet.', category: 'auditability', targetValue: 'Every settlement decision has a verified export packet', measurementMethod: 'Count of verified export packages vs. total scenarios requiring one.' },
    { id: 'sports-metric-operator-visibility', label: 'Operator walkthrough completeness', description: 'Control Plane sections an operator can inspect for this pilot.', category: 'operator_visibility', targetValue: 'All 6 walkthrough sections backed by real Control Plane rows', measurementMethod: 'Control Plane section availability check.' },
    { id: 'sports-metric-execution-safety', label: 'No unauthorized settlement execution occurred', description: 'Share of blocked/approval-required settlement scenarios where the real executor never ran.', category: 'execution_safety', targetValue: '0 executed settlement side effects for blocked/approval-required scenarios', measurementMethod: 'Executor-run count on blocked/approval-required enforcement outcomes.' },
    { id: 'sports-metric-policy-enforcement', label: 'Policy-pack-gated settlement actions enforced', description: 'Share of policy-flagged settlement actions actually blocked/approval-gated by Action Enforcement.', category: 'policy_enforcement', targetValue: '100% of policy-flagged settlement actions reflected in the enforcement decision', measurementMethod: 'Cross-check policyDecisionId on enforcement decisions.' },
    { id: 'sports-metric-evidence-readiness', label: 'Event record evidence resolution', description: 'Share of event_record evidence requirements eventually satisfied with accepted evidence.', category: 'evidence_readiness', targetValue: 'event_record requirements satisfied before settlement proceeds', measurementMethod: 'Evidence Runtime requirement/satisfaction status check.' },
    { id: 'sports-metric-buyer-confidence', label: 'Buyer confidence in governed settlement execution', description: 'Qualitative buyer confidence after the pilot.', category: 'buyer_confidence', targetValue: 'Buyer persona affirms Soberanía prevented at least one unverified settlement', measurementMethod: 'Buyer walkthrough sign-off.' },
  ],
  risks: [
    { id: 'sports-risk-smart-contract-overclaim', title: 'Stakeholders mistake this pilot for smart-contract legal enforceability', description: 'Buyers may assume this pilot proves the settlement is a legally enforceable smart contract or that payments are regulatorily compliant.', severity: 'critical', mitigation: 'Every artifact and walkthrough explicitly states this pilot does not claim smart-contract legal enforceability or payment regulatory compliance.', ownerPersonaId: BUYER_SMART_CONTRACT_PRODUCT_LEAD_PERSONA_ID },
    { id: 'sports-risk-event-record-authenticity', title: 'Synthetic event records may not reflect real event-verification rigor', description: 'The demo event record evidence is illustrative and does not represent a real event-verification pipeline.', severity: 'medium', mitigation: 'Scope explicitly states event data is synthetic; a real pilot requires a customer-provided event-verification source.', ownerPersonaId: BUYER_LEAGUE_OPERATOR_PERSONA_ID },
  ],
  script: {
    id: 'sports-pilot-script',
    executiveTalkTrack: ['A settlement that pays out on an unverified event is a liability. Soberanía makes the event-record gate and the approval gate both real, both provable.'],
    operatorTalkTrack: ['Watch settlement get blocked for missing event evidence, then watch the payment itself get gated on finance approval.'],
    technicalTalkTrack: ['Every decision carries policyDecisionId/policyProofId/approvalProofId you can trace in Proofs / Audit.', 'The closing export packet is a hash-chained, independently verifiable artifact.'],
    buyerTalkTrack: ['This is what governed settlement looks like: no payout without verified event evidence, no payment without human financial approval, and a provable trail for every decision.'],
    demoFlow: [
      { step: 1, title: 'Settlement blocked (missing evidence)', instruction: 'Run the sports-settlement-event-record-required scenario.', expectedObservation: 'Execution blocked pending event_record evidence.' },
      { step: 2, title: 'Settlement payment requires approval', instruction: 'Run the payment-approval-required scenario.', expectedObservation: 'Execution blocked pending finance_review approval.' },
      { step: 3, title: 'Control Plane + export', instruction: 'Walk the Control Plane and export a verified settlement decision packet.', expectedObservation: 'Verified export package with matching proof references.' },
    ],
    closingStatement: 'Soberanía does not make a settlement a legally enforceable smart contract -- it makes every gate before that settlement provable.',
    legalDisclaimer: 'This demo script uses demo-only policy packs and synthetic event/settlement data. It does not claim smart-contract legal enforceability or payment regulatory compliance, and it is not legal advice.',
  },
  nonGoals: [
    'This pilot does not implement a standalone SaaS product, billing, or multi-tenant infrastructure.',
    'This pilot does not claim smart-contract legal enforceability.',
    'This pilot does not claim payment, gaming, or betting regulatory compliance in any jurisdiction.',
  ],
  legalDisclaimer:
    'This pilot template uses demo-only policy packs (sports-event-settlement-basic, payments-basic, financial-approval-basic) and synthetic event/settlement data. It does not claim smart-contract legal enforceability or payment regulatory compliance; it is not legal advice; and evidence presence does not prove legal sufficiency unless explicitly marked verified_by_customer or verified_by_counsel.',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};
