import type { PilotTemplate, PilotTemplateId } from '../domain/pilot-template.js';
import type { PilotScenario } from '../domain/pilot-scenario.js';
import type { PilotExportPackageDefinition } from '../domain/pilot-export-package.js';
import type { PilotAcceptanceCriterion } from '../domain/pilot-acceptance-criteria.js';
import type { PilotSuccessMetric } from '../domain/pilot-success-metric.js';
import type { PilotScript } from '../domain/pilot-script.js';
import type { PilotControlPlaneWalkthrough } from '../domain/pilot-control-plane.js';
import type { PilotKit, PilotReadinessReport, PilotGeneratedArtifact } from '../domain/pilot-kit.js';

export const MINIMAL_NOW = '2026-01-01T00:00:00.000Z';

export function buildMinimalScenario(overrides: Partial<PilotScenario> = {}): PilotScenario {
  return {
    id: 'test-scenario-1',
    name: 'Test scenario',
    description: 'A minimal test scenario.',
    demoScenarioId: 'internal-agent-allowed',
    actionIds: ['test-action-1'],
    expectedOutcome: 'passed',
    controlPlaneFocus: 'enforcement',
    exportPackageType: 'decision_packet',
    buyerMessage: 'buyer message',
    operatorMessage: 'operator message',
    technicalMessage: 'technical message',
    acceptanceCriterionIds: ['test-acceptance-1'],
    successMetricIds: ['test-metric-1'],
    ...overrides,
  };
}

export function buildMinimalExportPackageDefinition(overrides: Partial<PilotExportPackageDefinition> = {}): PilotExportPackageDefinition {
  return {
    id: 'test-export-package-1',
    name: 'Test export package',
    packageType: 'decision_packet',
    targetType: 'enforcement_decision',
    targetId: 'test-action-1',
    expectedSections: ['summary', 'enforcement'],
    expectedVerificationStatus: 'verified_with_warnings',
    buyerPurpose: 'test buyer purpose',
    ...overrides,
  };
}

export function buildMinimalAcceptanceCriterion(overrides: Partial<PilotAcceptanceCriterion> = {}): PilotAcceptanceCriterion {
  return {
    id: 'test-acceptance-1',
    title: 'Test acceptance criterion',
    description: 'A minimal acceptance criterion.',
    type: 'runtime',
    required: true,
    verificationMethod: 'automated_test',
    expectedResult: 'passes',
    ...overrides,
  };
}

export function buildMinimalSuccessMetric(overrides: Partial<PilotSuccessMetric> = {}): PilotSuccessMetric {
  return {
    id: 'test-metric-1',
    label: 'Test metric',
    description: 'A minimal success metric.',
    category: 'risk_reduction',
    targetValue: 'target',
    measurementMethod: 'method',
    ...overrides,
  };
}

export function buildMinimalControlPlaneWalkthrough(overrides: Partial<PilotControlPlaneWalkthrough> = {}): PilotControlPlaneWalkthrough {
  return {
    id: 'test-walkthrough-1',
    sections: [
      {
        section: 'enforcement',
        title: 'Enforcement',
        whatToShow: ['show this'],
        whyItMatters: 'it matters',
        expectedRowsOrReferences: ['row 1'],
      },
    ],
    operatorScript: ['do this'],
    ...overrides,
  };
}

export function buildMinimalScript(overrides: Partial<PilotScript> = {}): PilotScript {
  return {
    id: 'test-script-1',
    executiveTalkTrack: ['executive line'],
    operatorTalkTrack: ['operator line'],
    technicalTalkTrack: ['technical line'],
    buyerTalkTrack: ['buyer line'],
    demoFlow: [{ step: 1, title: 'Step 1', instruction: 'do it', expectedObservation: 'observe it' }],
    closingStatement: 'closing',
    legalDisclaimer: 'This is a test fixture, not legal advice, demo-only.',
    ...overrides,
  };
}

