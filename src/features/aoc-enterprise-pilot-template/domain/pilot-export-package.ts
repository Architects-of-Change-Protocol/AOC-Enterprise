import type { PilotScenarioExportPackageType } from './pilot-scenario.js';

export type PilotExportPackageVerificationStatus = 'verified' | 'verified_with_warnings' | 'failed';

/**
 * A pilot-authored *definition* of an export package a scenario should
 * produce. It is not itself a Verifiable Export Package -- it is checked
 * against a real one by `services/pilot-export-package-binding-service.ts`.
 */
export interface PilotExportPackageDefinition {
  readonly id: string;
  readonly name: string;
  readonly packageType: PilotScenarioExportPackageType;
  readonly targetType: string;
  readonly targetId: string;
  readonly expectedSections: readonly string[];
  readonly expectedVerificationStatus: PilotExportPackageVerificationStatus;
  readonly buyerPurpose: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
