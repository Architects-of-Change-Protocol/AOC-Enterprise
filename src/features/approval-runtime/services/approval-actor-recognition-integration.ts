import type { ApprovalApproverRecognitionResult } from '../domain/approval-policy.js';
import type { ApprovalStore } from './approval-store.js';

/**
 * Structural adapter for an actor directory. Approval Runtime does not import
 * Recognition Runtime's Actor/ActorRegistry types directly -- it only needs
 * something shaped like ActorRegistry.getActor, so the two features stay
 * loosely coupled. Mirrors the AuthorityGraphIntegration structural pattern.
 */
export interface ApprovalActorLike {
  readonly status: string;
}

export interface ApprovalActorRegistryLike {
  getActor(actorId: string): ApprovalActorLike | undefined;
}

export interface ApprovalActorRecognitionIntegration {
  getApproverRecognitionStatus(actorId: string): ApprovalApproverRecognitionResult;
}

const RECOGNIZED_ACTOR_STATUS = 'recognized';

/** Adapts a Recognition-Runtime-shaped actor registry into an ApprovalActorRecognitionIntegration. */
export function createActorRegistryRecognitionIntegration(actorRegistry: ApprovalActorRegistryLike): ApprovalActorRecognitionIntegration {
  return {
    getApproverRecognitionStatus(actorId: string): ApprovalApproverRecognitionResult {
      const actor = actorRegistry.getActor(actorId);
      if (!actor) {
        return { recognized: false, reasonCode: 'APPROVER_UNKNOWN', reason: `Actor ${actorId} is not registered.` };
      }
      if (actor.status !== RECOGNIZED_ACTOR_STATUS) {
        return {
          recognized: false,
          reasonCode: 'APPROVER_NOT_RECOGNIZED',
          reason: `Actor ${actorId} has status "${actor.status}" and cannot approve.`,
        };
      }
      return { recognized: true, reasonCode: 'APPROVER_RECOGNIZED', reason: `Actor ${actorId} is recognized and may approve.` };
    },
  };
}

/**
 * Default, store-backed recognition check used when no Recognition Runtime
 * integration is supplied. Fixtures register approver statuses explicitly;
 * an unregistered actor is treated as unknown and fails closed.
 */
export function createStoreApprovalActorRecognitionIntegration(store: ApprovalStore): ApprovalActorRecognitionIntegration {
  return {
    getApproverRecognitionStatus(actorId: string): ApprovalApproverRecognitionResult {
      const status = store.getApproverRecognitionStatus(actorId);
      if (status === undefined) {
        return { recognized: false, reasonCode: 'APPROVER_UNKNOWN', reason: `Actor ${actorId} is not registered.` };
      }
      if (status !== RECOGNIZED_ACTOR_STATUS) {
        return {
          recognized: false,
          reasonCode: 'APPROVER_NOT_RECOGNIZED',
          reason: `Actor ${actorId} has status "${status}" and cannot approve.`,
        };
      }
      return { recognized: true, reasonCode: 'APPROVER_RECOGNIZED', reason: `Actor ${actorId} is recognized and may approve.` };
    },
  };
}
