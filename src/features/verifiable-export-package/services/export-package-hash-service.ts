import { createDigest, stableStringify } from '../domain/export-package.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageSectionType } from '../domain/export-package-section.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackage } from '../domain/export-package.js';
import type { AuditBundleScope, AuditBundleSummary } from '../domain/audit-bundle.js';

export interface HashSectionInput {
  readonly type: ExportPackageSectionType;
  readonly required: boolean;
  readonly items: readonly ExportPackageItem[];
}

export interface HashReferenceInput {
  readonly type: ExportPackageReference['type'];
  readonly fromItemId: string;
  readonly toItemId: string;
  readonly reasonCode: string;
}

export interface HashManifestInput {
  readonly packageId: string;
  readonly packageVersion: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly sectionHashes: ExportPackageManifest['sectionHashes'];
  readonly itemHashes: ExportPackageManifest['itemHashes'];
  readonly referenceHashes: ExportPackageManifest['referenceHashes'];
  readonly requiredSections: readonly ExportPackageSectionType[];
  readonly missingRequiredSections: readonly ExportPackageSectionType[];
}

export interface HashPackageInput {
  readonly id: string;
  readonly type: string;
  readonly trustDomainId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly packageVersion: string;
  readonly manifestHash: string;
  readonly previousPackageHash?: string;
}

export interface HashAuditBundleInput {
  readonly scope: AuditBundleScope;
  readonly packageIds: readonly string[];
  readonly summary: AuditBundleSummary;
}

/**
 * Every hash produced by this service is a pure function of already-recorded
 * facts -- it never consults a clock, a random source, or a source runtime.
 * Changing any included payload, section, reference, or manifest changes the
 * corresponding hash and, transitively, `packageHash`.
 */
export class ExportPackageHashService {
  hashPayload(payload: unknown): string {
    return createDigest(payload);
  }

  hashSection(input: HashSectionInput): string {
    return createDigest({
      type: input.type,
      required: input.required,
      items: input.items.map((item) => ({ id: item.id, type: item.type, sourceModule: item.sourceModule, sourceId: item.sourceId, payloadHash: item.payloadHash })),
    });
  }

  hashReference(input: HashReferenceInput): string {
    return createDigest({ type: input.type, fromItemId: input.fromItemId, toItemId: input.toItemId, reasonCode: input.reasonCode });
  }

  hashManifest(input: HashManifestInput): string {
    return createDigest({
      packageId: input.packageId,
      packageVersion: input.packageVersion,
      targetType: input.targetType,
      targetId: input.targetId,
      sectionHashes: input.sectionHashes,
      itemHashes: input.itemHashes,
      referenceHashes: input.referenceHashes,
      requiredSections: input.requiredSections,
      missingRequiredSections: input.missingRequiredSections,
    });
  }

  hashPackage(input: HashPackageInput): string {
    return createDigest({
      id: input.id,
      type: input.type,
      trustDomainId: input.trustDomainId,
      targetType: input.targetType,
      targetId: input.targetId,
      packageVersion: input.packageVersion,
      manifestHash: input.manifestHash,
      ...(input.previousPackageHash !== undefined ? { previousPackageHash: input.previousPackageHash } : {}),
    });
  }

  hashSerializedArtifact(content: string): string {
    return createDigest(content);
  }

  hashAuditBundle(input: HashAuditBundleInput): string {
    return createDigest({ scope: input.scope, packageIds: input.packageIds, summary: input.summary });
  }

  stableStringify(value: unknown): string {
    return stableStringify(value);
  }

  /** Recomputes packageHash from a fully-built ExportPackage + its manifestHash, for verification. */
  recomputePackageHash(pkg: ExportPackage, manifestHash: string): string {
    return this.hashPackage({
      id: pkg.id,
      type: pkg.type,
      trustDomainId: pkg.trustDomainId,
      targetType: pkg.targetType,
      targetId: pkg.targetId,
      packageVersion: pkg.packageVersion,
      manifestHash,
      ...(pkg.previousPackageHash !== undefined ? { previousPackageHash: pkg.previousPackageHash } : {}),
    });
  }
}

export function createExportPackageHashService(): ExportPackageHashService {
  return new ExportPackageHashService();
}
