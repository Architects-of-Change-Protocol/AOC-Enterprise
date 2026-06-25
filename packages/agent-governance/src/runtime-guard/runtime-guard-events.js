"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRuntimeGuardEvent = createRuntimeGuardEvent;
const crypto_1 = require("crypto");
function createRuntimeGuardEvent(input) {
    const occurredAt = input.now ? input.now() : new Date().toISOString();
    return {
        eventId: `RGEVT-${(0, crypto_1.randomBytes)(8).toString('hex').toUpperCase()}`,
        passportId: input.passportId,
        requestId: input.requestId,
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        type: input.type,
        occurredAt,
        actorId: input.actorId,
        reasonCodes: input.reasonCodes,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
}
