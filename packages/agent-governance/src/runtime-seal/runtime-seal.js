"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentRuntimeSeal = createAgentRuntimeSeal;
exports.verifyAgentRuntimeSeal = verifyAgentRuntimeSeal;
const canonical_json_js_1 = require("../crypto/canonical-json.js");
const passport_hash_core_js_1 = require("../passport/passport-hash-core.js");
const DEFAULT_VERIFICATION_BASE_URL = 'https://aocprotocol.org/verify';
function buildSealCore(passport, issuer, statusCheckUrl) {
    return {
        passportId: passport.passportId,
        passportHash: passport.passportHash,
        constitutionHash: passport.constitutionHash,
        policyManifestHash: passport.policyManifestHash,
        issuer,
        statusCheckUrl,
        issuedAt: passport.issuedAt,
    };
}
async function createAgentRuntimeSeal(passport, deps) {
    const baseUrl = (deps.baseVerificationUrl ?? DEFAULT_VERIFICATION_BASE_URL).replace(/\/$/, '');
    const issuer = deps.issuer ?? passport.issuer;
    const statusCheckUrl = `${baseUrl}/${passport.passportId}/status`;
    const sealCore = buildSealCore(passport, issuer, statusCheckUrl);
    const sealPayload = (0, canonical_json_js_1.createHashUrn)((0, canonical_json_js_1.canonicalizeJson)(sealCore));
    const signature = await deps.signer.sign(sealPayload);
    return { ...sealCore, signature };
}
async function verifyAgentRuntimeSeal(seal, passport, deps, options) {
    const reasonCodes = [];
    let valid = true;
    const allowedStatuses = options?.allowIssued === true ? ['active', 'issued'] : ['active'];
    if (!allowedStatuses.includes(passport.status)) {
        if (passport.status === 'revoked') {
            reasonCodes.push('passport.revoked');
        }
        else if (passport.status === 'expired') {
            reasonCodes.push('passport.expired');
        }
        else {
            reasonCodes.push('passport.status_not_active');
        }
        valid = false;
    }
    if (seal.passportId !== passport.passportId) {
        reasonCodes.push('runtime_seal.passport_mismatch');
        valid = false;
    }
    const expectedPassportHash = (0, canonical_json_js_1.createHashUrn)((0, canonical_json_js_1.canonicalizeJson)((0, passport_hash_core_js_1.extractPassportHashableCore)(passport)));
    const hashMismatch = seal.passportHash !== expectedPassportHash ||
        expectedPassportHash !== passport.passportHash ||
        seal.constitutionHash !== passport.constitutionHash ||
        seal.policyManifestHash !== passport.policyManifestHash;
    if (hashMismatch) {
        reasonCodes.push('runtime_seal.hash_mismatch');
        valid = false;
    }
    const sealCore = buildSealCore(passport, seal.issuer, seal.statusCheckUrl);
    const sealPayload = (0, canonical_json_js_1.createHashUrn)((0, canonical_json_js_1.canonicalizeJson)(sealCore));
    const signatureValid = await deps.signer.verify(sealPayload, seal.signature);
    if (!signatureValid) {
        reasonCodes.push('runtime_seal.invalid_signature');
        valid = false;
    }
    if (valid) {
        reasonCodes.push('runtime_seal.valid');
    }
    return { valid, reasonCodes };
}
