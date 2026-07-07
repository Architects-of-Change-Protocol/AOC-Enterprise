import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage, ExportPackageTargetType } from '../domain/export-package.js';
import type { ExportPackageSection } from '../domain/export-package-section.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageVerification } from '../domain/export-package-verification.js';
import type { ExportPackageFormat, SerializedExportPackage } from '../domain/export-package-format.js';
import type { ExportPackageRecipient } from '../domain/export-package-recipient.js';
import type { DecisionPacket, DecisionPacketSummary } from '../domain/decision-packet.js';
import type { AuditBundle, AuditBundleScope } from '../domain/audit-bundle.js';
import type { PackageSnapshot } from '../domain/package-snapshot.js';
import { ExportPackageStore, ExportPackageNotFoundError } from './export-package-store.js';
import { ExportPackageBuilder, type CreatePackageSectionInput } from './export-package-builder.js';
import { ExportPackageHashService, createExportPackageHashService } from './export-package-hash-service.js';
import { ExportPackageManifestService, createExportPackageManifestService } from './export-package-manifest-service.js';
import { ExportPackageIntegrityService, createExportPackageIntegrityService } from './export-package-integrity-service.js';
import { ExportPackageVerificationService, createExportPackageVerificationService } from './export-package-verification-service.js';
import { ExportPackageSerializer, createExportPackageSerializer } from './export-package-serializer.js';
import { ExportPackageMarkdownService, createExportPackageMarkdownService, type MarkdownAudience } from './export-package-markdown-service.js';
import { ExportPackageQueryService, createExportPackageQueryService, type ExportPackageQueryFilter } from './export-package-query-service.js';
import { ExportPackageLedger, createExportPackageLedger } from './export-package-ledger.js';

export interface CreateExportPackageInput {
  readonly title: string;
  readonly description: string;
  readonly trustDomainId: string;
  readonly targetType: ExportPackageTargetType;
  readonly targetId: string;
  readonly packageVersion?: string;
  readonly createdByActorId?: string;
  readonly recipient?: ExportPackageRecipient;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly sections: readonly CreatePackageSectionInput[];
}

export interface CreateAuditBundleInput {
  readonly title: string;
  readonly description: string;
  readonly trustDomainId: string;
  readonly scope: AuditBundleScope;
  readonly packageIds: readonly string[];
  readonly createdByActorId?: string;
  readonly recipient?: ExportPackageRecipient;
  readonly sections: readonly CreatePackageSectionInput[];
}

export interface CreatedPackage {
  readonly pkg: ExportPackage;
  readonly manifest: ExportPackageManifest;
  readonly decisionPacket: DecisionPacket;
}

const DECISION_ITEM_TYPES = ['enforcement_decision', 'policy_decision'] as const;

function findSectionId(sections: readonly ExportPackageSection[], type: ExportPackageSection['type']): string | undefined {
  return sections.find((section) => section.type === type)?.id;
}

function deriveDecisionSummary(sections: readonly ExportPackageSection[]): DecisionPacketSummary {
  const allItems = sections.flatMap((section) => section.items);
  const decisionItem = allItems.find((item) => DECISION_ITEM_TYPES.includes(item.type as (typeof DECISION_ITEM_TYPES)[number]));
  const executionItem = allItems.find((item) => item.type === 'execution_result');

  const action = decisionItem?.payload['action'];
  const actorId = decisionItem?.payload['actorId'];
  const resourceScope = decisionItem?.payload['resourceScope'];
  const allowed = decisionItem?.payload['allowedToExecute'] ?? decisionItem?.payload['allowed'];
  const blocked = typeof allowed === 'boolean' ? !allowed : undefined;
  const executed = executionItem?.payload['executed'];
  const reasonCode = decisionItem?.payload['reasonCode'];
  const reason = decisionItem?.payload['reason'];

  return {
    ...(typeof action === 'string' ? { action } : {}),
    ...(typeof actorId === 'string' ? { actorId } : {}),
    ...(typeof resourceScope === 'string' ? { resourceScope } : {}),
    ...(typeof allowed === 'boolean' ? { allowed } : {}),
    ...(typeof executed === 'boolean' ? { executed } : {}),
    ...(blocked !== undefined ? { blocked } : {}),
    ...(typeof reasonCode === 'string' ? { reasonCode } : {}),
    ...(typeof reason === 'string' ? { reason } : {}),
  };
}

