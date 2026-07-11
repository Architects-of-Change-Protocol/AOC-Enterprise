import type { AssuranceControlDefinition, AssuranceEvidenceRequirement, AssuranceFramework } from './contracts.js';

/**
 * The first runtime Assurance framework: `aoc.saf` 1.0.0 -- the runtime
 * translation of the Sovereignty Assurance Framework concepts that exist in
 * this repository today.
 *
 * IMPORTANT HONESTY NOTE (see `docs/enterprise/AOC_SAF_V1_RUNTIME_MAPPING.md`
 * and `docs/enterprise/AOC_ASSURANCE_CURRENT_MODEL.md`): no standalone
 * SAF-001/002/003 documents exist in this repository. The canonical
 * conceptual sources for this framework are therefore the repository's
 * *implemented* sovereignty-assurance concepts:
 *
 *  - the Governance Store's durable, integrity-digested decision records and
 *    its reserved `assurance_record` reference type (PR-004);
 *  - the Evidence Bundle's `Truth != Disclosure` disclosure-governed
 *    projections and verification (PR-005);
 *  - the Agent Passport's organization-bound identity, event-chain
 *    integrity, and lifecycle enforcement, plus the `agent-governance`
 *    package's governance-level ladder (registered -> constitutional ->
 *    observed -> governed -> enforced -> certified), whose upper rungs were
 *    never earned by any engine until now (PR-006);
 *  - the Module Lifecycle's readiness/health model (PR-003);
 *  - the claim-safety / no-overclaim discipline
 *    (`policy-pack-claim-safety.ts`), which is why every control here is
 *    evidence-driven and why eligibility profiles carry neutral names
 *    (`baseline`/`advanced`/`continuous`), never "certified".
 *
 * Every domain and control below names its conceptual source in `tags`.
 * This framework version is immutable once registered as active -- every
 * change to controls, weights, or thresholds requires `aoc.saf` 1.1.0+.
 */

export const AOC_SAF_FRAMEWORK_ID = 'aoc.saf';
export const AOC_SAF_FRAMEWORK_VERSION = '1.0.0';

const FRAMEWORK_BINDING = { frameworkId: AOC_SAF_FRAMEWORK_ID, frameworkVersion: AOC_SAF_FRAMEWORK_VERSION } as const;

const EVIDENCE_REQUIREMENTS: readonly AssuranceEvidenceRequirement[] = [
  {
    requirementId: 'saf.req.governance-records',
    description: 'Verified Governance Records demonstrating governed decisions for the subject within the assessment scope.',
    acceptedEvidenceTypes: ['governance_record'],
    minimumCount: 1,
    mustBeVerified: true,
    mustBeOrganizationBound: true,
    contradictionPolicy: 'manual_review',
  },
  {
    requirementId: 'saf.req.evidence-bundles',
    description: 'Structurally verified Evidence Bundles projected from Governance Records under an explicit disclosure policy.',
    acceptedEvidenceTypes: ['evidence_bundle'],
    minimumCount: 1,
    mustBeVerified: true,
    mustBeOrganizationBound: true,
    contradictionPolicy: 'manual_review',
  },
  {
    requirementId: 'saf.req.agent-passport',
    description: 'An organization-bound Agent Passport reconstructed from its append-only event chain for the assessed agent.',
    acceptedEvidenceTypes: ['agent_passport'],
    minimumCount: 1,
    mustBeOrganizationBound: true,
    mustReferenceSubject: true,
    contradictionPolicy: 'fail',
  },
  {
    requirementId: 'saf.req.enterprise-health',
    description: 'A current Enterprise readiness observation from the Module Lifecycle controller.',
    acceptedEvidenceTypes: ['enterprise_health'],
    minimumCount: 1,
    contradictionPolicy: 'unknown',
  },
  {
    requirementId: 'saf.req.module-health',
    description: 'Current per-module health observations from the Enterprise Module Registry.',
    acceptedEvidenceTypes: ['module_health'],
    minimumCount: 1,
    contradictionPolicy: 'unknown',
  },
  {
    requirementId: 'saf.req.review-attestation',
    description: 'An attributable reviewer attestation supporting an independent operational review.',
    acceptedEvidenceTypes: ['control_attestation'],
    minimumCount: 1,
    manualEvidenceAllowed: true,
    contradictionPolicy: 'manual_review',
  },
];

