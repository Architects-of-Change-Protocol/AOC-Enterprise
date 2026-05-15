declare module 'crypto' { export function randomUUID(): string; }
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
