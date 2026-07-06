import type { ActionRequest } from '../domain/action-request.js';
import type { AocRecognitionRuntime } from '../runtime/aoc-recognition-runtime.js';
import { buildDatasysAgentRepublicWorld, type DatasysAgentRepublicWorld } from './datasys-agent-republic.fixture.js';

export interface RogueAgentScenario {
  readonly world: DatasysAgentRepublicWorld;
  readInternalDocumentsRequest(): ActionRequest;
}

export function buildRogueAgentScenario(runtime: AocRecognitionRuntime): RogueAgentScenario {
  const world = buildDatasysAgentRepublicWorld(runtime);

  return {
    world,
    readInternalDocumentsRequest: () =>
      runtime.buildActionRequest({
        actorId: world.unknownAgent.id,
        trustDomainId: world.trustDomain.id,
        action: 'read_internal_documents',
        resource: 'documents:internal',
      }),
  };
}
