export class JurisdictionPackRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class JurisdictionPackInvalidManifestError extends JurisdictionPackRuntimeError {
  constructor(manifestId: string, issues: readonly string[]) {
    super(`Jurisdiction pack manifest "${manifestId}" is invalid: ${issues.join('; ')}`);
  }
}

export class JurisdictionPackWrongKindError extends JurisdictionPackRuntimeError {
  constructor(manifestId: string, kind: string) {
    super(`Manifest "${manifestId}" cannot be registered as a jurisdiction pack: expected kind "jurisdiction_pack", got "${kind}".`);
  }
}

export class JurisdictionPackDuplicateManifestIdError extends JurisdictionPackRuntimeError {
  constructor(manifestId: string) {
    super(`A jurisdiction pack manifest with id "${manifestId}" is already registered.`);
  }
}
