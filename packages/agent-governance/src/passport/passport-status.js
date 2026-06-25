"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canTransitionAgentPassportStatus = canTransitionAgentPassportStatus;
exports.transitionAgentPassportStatus = transitionAgentPassportStatus;
const VALID_TRANSITIONS = new Map([
    ['draft', new Set(['issued'])],
    ['issued', new Set(['active', 'revoked'])],
    ['active', new Set(['suspended', 'revoked', 'expired'])],
    ['suspended', new Set(['active', 'revoked'])],
    ['revoked', new Set()],
    ['expired', new Set()],
]);
function canTransitionAgentPassportStatus(from, to) {
    return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}
function transitionAgentPassportStatus(passport, to, _metadata) {
    if (!canTransitionAgentPassportStatus(passport.status, to)) {
        throw new Error(`Invalid agent passport status transition: ${passport.status} → ${to}`);
    }
    return { ...passport, status: to };
}
