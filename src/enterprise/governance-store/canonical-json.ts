/**
 * Deterministic canonical JSON serialization for the Governance Store's
 * integrity layer (`aoc.canonical-json.v1`). Every digest the Store computes
 * is a digest *of this serialization*, never of plain `JSON.stringify`
 * output, so that two semantically identical values always digest
 * identically regardless of object-key insertion order, runtime, or
 * platform.
 *
 * Canonicalization rules (v1):
 * - object keys are sorted lexicographically by UTF-16 code unit;
 * - arrays preserve their given order (order is data, not noise);
 * - `undefined`-valued object properties are omitted (matching what
 *   `JSON.stringify` persists — an absent key and an `undefined` key are the
 *   same stored fact);
 * - a top-level or array-element `undefined` serializes as `null`;
 * - `null` serializes as `null`;
 * - `Date` instances serialize as their ISO-8601 UTC string;
 * - strings/booleans/finite numbers serialize per JSON; `-0` normalizes to
 *   `0`; non-finite numbers are rejected;
 * - `bigint`, functions, and symbols are rejected (not silently dropped) —
 *   a governance record must never contain them;
 * - the input is never mutated;
 * - output is a UTF-8-encodable JS string with no whitespace.
 */

export const AOC_CANONICALIZATION_VERSION = 'aoc.canonical-json.v1';

/** Thrown when a value cannot be canonically serialized. Deliberately a plain Error subclass — callers map it into the Store error taxonomy. */
export class CanonicalSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalSerializationError';
  }
}

function serializeValue(value: unknown, path: string, seen: Set<object>): string {
  if (value === null || value === undefined) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new CanonicalSerializationError(`Non-finite number at ${path} cannot be canonically serialized.`);
      }
      // Normalize -0 so that semantically equal numbers digest identically.
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    case 'bigint':
      throw new CanonicalSerializationError(`bigint at ${path} cannot be canonically serialized; convert it to a string first.`);
    case 'function':
    case 'symbol':
      throw new CanonicalSerializationError(`${typeof value} at ${path} cannot be canonically serialized.`);
    case 'object':
      break;
    default:
      throw new CanonicalSerializationError(`Unsupported value of type ${typeof value} at ${path}.`);
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    throw new CanonicalSerializationError(`Circular reference at ${path} cannot be canonically serialized.`);
  }

  if (objectValue instanceof Date) {
    const time = objectValue.getTime();
    if (!Number.isFinite(time)) throw new CanonicalSerializationError(`Invalid Date at ${path} cannot be canonically serialized.`);
    return JSON.stringify(objectValue.toISOString());
  }

  seen.add(objectValue);
  try {
    if (Array.isArray(objectValue)) {
      const items = objectValue.map((item, index) => serializeValue(item, `${path}[${index}]`, seen));
      return `[${items.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalSerializationError(`Non-plain object (${prototype?.constructor?.name ?? 'unknown'}) at ${path} cannot be canonically serialized.`);
    }

    const record = objectValue as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${serializeValue(record[key], `${path}.${key}`, seen)}`);
    return `{${entries.join(',')}}`;
  } finally {
    seen.delete(objectValue);
  }
}

/** Serializes `value` deterministically per `aoc.canonical-json.v1`. Identical logical inputs always produce identical output strings. */
export function canonicalSerialize(value: unknown): string {
  return serializeValue(value, '$', new Set());
}
