import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage, ExportPackageTargetType } from '../domain/export-package.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageItemType } from '../domain/export-package-item.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageIntegrityIssue, ExportPackageIntegrityIssueSeverity, ExportPackageIntegrityReport } from '../domain/export-package-integrity.js';
import { ExportPackageHashService } from './export-package-hash-service.js';

const TARGET_TYPE_TO_ITEM_TYPE: Readonly<Partial<Record<ExportPackageTargetType, ExportPackageItemType>>> = {
  recognition_decision: 'recognition_decision',
  authority_proof: 'authority_proof',
  approval_request: 'approval_request',
  approval_decision: 'approval_decision',
  approval_proof: 'approval_proof',
  policy_decision: 'policy_decision',
  policy_proof: 'policy_proof',
  evidence_proof: 'evidence_proof',
  enforcement_request: 'enforcement_request',
  enforcement_decision: 'enforcement_decision',
  enforcement_proof: 'enforcement_proof',
  execution_result: 'execution_result',
  demo_scenario: 'demo_scenario',
  control_plane_snapshot: 'control_plane_snapshot',
};

const SEVERITY_RANK: Readonly<Record<ExportPackageIntegrityIssueSeverity, number>> = { critical: 0, error: 1, warning: 2, info: 3 };

/**
 * Recomputes hashes and structural consistency from the package's own
 * recorded sections/items/references and manifest -- it never consults a
 * source runtime and never re-evaluates a decision. Every issue this
 * service reports is derived from a mismatch or gap in what the package
 * itself already contains.
 */
export class ExportPackageIntegrityService {
  constructor(private readonly hashService: ExportPackageHashService) {}

