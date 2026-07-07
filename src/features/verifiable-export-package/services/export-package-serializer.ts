import { stableStringify } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage } from '../domain/export-package.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageIntegrityReport } from '../domain/export-package-integrity.js';
import type { ExportPackageVerification } from '../domain/export-package-verification.js';
import type { AuditBundle } from '../domain/audit-bundle.js';
import type { SerializedExportPackage } from '../domain/export-package-format.js';
import { ExportPackageHashService } from './export-package-hash-service.js';

/**
 * Renders a package (or one of its artifacts) to a deterministic string
 * format. Every serializer here only re-orders and re-encodes data that is
 * already part of the package -- it never writes to the filesystem and
 * never fetches additional facts.
 */
export class ExportPackageSerializer {
  constructor(private readonly hashService: ExportPackageHashService) {}

  serializeJsonBundle(ctx: ExportRuntimeContext, pkg: ExportPackage, manifest: ExportPackageManifest, verification?: ExportPackageVerification): SerializedExportPackage {
    const content = stableStringify({ package: pkg, manifest, ...(verification !== undefined ? { verification } : {}) });
    return this.build(ctx, pkg.id, 'json_bundle', `${pkg.title} (JSON bundle)`, content);
  }

  serializeManifest(ctx: ExportRuntimeContext, manifest: ExportPackageManifest): SerializedExportPackage {
    const content = stableStringify(manifest);
    return this.build(ctx, manifest.packageId, 'verification_manifest', `Manifest for ${manifest.packageId}`, content);
  }

  serializeIntegrityReport(ctx: ExportRuntimeContext, report: ExportPackageIntegrityReport): SerializedExportPackage {
    const content = stableStringify(report);
    return this.build(ctx, report.packageId, 'integrity_report', `Integrity report for ${report.packageId}`, content);
  }

  serializeAuditBundleFragment(ctx: ExportRuntimeContext, bundle: AuditBundle): SerializedExportPackage {
    const content = stableStringify(bundle);
    return this.build(ctx, bundle.packageId, 'audit_bundle_fragment', `Audit bundle fragment for ${bundle.id}`, content);
  }

  serializeMarkdown(ctx: ExportRuntimeContext, packageId: string, title: string, markdown: string): SerializedExportPackage {
    return this.build(ctx, packageId, 'markdown_summary', title, markdown);
  }

  private build(ctx: ExportRuntimeContext, packageId: string, format: SerializedExportPackage['format'], title: string, content: string): SerializedExportPackage {
    return {
      id: ctx.ids.nextId('export-serialized'),
      packageId,
      format,
      title,
      content,
      contentHash: this.hashService.hashSerializedArtifact(content),
      createdAt: ctx.clock.now(),
    };
  }
}

export function createExportPackageSerializer(hashService: ExportPackageHashService): ExportPackageSerializer {
  return new ExportPackageSerializer(hashService);
}
