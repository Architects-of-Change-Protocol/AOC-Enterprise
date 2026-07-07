import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AdapterRegistry } from '../services/adapter-registry.js';
import { EnforcementStore } from '../services/enforcement-store.js';

function setUp() {
  const store = new EnforcementStore();
  return { store, registry: new AdapterRegistry(store) };
}

describe('AdapterRegistry', () => {
  it('1. registers a tool_call adapter', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a1', type: 'tool_call', name: 'Tool', requiresIdempotencyKey: false });
    assert.equal(adapter.type, 'tool_call');
  });

  it('2. registers an api_handler adapter', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a2', type: 'api_handler', name: 'API', requiresIdempotencyKey: false });
    assert.equal(adapter.type, 'api_handler');
  });

  it('3. registers a workflow_step adapter', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a3', type: 'workflow_step', name: 'Workflow', requiresIdempotencyKey: false });
    assert.equal(adapter.type, 'workflow_step');
  });

  it('4. registers a webhook adapter', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a4', type: 'webhook', name: 'Webhook', requiresIdempotencyKey: false });
    assert.equal(adapter.type, 'webhook');
  });

  it('5. retrieves an adapter by id', () => {
    const { registry } = setUp();
    registry.register({ id: 'a5', type: 'tool_call', name: 'Tool', requiresIdempotencyKey: false });
    assert.equal(registry.getAdapter('a5')?.id, 'a5');
  });

  it('6. lists adapters by type', () => {
    const { registry } = setUp();
    registry.register({ id: 'a6', type: 'tool_call', name: 'Tool A', requiresIdempotencyKey: false });
    registry.register({ id: 'a7', type: 'webhook', name: 'Webhook A', requiresIdempotencyKey: false });
    assert.equal(registry.listByType('tool_call').length, 1);
  });

  it('7. allows an action on the adapter allow list', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a8', type: 'tool_call', name: 'Tool', allowedActions: ['draft_closure_email'], requiresIdempotencyKey: false });
    assert.equal(registry.checkPermission(adapter, { action: 'draft_closure_email', resourceScope: 'project:1' }).allowed, true);
  });

  it('8. denies an action on the adapter deny list', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a9', type: 'tool_call', name: 'Tool', deniedActions: ['approve_payment'], requiresIdempotencyKey: false });
    assert.equal(registry.checkPermission(adapter, { action: 'approve_payment', resourceScope: 'project:1' }).allowed, false);
  });

  it('9. allows a capability on the adapter allow list', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a10', type: 'tool_call', name: 'Tool', allowedCapabilities: ['project_closure.drafting'], requiresIdempotencyKey: false });
    assert.equal(registry.checkPermission(adapter, { action: 'draft_closure_email', capability: 'project_closure.drafting', resourceScope: 'project:1' }).allowed, true);
  });

  it('10. denies a capability on the adapter deny list', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a11', type: 'tool_call', name: 'Tool', deniedCapabilities: ['payments.approval'], requiresIdempotencyKey: false });
    assert.equal(registry.checkPermission(adapter, { action: 'approve_payment', capability: 'payments.approval', resourceScope: 'project:1' }).allowed, false);
  });

  it('11. allows a scope on the adapter allow list', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a12', type: 'tool_call', name: 'Tool', allowedResourceScopes: ['project:1'], requiresIdempotencyKey: false });
    assert.equal(registry.checkPermission(adapter, { action: 'draft_closure_email', resourceScope: 'project:1' }).allowed, true);
  });

  it('12. denies a scope on the adapter deny list', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a13', type: 'tool_call', name: 'Tool', deniedResourceScopes: ['finance:global'], requiresIdempotencyKey: false });
    assert.equal(registry.checkPermission(adapter, { action: 'change_bank_account', resourceScope: 'finance:global' }).allowed, false);
  });

  it('13. enforces the idempotency requirement', () => {
    const { registry } = setUp();
    const adapter = registry.register({ id: 'a14', type: 'tool_call', name: 'Tool', requiresIdempotencyKey: true });
    assert.equal(registry.checkPermission(adapter, { action: 'draft_closure_email', resourceScope: 'project:1' }).allowed, false);
    assert.equal(registry.checkPermission(adapter, { action: 'draft_closure_email', resourceScope: 'project:1', idempotencyKey: 'k1' }).allowed, true);
  });
});
