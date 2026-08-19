import { createHash } from 'crypto';
import type { PilotTemplate } from '../domain/pilot-template.js';
import type { PilotGeneratedArtifact, PilotGeneratedArtifactType } from '../domain/pilot-kit.js';
import type { PilotRuntimeContext } from '../domain/pilot-runtime-context.js';

// Recursively sorts object keys so hashing/serialization never depends on insertion order.
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortValue(entryValue);
    }
    return sorted;
  }
  return value;
}

export function stablePilotStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2);
}

export function createPilotContentDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

const NOT_LEGAL_ADVICE_NOTICE = 'This pilot template is not legal advice. It does not prove regulatory, legal, or production compliance -- only real, runtime-backed Soberanía outputs (recognition, authority, approval, policy, evidence, enforcement, and export decisions) are shown, and every claim of legal sufficiency requires explicit customer or counsel validation outside this template.';

function heading(text: string, level = 1): string {
  return `${'#'.repeat(level)} ${text}`;
}

function bulletList(items: readonly string[]): string {
  return items.length === 0 ? '- (none)' : items.map((item) => `- ${item}`).join('\n');
}

/**
 * Generates deterministic, template-derived text artifacts. Every artifact
 * is built purely from `PilotTemplate`'s own fields -- never from an LLM,
 * and never claiming legal/regulatory/production compliance (every artifact
 * carries `NOT_LEGAL_ADVICE_NOTICE` plus the template's own
 * `legalDisclaimer`).
 */
export class PilotScriptService {
  constructor(private readonly ctx: PilotRuntimeContext) {}

  generateAll(template: PilotTemplate): readonly PilotGeneratedArtifact[] {
    return [
      this.build(template, 'pilot_readme', this.renderReadme(template)),
      this.build(template, 'demo_script', this.renderDemoScript(template)),
      this.build(template, 'technical_setup', this.renderTechnicalSetup(template)),
      this.build(template, 'acceptance_checklist', this.renderAcceptanceChecklist(template)),
      this.build(template, 'buyer_summary', this.renderBuyerSummary(template)),
      this.build(template, 'operator_walkthrough', this.renderOperatorWalkthrough(template)),
      this.build(template, 'pilot_json', this.renderPilotJson(template)),
    ];
  }

  private build(template: PilotTemplate, type: PilotGeneratedArtifactType, content: string): PilotGeneratedArtifact {
    return {
      id: this.ctx.ids.nextId(`pilot-artifact-${type}`),
      type,
      title: `${template.name} -- ${type.replace(/_/g, ' ')}`,
      content,
      contentHash: createPilotContentDigest(content),
      createdAt: this.ctx.clock.now(),
    };
  }

  renderReadme(template: PilotTemplate): string {
    return [
      heading(`${template.name} -- Pilot Overview`),
      template.description,
      '',
      heading('Primary use case', 2),
      template.primaryUseCase,
      '',
      heading('Target personas', 2),
      bulletList([...template.targetBuyerPersonaIds, ...template.targetOperatorPersonaIds]),
      '',
      heading('Scope', 2),
      `In scope:\n${bulletList(template.scope.inScope)}`,
      `Out of scope:\n${bulletList(template.scope.outOfScope)}`,
      `Duration: ${template.scope.durationDays} day(s). Environment: ${template.scope.environments}. Data sensitivity: ${template.scope.dataSensitivity}. Legal completeness: ${template.scope.legalCompleteness}.`,
      '',
      heading('Non-goals', 2),
      bulletList(template.nonGoals),
      '',
      heading('Soberanía components used', 2),
      bulletList([
        'Recognition Runtime',
        'Authority Graph',
        'Approval Runtime',
        'External Agent Handshake',
        'Action Enforcement',
        'Domain Policy Pack Runtime',
        'Evidence / Source / Citation Runtime',
        'Soberanía Control Plane',
        'Soberanía Enterprise Demo',
        'Verifiable Export Package',
      ]),
      '',
      heading('Scenarios', 2),
      bulletList(template.scenarios.map((scenario) => `${scenario.name} -- expected outcome: ${scenario.expectedOutcome}`)),
      '',
      heading('Control Plane walkthrough', 2),
      bulletList(template.controlPlaneWalkthrough.sections.map((section) => section.title)),
      '',
      heading('Export packages', 2),
      bulletList(template.exportPackages.map((exportPackage) => `${exportPackage.name} (${exportPackage.packageType})`)),
      '',
      heading('Acceptance criteria', 2),
      bulletList(template.acceptanceCriteria.map((criterion) => `${criterion.title} [${criterion.verificationMethod}]`)),
      '',
      heading('Legal / compliance disclaimer', 2),
      template.legalDisclaimer,
      NOT_LEGAL_ADVICE_NOTICE,
    ].join('\n');
  }

