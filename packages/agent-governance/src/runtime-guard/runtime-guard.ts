import { randomBytes } from 'crypto';
import type { AgentPassportSignerPort } from '../signing/signer-port.js';
import { verifyAgentPassport } from '../passport/passport-verification.js';
import { verifyAgentRuntimeSeal } from '../runtime-seal/runtime-seal.js';
import type { EvaluateAgentRuntimeGuardInput } from './runtime-context.js';
import type {
  AgentRuntimeGuardDecision,
  AgentRuntimeGuardEnforcementResult,
  AgentRuntimeGuardOutcome,
  AgentRuntimeGuardReasonCode,
} from './runtime-decision.js';
import type { RuntimeGuardEventSink } from './runtime-guard-events.js';
import { createRuntimeGuardEvent } from './runtime-guard-events.js';

export interface EvaluateAgentRuntimeGuardDeps {
  readonly signer: AgentPassportSignerPort;
  readonly eventSink?: RuntimeGuardEventSink;
  readonly now?: () => string;
}

function generateDecisionId(): string {
  return `DEC-${randomBytes(8).toString('hex').toUpperCase()}`;
}

function currentTime(deps: EvaluateAgentRuntimeGuardDeps): string {
  return deps.now ? deps.now() : new Date().toISOString();
}

function resolveOptions(input: EvaluateAgentRuntimeGuardInput) {
  const opts = input.options ?? {};
  return {
    allowIssuedPassport: opts.allowIssuedPassport ?? false,
    requireRuntimeSeal: opts.requireRuntimeSeal ?? true,
    strictToolAccess: opts.strictToolAccess ?? true,
    strictDataAccess: opts.strictDataAccess ?? true,
    humanApprovalRiskTiers: opts.humanApprovalRiskTiers ?? ['critical'],
    unknownActionMode: opts.unknownActionMode ?? 'require_human_approval',
  } as const;
}

export async function evaluateAgentRuntimeGuard(
  input: EvaluateAgentRuntimeGuardInput,
  deps: EvaluateAgentRuntimeGuardDeps,
): Promise<AgentRuntimeGuardDecision> {
  const opts = resolveOptions(input);
  const { request, passport, runtimeSeal, policyManifest } = input;
  const evaluatedAt = currentTime(deps);
  const decisionId = generateDecisionId();
  const reasonCodes: AgentRuntimeGuardReasonCode[] = [];

  function deny(code: AgentRuntimeGuardReasonCode): AgentRuntimeGuardDecision {
    reasonCodes.push(code, 'runtime_guard.denied');
    return buildDecision('deny');
  }

  function approve(outcome: AgentRuntimeGuardOutcome): AgentRuntimeGuardDecision {
    const summaryCode: AgentRuntimeGuardReasonCode =
      outcome === 'allow'
        ? 'runtime_guard.allowed'
        : 'runtime_guard.human_approval_required';
    reasonCodes.push(summaryCode);
    return buildDecision(outcome);
  }

  function buildDecision(outcome: AgentRuntimeGuardOutcome): AgentRuntimeGuardDecision {
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
    const sealResult = await verifyAgentRuntimeSeal(runtimeSeal, passport, { signer: deps.signer }, {
      allowIssued: opts.allowIssuedPassport,
    });
    if (!sealResult.valid) {
      const decision = deny('runtime_guard.invalid_runtime_seal');
      await emitEvent(decision, deps);
      return decision;
    }
  }

  // Step 2: Validate passport
  const passportResult = await verifyAgentPassport(passport, { signer: deps.signer });
  if (!passportResult.valid) {
    const codes = passportResult.reasonCodes;
    let code: AgentRuntimeGuardReasonCode = 'runtime_guard.invalid_passport';
    if (codes.includes('passport.revoked')) code = 'runtime_guard.passport_revoked';
    else if (codes.includes('passport.expired')) code = 'runtime_guard.passport_expired';
    const decision = deny(code);
    await emitEvent(decision, deps);
    return decision;
  }

  // Step 3: Ensure passport is active
  const allowedStatuses = opts.allowIssuedPassport ? ['active', 'issued'] : ['active'];
  if (!allowedStatuses.includes(passport.status)) {
    const code: AgentRuntimeGuardReasonCode =
      passport.status === 'revoked'
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
    const disallowed = request.dataCategories.filter(
      (cat) => !policyManifest.dataAccess.includes(cat),
    );
    if (disallowed.length > 0) {
      const decision = deny('runtime_guard.data_access_not_allowed');
      await emitEvent(decision, deps);
      return decision;
    }
  }

  // Step 8: Human approval for configured risk tiers
  const effectiveRiskTier = (request.riskTier ?? policyManifest.riskTier) as string;
  if (opts.humanApprovalRiskTiers.includes(effectiveRiskTier as never)) {
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
  const actionKnown =
    policyManifest.allowedActions.includes(request.requestedAction) ||
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

async function emitEvent(
  decision: AgentRuntimeGuardDecision,
  deps: EvaluateAgentRuntimeGuardDeps,
): Promise<void> {
  if (!deps.eventSink) return;

  const eventType =
    decision.outcome === 'allow'
      ? 'agent_runtime_guard.allowed'
      : decision.outcome === 'deny'
      ? 'agent_runtime_guard.denied'
      : 'agent_runtime_guard.human_approval_required';

  const evaluatedEvent = createRuntimeGuardEvent({
    passportId: decision.passportId,
    requestId: decision.requestId,
    decisionId: decision.decisionId,
    type: 'agent_runtime_guard.evaluated',
    actorId: decision.passportId,
    reasonCodes: decision.reasonCodes,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  });

  const outcomeEvent = createRuntimeGuardEvent({
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

export async function enforceAgentRuntimeGuard(
  input: EvaluateAgentRuntimeGuardInput,
  deps: EvaluateAgentRuntimeGuardDeps,
): Promise<AgentRuntimeGuardEnforcementResult> {
  const decision = await evaluateAgentRuntimeGuard(input, deps);

  const allowed = decision.outcome === 'allow';
  const requiresHumanApproval = decision.outcome === 'require_human_approval';
  const blocked = !allowed;

  if (deps.eventSink) {
    const enforcedEvent = createRuntimeGuardEvent({
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