const AGENT_SUBJECTS = { subjectTypes: ['agent', 'passport'] as const, justification: 'Agent-identity controls evaluate an Agent Passport; they do not apply to organization-, system-, or process-level subjects.' };

const CONTROLS: readonly AssuranceControlDefinition[] = [
  // -- Domain: governance integrity (source: PR-004 Governance Store) --------
  {
    controlId: 'saf.gov.records-present',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.governance-integrity',
    title: 'Governed decisions are durably recorded',
    description: 'The subject operates through Kernel evaluations whose request/decision aggregates are durably persisted in the Governance Store.',
    objective: 'Demonstrate that the subject’s actions are governed and produce a durable, queryable decision history.',
    controlType: 'governance',
    criticality: 'mandatory',
    evaluationMethod: 'evidence_presence',
    evidenceRequirementIds: ['saf.req.governance-records'],
    criteria: { type: 'evidence_presence', requirementIds: ['saf.req.governance-records'], minimumSatisfied: 1, allMandatory: true },
    scoring: { weight: 1, maximumScore: 100 },
    remediationGuidance: 'Route the subject’s governed actions through POST /api/governance/evaluate so Governance Records accumulate for the assessment scope.',
    tags: ['source:PR-004', 'source:governance-store'],
  },
  {
    controlId: 'saf.gov.records-integrity',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.governance-integrity',
    title: 'Governance Record integrity verifies',
    description: 'Every Governance Record accepted as evidence recomputes its SHA-256 aggregate digest successfully.',
    objective: 'Demonstrate that the preserved decision history has not been altered after commit.',
    controlType: 'detective',
    criticality: 'mandatory',
    evaluationMethod: 'boolean',
    evidenceRequirementIds: ['saf.req.governance-records'],
    criteria: { type: 'boolean', metric: 'governance.records.all_verified', expected: true },
    scoring: { weight: 1, maximumScore: 100 },
    severityMapping: { fail: 'critical' },
    remediationGuidance: 'Run Governance Store integrity verification, identify the corrupted aggregates, and restore from a trusted replica before re-assessing.',
    tags: ['source:PR-004', 'blocking'],
  },

  // -- Domain: evidence disclosure (source: PR-005 Evidence Bundle) -----------
  {
    controlId: 'saf.evidence.bundles-present',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.evidence-disclosure',
    title: 'Disclosure-governed Evidence Bundles exist',
    description: 'Evidence Bundles projected under explicit disclosure policies exist for the subject’s governed decisions.',
    objective: 'Demonstrate the subject can prove decisions to outside parties without disclosing everything it knows (Truth != Disclosure).',
    controlType: 'evidence',
    criticality: 'recommended',
    evaluationMethod: 'evidence_presence',
    evidenceRequirementIds: ['saf.req.evidence-bundles'],
    criteria: { type: 'evidence_presence', requirementIds: ['saf.req.evidence-bundles'], minimumSatisfied: 1, allMandatory: false },
    scoring: { weight: 1, maximumScore: 100 },
    remediationGuidance: 'Build Evidence Bundles (POST /api/evidence/build) for the subject’s material Governance Records.',
    tags: ['source:PR-005', 'source:evidence-bundle'],
  },
  {
    controlId: 'saf.evidence.bundles-verified',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.evidence-disclosure',
    title: 'Evidence Bundles verify structurally',
    description: 'Every Evidence Bundle accepted as evidence passes structural verification (bundle digest, verification digest, policy match, completeness).',
    objective: 'Demonstrate that disclosed evidence is internally consistent with its declared disclosure policy and source record.',
    controlType: 'detective',
    criticality: 'mandatory',
    evaluationMethod: 'boolean',
    evidenceRequirementIds: ['saf.req.evidence-bundles'],
    criteria: { type: 'boolean', metric: 'evidence.bundles.all_verified', expected: true },
    scoring: { weight: 1, maximumScore: 100 },
    severityMapping: { fail: 'high' },
    remediationGuidance: 'Re-verify the failing Bundles; supersede any Bundle whose digests no longer verify with a freshly projected replacement.',
    tags: ['source:PR-005'],
  },

  // -- Domain: agent identity (source: PR-006 Agent Passport + agent-governance levels)
  {
    controlId: 'saf.identity.passport-bound',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.agent-identity',
    title: 'The agent carries an organization-bound Passport',
    description: 'The assessed agent has an Agent Passport bound to the assessing organization, reconstructed from its append-only event history.',
    objective: 'Demonstrate the agent is a recognized, identified participant rather than an anonymous actor.',
    controlType: 'preventive',
    criticality: 'mandatory',
    evaluationMethod: 'evidence_presence',
    evidenceRequirementIds: ['saf.req.agent-passport'],
    criteria: { type: 'evidence_presence', requirementIds: ['saf.req.agent-passport'], minimumSatisfied: 1, allMandatory: true },
    scoring: { weight: 1, maximumScore: 100 },
    applicability: AGENT_SUBJECTS,
    remediationGuidance: 'Issue and activate an Agent Passport for the agent within the assessing organization.',
    tags: ['source:PR-006', 'source:agent-governance-levels'],
  },
  {
    controlId: 'saf.identity.passport-integrity',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.agent-identity',
    title: 'Passport event-chain integrity verifies',
    description: 'The agent’s Passport passes verification: its event chain digests recompute and its reconstructed state is consistent.',
    objective: 'Demonstrate the agent’s governed history has not been altered after append.',
    controlType: 'detective',
    criticality: 'mandatory',
    evaluationMethod: 'boolean',
    evidenceRequirementIds: ['saf.req.agent-passport'],
    criteria: { type: 'boolean', metric: 'passport.verified', expected: true },
    scoring: { weight: 1, maximumScore: 100 },
    severityMapping: { fail: 'critical' },
    applicability: AGENT_SUBJECTS,
    remediationGuidance: 'Investigate the Passport integrity failure; a tampered event chain requires incident response, not re-issuance.',
    tags: ['source:PR-006', 'blocking'],
  },
  {
    controlId: 'saf.identity.revocation-enforced',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.agent-identity',
    title: 'Passport lifecycle (including revocation) is enforced',
    description: 'The agent’s Passport lifecycle state machine verifies: terminal states are terminal and every transition in its history was legal.',
    objective: 'Demonstrate that suspension and revocation are enforceable and enforced for this agent’s identity.',
    controlType: 'preventive',
    criticality: 'mandatory',
    evaluationMethod: 'boolean',
    evidenceRequirementIds: ['saf.req.agent-passport'],
    criteria: { type: 'boolean', metric: 'passport.lifecycle_valid', expected: true },
    scoring: { weight: 1, maximumScore: 100 },
    severityMapping: { fail: 'critical' },
    applicability: AGENT_SUBJECTS,
    remediationGuidance: 'Audit the Passport’s lifecycle events; an illegal transition in history is an integrity incident.',
    tags: ['source:PR-006', 'blocking'],
  },

  // -- Domain: operational continuity (source: PR-003 Module Lifecycle) -------
  {
    controlId: 'saf.ops.enterprise-ready',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.operational-continuity',
    title: 'The Enterprise Host reports ready',
    description: 'The hosting Enterprise reports a ready lifecycle state at evidence-collection time.',
    objective: 'Demonstrate the governance runtime hosting the subject is operational.',
    controlType: 'detective',
    criticality: 'mandatory',
    evaluationMethod: 'boolean',
    evidenceRequirementIds: ['saf.req.enterprise-health'],
    criteria: { type: 'boolean', metric: 'enterprise.ready', expected: true },
    scoring: { weight: 1, maximumScore: 100 },
    remediationGuidance: 'Restore Enterprise readiness (failed required modules block readiness) before re-collecting evidence.',
    tags: ['source:PR-003', 'source:module-lifecycle'],
  },
  {
    controlId: 'saf.ops.modules-healthy',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.operational-continuity',
    title: 'No Enterprise module is unhealthy',
    description: 'Every registered Enterprise module reports healthy or degraded -- none reports unhealthy at evidence-collection time.',
    objective: 'Demonstrate the governance runtime’s modules are operating within tolerance.',
    controlType: 'detective',
    criticality: 'recommended',
    evaluationMethod: 'threshold',
    evidenceRequirementIds: ['saf.req.module-health'],
    criteria: { type: 'threshold', metric: 'modules.unhealthy_count', operator: 'eq', value: 0 },
    scoring: { weight: 1, maximumScore: 100 },
    remediationGuidance: 'Investigate and restore the unhealthy module(s) reported by the module registry.',
    tags: ['source:PR-003'],
  },
  {
    controlId: 'saf.ops.independent-review',
    ...FRAMEWORK_BINDING,
    domainId: 'saf.operational-continuity',
    title: 'Independent operational review completed',
    description: 'A human reviewer has independently confirmed the subject’s operational governance posture for this assessment period.',
    objective: 'Preserve the human-review discipline the platform’s claim-safety rules demand: automated evidence alone does not certify operations.',
    controlType: 'governance',
    criticality: 'recommended',
    evaluationMethod: 'manual_review',
    evidenceRequirementIds: ['saf.req.review-attestation'],
    criteria: {
      type: 'manual_review',
      questions: [
        'Has the subject operated within its governed scope during the assessment period?',
        'Are there operational incidents not visible in Governance Records that bear on this assessment?',
      ],
      requiredReviewerRole: 'assurance-reviewer',
      requiredEvidenceRequirementIds: ['saf.req.review-attestation'],
    },
    scoring: { weight: 1, maximumScore: 100 },
    remediationGuidance: 'Record an attributable manual review by a reviewer holding the assurance-reviewer role.',
    tags: ['source:claim-safety', 'source:requires_customer_validation'],
  },
];

