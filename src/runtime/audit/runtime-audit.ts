import type { RuntimeAuditEmitter } from './emitters/runtime-audit-emitter';
import { emitRuntimeAuditEvent } from './emitters/runtime-audit-emitter';
import type { AuditEventEnvelope } from '@aoc/protocol/contracts';

export type { RuntimeAuditEmitter };

export async function emitRuntimeEvent(emitter: RuntimeAuditEmitter, event: AuditEventEnvelope): Promise<void> {
  await emitRuntimeAuditEvent(emitter, event);
}
