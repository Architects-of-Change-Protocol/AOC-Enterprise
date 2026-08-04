import { BUSINESS_SCENARIO } from './scenario.js';
import type { CommercialDemoRun } from './run-demo.js';
import type { ArtifactCard, ScenarioResult } from './types.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCard(card: ArtifactCard): string {
  return `
    <article class="card">
      <h3>${escapeHtml(card.stage)}</h3>
      <dl>
        <dt>Identifier</dt><dd>${escapeHtml(card.identifier)}</dd>
        <dt>Timestamp</dt><dd>${escapeHtml(card.timestamp)}</dd>
        <dt>Owner</dt><dd>${escapeHtml(card.owner)}</dd>
        <dt>Relationship</dt><dd>${escapeHtml(card.relationship)}</dd>
        <dt>Purpose</dt><dd>${escapeHtml(card.purpose)}</dd>
      </dl>
    </article>`;
}

function renderScenario(scenario: ScenarioResult): string {
  return `
  <section class="scenario">
    <h2>${escapeHtml(scenario.scenarioTitle)}</h2>
    <p class="outcome">${escapeHtml(scenario.outcomeSummary)}</p>
    <div class="cards">
      ${scenario.cards.map(renderCard).join('\n')}
    </div>
    <h3 class="narrative-heading">Why each transition exists</h3>
    <ol class="narrative">
      ${scenario.narrative
        .map((step) => `<li><strong>${escapeHtml(step.transition)}</strong> — ${escapeHtml(step.businessPurpose)}</li>`)
        .join('\n')}
    </ol>
  </section>`;
}

/**
 * Renders one full commercial demo run as a self-contained static HTML
 * report — no external stylesheet, script, font, or CDN reference, so it
 * opens standalone and can be screenshotted for documentation (Phase 10).
 * This is a rendering of the demo's own output, not a new dashboard: every
 * value it prints came from a real instance of a frozen Access Governance
 * contract, formatted as the same business-readable card Phase 4 requires.
 */
export function renderDemoRunToHtml(run: CommercialDemoRun): string {
  const scenarios = [run.happyPath, run.deniedAccess, run.expiredGrant, run.unsupportedCapability, run.providerFailure];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>AOC Access Governance — Commercial Reference Demo</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.5; color: #1a1a1a; background: #fafafa; }
  header { border-bottom: 3px solid #1a1a1a; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .tag { display: inline-block; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
  .reasons { background: #fff3e0; border-left: 4px solid #e08a1e; padding: 0.75rem 1rem; margin: 1rem 0; }
  .reasons li { margin: 0.35rem 0; }
  section.scenario { margin: 2.5rem 0; padding-top: 1rem; border-top: 1px solid #ddd; }
  h2 { font-size: 1.15rem; margin-bottom: 0.25rem; }
  p.outcome { color: #444; font-style: italic; margin-top: 0; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; margin: 1rem 0; }
  article.card { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem 0.9rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  article.card h3 { margin: 0 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #0a5b8c; }
  article.card dl { margin: 0; font-size: 0.85rem; }
  article.card dt { font-weight: 600; color: #555; margin-top: 0.4rem; }
  article.card dd { margin: 0.1rem 0 0; }
  h3.narrative-heading { font-size: 0.95rem; margin-bottom: 0.4rem; }
  ol.narrative { padding-left: 1.2rem; font-size: 0.9rem; color: #333; }
  ol.narrative li { margin: 0.35rem 0; }
  .audit { background: #eef7ee; border-left: 4px solid #2f8f4e; padding: 0.75rem 1rem; margin-top: 2rem; }
  .audit ol { padding-left: 1.2rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #14161a; color: #e6e6e6; }
    header { border-bottom-color: #e6e6e6; }
    .tag { color: #9aa0a6; }
    .reasons { background: #33270f; border-left-color: #e0a04a; }
    section.scenario { border-top-color: #333; }
    p.outcome { color: #b7bcc2; }
    article.card { background: #1d2025; border-color: #333; box-shadow: none; }
    article.card h3 { color: #6fb8e6; }
    article.card dt { color: #9aa0a6; }
    ol.narrative { color: #cfd3d8; }
    .audit { background: #17281c; border-left-color: #4caf6f; }
  }
</style>
</head>
<body>
<header>
  <span class="tag">AOC Architectural Consolidation Program · Sequence R006.A</span>
  <h1>Commercial Reference Demo — Governed Access for M&amp;A Diligence Documents</h1>
  <p><strong>${escapeHtml(BUSINESS_SCENARIO.customerName)}</strong> — ${escapeHtml(BUSINESS_SCENARIO.customerDescription)}</p>
  <p>${escapeHtml(BUSINESS_SCENARIO.whyGovernedAccess)}</p>
</header>

<div class="reasons">
  <strong>Why a signed URL is not enough:</strong>
  <ul>
    ${BUSINESS_SCENARIO.whySignedUrlsAreInsufficient.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('\n')}
  </ul>
</div>

${scenarios.map(renderScenario).join('\n')}

<div class="audit">
  <h2>Audit Reconstruction — starting from one EnterpriseEvidenceCorrelation id</h2>
  <ol>
    ${run.auditReconstruction.narrativeLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n')}
  </ol>
</div>

</body>
</html>
`;
}