export const AOC_SAF_FRAMEWORK_V1: AssuranceFramework = {
  frameworkId: AOC_SAF_FRAMEWORK_ID,
  frameworkVersion: AOC_SAF_FRAMEWORK_VERSION,
  name: 'AOC Sovereignty Assurance Framework (Runtime Translation)',
  description:
    'Evidence-driven runtime translation of the repository’s sovereignty-assurance concepts: governed decisions, disclosure-governed evidence, organization-bound agent identity, and operational continuity. Framework-bound and scope-bound; results are never universal trust scores or certifications.',
  issuer: 'architects-of-change-protocol',
  issuedAt: '2026-07-01T00:00:00.000Z',
  status: 'active',
  domains: [
    {
      domainId: 'saf.governance-integrity',
      name: 'Governance Integrity',
      description: 'Governed decisions exist, are durably recorded, and their preserved history verifies.',
      controlIds: ['saf.gov.records-present', 'saf.gov.records-integrity'],
      weight: 0.3,
      minimumScore: 50,
      blockingControlIds: ['saf.gov.records-integrity'],
      tags: ['source:PR-004'],
    },
    {
      domainId: 'saf.evidence-disclosure',
      name: 'Evidence & Disclosure',
      description: 'Decisions can be demonstrated through disclosure-governed, verifiable Evidence Bundles.',
      controlIds: ['saf.evidence.bundles-present', 'saf.evidence.bundles-verified'],
      weight: 0.25,
      tags: ['source:PR-005'],
    },
    {
      domainId: 'saf.agent-identity',
      name: 'Agent Identity & Lifecycle',
      description: 'Agent subjects carry organization-bound Passports whose integrity and lifecycle enforcement verify.',
      controlIds: ['saf.identity.passport-bound', 'saf.identity.passport-integrity', 'saf.identity.revocation-enforced'],
      weight: 0.25,
      blockingControlIds: ['saf.identity.passport-integrity', 'saf.identity.revocation-enforced'],
      tags: ['source:PR-006'],
    },
    {
      domainId: 'saf.operational-continuity',
      name: 'Operational Continuity',
      description: 'The governance runtime hosting the subject is ready, its modules healthy, and its operation independently reviewed.',
      controlIds: ['saf.ops.enterprise-ready', 'saf.ops.modules-healthy', 'saf.ops.independent-review'],
      weight: 0.2,
      tags: ['source:PR-003', 'source:claim-safety'],
    },
  ],
  controls: CONTROLS,
  evidenceRequirements: EVIDENCE_REQUIREMENTS,
  scoringModel: {
    methodologyId: 'aoc.saf.scoring',
    methodologyVersion: '1.0.0',
    // pass=1, partial=0.5, fail=0. unknown/manual_review score per policy
    // below; not_applicable is always excluded from the denominator.
    statusScores: { pass: 1, partial: 0.5, fail: 0, unknown: null, not_applicable: null, manual_review_required: null },
    domainWeights: {},
    controlWeights: {},
    // Claim-safety discipline: missing evidence scores zero rather than
    // being hidden from the denominator -- unknown stays visible AND costly.
    unknownPolicy: 'zero',
    manualReviewPolicy: 'provisional',
    blockingRule: 'both',
  },
  eligibilityProfiles: [
    {
      profileId: 'baseline',
      name: 'Baseline',
      description: 'Governed decisions exist, their history verifies, and no critical finding is open.',
      minimumOverallScore: 60,
      mandatoryControlIds: ['saf.gov.records-present', 'saf.gov.records-integrity'],
      prohibitedOpenSeverities: ['critical'],
      manualReviewRequired: false,
    },
    {
      profileId: 'advanced',
      name: 'Advanced',
      description: 'Strong evidence coverage: verified disclosure-governed evidence, high verified-evidence rate, no high-or-worse open findings.',
      minimumOverallScore: 80,
      minimumDomainScores: { 'saf.governance-integrity': 75, 'saf.evidence-disclosure': 70 },
      mandatoryControlIds: ['saf.gov.records-present', 'saf.gov.records-integrity', 'saf.evidence.bundles-verified'],
      prohibitedOpenSeverities: ['critical', 'high'],
      minimumVerifiedEvidenceRate: 0.8,
      manualReviewRequired: false,
    },
    {
      profileId: 'continuous',
      name: 'Continuous',
      description: 'Advanced posture sustained with fresh evidence and an independent human review.',
      minimumOverallScore: 85,
      minimumDomainScores: { 'saf.governance-integrity': 75, 'saf.evidence-disclosure': 70, 'saf.operational-continuity': 70 },
      prohibitedOpenSeverities: ['critical', 'high'],
      minimumVerifiedEvidenceRate: 0.8,
      maximumEvidenceAgeDays: 90,
      manualReviewRequired: true,
    },
  ],
  metadata: {
    conceptualSources: [
      'src/enterprise/governance-store (PR-004): durable decision records, integrity digests, reserved assurance_record references',
      'src/enterprise/evidence (PR-005): Truth != Disclosure, bundle verification, reserved assurance references',
      'src/enterprise/passport (PR-006): organization-bound identity, event-chain integrity, lifecycle enforcement, no-arbitrary-trust-score',
      'src/enterprise/lifecycle + modules (PR-003): readiness and module health',
      'packages/agent-governance governance-level ladder (registered..certified) -- upper rungs previously unearned by any engine',
      'src/features/policy-pack-foundation claim-safety: prohibited overclaim phrases, requires_customer_validation',
    ],
    safDocumentStatus: 'No standalone SAF-001/002/003 documents exist in this repository; see docs/enterprise/AOC_SAF_V1_RUNTIME_MAPPING.md.',
  },
};
