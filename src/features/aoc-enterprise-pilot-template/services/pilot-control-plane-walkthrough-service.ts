import type { AocControlPlaneReadModel } from '../../aoc-control-plane/domain/control-plane-view-model.js';
import type { PilotControlPlaneWalkthrough } from '../domain/pilot-control-plane.js';
import type { PilotControlPlaneFocus } from '../domain/pilot-scenario.js';
import { checkControlPlaneWalkthroughSections, type ControlPlaneSectionAvailability } from '../integrations/control-plane-pilot-adapter.js';

export interface PilotControlPlaneWalkthroughIssue {
  readonly section: PilotControlPlaneFocus;
  readonly severity: 'warning' | 'error';
  readonly reason: string;
}

export interface PilotControlPlaneWalkthroughValidationResult {
  readonly walkthroughId: string;
  readonly valid: boolean;
  readonly sectionAvailability: readonly ControlPlaneSectionAvailability[];
  readonly issues: readonly PilotControlPlaneWalkthroughIssue[];
  readonly operatorWalkthroughArtifact: string;
}

function validateStructure(walkthrough: PilotControlPlaneWalkthrough): readonly string[] {
  const errors: string[] = [];
  if (walkthrough.sections.length === 0) {
    errors.push('Walkthrough has no sections.');
  }
  if (walkthrough.operatorScript.length === 0) {
    errors.push('Walkthrough has no operator script.');
  }
  for (const section of walkthrough.sections) {
    if (section.whatToShow.length === 0) {
      errors.push(`Section "${section.section}" has no whatToShow entries.`);
    }
    if (section.whyItMatters.trim().length === 0) {
      errors.push(`Section "${section.section}" is missing whyItMatters.`);
    }
    if (section.expectedRowsOrReferences.length === 0) {
      errors.push(`Section "${section.section}" has no expectedRowsOrReferences.`);
    }
  }
  return errors;
}

function renderOperatorWalkthrough(walkthrough: PilotControlPlaneWalkthrough, sectionAvailability: readonly ControlPlaneSectionAvailability[]): string {
  const lines: string[] = ['# Control Plane Operator Walkthrough', ''];
  for (const section of walkthrough.sections) {
    const availability = sectionAvailability.find((candidate) => candidate.section === section.section);
    lines.push(`## ${section.title}`, section.whyItMatters, '', 'What to show:');
    for (const item of section.whatToShow) {
      lines.push(`- ${item}`);
    }
    lines.push('References to inspect:');
    for (const reference of section.expectedRowsOrReferences) {
      lines.push(`- ${reference}`);
    }
    if (availability !== undefined) {
      lines.push(`(Control Plane backing: ${availability.reason})`);
    }
    lines.push('');
  }
  lines.push('## Operator script');
  for (const line of walkthrough.operatorScript) {
    lines.push(`- ${line}`);
  }
  return lines.join('\n');
}

/**
 * Validates a `PilotControlPlaneWalkthrough`'s structural completeness and,
 * when a real `AocControlPlaneReadModel` is supplied, cross-checks its
 * sections against real Control Plane rows. Read-only -- never mutates the
 * read model and never invents a row.
 */
export class PilotControlPlaneWalkthroughService {
  validate(walkthrough: PilotControlPlaneWalkthrough, readModel?: AocControlPlaneReadModel): PilotControlPlaneWalkthroughValidationResult {
    const structuralErrors = validateStructure(walkthrough);
    const sectionFoci = walkthrough.sections.map((section) => section.section);
    const sectionAvailability = readModel !== undefined ? checkControlPlaneWalkthroughSections(readModel, sectionFoci) : [];

    const issues: PilotControlPlaneWalkthroughIssue[] = structuralErrors.map((reason) => ({
      section: sectionFoci[0] ?? 'overview',
      severity: 'error',
      reason,
    }));
    for (const availability of sectionAvailability) {
      if (availability.backedByControlPlane && !availability.hasRows) {
        issues.push({ section: availability.section, severity: 'warning', reason: availability.reason });
      }
    }

    return {
      walkthroughId: walkthrough.id,
      valid: structuralErrors.length === 0,
      sectionAvailability,
      issues,
      operatorWalkthroughArtifact: renderOperatorWalkthrough(walkthrough, sectionAvailability),
    };
  }
}

export function createPilotControlPlaneWalkthroughService(): PilotControlPlaneWalkthroughService {
  return new PilotControlPlaneWalkthroughService();
}
