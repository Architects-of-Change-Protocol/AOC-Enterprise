import { GOVERNED_RUNTIME_TERMINAL_STATES, GOVERNED_RUNTIME_TRANSITIONS, type GovernedRuntimeState } from './contracts.js';

/**
 * The single place `GOVERNED_RUNTIME_TRANSITIONS` is consulted (mission
 * section 3.2). Every state change in this module -- whether triggered by
 * lease issuance, a protected action, or an emergency control -- must pass
 * through `assertRuntimeTransition` first. There is no other path to
 * mutating `GovernedRuntime.state`.
 */
export function canTransitionRuntimeState(from: GovernedRuntimeState, to: GovernedRuntimeState): boolean {
  if (from === to) return true; // idempotent no-op transitions (e.g. pause-while-paused) are allowed by callers, not by the matrix itself
  return GOVERNED_RUNTIME_TRANSITIONS[from].includes(to);
}

export function isTerminalRuntimeState(state: GovernedRuntimeState): boolean {
  return GOVERNED_RUNTIME_TERMINAL_STATES.includes(state);
}

export class RuntimeStateTransitionError extends Error {
  constructor(
    readonly runtimeId: string,
    readonly from: GovernedRuntimeState,
    readonly to: GovernedRuntimeState,
  ) {
    super(
      isTerminalRuntimeState(from)
        ? `Runtime '${runtimeId}' is TERMINATED; termination is irreversible and no further transition (attempted: ${to}) is permitted. Create a new runtime identity instead.`
        : `Runtime '${runtimeId}' cannot transition from '${from}' to '${to}'; permitted targets are: ${GOVERNED_RUNTIME_TRANSITIONS[from].join(', ') || '(none)'}.`,
    );
    this.name = 'RuntimeStateTransitionError';
  }
}

/** Throws `RuntimeStateTransitionError` for any transition not present in the matrix. Idempotent same-state calls are allowed through (callers decide whether that's a no-op or an error for their own semantics). */
export function assertRuntimeTransition(runtimeId: string, from: GovernedRuntimeState, to: GovernedRuntimeState): void {
  if (!canTransitionRuntimeState(from, to)) {
    throw new RuntimeStateTransitionError(runtimeId, from, to);
  }
}
