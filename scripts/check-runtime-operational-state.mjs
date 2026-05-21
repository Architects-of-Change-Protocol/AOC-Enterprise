import { createRuntimeOperationalStateManager, validateRuntimeOperationalState } from '../dist/src/index.js';

const manager = createRuntimeOperationalStateManager({ runtimeId: 'runtime-check', trustDomain: 'check-domain', now: '2026-01-01T00:00:00.000Z' });
manager.updateRuntimeOperationalState({ eventType: 'authorization_enforced', occurredAt: '2026-01-01T00:00:01.000Z' });
manager.updateRuntimeOperationalState({ eventType: 'grant_issued', entityId: 'grant-1', occurredAt: '2026-01-01T00:00:02.000Z' });
const snapshot = manager.snapshotRuntimeOperationalState();
const report = validateRuntimeOperationalState(snapshot);
if (!report.valid) {
  console.error('invalid runtime state', report.errors);
  process.exit(1);
}
const restored = manager.hydrateRuntimeOperationalState(snapshot);
if (restored.continuity.runtimeSessionId !== snapshot.continuity.runtimeSessionId) {
  console.error('continuity id mismatch');
  process.exit(1);
}
