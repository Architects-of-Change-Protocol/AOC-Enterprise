import type { ExportPackageTargetType } from './export-package.js';

export interface DecisionPacketSummary {
  readonly action?: string;
  readonly actorId?: string;
  readonly resourceScope?: string;
  readonly allowed?: boolean;
  readonly executed?: boolean;
  readonly blocked?: boolean;
  readonly reasonCode?: string;
  readonly reason?: string;
}

export interface DecisionPacket {
  readonly id: string;

  readonly packageId: string;

  readonly targetType: ExportPackageTargetType;
  readonly targetId: string;

  readonly decisionSummary: DecisionPacketSummary;

  readonly recognitionSectionId?: string;
  readonly authoritySectionId?: string;
  readonly approvalSectionId?: string;
  readonly externalStandingSectionId?: string;
  readonly policySectionId?: string;
  readonly evidenceSectionId?: string;
  readonly enforcementSectionId?: string;
  readonly executionSectionId?: string;
  readonly eventsSectionId?: string;
  readonly controlPlaneSectionId?: string;

  readonly manifestId: string;

  readonly packageHash: string;

  readonly createdAt: string;
}
