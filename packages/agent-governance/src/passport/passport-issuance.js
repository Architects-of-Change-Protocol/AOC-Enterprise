"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentPassportVerificationUrl = createAgentPassportVerificationUrl;
exports.createAgentPassportQrPayload = createAgentPassportQrPayload;
exports.createAgentPassportPublicVerificationPayload = createAgentPassportPublicVerificationPayload;
exports.issueAgentPassport = issueAgentPassport;
const passport_id_js_1 = require("./passport-id.js");
const constitution_js_1 = require("../constitution/constitution.js");
const policy_manifest_js_1 = require("../policy-manifest/policy-manifest.js");
const canonical_json_js_1 = require("../crypto/canonical-json.js");
const runtime_seal_js_1 = require("../runtime-seal/runtime-seal.js");
const passport_events_js_1 = require("../events/passport-events.js");
const passport_hash_core_js_1 = require("./passport-hash-core.js");
const DEFAULT_VERIFICATION_BASE_URL = 'https://aocprotocol.org/verify';
const DEFAULT_ISSUER = 'AOC-Governance-Authority';
function createAgentPassportVerificationUrl(passportId, baseUrl) {
    const base = (baseUrl ?? DEFAULT_VERIFICATION_BASE_URL).replace(/\/$/, '');
    return `${base}/${passportId}`;
}
function createAgentPassportQrPayload(passportId, baseUrl) {
    return createAgentPassportVerificationUrl(passportId, baseUrl);
}
function createAgentPassportPublicVerificationPayload(passport) {
    return {
        passportId: passport.passportId,
        agentName: passport.agentName,
        ownerName: passport.ownerName,
        purpose: passport.purpose,
        status: passport.status,
        governanceLevel: passport.governanceLevel,
        riskTier: passport.riskTier,
        autonomyLevel: passport.autonomyLevel,
        jurisdiction: passport.jurisdiction,
        constitutionHash: passport.constitutionHash,
        policyManifestHash: passport.policyManifestHash,
        passportHash: passport.passportHash,
        issuer: passport.issuer,
        issuedAt: passport.issuedAt,
        ...(passport.lastVerifiedAt !== undefined
            ? { lastVerifiedAt: passport.lastVerifiedAt }
            : {}),
        verificationUrl: passport.verificationUrl,
    };
}
async function issueAgentPassport(input, deps) {
    const baseUrl = deps.baseVerificationUrl ?? DEFAULT_VERIFICATION_BASE_URL;
    const issuer = deps.issuer ?? DEFAULT_ISSUER;
    const jurisdiction = input.region ?? input.jurisdiction ?? 'GLOBAL';
    const passportId = (0, passport_id_js_1.generateAgentPassportId)({
        issuedAt: input.issuedAt,
        region: jurisdiction,
    });
    const constitution = (0, constitution_js_1.createAgentConstitution)(input, passportId);
    const policyManifest = (0, policy_manifest_js_1.createAgentPolicyManifest)(input, passportId);
    const constitutionHash = (0, canonical_json_js_1.createHashUrn)((0, canonical_json_js_1.canonicalizeJson)(constitution));
    const policyManifestHash = (0, canonical_json_js_1.createHashUrn)((0, canonical_json_js_1.canonicalizeJson)(policyManifest));
    const hashableCore = (0, passport_hash_core_js_1.extractPassportHashableCore)({
        passportId,
        agentName: input.agentName,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
        purpose: input.purpose,
        governanceLevel: 'constitutional',
        riskTier: input.riskTier,
        autonomyLevel: input.autonomyLevel,
        jurisdiction,
        constitutionVersion: constitution.version,
        constitutionHash,
        policyManifestVersion: policyManifest.version,
        policyManifestHash,
        issuedAt: input.issuedAt,
        issuer,
    });
    const passportHash = (0, canonical_json_js_1.createHashUrn)((0, canonical_json_js_1.canonicalizeJson)(hashableCore));
    const signature = await deps.signer.sign(passportHash);
    const verificationUrl = createAgentPassportVerificationUrl(passportId, baseUrl);
    const qrPayload = createAgentPassportQrPayload(passportId, baseUrl);
    const passport = {
        ...hashableCore,
        status: 'issued',
        passportHash,
        signature,
        verificationUrl,
        qrPayload,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    const runtimeSeal = await (0, runtime_seal_js_1.createAgentRuntimeSeal)(passport, deps);
    const events = [
        (0, passport_events_js_1.createPassportEvent)({
            passportId,
            type: 'agent_passport.drafted',
            actorId: input.createdBy,
            reasonCodes: ['passport.draft_created'],
        }),
        (0, passport_events_js_1.createPassportEvent)({
            passportId,
            type: 'agent_passport.issued',
            actorId: input.createdBy,
            reasonCodes: ['passport.issued'],
        }),
        (0, passport_events_js_1.createPassportEvent)({
            passportId,
            type: 'agent_passport.runtime_seal_created',
            actorId: issuer,
            reasonCodes: ['runtime_seal.valid'],
        }),
    ];
    return { passport, constitution, policyManifest, runtimeSeal, events };
}
