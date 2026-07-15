import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EnterpriseScopedAccessRequest } from '../src/enterprise-scoped-access-request.js';
import { legacyResourceIdentifier } from '../src/enterprise-scoped-access-request.js';

describe('EnterpriseScopedAccessRequest', () => {
  it('consumes requestedScope from the real Protocol contract', () => {
    const access: EnterpriseScopedAccessRequest = {
      principalId: 'actor-1',
      resource: { kind: 'record', id: 'contract' },
      requestedScope: ['record:read'],
      requestedAt: '2026-01-01T00:00:00.000Z',
    };
    assert.deepEqual(access.requestedScope, ['record:read']);
  });

  it('keeps action independent of requestedScope -- neither reinterprets the other', () => {
    const access: EnterpriseScopedAccessRequest = {
      principalId: 'actor-1',
      resource: { kind: 'record', id: 'contract' },
      requestedScope: ['record:read'],
      requestedAt: '2026-01-01T00:00:00.000Z',
      action: 'read',
    };
    assert.equal(access.action, 'read');
    assert.deepEqual(access.requestedScope, ['record:read']);
    assert.notEqual(access.action, access.requestedScope[0]);
  });

  it('remains a valid ScopedAccessRequest without action -- Protocol-only requests stay valid', () => {
    const access: EnterpriseScopedAccessRequest = {
      principalId: 'actor-1',
      resource: { kind: 'record', id: 'contract' },
      requestedScope: ['record:read'],
      requestedAt: '2026-01-01T00:00:00.000Z',
    };
    assert.equal(access.action, undefined);
  });
});

describe('legacyResourceIdentifier', () => {
  it('reconstructs the legacy kind:id string form from a ResourceRef', () => {
    assert.equal(legacyResourceIdentifier({ kind: 'record', id: 'contract' }), 'record:contract');
    assert.equal(legacyResourceIdentifier({ kind: 'dataset', id: 'example' }), 'dataset:example');
  });

  it('prepends tenantId when present', () => {
    assert.equal(
      legacyResourceIdentifier({ kind: 'record', id: 'contract', tenantId: 'tenant-a' }),
      'tenant-a:record:contract'
    );
  });

  it('does not coerce ResourceRef to string via a cast -- it explicitly reads kind/id/tenantId', () => {
    const resource = { kind: 'dataset', id: 'example', attributes: { region: 'eu' } };
    assert.equal(legacyResourceIdentifier(resource), 'dataset:example');
  });
});
