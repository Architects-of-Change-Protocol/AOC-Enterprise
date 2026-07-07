import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';
import type { ExportPackageSection, ExportPackageSectionType } from '../domain/export-package-section.js';
import type { ExportPackageHashService } from './export-package-hash-service.js';

export interface BuildSectionInput {
  readonly type: ExportPackageSectionType;
  readonly title: string;
  readonly description: string;
  readonly required: boolean;
  readonly items: readonly ExportPackageItem[];
}

const SECTION_DEFAULTS: Readonly<Record<ExportPackageSectionType, { readonly title: string; readonly description: string }>> = {
  summary: { title: 'Summary', description: 'Human-readable summary of the decision this package packages.' },
  recognition: { title: 'Recognition', description: 'Recognition Runtime decision and proof for the actor and action.' },
  authority: { title: 'Authority', description: 'Authority Graph grants, delegation lineage, and authority proof.' },
  approval: { title: 'Approval', description: 'Approval Runtime request, decision, and proof.' },
  external_standing: { title: 'External Standing', description: 'External Agent Handshake visa and standing proof.' },
  policy: { title: 'Policy', description: 'Domain Policy Pack Runtime decision and proof.' },
  evidence: { title: 'Evidence', description: 'Evidence / Source / Citation Runtime requirements, artifacts, satisfactions, and reviews.' },
  citations: { title: 'Citations', description: 'Citations and evidence links referenced by this decision.' },
  enforcement: { title: 'Enforcement', description: 'Action Enforcement request, decision, and proof.' },
  execution: { title: 'Execution', description: 'Execution result and side effects, if the action executed.' },
  events: { title: 'Events', description: 'Event trail(s) recorded by the source runtimes for this decision.' },
  control_plane: { title: 'Control Plane', description: 'AOC Control Plane snapshot reference for this decision.' },
  enterprise_demo: { title: 'Enterprise Demo', description: 'Enterprise Demo scenario and run reference, if this decision originated in a demo scenario.' },
  manifest: { title: 'Manifest', description: 'Deterministic manifest of every section, item, and reference hash in this package.' },
  verification: { title: 'Verification', description: 'Verification result proving whether this package is internally consistent.' },
};

/**
 * Builds one ExportPackageSection from already-mapped items. This function
 * never fetches, evaluates, or fabricates data -- `items` must already be
 * the complete, real set of ExportPackageItem records for this section.
 */
export function buildSection(ctx: ExportRuntimeContext, hashService: ExportPackageHashService, input: BuildSectionInput): ExportPackageSection {
  const status = input.items.length > 0 ? 'included' : 'not_available';
  return {
    id: ctx.ids.nextId('export-section'),
    type: input.type,
    title: input.title,
    description: input.description,
    status,
    items: input.items,
    itemCount: input.items.length,
    sectionHash: hashService.hashSection({ type: input.type, required: input.required, items: input.items }),
    required: input.required,
    missingReferenceIds: [],
    createdAt: ctx.clock.now(),
  };
}

/** Applies cross-section missing-reference findings to an already-built section, promoting `included` to `incomplete` when references are missing. */
export function applyMissingReferences(section: ExportPackageSection, missingReferenceIds: readonly string[]): ExportPackageSection {
  if (missingReferenceIds.length === 0) {
    return section;
  }
  return {
    ...section,
    status: section.status === 'included' ? 'incomplete' : section.status,
    missingReferenceIds,
  };
}

function buildTypedSection(
  type: ExportPackageSectionType,
): (ctx: ExportRuntimeContext, hashService: ExportPackageHashService, items: readonly ExportPackageItem[], required: boolean, overrides?: Partial<Pick<BuildSectionInput, 'title' | 'description'>>) => ExportPackageSection {
  return (ctx, hashService, items, required, overrides) =>
    buildSection(ctx, hashService, {
      type,
      title: overrides?.title ?? SECTION_DEFAULTS[type].title,
      description: overrides?.description ?? SECTION_DEFAULTS[type].description,
      required,
      items,
    });
}

export const buildSummarySection = buildTypedSection('summary');
export const buildRecognitionSection = buildTypedSection('recognition');
export const buildAuthoritySection = buildTypedSection('authority');
export const buildApprovalSection = buildTypedSection('approval');
export const buildExternalStandingSection = buildTypedSection('external_standing');
export const buildPolicySection = buildTypedSection('policy');
export const buildEvidenceSection = buildTypedSection('evidence');
export const buildCitationsSection = buildTypedSection('citations');
export const buildEnforcementSection = buildTypedSection('enforcement');
export const buildExecutionSection = buildTypedSection('execution');
export const buildEventsSection = buildTypedSection('events');
export const buildControlPlaneSection = buildTypedSection('control_plane');
export const buildEnterpriseDemoSection = buildTypedSection('enterprise_demo');
