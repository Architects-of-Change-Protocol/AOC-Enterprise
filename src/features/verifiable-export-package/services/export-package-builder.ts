import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackage, ExportPackageTargetType, ExportPackageType } from '../domain/export-package.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';
import type { ExportPackageSectionType } from '../domain/export-package-section.js';
import type { ExportPackageManifest } from '../domain/export-package-manifest.js';
import type { ExportPackageRecipient } from '../domain/export-package-recipient.js';
import { buildSection, applyMissingReferences } from './export-package-section-builder.js';
import { resolveReferences } from './export-package-reference-resolver.js';
import { ExportPackageHashService } from './export-package-hash-service.js';
import { ExportPackageManifestService } from './export-package-manifest-service.js';
import { ExportPackageStore, ExportPackageNotFoundError } from './export-package-store.js';
import { ExportPackageLedger } from './export-package-ledger.js';

const SECTION_DEFAULTS: Readonly<Record<ExportPackageSectionType, { readonly title: string; readonly description: string }>> = {
  summary: { title: 'Summary', description: 'Human-readable summary of the decision this package packages.' },
  recognition: { title: 'Recognition', description: 'Recognition Runtime decision and proof for the actor and action.' },
  authority: { title: 'Authority', description: 'Authority Graph grants, delegation lineage, and authority proof.' },
  approval: { title: 'Approval', description: 'Approval Runtime request, decision, and proof.' },
  external_standing: { title: 'External Standing', description: 'External Agent Handshake visa and standing proof.' },
  policy: { title: 'Policy', description: 'Domain Policy Pack Runtime decision and proof.' },
  evidence: { title: 'Evidence', description: 'Evidence / Source / Citation Runtime requirements, artifacts, satisfactions, and reviews.' },
  citations: { title: 'Citations', description: 'Citations and evidence links referenced by this decision.' },
  enforcement: { title: 'Enforcement', description: 'Action Enforcement request, decision, and proof.' },
  execution: { title: 'Execution', description: 'Execution result and side effects, if the action executed.' },
  events: { title: 'Events', description: 'Event trail(s) recorded by the source runtimes for this decision.' },
  control_plane: { title: 'Control Plane', description: 'AOC Control Plane snapshot reference for this decision.' },
  enterprise_demo: { title: 'Enterprise Demo', description: 'Enterprise Demo scenario and run reference, if this decision originated in a demo scenario.' },
  manifest: { title: 'Manifest', description: 'Deterministic manifest of every section, item, and reference hash in this package.' },
  verification: { title: 'Verification', description: 'Verification result proving whether this package is internally consistent.' },
};

export interface CreatePackageSectionInput {
  readonly type: ExportPackageSectionType;
  readonly required: boolean;
  readonly items: readonly ExportPackageItem[];
  readonly title?: string;
  readonly description?: string;
}

export interface CreatePackageInput {
  readonly type: ExportPackageType;
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

export interface CreatePackageResult {
  readonly pkg: ExportPackage;
  readonly manifest: ExportPackageManifest;
}

/**
 * Assembles an ExportPackage from already-mapped ExportPackageItems. This
 * builder never fetches, evaluates, or fabricates a fact: `input.sections`
 * must already carry the complete, real item set for this package (built by
 * the integrations/*.ts adapters from real source-runtime records).
 */
export class ExportPackageBuilder {
  constructor(
    private readonly hashService: ExportPackageHashService,
    private readonly manifestService: ExportPackageManifestService,
  ) {}

