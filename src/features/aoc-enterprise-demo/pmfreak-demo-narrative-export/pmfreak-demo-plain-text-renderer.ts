import type { PMFreakDemoNarrativeExport } from './pmfreak-demo-narrative-export-types.js';

function renderBullets(bullets: readonly string[]): string {
  return bullets.map((bullet) => `- ${bullet}`).join('\n');
}

/**
 * Renders a deterministic plain-text string from a narrative export.
 * Creates a string only -- never writes a file, sends a message, and never
 * produces a page-layout or word-processor export artifact.
 */
export function renderPMFreakDemoNarrativePlainText(narrativeExport: PMFreakDemoNarrativeExport): string {
  const lines: string[] = [];

  lines.push(narrativeExport.headline.toUpperCase());
  lines.push('');
  lines.push(`Export ID: ${narrativeExport.exportId}`);
  lines.push(`Source scenario: ${narrativeExport.sourceScenarioTitle} (${narrativeExport.sourceScenarioId})`);
  lines.push(`Decision: ${narrativeExport.decisionLabel} (${narrativeExport.decision})`);
  lines.push('');
  lines.push(narrativeExport.summary);

  for (const section of narrativeExport.sections) {
    lines.push('');
    lines.push(section.title.toUpperCase());
    lines.push(section.summary);
    if (section.bullets.length > 0) {
      lines.push(renderBullets(section.bullets));
    }
  }

  lines.push('');
  lines.push('DISCLAIMERS');
  lines.push(renderBullets(narrativeExport.disclaimers));

  return `${lines.join('\n').trim()}\n`;
}
