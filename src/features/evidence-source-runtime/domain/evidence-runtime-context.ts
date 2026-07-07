export interface EvidenceRuntimeClock {
  now(): string;
}

export interface EvidenceRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface EvidenceRuntimeContext {
  readonly clock: EvidenceRuntimeClock;
  readonly ids: EvidenceRuntimeIdGenerator;
}

export interface ManualEvidenceRuntimeClock extends EvidenceRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualEvidenceClock(initialIso: string): ManualEvidenceRuntimeClock {
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

export function createSequentialEvidenceIdGenerator(startAt = 1): EvidenceRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createEvidenceRuntimeContext(initialIso: string): EvidenceRuntimeContext {
  return {
    clock: createManualEvidenceClock(initialIso),
    ids: createSequentialEvidenceIdGenerator(),
  };
}
