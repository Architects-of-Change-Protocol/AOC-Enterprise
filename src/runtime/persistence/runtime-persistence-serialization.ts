import type { RuntimePersistenceEnvelope } from './runtime-persistence-types';
function sortValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) throw new Error('circular_reference_detected');
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((item) => sortValue(item, seen));
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const next = (value as Record<string, unknown>)[key];
    if (typeof next === 'function' || typeof next === 'symbol' || typeof next === 'undefined') throw new Error(`unsupported_value_type:${key}`);
    sorted[key] = sortValue(next, seen);
  }
  return sorted;
}
export function serializeRuntimePersistenceEnvelope(envelope: RuntimePersistenceEnvelope): string { return JSON.stringify(sortValue(envelope)); }
export function deserializeRuntimePersistenceEnvelope(serialized: string): RuntimePersistenceEnvelope { return sortValue(JSON.parse(serialized) as RuntimePersistenceEnvelope) as RuntimePersistenceEnvelope; }
