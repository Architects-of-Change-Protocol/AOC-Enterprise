import type { ExportPackage } from '../domain/export-package.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageVerification } from '../domain/export-package-verification.js';
import type { ExportPackageSection } from '../domain/export-package-section.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

export type MarkdownAudience = 'buyer' | 'technical' | 'auditor';

export const LEGAL_DISCLAIMER =
  'This package is not legal advice. The presence of evidence, citations, or policy pack coverage does not by itself prove legal or regulatory compliance. Demo-only packages and policy packs are illustrative and are never a substitute for customer- or counsel-validated compliance review. `not_legal_advice` metadata is never converted to a claim of "verified" by this package.';

function shortHash(hash: string | undefined): string {
  return hash === undefined ? 'n/a' : `${hash.slice(0, 16)}...`;
}

function findFirstItem(sections: readonly ExportPackageSection[], type: ExportPackageItem['type']): ExportPackageItem | undefined {
  for (const section of sections) {
    const match = section.items.find((item) => item.type === type);
    if (match !== undefined) return match;
  }
  return undefined;
}

function payloadString(item: ExportPackageItem | undefined, field: string): string | undefined {
  if (item === undefined) return undefined;
  const value = item.payload[field];
  return typeof value === 'string' ? value : undefined;
}

function payloadBool(item: ExportPackageItem | undefined, field: string): boolean | undefined {
  if (item === undefined) return undefined;
  const value = item.payload[field];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Renders a package into a deterministic markdown summary. Every sentence
 * is built from fields already present on the package's own sections and
 * items -- reason/reasonCode/summary text the source runtimes recorded --
 * never from an LLM and never from an inferred legal conclusion.
 */
export class ExportPackageMarkdownService {
  render(pkg: ExportPackage, manifest: ExportPackageManifest, verification: ExportPackageVerification | undefined, audience: MarkdownAudience): string {
    const lines: string[] = [];
    lines.push(`# ${pkg.title}`);
    lines.push('');
    lines.push(pkg.description);
    lines.push('');
    lines.push(`> **Disclaimer:** ${LEGAL_DISCLAIMER}`);
    lines.push('');

    lines.push('## Decision Summary');
    lines.push(...this.renderDecisionSummary(pkg));
    lines.push('');

    lines.push('## Package Integrity');
    lines.push(`- Package id: \`${pkg.id}\``);
    lines.push(`- Package type: \`${pkg.type}\``);
    lines.push(`- Package status: \`${pkg.status}\``);
    lines.push(`- Package hash: \`${shortHash(pkg.packageHash)}\``);
    lines.push(`- Manifest hash: \`${shortHash(manifest.manifestHash)}\``);
    lines.push(`- Verification status: \`${verification?.status ?? 'not_verified'}\``);
    if (manifest.missingRequiredSections.length > 0) {
      lines.push(`- Missing required sections: ${manifest.missingRequiredSections.map((s) => `\`${s}\``).join(', ')}`);
    }
    lines.push('');

    lines.push('## Sections');
    for (const section of pkg.sections) {
      lines.push(`- **${section.title}** (\`${section.type}\`): ${section.status}, ${section.itemCount} item(s), hash \`${shortHash(section.sectionHash)}\``);
    }
    lines.push('');

    lines.push('## Policy');
    lines.push(...this.renderPolicySummary(pkg));
    lines.push('');

    lines.push('## Enforcement');
    lines.push(...this.renderEnforcementSummary(pkg));
    lines.push('');

    lines.push('## Evidence & Citations');
    lines.push(...this.renderEvidenceSummary(pkg));
    lines.push('');

    if (audience === 'technical' || audience === 'auditor') {
      lines.push('## Source Modules');
      lines.push(manifest.sourceModules.length > 0 ? manifest.sourceModules.map((module) => `\`${module}\``).join(', ') : '_none recorded_');
      lines.push('');
    }

    if (audience === 'auditor' && verification !== undefined && verification.issues.length > 0) {
      lines.push('## Integrity Issues');
      for (const issue of verification.issues) {
        lines.push(`- [\`${issue.severity}\`] \`${issue.reasonCode}\`: ${issue.reason}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`_Audience: ${audience}. Generated deterministically from package \`${pkg.id}\` at \`${pkg.createdAt}\`._`);

    return lines.join('\n');
  }

  private renderDecisionSummary(pkg: ExportPackage): string[] {
    const enforcementDecision = findFirstItem(pkg.sections, 'enforcement_decision');
    const policyDecision = findFirstItem(pkg.sections, 'policy_decision');
    const executionResult = findFirstItem(pkg.sections, 'execution_result');

    const reasonCode = payloadString(enforcementDecision, 'reasonCode') ?? payloadString(policyDecision, 'reasonCode');
    const reason = payloadString(enforcementDecision, 'reason') ?? payloadString(policyDecision, 'reason');
    const allowedToExecute = payloadBool(enforcementDecision, 'allowedToExecute');
    const executed = payloadBool(executionResult, 'executed');

    const lines: string[] = [];
    lines.push(`- Target: \`${pkg.targetType}:${pkg.targetId}\``);
    lines.push(`- Trust domain: \`${pkg.trustDomainId}\``);
    if (allowedToExecute !== undefined) lines.push(`- Allowed to execute: \`${allowedToExecute}\``);
    if (executed !== undefined) lines.push(`- Executed: \`${executed}\``);
    if (reasonCode !== undefined) lines.push(`- Reason code: \`${reasonCode}\``);
    if (reason !== undefined) lines.push(`- Reason: ${reason}`);
    return lines;
  }

  private renderPolicySummary(pkg: ExportPackage): string[] {
    const policyDecision = findFirstItem(pkg.sections, 'policy_decision');
    if (policyDecision === undefined) {
      return ['_No policy pack decision is included in this package._'];
    }
    const legalCompleteness = policyDecision.payload['legalCompleteness'];
    const demoOnly = policyDecision.payload['demoOnly'];
    const lines: string[] = [];
    lines.push(`- Policy reason: ${payloadString(policyDecision, 'reason') ?? '_none recorded_'}`);
    if (typeof legalCompleteness === 'string') lines.push(`- Legal completeness: \`${legalCompleteness}\` (never treated as a compliance verification by this package)`);
    if (typeof demoOnly === 'boolean') lines.push(`- Demo-only pack: \`${demoOnly}\``);
    return lines;
  }

  private renderEnforcementSummary(pkg: ExportPackage): string[] {
    const enforcementDecision = findFirstItem(pkg.sections, 'enforcement_decision');
    const enforcementProof = findFirstItem(pkg.sections, 'enforcement_proof');
    if (enforcementDecision === undefined) {
      return ['_No enforcement decision is included in this package._'];
    }
    const lines: string[] = [];
    lines.push(`- Enforcement decision type: \`${String(enforcementDecision.payload['type'] ?? 'unknown')}\``);
    lines.push(`- Enforcement reason: ${payloadString(enforcementDecision, 'reason') ?? '_none recorded_'}`);
    if (enforcementProof !== undefined) lines.push(`- Enforcement proof hash: \`${shortHash(payloadString(enforcementProof, 'proofHash'))}\``);
    return lines;
  }

  private renderEvidenceSummary(pkg: ExportPackage): string[] {
    const evidenceSection = pkg.sections.find((section) => section.type === 'evidence');
    const citationsSection = pkg.sections.find((section) => section.type === 'citations');
    const evidenceCount = evidenceSection?.itemCount ?? 0;
    const citationCount = citationsSection?.itemCount ?? 0;
    if (evidenceCount === 0 && citationCount === 0) {
      return ['_No evidence or citations are included in this package._'];
    }
    return [
      `- Evidence items: ${evidenceCount}`,
      `- Citation items: ${citationCount}`,
      '- Evidence presence documents what was submitted and reviewed; it is not, by itself, a claim of legal sufficiency.',
    ];
  }
}

export function createExportPackageMarkdownService(): ExportPackageMarkdownService {
  return new ExportPackageMarkdownService();
}
