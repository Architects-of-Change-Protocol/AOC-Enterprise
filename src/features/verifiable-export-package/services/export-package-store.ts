import type { ExportPackage, ExportPackageStatus, ExportPackageTargetType, ExportPackageType } from '../domain/export-package.js';
import type { ExportPackageSection } from '../domain/export-package-section.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';
import type { ExportPackageReference } from '../domain/export-package-reference.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageIntegrityReport } from '../domain/export-package-integrity.js';
import type { ExportPackageVerification } from '../domain/export-package-verification.js';
import type { SerializedExportPackage } from '../domain/export-package-format.js';
import type { DecisionPacket } from '../domain/decision-packet.js';
import type { AuditBundle } from '../domain/audit-bundle.js';
import type { PackageSnapshot } from '../domain/package-snapshot.js';
import type { ExportPackageEvent } from '../domain/package-event.js';

export interface PackageQueryFilter {
  readonly trustDomainId?: string;
  readonly type?: ExportPackageType;
  readonly status?: ExportPackageStatus;
  readonly targetType?: ExportPackageTargetType;
  readonly targetId?: string;
}

/**
 * In-memory, deterministically-ordered storage for every record this
 * feature produces. Insertion order is preserved by `Map` iteration order,
 * so every `list*`/`query*` method returns results in creation order unless
 * explicitly re-sorted by a caller.
 */
export class ExportPackageStore {
  private readonly packages = new Map<string, ExportPackage>();
  private readonly sections = new Map<string, ExportPackageSection>();
  private readonly items = new Map<string, ExportPackageItem>();
  private readonly references = new Map<string, ExportPackageReference>();
  private readonly manifests = new Map<string, ExportPackageManifest>();
  private readonly integrityReports = new Map<string, ExportPackageIntegrityReport>();
  private readonly verifications = new Map<string, ExportPackageVerification>();
  private readonly serializedArtifacts = new Map<string, SerializedExportPackage>();
  private readonly decisionPackets = new Map<string, DecisionPacket>();
  private readonly auditBundles = new Map<string, AuditBundle>();
  private readonly packageSnapshots = new Map<string, PackageSnapshot>();
  private readonly events: ExportPackageEvent[] = [];

  savePackage(pkg: ExportPackage): ExportPackage {
    this.packages.set(pkg.id, pkg);
    for (const section of pkg.sections) {
      this.sections.set(section.id, section);
      for (const item of section.items) {
        this.items.set(item.id, item);
      }
    }
    return pkg;
  }

  getPackage(id: string): ExportPackage | undefined {
    return this.packages.get(id);
  }

  listPackages(): readonly ExportPackage[] {
    return Array.from(this.packages.values());
  }

  queryPackages(filter: PackageQueryFilter): readonly ExportPackage[] {
    return this.listPackages().filter((pkg) => {
      if (filter.trustDomainId !== undefined && pkg.trustDomainId !== filter.trustDomainId) return false;
      if (filter.type !== undefined && pkg.type !== filter.type) return false;
      if (filter.status !== undefined && pkg.status !== filter.status) return false;
      if (filter.targetType !== undefined && pkg.targetType !== filter.targetType) return false;
      if (filter.targetId !== undefined && pkg.targetId !== filter.targetId) return false;
      return true;
    });
  }

  saveReference(reference: ExportPackageReference): ExportPackageReference {
    this.references.set(reference.id, reference);
    return reference;
  }

  getReference(id: string): ExportPackageReference | undefined {
    return this.references.get(id);
  }

  listReferences(): readonly ExportPackageReference[] {
    return Array.from(this.references.values());
  }

  queryReferencesByFromItem(fromItemId: string): readonly ExportPackageReference[] {
    return this.listReferences().filter((reference) => reference.fromItemId === fromItemId);
  }

  queryReferencesByToItem(toItemId: string): readonly ExportPackageReference[] {
    return this.listReferences().filter((reference) => reference.toItemId === toItemId);
  }

  getSection(id: string): ExportPackageSection | undefined {
    return this.sections.get(id);
  }

  listSectionsByPackage(packageId: string): readonly ExportPackageSection[] {
    return this.getPackage(packageId)?.sections ?? [];
  }

  getItem(id: string): ExportPackageItem | undefined {
    return this.items.get(id);
  }

  listItems(): readonly ExportPackageItem[] {
    return Array.from(this.items.values());
  }

  listItemsByPackage(packageId: string): readonly ExportPackageItem[] {
    return this.listSectionsByPackage(packageId).flatMap((section) => section.items);
  }

  queryItemsBySource(sourceModule: string, sourceId: string): readonly ExportPackageItem[] {
    return this.listItems().filter((item) => item.sourceModule === sourceModule && item.sourceId === sourceId);
  }

  saveManifest(manifest: ExportPackageManifest): ExportPackageManifest {
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }

  getManifest(id: string): ExportPackageManifest | undefined {
    return this.manifests.get(id);
  }

  getManifestByPackage(packageId: string): ExportPackageManifest | undefined {
    return Array.from(this.manifests.values()).find((manifest) => manifest.packageId === packageId);
  }

