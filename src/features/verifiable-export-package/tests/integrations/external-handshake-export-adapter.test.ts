import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapExternalAgentStandingToItem, mapAgentVisaToItem, mapHandshakeProofToItem } from '../../integrations/external-handshake-export-adapter.js';
import { createExportRuntimeContext } from '../../domain/export-runtime-context.js';
import type { ExternalAgentStanding } from '../../../external-agent-handshake/domain/external-agent-standing.js';
import type { AgentVisa } from '../../../external-agent-handshake/domain/agent-visa.js';
import type { HandshakeProof } from '../../../external-agent-handshake/domain/handshake-proof.js';

const NOW = '2026-01-01T00:00:00.000Z';

function makeStanding(overrides: Partial<ExternalAgentStanding> = {}): ExternalAgentStanding {
  return {
    id: 'external-standing-1',
    externalAgentId: 'external-agent-1',
    localTrustDomainId: 'trust-domain-1',
    type: 'limited_standing',
    reasonCode: 'LIMITED_VISA',
    reason: 'External agent holds a limited visa.',
    evaluatedAt: NOW,
    ...overrides,
  };
}

function makeVisa(overrides: Partial<AgentVisa> = {}): AgentVisa {
  return {
    id: 'agent-visa-1',
    handshakeRequestId: 'handshake-request-1',
    handshakeDecisionId: 'handshake-decision-1',
    localTrustDomainId: 'trust-domain-1',
    externalAgentId: 'external-agent-1',
    status: 'active',
    allowedCapabilities: ['read_only'],
    allowedActions: ['read'],
    allowedResourceScopes: ['reports:quarterly'],
    issuedAt: NOW,
    expiresAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProof(overrides: Partial<HandshakeProof> = {}): HandshakeProof {
  return {
    id: 'handshake-proof-1',
    handshakeRequestId: 'handshake-request-1',
    handshakeDecisionId: 'handshake-decision-1',
    localTrustDomainId: 'trust-domain-1',
    externalAgentId: 'external-agent-1',
    passportPresentationId: 'passport-presentation-1',
    decisionType: 'accepted',
    accepted: true,
    evidenceHashes: ['evidence-hash-1'],
    proofHash: 'proof-hash-1',
    createdAt: NOW,
    ...overrides,
  };
}

describe('external-handshake-export-adapter', () => {
  it('1. mapExternalAgentStandingToItem maps an ExternalAgentStanding to an ExportPackageItem', () => {
    const ctx = createExportRuntimeContext(NOW);
    const standing = makeStanding();
    const item = mapExternalAgentStandingToItem(ctx, standing);

    assert.equal(item.type, 'external_handshake');
    assert.equal(item.sourceModule, 'external_agent_handshake');
    assert.equal(item.sourceId, standing.id);
    assert.equal(item.payload.type, standing.type);
    assert.equal(item.payload.reasonCode, standing.reasonCode);
  });

  it('2. mapAgentVisaToItem preserves localTrustDomainId, allowedResourceScopes, and expiresAt verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const visa = makeVisa({ localTrustDomainId: 'trust-domain-9', allowedResourceScopes: ['reports:quarterly', 'reports:annual'], expiresAt: '2026-03-15T00:00:00.000Z' });
    const item = mapAgentVisaToItem(ctx, visa);

    assert.equal(item.type, 'external_agent_visa');
    assert.equal(item.sourceModule, 'external_agent_handshake');
    assert.equal(item.sourceId, visa.id);
    assert.equal(item.payload.localTrustDomainId, 'trust-domain-9');
    assert.deepEqual(item.payload.allowedResourceScopes, ['reports:quarterly', 'reports:annual']);
    assert.equal(item.payload.expiresAt, '2026-03-15T00:00:00.000Z');
  });

  it('3. mapHandshakeProofToItem preserves accepted=true and proofHash verbatim', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({ accepted: true, proofHash: 'proof-hash-accepted' });
    const item = mapHandshakeProofToItem(ctx, proof);

    assert.equal(item.type, 'external_standing_proof');
    assert.equal(item.sourceModule, 'external_agent_handshake');
    assert.equal(item.sourceId, proof.id);
    assert.equal(item.payload.accepted, true);
    assert.equal(item.payload.proofHash, 'proof-hash-accepted');
  });

  it('4. mapHandshakeProofToItem preserves accepted=false verbatim, never flipping a rejection to accepted', () => {
    const ctx = createExportRuntimeContext(NOW);
    const proof = makeProof({ decisionType: 'rejected', accepted: false, proofHash: 'proof-hash-rejected' });
    const item = mapHandshakeProofToItem(ctx, proof);

    assert.equal(item.payload.accepted, false);
    assert.equal(item.payload.decisionType, 'rejected');
    assert.equal(item.payload.proofHash, 'proof-hash-rejected');
  });
});
