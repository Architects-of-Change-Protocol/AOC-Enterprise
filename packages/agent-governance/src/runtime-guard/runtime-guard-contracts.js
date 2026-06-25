"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHumanApprovalRequest = createHumanApprovalRequest;
const crypto_1 = require("crypto");
function createHumanApprovalRequest(decision, request, now) {
    const createdAt = now ? now() : new Date().toISOString();
    return {
        approvalRequestId: `APPR-${(0, crypto_1.randomBytes)(8).toString('hex').toUpperCase()}`,
        decisionId: decision.decisionId,
        requestId: decision.requestId,
        passportId: decision.passportId,
        requestedAction: request.requestedAction,
        reasonCodes: decision.reasonCodes,
        createdAt,
        status: 'pending',
    };
}
