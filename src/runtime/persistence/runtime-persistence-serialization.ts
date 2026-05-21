import type { RuntimePersistenceEnvelope } from './runtime-persistence-types.js';

function sortValue(value: unknown, stack = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (stack.has(value as object)) throw new Error('circular_reference_detected');
  stack.add(value as object);
  let sorted: unknown;
  if (Array.isArray(value)) {
    sorted = value.map((item) => sortValue(item, stack));
  } else {
    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const next = (value as Record<string, unknown>)[key];
      if (typeof next === 'function' || typeof next === 'symbol' || typeof next === 'undefined') {
        throw new Error(`unsupported_value_type:${key}`);
      }
      obj[key] = sortValue(next, stack);
    }
    sorted = obj;
  }
  stack.delete(value as object);
  return sorted;
}

export function serializeRuntimePersistenceEnvelope(envelope: RuntimePersistenceEnvelope): string {
  return JSON.stringify(sortValue(envelope));
}

export function deserializeRuntimePersistenceEnvelope(serialized: string): RuntimePersistenceEnvelope {
  return sortValue(JSON.parse(serialized) as RuntimePersistenceEnvelope) as RuntimePersistenceEnvelope;
}
