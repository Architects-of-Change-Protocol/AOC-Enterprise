# Proof of Governance Demo

## Purpose

The Proof of Governance demo shows that AOC Agent Passport is not just a badge, document, or governance ingredient list. It demonstrates a governed runtime decision path from Runtime Seal through Passport Verification, Policy Manifest Evaluation, Runtime Decision, Audit Event, and Execution Result.

AOC Agent Passport is not a promise that an AI agent will behave. It is the identity, policy, verification, and enforcement substrate that allows a governed runtime to decide whether an agent action is allowed to become real-world execution.

## Why this is not an ingredient list

The demo runs concrete action requests through Runtime Guard Lite. The result is an enforceable decision: `ALLOW`, `DENY`, or `REQUIRE_HUMAN_APPROVAL`. The page displays the request, verification checks, policy evaluation summary, reason codes, decision ID, execution result, and MVP audit event preview.

## What is actually evaluated

- Runtime seal validity and hash linkage.
- Passport signature, integrity, and status.
- Policy manifest tool access.
- Policy manifest data access.
- Prohibited actions.
- High-risk and explicit human approval requirements.

## What is blocked

The demo blocks prohibited actions, unauthorized data access, tools that are not allowed by policy, invalid or tampered runtime seals, and revoked passports.

## What requires human approval

Critical-risk governed actions, such as a refund commitment request, are paused with a `REQUIRE_HUMAN_APPROVAL` runtime decision instead of proceeding autonomously.

## Current limitations

- This demo controls governed execution decisions, not the model’s internal reasoning.
- Enforcement requires integration into the runtime/tool gateway.
- MVP audit events are not yet append-only production audit logs.
- Production use requires persistent storage and production issuer key management.

## Production hardening remaining

- Persistent passport, policy, seal, and audit storage.
- Append-only audit log infrastructure.
- Production-grade issuer key management and rotation.
- Runtime/tool gateway integration for hard enforcement.
- Operational monitoring, alerting, and incident workflows.
