import {
  bridgeRecognitionRuntime,
  buildDatasysEnforcementFixture,
  type DatasysEnforcementFixture,
} from '../../../features/action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { createManualEnforcementClock, createSequentialEnforcementIdGenerator } from '../../../features/action-enforcement/runtime/enforcement-runtime-context.js';
import type { GuardActionRequestInput } from '../../../features/action-enforcement/sdk/aoc-guard.js';
import { AocKernel } from '../../AocKernel.js';
import type { KernelEvaluationRequest } from '../../contracts/kernel-request.js';

export const NOW = '2026-01-01T00:00:00.000Z';

/**
 * One "world" shared by a characterization scenario's pre-extraction call
 * (`fixture.aocGuard`, entirely untouched code) and its post-extraction call
 * (`kernel`, wrapping the same underlying recognition world through the same
 * structural bridge used everywhere in this repository). The two enforcement
 * runtimes are deliberately separate instances (each with its own store/
 * idempotency/adapter registry) -- neither is derived from or depends on the
 * other, so agreement between them is real evidence of equivalent behavior,
 * not shared state.
 */
export interface KernelParityWorld {
  readonly fixture: DatasysEnforcementFixture;
  readonly kernel: AocKernel;
}

export function buildKernelParityWorld(): KernelParityWorld {
  const fixture = buildDatasysEnforcementFixture();
  const kernel = new AocKernel({
    recognitionProvider: bridgeRecognitionRuntime(fixture.recognitionRuntime),
    clock: createManualEnforcementClock(NOW),
    idGenerator: createSequentialEnforcementIdGenerator(),
  });
  return { fixture, kernel };
}

let requestCounter = 0;

/** Maps the same `GuardActionRequestInput` shape the pre-extraction fixtures already use onto a `KernelEvaluationRequest`, so both sides of a parity assertion are built from one literal scenario definition. */
export function toKernelRequest(input: GuardActionRequestInput): KernelEvaluationRequest {
  requestCounter += 1;
  const metadata = input.metadata;
  return {
    requestId: input.actionRequestId ?? `characterization-request-${requestCounter}`,
    actor: {
      id: input.actorId,
      trustDomainId: input.trustDomainId,
      ...(input.principalActorId !== undefined ? { principalId: input.principalActorId } : {}),
    },
    action: {
      type: input.action,
      resourceScope: input.resourceScope,
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
      ...(input.sideEffectType !== undefined ? { sideEffectType: input.sideEffectType } : {}),
    },
    ...(input.targetId !== undefined || input.targetType !== undefined || input.targetName !== undefined || input.adapterId !== undefined
      ? {
          target: {
            ...(input.targetId !== undefined ? { id: input.targetId } : {}),
            ...(input.targetType !== undefined ? { type: input.targetType } : {}),
            ...(input.targetName !== undefined ? { name: input.targetName } : {}),
            ...(input.adapterId !== undefined ? { adapterId: input.adapterId } : {}),
          },
        }
      : {}),
    ...(metadata !== undefined ? { context: metadata } : {}),
    requestedAt: NOW,
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.approvalProofId !== undefined ? { approvalProofId: input.approvalProofId } : {}),
    ...(input.approvalRequestId !== undefined ? { approvalRequestId: input.approvalRequestId } : {}),
    ...(input.approvalDecisionId !== undefined ? { approvalDecisionId: input.approvalDecisionId } : {}),
  };
}
