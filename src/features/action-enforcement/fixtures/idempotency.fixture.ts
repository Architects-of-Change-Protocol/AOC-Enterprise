import type { GuardActionRequestInput } from '../sdk/aoc-guard.js';
import { buildDraftClosureEmailGuardInput } from './allowed-action.fixture.js';

export const DEMO_IDEMPOTENCY_KEY = 'idempotency-key-demo-closure-email-1';

/** The same allowed action, submitted twice with the same idempotency key -- the second attempt must be suppressed. */
export function buildIdempotentDraftClosureEmailGuardInput(idempotencyKey: string = DEMO_IDEMPOTENCY_KEY, overrides: Partial<GuardActionRequestInput> = {}): GuardActionRequestInput {
  return buildDraftClosureEmailGuardInput({ idempotencyKey, ...overrides });
}
