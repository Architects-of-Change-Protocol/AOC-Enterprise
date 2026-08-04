import { BUSINESS_SCENARIO } from './scenario.js';
import type { CommercialDemoRun } from './run-demo.js';
import type { ArtifactCard, ScenarioResult } from './types.js';

function cardTable(cards: readonly ArtifactCard[]): string {
  const header = '| Stage | Identifier | Timestamp | Owner | Relationship | Purpose |\n|---|---|---|---|---|---|';
  const rows = cards.map(
    (card) =>
      `| ${card.stage} | \`${card.identifier}\` | ${card.timestamp} | ${card.owner} | ${escapeCell(card.relationship)} | ${escapeCell(card.purpose)} |`,
  );
  return [header, ...rows].join('\n');
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderScenario(scenario: ScenarioResult): string {
  const narrative = scenario.narrative.map((step) => `- **${step.transition}** — ${step.businessPurpose}`).join('\n');
  return `### ${scenario.scenarioTitle}\n\n*${scenario.outcomeSummary}*\n\n${cardTable(scenario.cards)}\n\n**Why each transition exists:**\n\n${narrative}\n`;
}

/** Renders the full commercial demo run as portable Markdown — the same content as the HTML report and console transcript, suitable for a PR body, a docs page, or a chat message. */
export function renderDemoRunToMarkdown(run: CommercialDemoRun): string {
  const sections: string[] = [];
  sections.push('# AOC Access Governance — Commercial Reference Demo (R006.A)');
  sections.push(`**Customer:** ${BUSINESS_SCENARIO.customerName} — ${BUSINESS_SCENARIO.customerDescription}`);
  sections.push(`**Why Governed Access:** ${BUSINESS_SCENARIO.whyGovernedAccess}`);
  sections.push(
    `**Why a signed URL is not enough:**\n\n${BUSINESS_SCENARIO.whySignedUrlsAreInsufficient.map((reason) => `- ${reason}`).join('\n')}`,
  );

  sections.push(renderScenario(run.happyPath));
  sections.push(renderScenario(run.deniedAccess));
  sections.push(renderScenario(run.expiredGrant));
  sections.push(renderScenario(run.unsupportedCapability));
  sections.push(renderScenario(run.providerFailure));

  sections.push('## Audit Reconstruction — starting from one EnterpriseEvidenceCorrelation id');
  sections.push(run.auditReconstruction.narrativeLines.map((line) => `1. ${line}`).join('\n'));

  return sections.join('\n\n');
}