/**
 * The single composition root for this feature: wires the store, builder,
 * hash/manifest/integrity/verification services, serializer, markdown
 * renderer, query service, and ledger together, and exposes the small,
 * stable API the rest of the codebase (and fixtures/tests) use.
 */
export class ExportPackageRuntime {
  readonly store: ExportPackageStore;
  readonly ledger: ExportPackageLedger;
  readonly hashService: ExportPackageHashService;
  readonly manifestService: ExportPackageManifestService;
  readonly integrityService: ExportPackageIntegrityService;
  readonly verificationService: ExportPackageVerificationService;
  readonly serializer: ExportPackageSerializer;
  readonly markdownService: ExportPackageMarkdownService;
  readonly queryService: ExportPackageQueryService;
  readonly builder: ExportPackageBuilder;

  constructor(private readonly ctx: ExportRuntimeContext) {
    this.store = new ExportPackageStore();
    this.ledger = createExportPackageLedger(ctx, this.store);
    this.hashService = createExportPackageHashService();
    this.manifestService = createExportPackageManifestService(this.hashService);
    this.integrityService = createExportPackageIntegrityService(this.hashService);
    this.verificationService = createExportPackageVerificationService(this.hashService, this.manifestService, this.integrityService);
    this.serializer = createExportPackageSerializer(this.hashService);
    this.markdownService = createExportPackageMarkdownService();
    this.queryService = createExportPackageQueryService(this.store);
    this.builder = new ExportPackageBuilder(this.hashService, this.manifestService);
  }

  private createTypedPackage(type: ExportPackage['type'], input: CreateExportPackageInput): CreatedPackage {
    const { pkg, manifest } = this.builder.createPackage(this.ctx, this.store, this.ledger, { type, ...input });

    const recognitionSectionId = findSectionId(pkg.sections, 'recognition');
    const authoritySectionId = findSectionId(pkg.sections, 'authority');
    const approvalSectionId = findSectionId(pkg.sections, 'approval');
    const externalStandingSectionId = findSectionId(pkg.sections, 'external_standing');
    const policySectionId = findSectionId(pkg.sections, 'policy');
    const evidenceSectionId = findSectionId(pkg.sections, 'evidence');
    const enforcementSectionId = findSectionId(pkg.sections, 'enforcement');
    const executionSectionId = findSectionId(pkg.sections, 'execution');
    const eventsSectionId = findSectionId(pkg.sections, 'events');
    const controlPlaneSectionId = findSectionId(pkg.sections, 'control_plane');

    const decisionPacket: DecisionPacket = {
      id: this.ctx.ids.nextId('export-decision-packet'),
      packageId: pkg.id,
      targetType: pkg.targetType,
      targetId: pkg.targetId,
      decisionSummary: deriveDecisionSummary(pkg.sections),
      ...(recognitionSectionId !== undefined ? { recognitionSectionId } : {}),
      ...(authoritySectionId !== undefined ? { authoritySectionId } : {}),
      ...(approvalSectionId !== undefined ? { approvalSectionId } : {}),
      ...(externalStandingSectionId !== undefined ? { externalStandingSectionId } : {}),
      ...(policySectionId !== undefined ? { policySectionId } : {}),
      ...(evidenceSectionId !== undefined ? { evidenceSectionId } : {}),
      ...(enforcementSectionId !== undefined ? { enforcementSectionId } : {}),
      ...(executionSectionId !== undefined ? { executionSectionId } : {}),
      ...(eventsSectionId !== undefined ? { eventsSectionId } : {}),
      ...(controlPlaneSectionId !== undefined ? { controlPlaneSectionId } : {}),
      manifestId: manifest.id,
      packageHash: pkg.packageHash ?? '',
      createdAt: pkg.createdAt,
    };
    this.store.saveDecisionPacket(decisionPacket);
    return { pkg, manifest, decisionPacket };
  }

  createDecisionPacket(input: CreateExportPackageInput): CreatedPackage {
    return this.createTypedPackage('decision_packet', input);
  }

  createPolicyDecisionPacket(input: CreateExportPackageInput): CreatedPackage {
    return this.createTypedPackage('policy_decision_packet', input);
  }

  createEnforcementDecisionPacket(input: CreateExportPackageInput): CreatedPackage {
    return this.createTypedPackage('enforcement_decision_packet', input);
  }