  renderDemoScript(template: PilotTemplate): string {
    const script = template.script;
    return [
      heading(`${template.name} -- Demo Script`),
      heading('Opening statement', 2),
      script.executiveTalkTrack[0] ?? template.aocValueProposition,
      '',
      heading('Buyer pain', 2),
      template.businessPain,
      '',
      heading('Scenario order', 2),
      bulletList(template.scenarios.map((scenario, index) => `${index + 1}. ${scenario.name} (${scenario.controlPlaneFocus})`)),
      '',
      heading('Operator narration', 2),
      bulletList(script.operatorTalkTrack),
      '',
      heading('Technical narration', 2),
      bulletList(script.technicalTalkTrack),
      '',
      heading('What to show in Control Plane', 2),
      bulletList(template.controlPlaneWalkthrough.sections.map((section) => section.title)),
      '',
      heading('What to export', 2),
      bulletList(template.exportPackages.map((exportPackage) => exportPackage.name)),
      '',
      heading('Demo flow', 2),
      bulletList(script.demoFlow.map((step) => `Step ${step.step}: ${step.title} -- ${step.instruction} (expect: ${step.expectedObservation})`)),
      '',
      heading('Closing statement', 2),
      script.closingStatement,
      '',
      heading('Legal / compliance disclaimer', 2),
      script.legalDisclaimer,
      NOT_LEGAL_ADVICE_NOTICE,
    ].join('\n');
  }

  renderTechnicalSetup(template: PilotTemplate): string {
    return [
      heading(`${template.name} -- Technical Setup Notes`),
      heading('Required Soberanía modules', 2),
      bulletList([
        'src/features/recognition-runtime',
        'src/features/authority-graph',
        'src/features/approval-runtime',
        'src/features/external-agent-handshake',
        'src/features/action-enforcement',
        'src/features/domain-policy-pack-runtime',
        'src/features/evidence-source-runtime',
        'src/features/aoc-control-plane',
        'src/features/aoc-enterprise-demo',
        'src/features/verifiable-export-package',
        'src/features/aoc-enterprise-pilot-template',
      ]),
      '',
      heading('Required fixtures', 2),
      bulletList([`fixtures/${template.id}-pilot.fixture.ts`, 'fixtures/enterprise-pilot-template.fixture.ts']),
      '',
      heading('Required policy packs', 2),
      bulletList(template.policyModel.policyPackIds),
      '',
      heading('Required evidence fixtures', 2),
      bulletList(template.evidenceModel.evidenceScenarios.map((scenario) => `${scenario.action}: ${scenario.requiredEvidenceTypes.join(', ')}`)),
      '',
      heading('Required export package fixtures', 2),
      bulletList(template.exportPackages.map((exportPackage) => exportPackage.name)),
      '',
      heading('Test commands', 2),
      bulletList(['npm run build && node --test src/features/aoc-enterprise-pilot-template', 'npm run typecheck', 'npm run lint']),
    ].join('\n');
  }

  renderAcceptanceChecklist(template: PilotTemplate): string {
    const automatedMethods = new Set(['automated_test', 'export_package_verification']);
    return [
      heading(`${template.name} -- Acceptance Checklist`),
      ...template.acceptanceCriteria.map((criterion) =>
        [
          `- [ ] ${criterion.title} (${automatedMethods.has(criterion.verificationMethod) ? 'automated' : 'manual'} via ${criterion.verificationMethod})`,
          `  ${criterion.description}`,
          `  Expected result: ${criterion.expectedResult}`,
        ].join('\n'),
      ),
    ].join('\n');
  }

  renderBuyerSummary(template: PilotTemplate): string {
    return [
      heading(`${template.name} -- Buyer Summary`),
      heading('Business pain', 2),
      template.businessPain,
      '',
      heading('Soberanía value', 2),
      template.aocValueProposition,
      '',
      heading('What this pilot proves', 2),
      bulletList(template.scenarios.map((scenario) => scenario.buyerMessage)),
      '',
      heading('What this pilot does not prove', 2),
      bulletList(template.nonGoals),
      '',
      heading('Success metrics', 2),
      bulletList(template.successMetrics.map((metric) => `${metric.label}: ${metric.targetValue}`)),
      '',
      heading('Legal / compliance disclaimer', 2),
      template.legalDisclaimer,
      NOT_LEGAL_ADVICE_NOTICE,
    ].join('\n');
  }

  renderOperatorWalkthrough(template: PilotTemplate): string {
    const walkthrough = template.controlPlaneWalkthrough;
    return [
      heading(`${template.name} -- Operator Walkthrough`),
      ...walkthrough.sections.map((section) =>
        [
          heading(section.title, 2),
          section.whyItMatters,
          'What to show:',
          bulletList(section.whatToShow),
          'References to inspect:',
          bulletList(section.expectedRowsOrReferences),
        ].join('\n'),
      ),
      '',
      heading('Decision / proof / evidence / export flow', 2),
      bulletList(template.scenarios.map((scenario) => `${scenario.name}: ${scenario.controlPlaneFocus} -> ${scenario.exportPackageType}`)),
      '',
      heading('Operator script', 2),
      bulletList(walkthrough.operatorScript),
    ].join('\n');
  }

  renderPilotJson(template: PilotTemplate): string {
    return stablePilotStringify(template);
  }
}

export function createPilotScriptService(ctx: PilotRuntimeContext): PilotScriptService {
  return new PilotScriptService(ctx);
}
