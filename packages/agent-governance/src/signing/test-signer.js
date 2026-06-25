"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestSigner = createTestSigner;
const crypto_1 = require("crypto");
const TEST_ALGORITHM = 'hmac-sha256';
function createTestSigner(options) {
    const keyId = options?.keyId ?? 'test-key-1';
    const issuer = options?.issuer ?? 'AOC-Test-Issuer';
    const secret = options?.secret ?? 'aoc-test-signing-secret-do-not-use-in-production';
    function computeHmac(payload) {
        return (0, crypto_1.createHmac)('sha256', secret).update(payload, 'utf8').digest('hex');
    }
    return {
        async sign(payload) {
            return {
                algorithm: TEST_ALGORITHM,
                keyId,
                signature: computeHmac(payload),
                signedAt: new Date().toISOString(),
                issuer,
            };
        },
        async verify(payload, signature) {
            if (signature.algorithm !== TEST_ALGORITHM || signature.keyId !== keyId) {
                return false;
            }
            return computeHmac(payload) === signature.signature;
        },
    };
}