  createApprovalDecisionPacket(input: CreateExportPackageInput): CreatedPackage {
    return this.createTypedPackage('approval_decision_packet', input);
  }

  createEvidencePacket(input: CreateExportPackageInput): CreatedPackage {
    return this.createTypedPackage('evidence_packet', input);
  }

  createEnterpriseDemoPacket(input: CreateExportPackageInput): CreatedPackage {
    return this.createTypedPackage('enterprise_demo_packet', input);
  }

  createControlPlaneSnapshotPacket(input: CreateExportPackageInput): CreatedPackage {
    return this.createTypedPackage('control_plane_snapshot_packet', input);
  }

  createAuditBundle(input: CreateAuditBundleInput): { readonly pkg: ExportPackage; readonly manifest: ExportPackageManifest; readonly auditBundle: AuditBundle } {
    const { pkg, manifest } = this.builder.createPackage(this.ctx, this.store, this.ledger, {
      type: 'audit_bundle',
      title: input.title,
      description: input.description,
      trustDomainId: input.trustDomainId,
      targetType: 'audit_scope',
      targetId: this.ctx.ids.nextId('audit-scope'),
      ...(input.createdByActorId !== undefined ? { createdByActorId: input.createdByActorId } : {}),
      ...(input.recipient !== undefined ? { recipient: input.recipient } : {}),
      sections: input.sections,
    });

    const referencedPackages = input.packageIds.map((id) => this.store.getPackage(id)).filter((candidate): candidate is ExportPackage => candidate !== undefined);
    const decisionCount = referencedPackages.reduce((total, referenced) => total + referenced.sections.flatMap((section) => section.items).filter((item) => item.type.endsWith('_decision')).length, 0);
    const proofCount = referencedPackages.reduce((total, referenced) => total + referenced.sections.flatMap((section) => section.items).filter((item) => item.type.endsWith('_proof')).length, 0);
    const eventCount = referencedPackages.reduce((total, referenced) => total + this.ledger.getTrailByPackage(referenced.id).length, 0);
    const issueCount = referencedPackages.reduce((total, referenced) => total + (this.store.getIntegrityReportByPackage(referenced.id)?.issues.length ?? 0), 0);

    const summary = { packageCount: input.packageIds.length, decisionCount, proofCount, eventCount, issueCount };
    const bundleHash = this.hashService.hashAuditBundle({ scope: input.scope, packageIds: input.packageIds, summary });

    const auditBundle: AuditBundle = {
      id: this.ctx.ids.nextId('audit-bundle'),
      packageId: pkg.id,
      scope: input.scope,
      packageIds: input.packageIds,
      summary,
      bundleHash,
      createdAt: this.ctx.clock.now(),
    };
    this.store.saveAuditBundle(auditBundle);
    this.ledger.recordEvent({ type: 'audit_bundle_created', packageId: pkg.id, auditBundleId: auditBundle.id, payload: { bundleHash, packageCount: summary.packageCount } });

    return { pkg, manifest, auditBundle };
  }

  sealPackage(packageId: string): ExportPackage {
    return this.builder.sealPackage(this.ctx, this.store, this.ledger, packageId);
  }

  verifyPackage(packageId: string): ExportPackageVerification {
    const pkg = this.store.getPackage(packageId);
    if (pkg === undefined) {
      throw new ExportPackageNotFoundError(`Export package "${packageId}" was not found.`);
    }
    const manifest = this.store.getManifestByPackage(packageId);
    if (manifest === undefined) {
      throw new ExportPackageNotFoundError(`Manifest for export package "${packageId}" was not found.`);
    }
    const references = this.store.listReferences().filter((reference) => manifest.referenceHashes.some((entry) => entry.referenceId === reference.id));

    const { verification, integrityReport } = this.verificationService.verifyPackage(this.ctx, pkg, manifest, references);

    this.store.saveVerification(verification);
    this.store.saveIntegrityReport(integrityReport);
    this.store.updatePackageHashes(packageId, { integrityReportId: integrityReport.id, verificationId: verification.id });

    const nextStatus = verification.status === 'failed' ? 'verification_failed' : 'verified';
    this.store.updatePackageStatus(packageId, nextStatus, 'verifiedAt', verification.verifiedAt);

    this.ledger.recordEvent({
      type: verification.status === 'failed' ? 'export_package_verification_failed' : 'export_package_verified',
      packageId,
      verificationId: verification.id,
      payload: { status: verification.status, issueCount: verification.issues.length },
    });

    const snapshot: PackageSnapshot = {
      id: this.ctx.ids.nextId('export-snapshot'),
      packageId,
      targetType: pkg.targetType,
      targetId: pkg.targetId,
      sections: pkg.sections.map((section) => ({ sectionType: section.type, status: section.status, itemCount: section.itemCount, sectionHash: section.sectionHash })),
      ...(manifest.manifestHash !== undefined ? { manifestHash: manifest.manifestHash } : {}),
      ...(pkg.packageHash !== undefined ? { packageHash: pkg.packageHash } : {}),
      verificationStatus: verification.status,
      createdAt: this.ctx.clock.now(),
    };
    this.store.savePackageSnapshot(snapshot);

    return verification;
  }

