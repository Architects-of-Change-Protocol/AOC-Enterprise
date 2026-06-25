"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPassportEvent = createPassportEvent;
const crypto_1 = require("crypto");
function createPassportEvent(input) {
    return {
        eventId: `EVT-${(0, crypto_1.randomBytes)(8).toString('hex').toUpperCase()}`,
        passportId: input.passportId,
        type: input.type,
        occurredAt: new Date().toISOString(),
        actorId: input.actorId,
        reasonCodes: input.reasonCodes,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
}
