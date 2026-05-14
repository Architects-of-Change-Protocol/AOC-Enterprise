import {
  approveRuntimeNegotiation,
  createNegotiationAttestation,
  createNegotiationEnvelope,
  createRuntimeNegotiation,
  degradeNegotiationTrust,
  evaluateNegotiationBoundaries,
  evaluateNegotiationTrust,
  expireRuntimeNegotiation,
  recoverNegotiationTrust,
  resolveNegotiationIntegrationSeams,
  validateIsolationExceptions,
  validateNegotiationAttestation,
  validateNegotiationEnvelope,
} from '../index';

describe('runtime negotiation layer', () => {
  const baseNegotiation = createRuntimeNegotiation({
    negotiationId: 'neg-1',
    sourceRuntimeId: 'rt-a',
    targetRuntimeId: 'rt-b',
    negotiationType: 'ai_execution_request',
    requestedAuthorities: ['cap.execute.ai'],
    requestedFederationModes: ['delegated'],
    requestedExecutionScopes: ['ai:model:gpt', 'runtime:write'],
    trustRequirements: ['attestation_continuity'],
    isolationExceptions: ['shared_sandbox'],
  });

  it('supports lifecycle with envelope-gated approval', () => {
    const envelope = createNegotiationEnvelope({
      envelopeId: 'env-1',
      negotiationId: baseNegotiation.negotiationId,
      sourceTrustPostureRef: 'trust:src',
      targetTrustPostureRef: 'trust:tgt',
      requiredAttestationRefs: ['att:1'],
      capabilityBoundaryRefs: ['cap-boundary:1'],
      executionRestrictions: ['no-root-shell'],
      temporalConstraints: { notBefore: '2026-01-01T00:00:00.000Z', notAfter: '2026-12-31T00:00:00.000Z' },
      replayProtectionRefs: ['replay:nonce:1'],
    });

    const approved = approveRuntimeNegotiation(baseNegotiation, envelope);
    expect(approved.status).toBe('approved');
  });

  it('revoked negotiation cannot reactivate', () => {
    const revoked = { ...baseNegotiation, status: 'revoked' as const };
    expect(() => approveRuntimeNegotiation(revoked, {
      envelopeId: 'env-x', negotiationId: 'neg-1', sourceTrustPostureRef: 's', targetTrustPostureRef: 't', requiredAttestationRefs: ['a'], capabilityBoundaryRefs: ['b'], executionRestrictions: ['x'], temporalConstraints: { notBefore: '2026-01-01T00:00:00.000Z', notAfter: '2026-12-31T00:00:00.000Z' }, replayProtectionRefs: ['r']
    })).toThrow(/cannot reactivate/);
  });

  it('validates isolation exceptions and capability boundaries', () => {
    const decision = evaluateNegotiationBoundaries(baseNegotiation, {
      sourceIsolationProfile: 'strict',
      targetIsolationProfile: 'standard',
      sourceCapabilities: ['cap.execute.ai'],
      targetCapabilities: [],
      blockedRuntimeTypes: [],
      sourceRuntimeType: 'sovereign',
      targetRuntimeType: 'partner',
      federationRestrictions: [],
      executionRestrictions: ['runtime:write'],
      aiGovernanceRestrictions: ['ai:model:gpt'],
    });
    expect(decision.compatible).toBe(false);
    expect(decision.blockedCapabilities).toContain('cap.execute.ai');
    expect(decision.blockedExecutionScopes).toContain('runtime:write');
    expect(validateIsolationExceptions(baseNegotiation, {
      sourceIsolationProfile: 'strict', targetIsolationProfile: 'standard', sourceCapabilities: [], targetCapabilities: [], blockedRuntimeTypes: [], sourceRuntimeType: 'a', targetRuntimeType: 'b', federationRestrictions: [], executionRestrictions: [], aiGovernanceRestrictions: []
    }).length).toBeGreaterThan(0);
  });

  it('handles trust degradation and recovery', () => {
    const degraded = degradeNegotiationTrust({
      sourceTrustPosture: 80,
      targetTrustPosture: 75,
      federationHistoryScore: 10,
      degradationSignals: [],
      attestationContinuity: true,
      unresolvedFailures: 0,
      escalationHistoryCount: 1,
    }, 'remote_integrity_gap');

    const trustDecision = evaluateNegotiationTrust(degraded);
    expect(trustDecision.trustCompatible).toBe(true);

    const recovered = recoverNegotiationTrust({ ...degraded, unresolvedFailures: 0 });
    expect(recovered.degradationSignals).toHaveLength(0);
  });

  it('enforces envelope and attestation validation', () => {
    expect(validateNegotiationEnvelope({
      envelopeId: 'e2', negotiationId: 'n1', sourceTrustPostureRef: 's', targetTrustPostureRef: 't', requiredAttestationRefs: [], capabilityBoundaryRefs: [], executionRestrictions: [], temporalConstraints: { notBefore: 'bad', notAfter: 'bad' }, replayProtectionRefs: []
    }).valid).toBe(false);

    expect(validateNegotiationAttestation({
      attestationId: 'na-1', negotiationId: 'n1', envelopeId: 'e1', evidenceRefs: ['ev:1'], trustBoundaryContinuityRef: 'tb:1', replayChainRef: 'rc:1', temporaryAgreementRef: 'ta:1', issuedAt: '2026-01-01T00:00:00.000Z'
    }).valid).toBe(true);

    expect(() => createNegotiationAttestation({
      attestationId: 'na-bad', negotiationId: 'n1', envelopeId: 'e1', evidenceRefs: [], trustBoundaryContinuityRef: '', replayChainRef: '', temporaryAgreementRef: '', issuedAt: '2026-01-01T00:00:00.000Z'
    })).toThrow();
  });

  it('exposes execution-fabric/federation integration seams', () => {
    const seam = resolveNegotiationIntegrationSeams({ ...baseNegotiation, status: 'approved' }, {
      trustCompatible: true,
      boundaryCompatible: true,
      humanReviewRequired: true,
    });
    expect(seam.executionContinuationEligible).toBe(true);
    expect(seam.distributedEscalationRequired).toBe(true);
  });

  it('expired negotiations require new negotiation', () => {
    const expired = expireRuntimeNegotiation(baseNegotiation);
    expect(expired.status).toBe('expired');
    expect(() => approveRuntimeNegotiation(expired, {
      envelopeId: 'env-x', negotiationId: 'neg-1', sourceTrustPostureRef: 's', targetTrustPostureRef: 't', requiredAttestationRefs: ['a'], capabilityBoundaryRefs: ['b'], executionRestrictions: ['x'], temporalConstraints: { notBefore: '2026-01-01T00:00:00.000Z', notAfter: '2026-12-31T00:00:00.000Z' }, replayProtectionRefs: ['r']
    })).toThrow(/require a new negotiation/);
  });
});