  createPackage(ctx: ExportRuntimeContext, store: ExportPackageStore, ledger: ExportPackageLedger, input: CreatePackageInput): CreatePackageResult {
    const allItems = input.sections.flatMap((section) => section.items);
    const { references, missing } = resolveReferences(ctx, allItems);

    let sections = input.sections.map((sectionInput) =>
      buildSection(ctx, this.hashService, {
        type: sectionInput.type,
        title: sectionInput.title ?? SECTION_DEFAULTS[sectionInput.type].title,
        description: sectionInput.description ?? SECTION_DEFAULTS[sectionInput.type].description,
        required: sectionInput.required,
        items: sectionInput.items,
      }),
    );

    const missingBySection = new Map<string, string[]>();
    for (const entry of missing) {
      const section = sections.find((candidate) => candidate.items.some((item) => item.id === entry.fromItemId));
      if (section === undefined) continue;
      const bucket = missingBySection.get(section.id) ?? [];
      bucket.push(`${entry.field}:${entry.targetSourceId}`);
      missingBySection.set(section.id, bucket);
    }
    sections = sections.map((section) => (missingBySection.has(section.id) ? applyMissingReferences(section, missingBySection.get(section.id)!) : section));

    const packageId = ctx.ids.nextId('export-package');
    const createdAt = ctx.clock.now();
    const packageVersion = input.packageVersion ?? '1.0.0';

    const manifest = this.manifestService.createManifest(ctx, {
      packageId,
      packageType: input.type,
      packageVersion,
      targetType: input.targetType,
      targetId: input.targetId,
      sections,
      references,
    });

    const pkg: ExportPackage = {
      id: packageId,
      type: input.type,
      title: input.title,
      description: input.description,
      status: 'draft',
      trustDomainId: input.trustDomainId,
      targetType: input.targetType,
      targetId: input.targetId,
      packageVersion,
      sections,
      manifestId: manifest.id,
      createdAt,
      ...(input.createdByActorId !== undefined ? { createdByActorId: input.createdByActorId } : {}),
      ...(input.recipient !== undefined ? { recipient: input.recipient } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    store.savePackage(pkg);
    store.saveManifest(manifest);
    for (const reference of references) {
      store.saveReference(reference);
    }

    ledger.recordEvent({ type: 'export_package_created', packageId, targetType: input.targetType, targetId: input.targetId, payload: { type: input.type, title: input.title } });
    for (const section of sections) {
      ledger.recordEvent({ type: 'export_package_section_created', packageId, sectionId: section.id, payload: { sectionType: section.type, itemCount: section.itemCount, status: section.status } });
    }
    for (const item of allItems) {
      ledger.recordEvent({ type: 'export_package_item_added', packageId, itemId: item.id, payload: { itemType: item.type, sourceModule: item.sourceModule, sourceId: item.sourceId } });
    }
    for (const reference of references) {
      ledger.recordEvent({ type: 'export_package_reference_created', packageId, referenceId: reference.id, payload: { referenceType: reference.type, reasonCode: reference.reasonCode } });
    }
    ledger.recordEvent({ type: 'export_package_manifest_created', packageId, manifestId: manifest.id, payload: { manifestHash: manifest.manifestHash } });

    return { pkg, manifest };
  }

  sealPackage(ctx: ExportRuntimeContext, store: ExportPackageStore, ledger: ExportPackageLedger, packageId: string): ExportPackage {
    const pkg = store.getPackage(packageId);
    if (pkg === undefined) {
      throw new ExportPackageNotFoundError(`Export package "${packageId}" was not found.`);
    }
    const manifest = store.getManifestByPackage(packageId);
    if (manifest === undefined) {
      throw new ExportPackageNotFoundError(`Manifest for export package "${packageId}" was not found.`);
    }

    const previousPackageHash = store.getLatestSealedPackageHash(pkg.trustDomainId);
    const packageHash = this.hashService.hashPackage({
      id: pkg.id,
      type: pkg.type,
      trustDomainId: pkg.trustDomainId,
      targetType: pkg.targetType,
      targetId: pkg.targetId,
      packageVersion: pkg.packageVersion,
      manifestHash: manifest.manifestHash,
      ...(previousPackageHash !== undefined ? { previousPackageHash } : {}),
    });

    store.updatePackageHashes(packageId, { packageHash, ...(previousPackageHash !== undefined ? { previousPackageHash } : {}) });
    const sealedAt = ctx.clock.now();
    const sealed = store.updatePackageStatus(packageId, 'sealed', 'sealedAt', sealedAt);

    ledger.recordEvent({ type: 'export_package_sealed', packageId, payload: { packageHash } });

    return sealed;
  }
}

export function createExportPackageBuilder(hashService: ExportPackageHashService, manifestService: ExportPackageManifestService): ExportPackageBuilder {
  return new ExportPackageBuilder(hashService, manifestService);
}
