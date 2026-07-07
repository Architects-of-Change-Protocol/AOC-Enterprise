export interface EnforcementRuntimeClock {
  now(): string;
}

export interface EnforcementRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface EnforcementRuntimeContext {
  readonly clock: EnforcementRuntimeClock;
  readonly ids: EnforcementRuntimeIdGenerator;
}

export interface ManualEnforcementRuntimeClock extends EnforcementRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualEnforcementClock(initialIso: string): ManualEnforcementRuntimeClock {
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

export function createSequentialEnforcementIdGenerator(startAt = 1): EnforcementRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createEnforcementRuntimeContext(initialIso: string): EnforcementRuntimeContext {
  return {
    clock: createManualEnforcementClock(initialIso),
    ids: createSequentialEnforcementIdGenerator(),
  };
}
