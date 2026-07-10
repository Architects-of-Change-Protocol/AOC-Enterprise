import assert from 'node:assert/strict';

/**
 * This repository's restricted `node-shims` type surface (`types/node-shims/index.d.ts`,
 * intentionally excludes `@types/node`) does not type the
 * `assert.throws(fn, ErrorClass)` / `assert.rejects(fn, ErrorClass)`
 * constructor-matcher overloads -- only the plain `(fn, message?)` form.
 * These helpers mirror the pattern already used elsewhere in this repo
 * (e.g. `recognition-runtime/tests/passport-service.test.ts`).
 */
export function assertThrowsInstance(fn: () => void, errorClass: new (...args: never[]) => Error): void {
  try {
    fn();
    assert.ok(false, 'expected function to throw');
  } catch (error) {
    assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}, got ${String(error)}`);
  }
}

export async function assertRejectsInstance(fn: () => Promise<unknown>, errorClass: new (...args: never[]) => Error): Promise<void> {
  try {
    await fn();
    assert.ok(false, 'expected promise to reject');
  } catch (error) {
    assert.ok(error instanceof errorClass, `expected error to be an instance of ${errorClass.name}, got ${String(error)}`);
  }
}