export function buildMinimalPilotTemplate(overrides: Partial<PilotTemplate> = {}): PilotTemplate {
  return {
    id: 'datasys-project-governance' as PilotTemplateId,
    name: 'Test Pilot Template',
    description: 'A minimal, valid pilot template used for unit tests.',
    status: 'draft',
    industry: 'technology_services',
    primaryUseCase: 'test use case',
    businessPain: 'test business pain',
    aocValueProposition: 'test Soberanía value proposition',
    targetBuyerPersonaIds: ['persona-buyer-test'],
    targetOperatorPersonaIds: ['persona-operator-test'],
    trustDomainId: 'trust-domain-test',
    scope: {
      inScope: ['test in scope'],
      outOfScope: ['test out of scope'],
      durationDays: 7,
      environments: 'sandbox',
      dataSensitivity: 'synthetic_only',
      legalCompleteness: 'demo_policy_model',
      assumptions: ['test assumption'],
      constraints: ['test constraint'],
    },
    actors: [],
    agents: [],
    capabilities: [],
    authorityModel: { authorityGrantIds: [], delegationGrantIds: [], authorityProofIds: [], requiredCapabilities: [], description: 'test authority model', walkthrough: [] },
    approvalModel: { approvalRoleIds: [], approvalRequestIds: [], approvalDecisionIds: [], approvalProofIds: [], approvalScenarios: [], walkthrough: [] },
    policyModel: { policyPackIds: [], policyPackVersionIds: [], demoOnly: true, legalCompleteness: 'demo_policy_model', policyScenarios: [], walkthrough: [] },
    evidenceModel: { sourceDocumentIds: [], evidenceArtifactIds: [], evidenceRequirementIds: [], evidenceSatisfactionIds: [], evidenceProofIds: [], citationIds: [], evidenceScenarios: [], walkthrough: [] },
    actions: [],
    scenarios: [buildMinimalScenario()],
    controlPlaneWalkthrough: buildMinimalControlPlaneWalkthrough(),
    exportPackages: [buildMinimalExportPackageDefinition()],
    acceptanceCriteria: [buildMinimalAcceptanceCriterion()],
    successMetrics: [buildMinimalSuccessMetric()],
    risks: [{ id: 'test-risk-1', title: 'Test risk', description: 'A minimal risk.', severity: 'low', mitigation: 'mitigated' }],
    script: buildMinimalScript(),
    nonGoals: ['test non-goal'],
    legalDisclaimer: 'This is a test fixture. Not legal advice. Demo-only.',
    createdAt: MINIMAL_NOW,
    updatedAt: MINIMAL_NOW,
    ...overrides,
  };
}

export function buildMinimalReadinessReport(overrides: Partial<PilotReadinessReport> = {}): PilotReadinessReport {
  return {
    id: 'test-readiness-1',
    templateId: 'datasys-project-governance',
    status: 'ready',
    checkedAt: MINIMAL_NOW,
    passedCriteriaIds: [],
    failedCriteriaIds: [],
    warningCriteriaIds: [],
    issues: [],
    readyScenarioIds: [],
    missingScenarioIds: [],
    verifiedExportPackageIds: [],
    failedExportPackageIds: [],
    ...overrides,
  };
}

export function buildMinimalGeneratedArtifact(overrides: Partial<PilotGeneratedArtifact> = {}): PilotGeneratedArtifact {
  return {
    id: 'test-artifact-1',
    type: 'pilot_readme',
    title: 'Test artifact',
    content: 'Test content.',
    contentHash: 'test-hash',
    createdAt: MINIMAL_NOW,
    ...overrides,
  };
}

export function buildMinimalPilotKit(overrides: Partial<PilotKit> = {}): PilotKit {
  const template = overrides.template ?? buildMinimalPilotTemplate();
  return {
    id: 'test-pilot-kit-1',
    templateId: template.id,
    status: 'assembled',
    template,
    boundScenarioIds: [],
    boundPolicyPackIds: [],
    boundPolicyPackVersionIds: [],
    boundEvidenceProofIds: [],
    boundExportPackageIds: [],
    controlPlaneSnapshotIds: [],
    readiness: buildMinimalReadinessReport({ templateId: template.id }),
    generatedArtifacts: [],
    createdAt: MINIMAL_NOW,
    ...overrides,
  };
}
