import type { PolicyCondition, PolicyPredicateCondition } from '../domain/policy-pack-condition.js';

/** Internal authoring helpers shared by the sample packs in this directory. Not part of the module's public surface. */
export function predicate(
  field: PolicyPredicateCondition['field'],
  operator: PolicyPredicateCondition['operator'],
  value?: unknown,
  metadataPath?: string,
): PolicyPredicateCondition {
  return {
    type: 'predicate',
    field,
    operator,
    ...(value !== undefined ? { value } : {}),
    ...(metadataPath !== undefined ? { metadataPath } : {}),
  };
}

export function all(...conditions: readonly PolicyCondition[]): PolicyCondition {
  return { type: 'group', operator: 'all', conditions };
}

export function any(...conditions: readonly PolicyCondition[]): PolicyCondition {
  return { type: 'group', operator: 'any', conditions };
}
