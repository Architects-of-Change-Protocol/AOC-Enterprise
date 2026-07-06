export interface AuthorityRuntimeClock {
  now(): string;
}

export interface AuthorityRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface AuthorityRuntimeContext {
  readonly clock: AuthorityRuntimeClock;
  readonly ids: AuthorityRuntimeIdGenerator;
}

export interface ManualAuthorityRuntimeClock extends AuthorityRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualAuthorityClock(initialIso: string): ManualAuthorityRuntimeClock {
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

export function createSequentialAuthorityIdGenerator(startAt = 1): AuthorityRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createAuthorityRuntimeContext(initialIso: string): AuthorityRuntimeContext {
  return {
    clock: createManualAuthorityClock(initialIso),
    ids: createSequentialAuthorityIdGenerator(),
  };
}
