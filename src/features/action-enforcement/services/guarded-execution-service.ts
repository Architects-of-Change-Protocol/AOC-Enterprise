import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { EnforcementRequest } from '../domain/enforcement-request.js';
import type { ExecutionResult } from '../domain/execution-result.js';
import type { EnforcementRuntimeContext } from '../runtime/enforcement-runtime-context.js';
import { PostExecutionRecordMissingError } from '../runtime/enforcement-runtime-errors.js';
import type { EnforcementLedger } from './enforcement-ledger.js';
import type { EnforcementPreflightService } from './enforcement-preflight-service.js';
import type { EnforcementProofService } from './enforcement-proof-service.js';
import type { EnforcementResultService } from './enforcement-result-service.js';
import type { EnforcementStore } from './enforcement-store.js';
import type { IdempotencyService } from './idempotency-service.js';
import type { SideEffectLedger } from './side-effect-ledger.js';

/**
 * The only place in this feature that is allowed to invoke a caller-supplied
 * execute() callback. It always runs preflight first; the callback is
 * invoked once, and only once, when (and only when) preflight resolves to
 * `execute_allowed`. Every other outcome -- blocked, pending approval or
 * evidence, dry run, duplicate, adapter/emergency denial, expiry -- returns
 * without ever calling execute().
 */
