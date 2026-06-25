"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAgentPassport = verifyAgentPassport;
const canonical_json_js_1 = require("../crypto/canonical-json.js");
const passport_hash_core_js_1 = require("./passport-hash-core.js");
async function verifyAgentPassport(passport, deps) {
    const reasonCodes = [];
    let valid = true;
    if (passport.status === 'revoked') {
        reasonCodes.push('passport.revoked');
        valid = false;
    }
    else if (passport.status === 'expired') {
        reasonCodes.push('passport.expired');
        valid = false;
    }
    else if (passport.status === 'suspended' || passport.status === 'draft') {
        reasonCodes.push('passport.status_not_active');
        valid = false;
    }
    if (passport.expiresAt !== undefined && new Date(passport.expiresAt) < new Date()) {
        reasonCodes.push('passport.expired');
        valid = false;
    }
    if (!passport.constitutionHash) {
        reasonCodes.push('passport.missing_constitution_hash');
        valid = false;
    }
    if (!passport.policyManifestHash) {
        reasonCodes.push('passport.missing_policy_manifest_hash');
        valid = false;
    }
    const expectedHash = (0, canonical_json_js_1.createHashUrn)((0, canonical_json_js_1.canonicalizeJson)((0, passport_hash_core_js_1.extractPassportHashableCore)(passport)));
    if (expectedHash !== passport.passportHash) {
        reasonCodes.push('passport.invalid_hash');
        valid = false;
    }
    const signatureValid = await deps.signer.verify(passport.passportHash, passport.signature);
    if (!signatureValid) {
        reasonCodes.push('passport.invalid_signature');
        valid = false;
    }
    if (valid) {
        reasonCodes.push('passport.valid');
    }
    return { valid, reasonCodes, verifiedAt: new Date().toISOString() };
}
