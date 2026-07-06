export class RecognitionRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ActorNotFoundError extends RecognitionRuntimeError {
  constructor(actorId: string) {
    super(`Actor not found: ${actorId}`);
  }
}

export class TrustDomainNotFoundError extends RecognitionRuntimeError {
  constructor(trustDomainId: string) {
    super(`Trust domain not found: ${trustDomainId}`);
  }
}

export class PassportNotFoundError extends RecognitionRuntimeError {
  constructor(passportId: string) {
    super(`Passport not found: ${passportId}`);
  }
}

export class CapabilityTokenNotFoundError extends RecognitionRuntimeError {
  constructor(capabilityTokenId: string) {
    super(`Capability token not found: ${capabilityTokenId}`);
  }
}

export class DelegationNotPermittedError extends RecognitionRuntimeError {
  constructor(reason: string) {
    super(`Delegation not permitted: ${reason}`);
  }
}

export class InvalidActionRequestError extends RecognitionRuntimeError {
  constructor(reason: string) {
    super(`Invalid action request: ${reason}`);
  }
}
