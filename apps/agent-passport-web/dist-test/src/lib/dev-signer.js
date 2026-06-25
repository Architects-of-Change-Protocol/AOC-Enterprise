"use strict";
/**
 * Development/MVP signer.
 *
 * WARNING: Uses a test HMAC signer. NOT for production.
 * In production, replace with a KMS-backed signer that holds a real signing key.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDevSigner = createDevSigner;
const agent_governance_1 = require("@aoc-enterprise/agent-governance");
function createDevSigner() {
    return (0, agent_governance_1.createTestSigner)({
        keyId: 'dev-key-1',
        issuer: 'AOC-Dev-Issuer',
        secret: process.env.AOC_DEV_SIGNING_SECRET ?? 'aoc-dev-signing-secret-not-for-production',
    });
}
