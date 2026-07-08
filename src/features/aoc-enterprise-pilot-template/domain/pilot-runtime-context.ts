export interface PilotRuntimeClock {
  now(): string;
}

export interface PilotRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface PilotRuntimeContext {
  readonly clock: PilotRuntimeClock;
  readonly ids: PilotRuntimeIdGenerator;
}

export interface ManualPilotRuntimeClock extends PilotRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualPilotClock(initialIso: string): ManualPilotRuntimeClock {
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

export function createSequentialPilotIdGenerator(startAt = 1): PilotRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createPilotRuntimeContext(initialIso: string): PilotRuntimeContext {
  return {
    clock: createManualPilotClock(initialIso),
    ids: createSequentialPilotIdGenerator(),
  };
}
