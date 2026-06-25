"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAgentRuntimeGuard = evaluateAgentRuntimeGuard;
exports.enforceAgentRuntimeGuard = enforceAgentRuntimeGuard;
const crypto_1 = require("crypto");
const passport_verification_js_1 = require("../passport/passport-verification.js");
const runtime_seal_js_1 = require("../runtime-seal/runtime-seal.js");
const runtime_guard_events_js_1 = require("./runtime-guard-events.js");
function generateDecisionId() {
    return `DEC-${(0, crypto_1.randomBytes)(8).toString('hex').toUpperCase()}`;
}
function currentTime(deps) {
    return deps.now ? deps.now() : new Date().toISOString();
}
function resolveOptions(input) {
    const opts = input.options ?? {};
    return {
        allowIssuedPassport: opts.allowIssuedPassport ?? false,
        requireRuntimeSeal: opts.requireRuntimeSeal ?? true,
        strictToolAccess: opts.strictToolAccess ?? true,
        strictDataAccess: opts.strictDataAccess ?? true,
        humanApprovalRiskTiers: opts.humanApprovalRiskTiers ?? ['critical'],
        unknownActionMode: opts.unknownActionMode ?? 'require_human_approval',
    };
}
async function evaluateAgentRuntimeGuard(input, deps) {
    const opts = resolveOptions(input);
    const { request, passport, runtimeSeal, policyManifest } = input;
    const evaluatedAt = currentTime(deps);
    const decisionId = generateDecisionId();
    const reasonCodes = [];
    function deny(code) {
        reasonCodes.push(code, 'runtime_guard.denied');
        return buildDecision('deny');
    }
    function approve(outcome) {
        const summaryCode = outcome === 'allow'
            ? 'runtime_guard.allowed'
            : 'runtime_guard.human_approval_required';
        reasonCodes.push(summaryCode);
        return buildDecision(outcome);
    }
    function buildDecision(outcome) {
        return {
            decisionId,
            requestId: request.requestId,
            passportId: request.passportId,
            outcome,
            reasonCodes: [...reasonCodes],
            evaluatedAt,
            policyManifestHash: passport.policyManifestHash,
            constitutionHash: passport.constitutionHash,
            passportHash: passport.passportHash,
        };
    }
    // Step 1: Validate runtime seal
    if (opts.requireRuntimeSeal) {
        if (!runtimeSeal) {
            const decision = deny('runtime_guard.missing_runtime_seal');
            await emitEvent(decision, deps);
            return decision;
        }
        const sealResult = await (0, runtime_seal_js_1.verifyAgentRuntimeSeal)(runtimeSeal, passport, { signer: deps.signer }, {
            allowIssued: opts.allowIssuedPassport,
        });
        if (!sealResult.valid) {
            const decision = deny('runtime_guard.invalid_runtime_seal');
            await emitEvent(decision, deps);
            return decision;
        }
    }
    // Step 2: Validate passport
    const passportResult = await (0, passport_verification_js_1.verifyAgentPassport)(passport, { signer: deps.signer });
    if (!passportResult.valid) {
        const codes = passportResult.reasonCodes;
        let code = 'runtime_guard.invalid_passport';
        if (codes.includes('passport.revoked'))
            code = 'runtime_guard.passport_revoked';
        else if (codes.includes('passport.expired'))
            code = 'runtime_guard.passport_expired';
        const decision = deny(code);
        await emitEvent(decision, deps);
        return decision;
    }
    // Step 3: Ensure passport is active
    const allowedStatuses = opts.allowIssuedPassport ? ['active', 'issued'] : ['active'];
    if (!allowedStatuses.includes(passport.status)) {
        const code = passport.status === 'revoked'
            ? 'runtime_guard.passport_revoked'
            : passport.status === 'expired'
                ? 'runtime_guard.passport_expired'
                : 'runtime_guard.passport_not_active';
        const decision = deny(code);
        await emitEvent(decision, deps);
        return decision;
    }
    // Step 4: Policy manifest hash must match passport
    if (passport.policyManifestHash !== policyManifest.manifestId &&
        !passport.policyManifestHash.includes(policyManifest.manifestId)) {
        // Use hash comparison: policyManifest doesn't carry its own hash externally,
        // but we can verify by comparing the stored hash on the passport against
        // what the runtime seal recorded.
        if (runtimeSeal && runtimeSeal.policyManifestHash !== passport.policyManifestHash) {
            const decision = deny('runtime_guard.policy_manifest_mismatch');
            await emitEvent(decision, deps);
            return decision;
        }
    }
    // Step 5: Check if action is explicitly prohibited
    if (policyManifest.prohibitedActions.includes(request.requestedAction)) {
        const decision = deny('runtime_guard.action_prohibited');
        await emitEvent(decision, deps);
        return decision;
    }
    // Step 6: Check tool access
    if (opts.strictToolAccess && request.toolName) {
        if (!policyManifest.toolAccess.includes(request.toolName)) {
            const decision = deny('runtime_guard.tool_not_allowed');
            await emitEvent(decision, deps);
            return decision;
        }
    }
    // Step 7: Check data category access
    if (opts.strictDataAccess && request.dataCategories && request.dataCategories.length > 0) {
        const disallowed = request.dataCategories.filter((cat) => !policyManifest.dataAccess.includes(cat));
        if (disallowed.length > 0) {
            const decision = deny('runtime_guard.data_access_not_allowed');
            await emitEvent(decision, deps);
            return decision;
        }
    }
    // Step 8: Human approval for configured risk tiers
    const effectiveRiskTier = (request.riskTier ?? policyManifest.riskTier);
    if (opts.humanApprovalRiskTiers.includes(effectiveRiskTier)) {
        reasonCodes.push('runtime_guard.high_risk_requires_approval');
        const decision = approve('require_human_approval');
        await emitEvent(decision, deps);
        return decision;
    }
    // Step 9: Human approval for explicitly flagged actions
    if (policyManifest.humanApprovalRequiredFor.includes(request.requestedAction)) {
        const decision = approve('require_human_approval');
        await emitEvent(decision, deps);
        return decision;
    }
    // Step 10: Check if action is known/allowed
    const actionKnown = policyManifest.allowedActions.includes(request.requestedAction) ||
        request.actionCategory !== 'unknown';
    if (!actionKnown || request.actionCategory === 'unknown') {
        reasonCodes.push('runtime_guard.action_unknown');
        if (opts.unknownActionMode === 'deny') {
            reasonCodes.push('runtime_guard.denied');
            const decision = buildDecision('deny');
            await emitEvent(decision, deps);
            return decision;
        }
        const decision = approve('require_human_approval');
        await emitEvent(decision, deps);
        return decision;
    }
    // Step 11: Allow
    const decision = approve('allow');
    await emitEvent(decision, deps);
    return decision;
}
async function emitEvent(decision, deps) {
    if (!deps.eventSink)
        return;
    const eventType = decision.outcome === 'allow'
        ? 'agent_runtime_guard.allowed'
        : decision.outcome === 'deny'
            ? 'agent_runtime_guard.denied'
            : 'agent_runtime_guard.human_approval_required';
    const evaluatedEvent = (0, runtime_guard_events_js_1.createRuntimeGuardEvent)({
        passportId: decision.passportId,
        requestId: decision.requestId,
        decisionId: decision.decisionId,
        type: 'agent_runtime_guard.evaluated',
        actorId: decision.passportId,
        reasonCodes: decision.reasonCodes,
        ...(deps.now !== undefined ? { now: deps.now } : {}),
    });
    const outcomeEvent = (0, runtime_guard_events_js_1.createRuntimeGuardEvent)({
        passportId: decision.passportId,
        requestId: decision.requestId,
        decisionId: decision.decisionId,
        type: eventType,
        actorId: decision.passportId,
        reasonCodes: decision.reasonCodes,
        ...(deps.now !== undefined ? { now: deps.now } : {}),
    });
    await deps.eventSink.emit(evaluatedEvent);
    await deps.eventSink.emit(outcomeEvent);
}
async function enforceAgentRuntimeGuard(input, deps) {
    const decision = await evaluateAgentRuntimeGuard(input, deps);
    const allowed = decision.outcome === 'allow';
    const requiresHumanApproval = decision.outcome === 'require_human_approval';
    const blocked = !allowed;
    if (deps.eventSink) {
        const enforcedEvent = (0, runtime_guard_events_js_1.createRuntimeGuardEvent)({
            passportId: decision.passportId,
            requestId: decision.requestId,
            decisionId: decision.decisionId,
            type: 'agent_runtime_guard.enforced',
            actorId: decision.passportId,
            reasonCodes: decision.reasonCodes,
            ...(deps.now !== undefined ? { now: deps.now } : {}),
        });
        await deps.eventSink.emit(enforcedEvent);
    }
    return { decision, allowed, requiresHumanApproval, blocked };
}