export class GuardedExecutionService {
  constructor(
    private readonly ctx: EnforcementRuntimeContext,
    private readonly store: EnforcementStore,
    private readonly ledger: EnforcementLedger,
    private readonly preflightService: EnforcementPreflightService,
    private readonly resultService: EnforcementResultService,
    private readonly proofService: EnforcementProofService,
    private readonly sideEffectLedger: SideEffectLedger,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async run<T>(request: EnforcementRequest, execute: () => Promise<T> | T): Promise<EnforcementOutcome<T>> {
    const decision = this.preflightService.preflight(request);
    const sideEffectIds = request.sideEffects.map((sideEffect) => sideEffect.id);

    if (!decision.allowedToExecute) {
      let result: ExecutionResult;

      if (decision.type === 'dry_run_allowed') {
        for (const sideEffectId of sideEffectIds) {
          this.sideEffectLedger.markSkipped(sideEffectId);
        }
        this.ledger.recordEvent({
          type: 'execution_skipped',
          trustDomainId: request.trustDomainId,
          enforcementRequestId: request.id,
          enforcementDecisionId: decision.id,
          actorId: request.actorId,
          payload: { reasonCode: decision.reasonCode },
        });
        result = this.resultService.markSkipped({ enforcementRequestId: request.id, enforcementDecisionId: decision.id });
      } else if (decision.type === 'duplicate_suppressed') {
        for (const sideEffectId of sideEffectIds) {
          this.sideEffectLedger.markSkipped(sideEffectId);
        }
        this.ledger.recordEvent({
          type: 'duplicate_suppressed',
          trustDomainId: request.trustDomainId,
          enforcementRequestId: request.id,
          enforcementDecisionId: decision.id,
          actorId: request.actorId,
          payload: { idempotencyKey: request.idempotencyKey },
        });
        const idempotency = this.idempotencyService.check(request.idempotencyKey, request.id);
        result = this.resultService.markDuplicate({
          enforcementRequestId: request.id,
          enforcementDecisionId: decision.id,
          ...(idempotency.priorExecutionResultId !== undefined ? { priorExecutionResultId: idempotency.priorExecutionResultId } : {}),
        });
      } else {
        for (const sideEffectId of sideEffectIds) {
          this.sideEffectLedger.markBlocked(sideEffectId, request.trustDomainId, request.actorId);
        }
        this.ledger.recordEvent({
          type: 'execution_blocked',
          trustDomainId: request.trustDomainId,
          enforcementRequestId: request.id,
          enforcementDecisionId: decision.id,
          actorId: request.actorId,
          payload: { decisionType: decision.type, reasonCode: decision.reasonCode },
        });
        result = this.resultService.markNotExecuted({ enforcementRequestId: request.id, enforcementDecisionId: decision.id });
      }

      const updatedRequest = this.refreshRequestSideEffects(request);
      const proof = this.createProof(updatedRequest, decision, result, sideEffectIds);
      return { request: updatedRequest, decision, result: result as ExecutionResult<T>, proof };
    }

    this.store.updateRequestStatus(request.id, 'executing');
    const startedAt = this.ctx.clock.now();
    this.ledger.recordEvent({
      type: 'execution_started',
      trustDomainId: request.trustDomainId,
      enforcementRequestId: request.id,
      enforcementDecisionId: decision.id,
      actorId: request.actorId,
      payload: {},
    });

    try {
      const value = await execute();
      const completedAt = this.ctx.clock.now();

      for (const sideEffectId of sideEffectIds) {
        this.sideEffectLedger.markExecuted(sideEffectId, request.trustDomainId, request.actorId);
      }
      const result = this.resultService.markExecuted({ enforcementRequestId: request.id, enforcementDecisionId: decision.id, value, startedAt, completedAt });
      this.idempotencyService.recordSuccess(request.idempotencyKey, result.id);
      this.store.updateRequestStatus(request.id, 'executed');
      this.ledger.recordEvent({
        type: 'execution_succeeded',
        trustDomainId: request.trustDomainId,
        enforcementRequestId: request.id,
        enforcementDecisionId: decision.id,
        executionResultId: result.id,
        actorId: request.actorId,
        payload: {},
      });

      const updatedRequest = this.refreshRequestSideEffects(request);
      const proof = this.createProof(updatedRequest, decision, result, sideEffectIds);
      return { request: updatedRequest, decision, result, proof };
    } catch (error) {
      const completedAt = this.ctx.clock.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      for (const sideEffectId of sideEffectIds) {
        this.sideEffectLedger.markFailed(sideEffectId);
      }
      const result = this.resultService.markFailed({ enforcementRequestId: request.id, enforcementDecisionId: decision.id, errorMessage, startedAt, completedAt });
      this.idempotencyService.recordFailure(request.idempotencyKey);
      this.store.updateRequestStatus(request.id, 'failed');
      this.ledger.recordEvent({
        type: 'execution_failed',
        trustDomainId: request.trustDomainId,
        enforcementRequestId: request.id,
        enforcementDecisionId: decision.id,
        executionResultId: result.id,
        actorId: request.actorId,
        payload: { errorMessage },
      });

      const updatedRequest = this.refreshRequestSideEffects(request);
      const proof = this.createProof(updatedRequest, decision, result, sideEffectIds);
      return { request: updatedRequest, decision, result: result as ExecutionResult<T>, proof };
    }
  }

  /** EnforcementRequest.sideEffects is a snapshot taken at creation time; refresh it from the store after side-effect status transitions so callers observing the returned request see the latest statuses. */
  private refreshRequestSideEffects(request: EnforcementRequest): EnforcementRequest {
    const sideEffects = this.store.getSideEffectsByRequest(request.id);
    return this.store.replaceRequestSideEffects(request.id, sideEffects) ?? { ...request, sideEffects };
  }

  private createProof(request: EnforcementRequest, decision: EnforcementDecision, result: ExecutionResult, sideEffectIds: readonly string[]) {
    const proof = this.proofService.createProof({
      enforcementRequestId: request.id,
      enforcementDecisionId: decision.id,
      executionResultId: result.id,
      trustDomainId: request.trustDomainId,
      actorId: request.actorId,
      action: request.action,
      resourceScope: request.resourceScope,
      allowedToExecute: decision.allowedToExecute,
      executed: result.executed,
      sideEffectIds,
      ...(request.principalActorId !== undefined ? { principalActorId: request.principalActorId } : {}),
      ...(request.capability !== undefined ? { capability: request.capability } : {}),
      ...(decision.recognitionDecisionId !== undefined ? { recognitionDecisionId: decision.recognitionDecisionId } : {}),
      ...(decision.authorityProofId !== undefined ? { authorityProofId: decision.authorityProofId } : {}),
      ...(decision.approvalProofId !== undefined ? { approvalProofId: decision.approvalProofId } : {}),
      ...(decision.handshakeProofId !== undefined ? { handshakeProofId: decision.handshakeProofId } : {}),
      ...(decision.policyDecisionId !== undefined ? { policyDecisionId: decision.policyDecisionId } : {}),
      ...(decision.policyProofId !== undefined ? { policyProofId: decision.policyProofId } : {}),
      ...(decision.policyPackVersionIds !== undefined ? { policyPackVersionIds: decision.policyPackVersionIds } : {}),
      ...(decision.policyMatchedRuleIds !== undefined ? { policyMatchedRuleIds: decision.policyMatchedRuleIds } : {}),
      ...(request.idempotencyKey !== undefined ? { idempotencyKey: request.idempotencyKey } : {}),
    });

    this.ledger.recordEvent({
      type: 'enforcement_proof_created',
      trustDomainId: request.trustDomainId,
      enforcementRequestId: request.id,
      enforcementDecisionId: decision.id,
      enforcementProofId: proof.id,
      actorId: request.actorId,
      payload: { proofHash: proof.proofHash },
    });

    if (this.store.getResult(result.id) === undefined || this.store.getProof(proof.id) === undefined) {
      throw new PostExecutionRecordMissingError(request.id, 'ExecutionResult or EnforcementProof failed to persist.');
    }

    return proof;
  }
}
