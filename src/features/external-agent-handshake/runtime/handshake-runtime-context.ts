export interface HandshakeRuntimeClock {
  now(): string;
}

export interface HandshakeRuntimeIdGenerator {
  nextId(prefix: string): string;
}

export interface HandshakeRuntimeContext {
  readonly clock: HandshakeRuntimeClock;
  readonly ids: HandshakeRuntimeIdGenerator;
}

export interface ManualHandshakeRuntimeClock extends HandshakeRuntimeClock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createManualHandshakeClock(initialIso: string): ManualHandshakeRuntimeClock {
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

export function createSequentialHandshakeIdGenerator(startAt = 1): HandshakeRuntimeIdGenerator {
  let counter = startAt;
  return {
    nextId(prefix: string): string {
      const id = `${prefix}-${String(counter).padStart(6, '0')}`;
      counter += 1;
      return id;
    },
  };
}

export function createHandshakeRuntimeContext(initialIso: string): HandshakeRuntimeContext {
  return {
    clock: createManualHandshakeClock(initialIso),
    ids: createSequentialHandshakeIdGenerator(),
  };
}