  createIntegrityReport(ctx: ExportRuntimeContext, pkg: ExportPackage, manifest: ExportPackageManifest, references: readonly ExportPackageReference[]): ExportPackageIntegrityReport {
    const issues: ExportPackageIntegrityIssue[] = [];

    const sectionIdCounts = new Map<string, number>();
    const itemIdCounts = new Map<string, number>();
    const allItemIds = new Set<string>();

    for (const section of pkg.sections) {
      sectionIdCounts.set(section.id, (sectionIdCounts.get(section.id) ?? 0) + 1);
      for (const item of section.items) {
        itemIdCounts.set(item.id, (itemIdCounts.get(item.id) ?? 0) + 1);
        allItemIds.add(item.id);
      }
    }

    for (const [sectionId, count] of sectionIdCounts) {
      if (count > 1) {
        issues.push(this.issue(ctx, 'critical', 'DUPLICATE_SECTION_ID', `Section id "${sectionId}" appears ${count} times.`, { sectionId }));
      }
    }
    for (const [itemId, count] of itemIdCounts) {
      if (count > 1) {
        issues.push(this.issue(ctx, 'critical', 'DUPLICATE_ITEM_ID', `Item id "${itemId}" appears ${count} times.`, { itemId }));
      }
    }

    for (const section of pkg.sections) {
      const recomputedSectionHash = this.hashService.hashSection({ type: section.type, required: section.required, items: section.items });
      if (recomputedSectionHash !== section.sectionHash) {
        issues.push(this.issue(ctx, 'critical', 'SECTION_HASH_MISMATCH', `Section "${section.id}" (${section.type}) hash does not match its recorded items.`, { sectionId: section.id }));
      }
      for (const item of section.items) {
        const recomputedPayloadHash = this.hashService.hashPayload(item.payload);
        if (recomputedPayloadHash !== item.payloadHash) {
          issues.push(
            this.issue(ctx, 'critical', 'ITEM_PAYLOAD_HASH_MISMATCH', `Item "${item.id}" (${item.type}) payload hash does not match its recorded payload.`, {
              sectionId: section.id,
              itemId: item.id,
              sourceModule: item.sourceModule,
              sourceId: item.sourceId,
            }),
          );
        }
      }
      if (section.missingReferenceIds.length > 0) {
        for (const missingId of section.missingReferenceIds) {
          issues.push(
            this.issue(ctx, 'warning', 'MISSING_REFERENCE', `Section "${section.id}" (${section.type}) references "${missingId}", which is not included in this package.`, {
              sectionId: section.id,
            }),
          );
        }
      }
    }

    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    let verifiedReferenceHashes = 0;
    for (const entry of manifest.referenceHashes) {
      const reference = referenceById.get(entry.referenceId);
      if (reference === undefined) {
        issues.push(this.issue(ctx, 'critical', 'REFERENCE_NOT_FOUND', `Manifest references "${entry.referenceId}", which does not exist in this package.`, { referenceId: entry.referenceId }));
        continue;
      }
      if (!allItemIds.has(reference.fromItemId) || !allItemIds.has(reference.toItemId)) {
        issues.push(
          this.issue(ctx, 'critical', 'REFERENCE_TO_UNKNOWN_ITEM', `Reference "${reference.id}" (${reference.type}) points to an item that is not included in this package.`, {
            referenceId: reference.id,
          }),
        );
        continue;
      }
      const recomputedReferenceHash = this.hashService.hashReference({ type: reference.type, fromItemId: reference.fromItemId, toItemId: reference.toItemId, reasonCode: reference.reasonCode });
      if (recomputedReferenceHash !== entry.referenceHash) {
        issues.push(this.issue(ctx, 'critical', 'REFERENCE_HASH_MISMATCH', `Reference "${reference.id}" hash does not match its recorded fields.`, { referenceId: reference.id }));
        continue;
      }
      verifiedReferenceHashes += 1;
    }

    if (manifest.missingRequiredSections.length > 0) {
      for (const sectionType of manifest.missingRequiredSections) {
        issues.push(this.issue(ctx, 'critical', 'MISSING_REQUIRED_SECTION', `Required section "${sectionType}" is not available in this package.`, {}));
      }
    }

    const expectedItemType = TARGET_TYPE_TO_ITEM_TYPE[pkg.targetType];
    if (expectedItemType !== undefined) {
      const candidates = pkg.sections.flatMap((section) => section.items).filter((item) => item.type === expectedItemType);
      if (candidates.length > 0 && !candidates.some((item) => item.sourceId === pkg.targetId)) {
        issues.push(
          this.issue(ctx, 'critical', 'PACKAGE_TARGET_MISMATCH', `Package target "${pkg.targetType}:${pkg.targetId}" does not match any included ${expectedItemType} item.`, {}),
        );
      }
    }

    issues.sort((a, b) => {
      const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rank !== 0) return rank;
      if (a.reasonCode !== b.reasonCode) return a.reasonCode < b.reasonCode ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const hasBlockingIssue = issues.some((issue) => issue.severity === 'critical' || issue.severity === 'error');
    const status = hasBlockingIssue ? 'failed' : issues.length > 0 ? 'warning' : 'passed';

    const missingReferenceIds = pkg.sections.flatMap((section) => section.missingReferenceIds);

    const report: Omit<ExportPackageIntegrityReport, 'id' | 'integrityHash' | 'createdAt'> = {
      packageId: pkg.id,
      status,
      sectionCount: pkg.sections.length,
      itemCount: allItemIds.size,
      referenceCount: manifest.referenceHashes.length,
      verifiedSectionHashes: pkg.sections.filter((section) => this.hashService.hashSection({ type: section.type, required: section.required, items: section.items }) === section.sectionHash).length,
      verifiedItemHashes: pkg.sections.flatMap((section) => section.items).filter((item) => this.hashService.hashPayload(item.payload) === item.payloadHash).length,
      verifiedReferenceHashes,
      missingRequiredSections: manifest.missingRequiredSections,
      missingReferenceIds,
      issues,
    };

    const createdAt = ctx.clock.now();
    const integrityHash = this.hashService.hashPayload(report);

    return { id: ctx.ids.nextId('export-integrity'), ...report, createdAt, integrityHash };
  }

  private issue(
    ctx: ExportRuntimeContext,
    severity: ExportPackageIntegrityIssueSeverity,
    reasonCode: string,
    reason: string,
    fields: Partial<Pick<ExportPackageIntegrityIssue, 'sectionId' | 'itemId' | 'referenceId' | 'sourceModule' | 'sourceId'>>,
  ): ExportPackageIntegrityIssue {
    return {
      id: ctx.ids.nextId('export-issue'),
      severity,
      reasonCode,
      reason,
      ...(fields.sectionId !== undefined ? { sectionId: fields.sectionId } : {}),
      ...(fields.itemId !== undefined ? { itemId: fields.itemId } : {}),
      ...(fields.referenceId !== undefined ? { referenceId: fields.referenceId } : {}),
      ...(fields.sourceModule !== undefined ? { sourceModule: fields.sourceModule } : {}),
      ...(fields.sourceId !== undefined ? { sourceId: fields.sourceId } : {}),
    };
  }
}

export function createExportPackageIntegrityService(hashService: ExportPackageHashService): ExportPackageIntegrityService {
  return new ExportPackageIntegrityService(hashService);
}
