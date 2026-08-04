import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateEnterpriseResourceEnvelope } from '@aoc-enterprise/resource-envelope';
import { validateEnterpriseAccessDecision } from '@aoc-enterprise/access-decision';
import { validateEnterpriseAccessObligationSet } from '@aoc-enterprise/access-obligation';
import { validateEnterpriseAccessGrant } from '@aoc-enterprise/access-grant';
import { validateEnterpriseGrantRevocation } from '@aoc-enterprise/grant-revocation';
import { validateEnterpriseUsageEventSet } from '@aoc-enterprise/usage-event';
import { validateEnterpriseEvidenceCorrelation } from '@aoc-enterprise/evidence-correlation';

import { runCommercialDemo } from '../src/run-demo.js';
import { renderDemoRunToConsole, renderScenarioToConsole } from '../src/render-console.js';
import { renderDemoRunToHtml } from '../src/render-report.js';
import { renderDemoRunToMarkdown } from '../src/render-markdown.js';

describe('runCommercialDemo — happy path', () => {
  it('produces a resource envelope that is independently valid', async () => {
    const run = await runCommercialDemo();
    assert.equal(validateEnterpriseResourceEnvelope(run.resourceEnvelope).valid, true);
  });

  it('produces a conditional decision, obligations, an active grant, translation, execution, usage, and correlation, each independently valid', async () => {
    const run = await runCommercialDemo();
    const history = run.auditReconstruction.history;

    assert.equal(history.decisions.length, 1);
    assert.equal(history.decisions[0]?.outcome, 'conditional');
    assert.equal(validateEnterpriseAccessDecision(history.decisions[0]).valid, true);

    assert.equal(history.obligations.length, 3);
    assert.equal(validateEnterpriseAccessObligationSet(history.obligations).valid, true);
    assert.ok(history.obligations.some((obligation) => obligation.type === 'watermark-content'));

    assert.equal(history.grants.length, 1);
    assert.equal(history.grants[0]?.status, 'active');
    assert.equal(validateEnterpriseAccessGrant(history.grants[0]).valid, true);

    assert.equal(history.usageEvents.length, 3);
    assert.equal(validateEnterpriseUsageEventSet(history.usageEvents).valid, true);
    assert.ok(!history.usageEvents.some((event) => event.eventType === 'ContentDownloaded'), 'read-only obligation implies no ContentDownloaded event');

    assert.equal(history.revocations.length, 1);
    assert.equal(history.revocations[0]?.reason, 'administrator-revoked');
    assert.equal(validateEnterpriseGrantRevocation(history.revocations[0]).valid, true);

    assert.equal(validateEnterpriseEvidenceCorrelation(run.auditReconstruction.history.correlation).valid, true);
  });

  it('reconstructs a complete, ordered audit history from the evidence correlation id alone', async () => {
    const run = await runCommercialDemo();
    const lines = run.auditReconstruction.narrativeLines.join('\n');
    assert.ok(/Who requested: 'counsel-r-harrington-lee-llp'/.test(lines))
    assert.ok(/Who approved: 'meridian-approval-engine'/.test(lines))
    assert.ok(/When granted:/.test(lines))
    assert.ok(/When used:/.test(lines))
    assert.ok(/When revoked:.*administrator-revoked/.test(lines))

    const occurredAtValues = run.auditReconstruction.history.usageEvents.map((event) => Date.parse(event.occurredAt));
    const sorted = [...occurredAtValues].sort((a, b) => a - b);
    assert.deepEqual(occurredAtValues, sorted, 'usage events must be reconstructed in chronological order');
  });
});

describe('runCommercialDemo — failure demonstrations', () => {
  it('denies access outright and correlates only the decision', async () => {
    const run = await runCommercialDemo();
    assert.equal(run.deniedAccess.cards.some((card) => card.stage === 'Access Decision'), true);
    assert.equal(run.deniedAccess.cards.some((card) => card.stage === 'Access Grant'), false);
    assert.equal(run.deniedAccess.cards.some((card) => card.stage === 'Provider Execution'), false);
  });

  it('refuses an already-expired grant before any provider translation is honored', async () => {
    const run = await runCommercialDemo();
    assert.ok(/failureReason 'grant-expired'/.test(run.expiredGrant.outcomeSummary))
    assert.equal(run.expiredGrant.cards.some((card) => card.stage === 'Provider Translation'), false);
  });

  it('refuses a translation whose required capability Pinata has not declared', async () => {
    const run = await runCommercialDemo();
    assert.ok(/failureReason 'capability-unsupported'/.test(run.unsupportedCapability.outcomeSummary))
  });

  it('normalizes a provider outage into a canonical failure without leaking provider internals', async () => {
    const run = await runCommercialDemo();
    assert.ok(/failureReason 'provider-unavailable'/.test(run.providerFailure.outcomeSummary))
    const outcomeText = JSON.stringify(run.providerFailure);
    assert.ok(!outcomeText.includes('PinataProviderClientError'), 'the canonical failure must never leak the raw error class name');
  });
});

describe('rendering', () => {
  it('renders every scenario and the full run to non-empty, business-readable console text', async () => {
    const run = await runCommercialDemo();
    const scenarioText = renderScenarioToConsole(run.happyPath);
    assert.ok(/SCENARIO: Happy path/.test(scenarioText))
    assert.ok(/Identifier:/.test(scenarioText))
    assert.ok(/Purpose:/.test(scenarioText))

    const fullText = renderDemoRunToConsole(run);
    assert.ok(/Meridian Diligence/.test(fullText))
    assert.ok(/AUDIT RECONSTRUCTION/.test(fullText))
  });

  it('renders a self-contained HTML report with no external references', async () => {
    const run = await runCommercialDemo();
    const html = renderDemoRunToHtml(run);
    assert.ok(/<!doctype html>/.test(html))
    assert.ok(!/https?:\/\/(?!meridian-diligence)/.test(html.replace(/mypinata\.cloud[^"]*/g, '')), 'report must not reference external hosts other than the illustrative Pinata gateway URL');
    assert.ok(!html.includes('<script src='), 'report must not load an external script');
    assert.ok(!html.includes('<link '), 'report must not load an external stylesheet or font');
  });

  it('renders a Markdown report covering every scenario', async () => {
    const run = await runCommercialDemo();
    const markdown = renderDemoRunToMarkdown(run);
    assert.ok(/# AOC Access Governance/.test(markdown))
    assert.ok(/Audit Reconstruction/.test(markdown))
  });
});
