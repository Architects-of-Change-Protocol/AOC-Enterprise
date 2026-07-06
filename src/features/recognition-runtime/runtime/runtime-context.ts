export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface RuntimeContext {
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

export interface ManualClock extends Clock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualClock(initialIso: string): ManualClock {
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

export function createSequentialIdGenerator(startAt = 1): IdGenerator {
  let counter = startAt;
  return {
    next(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createRuntimeContext(initialIso: string): RuntimeContext {
  return {
    clock: createManualClock(initialIso),
    idGenerator: createSequentialIdGenerator(),
  };
}
