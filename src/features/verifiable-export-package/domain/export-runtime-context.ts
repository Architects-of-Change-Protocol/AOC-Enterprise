export interface ExportRuntimeClock {
  now(): string;
}

export interface ExportRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface ExportRuntimeContext {
  readonly clock: ExportRuntimeClock;
  readonly ids: ExportRuntimeIdGenerator;
}

export interface ManualExportRuntimeClock extends ExportRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualExportClock(initialIso: string): ManualExportRuntimeClock {
  let currentMs = Date.parse(initialIso);
  return {
    now(): string {
      return new Date(currentMs).toISOString();
    },
    set(iso: string): void {
      currentMs = Date.parse(iso);
    },
    advance(ms: number): void {
      currentMs += ms;
    },
  };
}

export function createSequentialExportIdGenerator(startAt = 1): ExportRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createExportRuntimeContext(initialIso: string): ExportRuntimeContext {
  return {
    clock: createManualExportClock(initialIso),
    ids: createSequentialExportIdGenerator(),
  };
}
