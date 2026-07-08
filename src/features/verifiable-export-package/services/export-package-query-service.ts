import type { ExportPackage, ExportPackageStatus, ExportPackageTargetType, ExportPackageType } from '../domain/export-package.js';
import type { ExportPackageRecipientPurpose } from '../domain/export-package-recipient.js';
import type { ExportPackageVerificationStatus } from '../domain/export-package-verification.js';
import type { ExportPackageItemType } from '../domain/export-package-item.js';
import { ExportPackageStore } from './export-package-store.js';

export interface ExportPackageQueryFilter {
  readonly trustDomainId?: string;
  readonly type?: ExportPackageType;
  readonly status?: ExportPackageStatus;
  readonly targetType?: ExportPackageTargetType;
  readonly targetId?: string;
  readonly recipientPurpose?: ExportPackageRecipientPurpose;
  readonly createdByActorId?: string;
  readonly verificationStatus?: ExportPackageVerificationStatus;
  readonly packageHash?: string;
  readonly search?: string;
}

function sortPackages(packages: readonly ExportPackage[]): readonly ExportPackage[] {
  return [...packages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Read-only search over already-built packages. Never re-evaluates or fetches new facts. */
export class ExportPackageQueryService {
  constructor(private readonly store: ExportPackageStore) {}

  query(filter: ExportPackageQueryFilter): readonly ExportPackage[] {
    const matches = this.store.listPackages().filter((pkg) => {
      if (filter.trustDomainId !== undefined && pkg.trustDomainId !== filter.trustDomainId) return false;
      if (filter.type !== undefined && pkg.type !== filter.type) return false;
      if (filter.status !== undefined && pkg.status !== filter.status) return false;
      if (filter.targetType !== undefined && pkg.targetType !== filter.targetType) return false;
      if (filter.targetId !== undefined && pkg.targetId !== filter.targetId) return false;
      if (filter.recipientPurpose !== undefined && pkg.recipient?.purpose !== filter.recipientPurpose) return false;
      if (filter.createdByActorId !== undefined && pkg.createdByActorId !== filter.createdByActorId) return false;
      if (filter.packageHash !== undefined && pkg.packageHash !== filter.packageHash) return false;
      if (filter.verificationStatus !== undefined) {
        const verification = this.store.getLatestVerificationByPackage(pkg.id);
        if (verification?.status !== filter.verificationStatus) return false;
      }
      if (filter.search !== undefined) {
        const needle = filter.search.toLowerCase();
        const haystack = [pkg.title, pkg.description, pkg.targetId, ...pkg.sections.flatMap((section) => section.items.map((item) => item.sourceId))]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    return sortPackages(matches);
  }

  findPackagesBySource(sourceModule: string, sourceId: string): readonly ExportPackage[] {
    const matches = this.store.listPackages().filter((pkg) => this.store.listItemsByPackage(pkg.id).some((item) => item.sourceModule === sourceModule && item.sourceId === sourceId));
    return sortPackages(matches);
  }

  private findPackagesByItemTypeAndSourceId(itemType: ExportPackageItemType, sourceId: string): readonly ExportPackage[] {
    const matches = this.store.listPackages().filter((pkg) => this.store.listItemsByPackage(pkg.id).some((item) => item.type === itemType && item.sourceId === sourceId));
    return sortPackages(matches);
  }

  findPackagesByPolicyDecisionId(policyDecisionId: string): readonly ExportPackage[] {
    return this.findPackagesByItemTypeAndSourceId('policy_decision', policyDecisionId);
  }

  findPackagesByEvidenceProofId(evidenceProofId: string): readonly ExportPackage[] {
    return this.findPackagesByItemTypeAndSourceId('evidence_proof', evidenceProofId);
  }

  findPackagesByEnforcementDecisionId(enforcementDecisionId: string): readonly ExportPackage[] {
    return this.findPackagesByItemTypeAndSourceId('enforcement_decision', enforcementDecisionId);
  }
}

export function createExportPackageQueryService(store: ExportPackageStore): ExportPackageQueryService {
  return new ExportPackageQueryService(store);
}