  serializePackage(packageId: string, format: ExportPackageFormat): SerializedExportPackage {
    const pkg = this.store.getPackage(packageId);
    if (pkg === undefined) {
      throw new ExportPackageNotFoundError(`Export package "${packageId}" was not found.`);
    }
    const manifest = this.store.getManifestByPackage(packageId);
    if (manifest === undefined) {
      throw new ExportPackageNotFoundError(`Manifest for export package "${packageId}" was not found.`);
    }

    let artifact: SerializedExportPackage;
    if (format === 'json_bundle') {
      const verification = this.store.getLatestVerificationByPackage(packageId);
      artifact = this.serializer.serializeJsonBundle(this.ctx, pkg, manifest, verification);
    } else if (format === 'verification_manifest') {
      artifact = this.serializer.serializeManifest(this.ctx, manifest);
    } else if (format === 'integrity_report') {
      const report = this.store.getIntegrityReportByPackage(packageId);
      if (report === undefined) {
        throw new ExportPackageNotFoundError(`Integrity report for export package "${packageId}" was not found. Call verifyPackage() first.`);
      }
      artifact = this.serializer.serializeIntegrityReport(this.ctx, report);
    } else if (format === 'audit_bundle_fragment') {
      const bundle = Array.from(this.store.listAuditBundles()).find((candidate) => candidate.packageId === packageId);
      if (bundle === undefined) {
        throw new ExportPackageNotFoundError(`Audit bundle for export package "${packageId}" was not found.`);
      }
      artifact = this.serializer.serializeAuditBundleFragment(this.ctx, bundle);
    } else {
      const verification = this.store.getLatestVerificationByPackage(packageId);
      const markdown = this.markdownService.render(pkg, manifest, verification, 'technical');
      artifact = this.serializer.serializeMarkdown(this.ctx, packageId, `${pkg.title} (markdown summary)`, markdown);
    }

    this.store.saveSerializedArtifact(artifact);
    this.ledger.recordEvent({ type: 'export_package_serialized', packageId, payload: { format, contentHash: artifact.contentHash } });
    return artifact;
  }

  renderMarkdownSummary(packageId: string, audience: MarkdownAudience = 'buyer'): string {
    const pkg = this.store.getPackage(packageId);
    if (pkg === undefined) {
      throw new ExportPackageNotFoundError(`Export package "${packageId}" was not found.`);
    }
    const manifest = this.store.getManifestByPackage(packageId);
    if (manifest === undefined) {
      throw new ExportPackageNotFoundError(`Manifest for export package "${packageId}" was not found.`);
    }
    const verification = this.store.getLatestVerificationByPackage(packageId);
    return this.markdownService.render(pkg, manifest, verification, audience);
  }

  getPackage(packageId: string): ExportPackage | undefined {
    return this.store.getPackage(packageId);
  }

  getPackageManifest(packageId: string): ExportPackageManifest | undefined {
    return this.store.getManifestByPackage(packageId);
  }

  getPackageVerification(packageId: string): ExportPackageVerification | undefined {
    return this.store.getLatestVerificationByPackage(packageId);
  }

  getDecisionPacket(packageId: string): DecisionPacket | undefined {
    return this.store.getDecisionPacketByPackage(packageId);
  }

  queryPackages(filter: ExportPackageQueryFilter): readonly ExportPackage[] {
    return this.queryService.query(filter);
  }
}

export function createExportPackageRuntime(ctx: ExportRuntimeContext): ExportPackageRuntime {
  return new ExportPackageRuntime(ctx);
}
