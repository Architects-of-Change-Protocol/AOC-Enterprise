import type { ExportPackage } from '../../verifiable-export-package/domain/export-package.js';
import type { ExportPackageManifest } from '../../verifiable-export-package/domain/export-package-manifest.js';
import type { ExportPackageVerification } from '../../verifiable-export-package/domain/export-package-verification.js';
import type { PilotExportPackageDefinition } from '../domain/pilot-export-package.js';

/**
 * Structural comparison of a `PilotExportPackageDefinition` against a real,
 * already-created `ExportPackage`/`ExportPackageManifest`/
 * `ExportPackageVerification`. Never creates a package itself -- if
 * `pkg`/`manifest`/`verification` were never supplied, every flag reports
 * "not satisfied" rather than being assumed true.
 */
export interface ExportPackageBindingCheck {
  readonly matchesType: boolean;
  readonly matchesTarget: boolean;
  readonly hasHash: boolean;
  readonly hasManifest: boolean;
  readonly missingSections: readonly string[];
  readonly verificationStatus?: ExportPackageVerification['status'];
  readonly meetsExpectedVerification: boolean;
}

export function checkExportPackageBinding(
  definition: PilotExportPackageDefinition,
  pkg: ExportPackage,
  manifest: ExportPackageManifest | undefined,
  verification: ExportPackageVerification | undefined,
): ExportPackageBindingCheck {
  const matchesType = pkg.type === definition.packageType;
  // pkg.targetId is always the real target entity's own id (e.g. the real
  // EnforcementDecision id an export package's own verification service
  // requires); definition.targetId is a human-readable label authored on the
  // static PilotExportPackageDefinition, so only the target *type* -- plus a
  // genuinely non-empty target id -- can be compared here.
  const matchesTarget = pkg.targetType === definition.targetType && pkg.targetId.length > 0;
  const hasHash = typeof pkg.packageHash === 'string' && pkg.packageHash.length > 0;
  const hasManifest = manifest !== undefined;

  const presentSections = new Set<string>(pkg.sections.map((section) => section.type));
  const missingSections = definition.expectedSections.filter((sectionType) => !presentSections.has(sectionType));

  const verificationStatus = verification?.status;
  const meetsExpectedVerification =
    verificationStatus !== undefined &&
    (verificationStatus === definition.expectedVerificationStatus ||
      (definition.expectedVerificationStatus === 'verified_with_warnings' && verificationStatus === 'verified'));

  return {
    matchesType,
    matchesTarget,
    hasHash,
    hasManifest,
    missingSections,
    ...(verificationStatus !== undefined ? { verificationStatus } : {}),
    meetsExpectedVerification,
  };
}

export function exportPackageBindingIsSatisfied(check: ExportPackageBindingCheck): boolean {
  return check.matchesType && check.matchesTarget && check.hasHash && check.hasManifest && check.missingSections.length === 0 && check.meetsExpectedVerification;
}
