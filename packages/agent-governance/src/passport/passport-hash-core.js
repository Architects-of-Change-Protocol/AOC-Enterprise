"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPassportHashableCore = extractPassportHashableCore;
function extractPassportHashableCore(passport) {
    return {
        passportId: passport.passportId,
        agentName: passport.agentName,
        ownerId: passport.ownerId,
        ownerName: passport.ownerName,
        purpose: passport.purpose,
        governanceLevel: passport.governanceLevel,
        riskTier: passport.riskTier,
        autonomyLevel: passport.autonomyLevel,
        jurisdiction: passport.jurisdiction,
        constitutionVersion: passport.constitutionVersion,
        constitutionHash: passport.constitutionHash,
        policyManifestVersion: passport.policyManifestVersion,
        policyManifestHash: passport.policyManifestHash,
        issuedAt: passport.issuedAt,
        issuer: passport.issuer,
    };
}