  saveIntegrityReport(report: ExportPackageIntegrityReport): ExportPackageIntegrityReport {
    this.integrityReports.set(report.id, report);
    return report;
  }

  getIntegrityReport(id: string): ExportPackageIntegrityReport | undefined {
    return this.integrityReports.get(id);
  }

  getIntegrityReportByPackage(packageId: string): ExportPackageIntegrityReport | undefined {
    const matches = Array.from(this.integrityReports.values()).filter((report) => report.packageId === packageId);
    return matches[matches.length - 1];
  }

  saveVerification(verification: ExportPackageVerification): ExportPackageVerification {
    this.verifications.set(verification.id, verification);
    return verification;
  }

  getVerification(id: string): ExportPackageVerification | undefined {
    return this.verifications.get(id);
  }

  listVerificationsByPackage(packageId: string): readonly ExportPackageVerification[] {
    return Array.from(this.verifications.values()).filter((verification) => verification.packageId === packageId);
  }

  getLatestVerificationByPackage(packageId: string): ExportPackageVerification | undefined {
    const matches = this.listVerificationsByPackage(packageId);
    return matches[matches.length - 1];
  }

  saveSerializedArtifact(artifact: SerializedExportPackage): SerializedExportPackage {
    this.serializedArtifacts.set(artifact.id, artifact);
    return artifact;
  }

  getSerializedArtifact(id: string): SerializedExportPackage | undefined {
    return this.serializedArtifacts.get(id);
  }

  listSerializedArtifactsByPackage(packageId: string): readonly SerializedExportPackage[] {
    return Array.from(this.serializedArtifacts.values()).filter((artifact) => artifact.packageId === packageId);
  }

  saveDecisionPacket(packet: DecisionPacket): DecisionPacket {
    this.decisionPackets.set(packet.id, packet);
    return packet;
  }

  getDecisionPacket(id: string): DecisionPacket | undefined {
    return this.decisionPackets.get(id);
  }

  getDecisionPacketByPackage(packageId: string): DecisionPacket | undefined {
    return Array.from(this.decisionPackets.values()).find((packet) => packet.packageId === packageId);
  }

  saveAuditBundle(bundle: AuditBundle): AuditBundle {
    this.auditBundles.set(bundle.id, bundle);
    return bundle;
  }

  getAuditBundle(id: string): AuditBundle | undefined {
    return this.auditBundles.get(id);
  }

  listAuditBundles(): readonly AuditBundle[] {
    return Array.from(this.auditBundles.values());
  }

  savePackageSnapshot(snapshot: PackageSnapshot): PackageSnapshot {
    this.packageSnapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  getPackageSnapshot(id: string): PackageSnapshot | undefined {
    return this.packageSnapshots.get(id);
  }

  getPackageSnapshotByPackage(packageId: string): PackageSnapshot | undefined {
    const matches = Array.from(this.packageSnapshots.values()).filter((snapshot) => snapshot.packageId === packageId);
    return matches[matches.length - 1];
  }

  saveEvent(event: ExportPackageEvent): ExportPackageEvent {
    this.events.push(event);
    return event;
  }

  getEvents(): readonly ExportPackageEvent[] {
    return this.events;
  }

  getLatestEvent(): ExportPackageEvent | undefined {
    return this.events[this.events.length - 1];
  }

  updatePackageStatus(packageId: string, status: ExportPackageStatus, timestampField: 'sealedAt' | 'verifiedAt' | undefined, timestamp: string | undefined): ExportPackage {
    const existing = this.packages.get(packageId);
    if (existing === undefined) {
      throw new ExportPackageNotFoundError(`Export package "${packageId}" was not found.`);
    }
    const updated: ExportPackage = {
      ...existing,
      status,
      ...(timestampField !== undefined && timestamp !== undefined ? { [timestampField]: timestamp } : {}),
    };
    this.packages.set(packageId, updated);
    return updated;
  }

  updatePackageHashes(packageId: string, input: { readonly packageHash?: string; readonly previousPackageHash?: string; readonly manifestId?: string; readonly integrityReportId?: string; readonly verificationId?: string }): ExportPackage {
    const existing = this.packages.get(packageId);
    if (existing === undefined) {
      throw new ExportPackageNotFoundError(`Export package "${packageId}" was not found.`);
    }
    const updated: ExportPackage = {
      ...existing,
      ...(input.packageHash !== undefined ? { packageHash: input.packageHash } : {}),
      ...(input.previousPackageHash !== undefined ? { previousPackageHash: input.previousPackageHash } : {}),
      ...(input.manifestId !== undefined ? { manifestId: input.manifestId } : {}),
      ...(input.integrityReportId !== undefined ? { integrityReportId: input.integrityReportId } : {}),
      ...(input.verificationId !== undefined ? { verificationId: input.verificationId } : {}),
    };
    this.packages.set(packageId, updated);
    return updated;
  }

  getLatestSealedPackageHash(trustDomainId: string): string | undefined {
    const sealed = this.listPackages()
      .filter((pkg) => pkg.trustDomainId === trustDomainId && pkg.packageHash !== undefined)
      .slice(-1)[0];
    return sealed?.packageHash;
  }
}

export class ExportPackageNotFoundError extends Error {}
