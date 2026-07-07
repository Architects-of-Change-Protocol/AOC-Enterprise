export interface PolicyPackRuntimeClock {
  now(): string;
}

export interface PolicyPackRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface PolicyPackRuntimeContext {
  readonly clock: PolicyPackRuntimeClock;
  readonly ids: PolicyPackRuntimeIdGenerator;
}

export interface ManualPolicyPackRuntimeClock extends PolicyPackRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualPolicyPackClock(initialIso: string): ManualPolicyPackRuntimeClock {
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

export function createSequentialPolicyPackIdGenerator(startAt = 1): PolicyPackRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createPolicyPackRuntimeContext(initialIso: string): PolicyPackRuntimeContext {
  return {
    clock: createManualPolicyPackClock(initialIso),
    ids: createSequentialPolicyPackIdGenerator(),
  };
}
