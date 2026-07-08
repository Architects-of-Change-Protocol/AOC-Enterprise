import type { AocControlPlaneReadModel } from '../../aoc-control-plane/domain/control-plane-view-model.js';
import type { PilotControlPlaneFocus } from '../domain/pilot-scenario.js';

/**
 * Focus areas that the real `AocControlPlaneReadModel` currently backs.
 * `evidence` and `export_packages` are deliberately excluded -- neither
 * Evidence/Source/Citation Runtime nor Verifiable Export Package rows are
 * wired into Control Plane UI components yet (see those features' READMEs),
 * so this adapter never claims Control Plane visibility it does not have.
 */
const SECTIONS_BACKED_BY_READ_MODEL: ReadonlySet<PilotControlPlaneFocus> = new Set([
  'overview',
  'recognition',
  'authority',
  'approvals',
  'external_agents',
  'enforcement',
  'policy_packs',
  'proofs_audit',
]);

export interface ControlPlaneSectionAvailability {
  readonly section: PilotControlPlaneFocus;
  readonly backedByControlPlane: boolean;
  readonly hasRows: boolean;
  readonly reason: string;
}

function sectionHasRows(section: object): boolean {
  return Object.values(section).some((value) => Array.isArray(value) && value.length > 0);
}

function sectionViewModel(readModel: AocControlPlaneReadModel, section: PilotControlPlaneFocus): object | undefined {
  switch (section) {
    case 'overview':
      return readModel.overview;
    case 'recognition':
      return readModel.recognition;
    case 'authority':
      return readModel.authority;
    case 'approvals':
      return readModel.approvals;
    case 'external_agents':
      return readModel.externalAgents;
    case 'enforcement':
      return readModel.enforcement;
    case 'policy_packs':
      return readModel.policyPacks;
    case 'proofs_audit':
      return readModel.proofs;
    default:
      return undefined;
  }
}

/**
 * Read-only check of whether a Control Plane focus area is both backed by
 * the real read model and actually carries rows. Never mutates
 * `readModel` and never synthesizes a row it did not already contain.
 */
export function checkControlPlaneSection(readModel: AocControlPlaneReadModel, section: PilotControlPlaneFocus): ControlPlaneSectionAvailability {
  if (!SECTIONS_BACKED_BY_READ_MODEL.has(section)) {
    return {
      section,
      backedByControlPlane: false,
      hasRows: false,
      reason: `The "${section}" focus is not yet wired into the AOC Control Plane read model.`,
    };
  }
  const view = sectionViewModel(readModel, section);
  const hasRows = view !== undefined && sectionHasRows(view);
  return {
    section,
    backedByControlPlane: true,
    hasRows,
    reason: hasRows
      ? `The AOC Control Plane read model has real "${section}" rows.`
      : `The AOC Control Plane read model has a "${section}" view model but no rows were present.`,
  };
}

export function checkControlPlaneWalkthroughSections(
  readModel: AocControlPlaneReadModel,
  sections: readonly PilotControlPlaneFocus[],
): readonly ControlPlaneSectionAvailability[] {
  return sections.map((section) => checkControlPlaneSection(readModel, section));
}
