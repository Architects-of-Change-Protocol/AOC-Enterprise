import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApprovalActionBar } from '../components/approvals/ApprovalActionBar.js';
import { AuthorityGrantsTable } from '../components/authority/AuthorityGrantsTable.js';
import { AgentVisasTable } from '../components/external-agents/AgentVisasTable.js';
import { createManualClock } from '../../recognition-runtime/runtime/runtime-context.js';
import { buildDatasysEnforcementFixture, VICTOR_ACTOR_ID } from '../../action-enforcement/fixtures/datasys-enforcement.fixture.js';
import { ControlPlaneCommandService } from '../services/control-plane-command-service.js';

describe('Command wiring', () => {
  it('command buttons render disabled with an explanatory tooltip when no handler is wired', () => {
    const html = renderToStaticMarkup(<ApprovalActionBar />);
    assert.ok(html.includes('disabled=""'));
    assert.ok(html.includes('title="Command wiring not enabled in this read-only demo."'));
  });

  it('command buttons render enabled when a handler is wired', () => {
    const html = renderToStaticMarkup(
      <AuthorityGrantsTable
        grants={[
          {
            id: 'grant-1',
            issuerActorId: 'actor-datasys',
            subjectActorId: 'actor-victor-valverde',
            trustDomainId: 't1',
            capability: 'project_closure.management',
            actions: ['draft_closure_email'],
            resourceScopes: ['project:HMP-14665'],
            status: 'active',
            canDelegate: true,
            issuedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        onRevoke={() => {}}
      />,
    );
    assert.ok(!html.includes('disabled=""'));
  });

  it('a wired command calls the real runtime service and produces a deterministic result', () => {
    const fixture = buildDatasysEnforcementFixture();
    const service = new ControlPlaneCommandService(
      { approvalRuntime: fixture.approvalRuntime, authorityRuntime: fixture.authorityRuntime, handshakeRuntime: fixture.handshakeRuntime, aocGuard: fixture.aocGuard },
      createManualClock('2026-06-01T00:00:00.000Z'),
    );
    const result = service.revokeAuthorityGrant({ targetId: 'authority-grant-victor-project-closure', revokedByActorId: VICTOR_ACTOR_ID, reason: 'Test revoke.' });
    assert.equal(result.success, true);
    assert.equal(fixture.authorityRuntime.store.getGrant('authority-grant-victor-project-closure')?.status, 'revoked');

    // Rendering the same grant after revocation should show a disabled revoke button (already revoked).
    const grant = fixture.authorityRuntime.store.getGrant('authority-grant-victor-project-closure')!;
    const html = renderToStaticMarkup(
      <AuthorityGrantsTable
        grants={[
          {
            id: grant.id,
            issuerActorId: grant.issuerActorId,
            subjectActorId: grant.subjectActorId,
            trustDomainId: grant.trustDomainId,
            capability: grant.capability,
            actions: grant.actions,
            resourceScopes: grant.resourceScopes,
            status: grant.status,
            canDelegate: grant.canDelegate,
            issuedAt: grant.issuedAt,
          },
        ]}
        onRevoke={() => {}}
      />,
    );
    assert.ok(html.includes('disabled=""'), 'an already-revoked grant should not offer another revoke action');
  });

  it('a disabled command explains why it is unavailable', () => {
    const fixture = buildDatasysEnforcementFixture();
    const service = new ControlPlaneCommandService(
      { approvalRuntime: fixture.approvalRuntime, authorityRuntime: fixture.authorityRuntime, handshakeRuntime: fixture.handshakeRuntime, aocGuard: fixture.aocGuard },
      createManualClock('2026-06-01T00:00:00.000Z'),
    );
    const result = service.retryFailedEnforcement('enforcement-request-x');
    assert.equal(result.success, false);
    assert.ok(result.reason.length > 0);
  });

  it('agent visa table also disables revoke without a wired handler', () => {
    const html = renderToStaticMarkup(
      <AgentVisasTable
        visas={[
          {
            id: 'visa-1',
            externalAgentId: 'agent-1',
            localTrustDomainId: 't1',
            status: 'active',
            allowedCapabilities: [],
            allowedActions: [],
            allowedResourceScopes: [],
            issuedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
      />,
    );
    assert.ok(html.includes('disabled=""'));
    assert.ok(html.includes('Command wiring not enabled in this read-only demo.'));
  });
});
