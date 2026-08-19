import type { DemoAssertionResult } from '../domain/demo-assertion.js';
import type { DemoExportArtifact, DemoExportArtifactType } from '../domain/demo-export.js';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import type { DemoProofChain } from '../domain/demo-proof-chain.js';
import type { DemoScenario } from '../domain/demo-scenario.js';

function buildJsonSummary(scenario: DemoScenario, outcome: DemoScenarioOutcome, assertions: readonly DemoAssertionResult[], proofChain: DemoProofChain): string {
  return JSON.stringify(
    {
      scenarioId: scenario.id,
      title: scenario.title,
      category: scenario.category,
      outcome,
      assertions: assertions.map((assertion) => ({ id: assertion.assertionId, type: assertion.type, passed: assertion.passed, reasonCode: assertion.reasonCode })),
      proofChain,
    },
    null,
    2,
  );
}

function buildMarkdownScript(scenario: DemoScenario, outcome: DemoScenarioOutcome): string {
  const lines = [
    `# ${scenario.title}`,
    '',
    `**Scenario:** ${scenario.id}`,
    `**Outcome:** ${outcome.status} (${outcome.reasonCode})`,
    '',
    `## Buyer pain`,
    scenario.buyerPain,
    '',
    `## Soberanía value`,
    scenario.aocValue,
    '',
    `## Talk track`,
    ...scenario.steps.map((step, index) => `${index + 1}. **${step.title}** -- ${step.operatorNarration}`),
  ];
  return lines.join('\n');
}

function buildOperatorWalkthrough(scenario: DemoScenario, outcome: DemoScenarioOutcome, proofChain: DemoProofChain): string {
  const lines = [
    `Operator walkthrough: ${scenario.title}`,
    '',
    `Scenario id: ${scenario.id}`,
    `Outcome: ${outcome.status} (${outcome.reasonCode}: ${outcome.reason})`,
    `Executor ran: ${outcome.executorRan}`,
    `Side effects executed: ${outcome.sideEffectsExecuted}`,
    '',
    'Steps:',
    ...scenario.steps.map((step) => `- [${step.kind}] ${step.title}: ${step.description}`),
    '',
    `Proof chain complete: ${proofChain.complete}`,
    `Proof chain sources: ${proofChain.sources.join(', ') || 'none'}`,
    ...(proofChain.missingSources.length > 0 ? [`Missing sources: ${proofChain.missingSources.join(', ')}`] : []),
  ];
  return lines.join('\n');
}

function buildTechnicalTrace(scenario: DemoScenario, outcome: DemoScenarioOutcome, assertions: readonly DemoAssertionResult[], proofChain: DemoProofChain): string {
  const lines = [
    `technical_trace scenario=${scenario.id}`,
    `action=${scenario.action} capability=${scenario.capability ?? 'n/a'} resourceScope=${scenario.resourceScope}`,
    `enforcementRequestId=${outcome.enforcementRequestId ?? 'n/a'}`,
    `enforcementDecisionId=${outcome.enforcementDecisionId ?? 'n/a'}`,
    `executionResultId=${outcome.executionResultId ?? 'n/a'}`,
    `recognitionDecisionId=${outcome.recognitionDecisionId ?? 'n/a'}`,
    `authorityProofId=${outcome.authorityProofId ?? 'n/a'}`,
    `approvalProofId=${outcome.approvalProofId ?? 'n/a'}`,
    `handshakeProofId=${outcome.handshakeProofId ?? 'n/a'}`,
    `proofHash=${outcome.proofHash ?? 'n/a'}`,
    `proofChain.proofIds=${proofChain.proofIds.join(',') || 'none'}`,
    `proofChain.complete=${proofChain.complete}`,
    ...assertions.map((assertion) => `assertion[${assertion.assertionId}]=${assertion.passed ? 'PASS' : 'FAIL'} (${assertion.reasonCode})`),
  ];
  return lines.join('\n');
}

function buildSalesOnePager(scenario: DemoScenario, outcome: DemoScenarioOutcome): string {
  const lines = [
    `${scenario.title}`,
    '',
    scenario.summary,
    '',
    `Buyer pain: ${scenario.buyerPain}`,
    `Soberanía value: ${scenario.aocValue}`,
    `Enterprise message: ${scenario.enterpriseMessage}`,
    '',
    `Demonstrated outcome: ${outcome.status}.`,
  ];
  return lines.join('\n');
}

/**
 * Renders scenario runs into export artifacts. Every artifact is derived
 * exclusively from the scenario definition and the real DemoScenarioOutcome/
 * DemoAssertionResult/DemoProofChain a run actually produced -- there is no
 * filesystem write here, only in-memory string content the caller decides
 * what to do with.
 */
export class DemoExportService {
  buildArtifacts(
    scenario: DemoScenario,
    outcome: DemoScenarioOutcome,
    assertions: readonly DemoAssertionResult[],
    proofChain: DemoProofChain,
    now: () => string,
  ): readonly DemoExportArtifact[] {
    const createdAt = now();
    const builders: ReadonlyArray<{ type: DemoExportArtifactType; title: string; content: string }> = [
      { type: 'json_summary', title: `${scenario.title} -- JSON summary`, content: buildJsonSummary(scenario, outcome, assertions, proofChain) },
      { type: 'markdown_script', title: `${scenario.title} -- markdown script`, content: buildMarkdownScript(scenario, outcome) },
      { type: 'operator_walkthrough', title: `${scenario.title} -- operator walkthrough`, content: buildOperatorWalkthrough(scenario, outcome, proofChain) },
      { type: 'technical_trace', title: `${scenario.title} -- technical trace`, content: buildTechnicalTrace(scenario, outcome, assertions, proofChain) },
      { type: 'sales_one_pager', title: `${scenario.title} -- sales one-pager`, content: buildSalesOnePager(scenario, outcome) },
    ];

    return builders.map((builder) => ({
      id: `export-${scenario.id}-${builder.type}`,
      scenarioId: scenario.id,
      type: builder.type,
      title: builder.title,
      content: builder.content,
      createdAt,
    }));
  }
}

export function createDemoExportService(): DemoExportService {
  return new DemoExportService();
}
