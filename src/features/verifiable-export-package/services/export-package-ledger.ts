import { createDigest } from '../domain/export-package.js';
import type { ExportPackageEvent, ExportPackageEventType } from '../domain/package-event.js';
import type { ExportPackageTargetType } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageStore } from './export-package-store.js';

export interface RecordExportPackageEventInput {
  readonly type: ExportPackageEventType;
  readonly packageId?: string;
  readonly sectionId?: string;
  readonly itemId?: string;
  readonly referenceId?: string;
  readonly manifestId?: string;
  readonly verificationId?: string;
  readonly auditBundleId?: string;
  readonly targetType?: ExportPackageTargetType;
  readonly targetId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ExportPackageEventFilter {
  readonly packageId?: string;
  readonly targetType?: ExportPackageTargetType;
  readonly targetId?: string;
  readonly type?: ExportPackageEventType;
}

/** Append-only, hash-chained event ledger. Mirrors EvidenceLedger/PolicyPackLedger's previousHash/eventHash chaining. */
export class ExportPackageLedger {
  constructor(
    private readonly ctx: ExportRuntimeContext,
    private readonly store: ExportPackageStore,
  ) {}

  recordEvent(input: RecordExportPackageEventInput): ExportPackageEvent {
    const timestamp = this.ctx.clock.now();
    const previousHash = this.store.getLatestEvent()?.eventHash;
    const eventHash = createDigest({
      type: input.type,
      packageId: input.packageId,
      sectionId: input.sectionId,
      itemId: input.itemId,
      referenceId: input.referenceId,
      manifestId: input.manifestId,
      verificationId: input.verificationId,
      auditBundleId: input.auditBundleId,
      targetType: input.targetType,
      targetId: input.targetId,
      timestamp,
      payload: input.payload,
      previousHash,
    });

    const event: ExportPackageEvent = {
      id: this.ctx.ids.nextId('export-event'),
      type: input.type,
      timestamp,
      payload: input.payload,
      eventHash,
      ...(input.packageId !== undefined ? { packageId: input.packageId } : {}),
      ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
      ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
      ...(input.referenceId !== undefined ? { referenceId: input.referenceId } : {}),
      ...(input.manifestId !== undefined ? { manifestId: input.manifestId } : {}),
      ...(input.verificationId !== undefined ? { verificationId: input.verificationId } : {}),
      ...(input.auditBundleId !== undefined ? { auditBundleId: input.auditBundleId } : {}),
      ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(previousHash !== undefined ? { previousHash } : {}),
    };

    return this.store.saveEvent(event);
  }

  getEvents(filter?: ExportPackageEventFilter): readonly ExportPackageEvent[] {
    const events = this.store.getEvents();
    if (filter === undefined) return events;
    return events.filter((event) => {
      if (filter.packageId !== undefined && event.packageId !== filter.packageId) return false;
      if (filter.targetType !== undefined && event.targetType !== filter.targetType) return false;
      if (filter.targetId !== undefined && event.targetId !== filter.targetId) return false;
      if (filter.type !== undefined && event.type !== filter.type) return false;
      return true;
    });
  }

  getTrailByPackage(packageId: string): readonly ExportPackageEvent[] {
    return this.getEvents({ packageId });
  }

  getTrailByTarget(targetType: ExportPackageTargetType, targetId: string): readonly ExportPackageEvent[] {
    return this.getEvents({ targetType, targetId });
  }

  /** Recomputes each event's hash in order and confirms the previousHash chain was never tampered with. */
  verifyChain(): boolean {
    let expectedPrevious: string | undefined;
    for (const event of this.store.getEvents()) {
      if (event.previousHash !== expectedPrevious) return false;
      const recomputedHash = createDigest({
        type: event.type,
        packageId: event.packageId,
        sectionId: event.sectionId,
        itemId: event.itemId,
        referenceId: event.referenceId,
        manifestId: event.manifestId,
        verificationId: event.verificationId,
        auditBundleId: event.auditBundleId,
        targetType: event.targetType,
        targetId: event.targetId,
        timestamp: event.timestamp,
        payload: event.payload,
        previousHash: event.previousHash,
      });
      if (recomputedHash !== event.eventHash) return false;
      expectedPrevious = event.eventHash;
    }
    return true;
  }
}

export function createExportPackageLedger(ctx: ExportRuntimeContext, store: ExportPackageStore): ExportPackageLedger {
  return new ExportPackageLedger(ctx, store);
}
