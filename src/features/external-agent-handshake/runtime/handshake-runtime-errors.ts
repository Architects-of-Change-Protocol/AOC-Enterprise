export class HandshakeRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ExternalIssuerNotFoundError extends HandshakeRuntimeError {
  constructor(externalIssuerId: string) {
    super(`External trust issuer not found: ${externalIssuerId}`);
  }
}

export class TrustBoundaryNotFoundError extends HandshakeRuntimeError {
  constructor(trustBoundaryId: string) {
    super(`Trust boundary not found: ${trustBoundaryId}`);
  }
}

export class HandshakeRequestNotFoundError extends HandshakeRuntimeError {
  constructor(handshakeRequestId: string) {
    super(`Handshake request not found: ${handshakeRequestId}`);
  }
}

export class HandshakeChallengeNotFoundError extends HandshakeRuntimeError {
  constructor(handshakeChallengeId: string) {
    super(`Handshake challenge not found: ${handshakeChallengeId}`);
  }
}

export class HandshakeSessionNotFoundError extends HandshakeRuntimeError {
  constructor(handshakeSessionId: string) {
    super(`Handshake session not found: ${handshakeSessionId}`);
  }
}

export class AgentVisaNotFoundError extends HandshakeRuntimeError {
  constructor(visaId: string) {
    super(`Agent visa not found: ${visaId}`);
  }
}

export class IngressGrantNotFoundError extends HandshakeRuntimeError {
  constructor(ingressGrantId: string) {
    super(`Ingress grant not found: ${ingressGrantId}`);
  }
}

export class HandshakeProofNotFoundError extends HandshakeRuntimeError {
  constructor(handshakeProofId: string) {
    super(`Handshake proof not found: ${handshakeProofId}`);
  }
}
