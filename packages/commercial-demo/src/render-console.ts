import { BUSINESS_SCENARIO } from './scenario.js';
import type { CommercialDemoRun } from './run-demo.js';
import type { ScenarioResult } from './types.js';

const RULE = '═'.repeat(78);
const THIN_RULE = '─'.repeat(78);

/**
 * Renders one scenario as a sequence of business-readable artifact cards
 * (Phase 4: identifier, timestamp, owner, relationship, purpose — never a
 * raw object dump) followed by the business purpose of each transition
 * (Phase 5). Returns plain text so this can be printed, written to a file,
 * or asserted against in a test without depending on a terminal.
 */
export function renderScenarioToConsole(scenario: ScenarioResult): string {
  const lines: string[] = [];
  lines.push(RULE);
  lines.push(`SCENARIO: ${scenario.scenarioTitle}`);
  lines.push(RULE);
  lines.push(`Outcome: ${scenario.outcomeSummary}`);
  lines.push('');
  lines.push('Artifacts produced, in order:');
  lines.push(THIN_RULE);
  for (const card of scenario.cards) {
    lines.push(`[${card.stage}]`);
    lines.push(`  Identifier:   ${card.identifier}`);
    lines.push(`  Timestamp:    ${card.timestamp}`);
    lines.push(`  Owner:        ${card.owner}`);
    lines.push(`  Relationship: ${card.relationship}`);
    lines.push(`  Purpose:      ${card.purpose}`);
    lines.push('');
  }
  lines.push('Why each transition exists (business purpose, not implementation):');
  lines.push(THIN_RULE);
  for (const step of scenario.narrative) {
    lines.push(`${step.transition}`);
    lines.push(`  ${step.businessPurpose}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** Renders the full commercial demo run: scenario, asset, every scenario, and the audit reconstruction — the complete CTO-facing transcript. */
export function renderDemoRunToConsole(run: CommercialDemoRun): string {
  const sections: string[] = [];

  sections.push(RULE);
  sections.push('SOBERANÍA ACCESS GOVERNANCE — COMMERCIAL REFERENCE DEMO (R006.A)');
  sections.push(RULE);
  sections.push(`Customer: ${BUSINESS_SCENARIO.customerName}`);
  sections.push(BUSINESS_SCENARIO.customerDescription);
  sections.push('');
  sections.push(`Why Governed Access: ${BUSINESS_SCENARIO.whyGovernedAccess}`);
  sections.push('');
  sections.push('Why a signed URL is not enough:');
  for (const reason of BUSINESS_SCENARIO.whySignedUrlsAreInsufficient) sections.push(`  - ${reason}`);
  sections.push('');

  sections.push(renderScenarioToConsole(run.happyPath));
  sections.push(renderScenarioToConsole(run.deniedAccess));
  sections.push(renderScenarioToConsole(run.expiredGrant));
  sections.push(renderScenarioToConsole(run.unsupportedCapability));
  sections.push(renderScenarioToConsole(run.providerFailure));

  sections.push(RULE);
  sections.push('AUDIT RECONSTRUCTION — starting from EnterpriseEvidenceCorrelation alone');
  sections.push(RULE);
  for (const line of run.auditReconstruction.narrativeLines) sections.push(`  ${line}`);
  sections.push('');

  return sections.join('\n');
}
