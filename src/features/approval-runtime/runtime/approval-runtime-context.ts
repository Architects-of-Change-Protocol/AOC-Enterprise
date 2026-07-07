export interface ApprovalRuntimeClock {
  now(): string;
}

export interface ApprovalRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface ApprovalRuntimeContext {
  readonly clock: ApprovalRuntimeClock;
  readonly ids: ApprovalRuntimeIdGenerator;
}

export interface ManualApprovalRuntimeClock extends ApprovalRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualApprovalClock(initialIso: string): ManualApprovalRuntimeClock {
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

export function createSequentialApprovalIdGenerator(startAt = 1): ApprovalRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createApprovalRuntimeContext(initialIso: string): ApprovalRuntimeContext {
  return {
    clock: createManualApprovalClock(initialIso),
    ids: createSequentialApprovalIdGenerator(),
  };
}
