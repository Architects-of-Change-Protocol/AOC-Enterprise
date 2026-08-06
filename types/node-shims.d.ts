declare module 'crypto' {
  export function randomUUID(): string;
  export function randomBytes(size: number): Buffer;
  interface Hash {
    update(data: string, encoding?: string): Hash;
    digest(encoding: 'hex'): string;
    digest(encoding: 'base64'): string;
    digest(): Buffer;
  }
  interface Hmac {
    update(data: string, encoding?: string): Hmac;
    digest(encoding: 'hex'): string;
    digest(encoding: 'base64'): string;
    digest(): Buffer;
  }
  export function createHash(algorithm: string): Hash;
  export function createHmac(algorithm: string, key: string | Buffer): Hmac;
}
declare module 'fs' {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding: string): void;
}
declare module 'path' {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
}
declare const process: { cwd(): string };

declare module 'node:test' {
  type TestFn = (t: unknown) => void | Promise<void>;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: TestFn): void;
  export function test(name: string, fn: TestFn): void;
  export function before(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  const assert: {
    ok(value: unknown, message?: string): void;
    equal<T>(actual: T, expected: T, message?: string): void;
    notEqual<T>(actual: T, expected: T, message?: string): void;
    deepEqual<T>(actual: T, expected: T, message?: string): void;
    throws(fn: () => void, message?: string): void;
    rejects(fn: () => Promise<unknown>, message?: string): Promise<void>;
  };
  export = assert;
}
