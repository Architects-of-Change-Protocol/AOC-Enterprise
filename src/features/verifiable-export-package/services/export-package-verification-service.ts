import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage } from '../domain/export-package.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageIntegrityReport } from '../domain/export-package-integrity.js';
import type { ExportPackageVerification, ExportPackageVerificationStatus } from '../domain/export-package-verification.js';
import { ExportPackageHashService } from './export-package-hash-service.js';
import { ExportPackageManifestService } from './export-package-manifest-service.js';
import { ExportPackageIntegrityService } from './export-package-integrity-service.js';

/**
 * Recomputes every hash the package's manifest and integrity report claim,
 * then reports whether the package is internally consistent. This service
 * never re-evaluates the decision the package describes -- it only proves
 * (or disproves) that the package still says what it said when it was
 * sealed.
 */
export class ExportPackageVerificationService {
  constructor(
    private readonly hashService: ExportPackageHashService,
    private readonly manifestService: ExportPackageManifestService,
    private readonly integrityService: ExportPackageIntegrityService,
  ) {}

  verifyPackage(ctx: ExportRuntimeContext, pkg: ExportPackage, manifest: ExportPackageManifest, references: readonly ExportPackageReference[]): { readonly verification: ExportPackageVerification; readonly integrityReport: ExportPackageIntegrityReport } {
    const integrityReport = this.integrityService.createIntegrityReport(ctx, pkg, manifest, references);

    const verifiedManifest = this.manifestService.verifyManifest(manifest);
    const recomputedPackageHash = this.hashService.recomputePackageHash(pkg, manifest.manifestHash);
    const verifiedPackageHash = pkg.packageHash !== undefined && recomputedPackageHash === pkg.packageHash;
    const verifiedSectionHashes = integrityReport.verifiedSectionHashes === integrityReport.sectionCount;
    const verifiedItemHashes = integrityReport.verifiedItemHashes === integrityReport.itemCount;
    const verifiedReferenceHashes = integrityReport.verifiedReferenceHashes === integrityReport.referenceCount;

    const hasBlockingFailure = !verifiedManifest || !verifiedPackageHash || !verifiedSectionHashes || !verifiedItemHashes || !verifiedReferenceHashes || integrityReport.status === 'failed';

    const status: ExportPackageVerificationStatus = hasBlockingFailure ? 'failed' : integrityReport.issues.length > 0 ? 'verified_with_warnings' : 'verified';

    const verification: ExportPackageVerification = {
      id: ctx.ids.nextId('export-verification'),
      packageId: pkg.id,
      status,
      manifestHash: manifest.manifestHash,
      packageHash: pkg.packageHash ?? recomputedPackageHash,
      verifiedManifest,
      verifiedPackageHash,
      verifiedSectionHashes,
      verifiedItemHashes,
      verifiedReferenceHashes,
      verifiedAt: ctx.clock.now(),
      issues: integrityReport.issues,
    };

    return { verification, integrityReport };
  }
}

export function createExportPackageVerificationService(
  hashService: ExportPackageHashService,
  manifestService: ExportPackageManifestService,
  integrityService: ExportPackageIntegrityService,
): ExportPackageVerificationService {
  return new ExportPackageVerificationService(hashService, manifestService, integrityService);
}
