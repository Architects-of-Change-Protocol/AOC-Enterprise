# AOC Agent Passport Lifecycle (PR-006)

Single source of truth: `src/enterprise/passport/lifecycle.ts`. Both the
reconstruction fold (`reconstruction.ts`) and the append path
(`in-memory-passport-store.ts` / `sqlite-passport-store.ts`) call
`applyLifecycleTransition`, so they can never disagree about which
transitions are legal.

## Statuses

| Status | Meaning |
|---|---|
| `draft` | Created but not yet operationally valid. |
| `active` | Recognized and eligible for evaluation subject to authority and policy. |
| `suspended` | Temporarily unavailable for governed execution. |
| `revoked` | Explicitly invalidated. Terminal. |
| `expired` | Validity period ended. Terminal. |
| `retired` | No longer operational but preserved historically. Terminal. |

Suspension and revocation are never conflated: suspension is reversible
(`AgentPassportReactivated`), revocation is not.

## Transition table

```
draft
  ↓ AgentPassportActivated
active
  ├── AgentPassportSuspended   → suspended
  ├── AgentPassportRevoked     → revoked   (terminal)
  ├── AgentPassportExpired     → expired   (terminal)
  └── AgentPassportRetired     → retired   (terminal)

suspended
  ├── AgentPassportReactivated → active
  ├── AgentPassportRevoked     → revoked   (terminal)
  ├── AgentPassportExpired     → expired   (terminal)
  └── AgentPassportRetired     → retired   (terminal)

revoked | expired | retired
  -- no further lifecycle transition (terminal by default) --
```

`AgentPassportRevoked` and `AgentPassportExpired` are additionally valid
directly from `draft` (an agent can be revoked/expired before ever
activating). `AgentPassportRetired` is valid only from `active` or
`suspended` — retirement implies the Passport was operational at some
point.

A revoked, expired, or retired Passport is **never reactivated in v1**.
`applyLifecycleTransition` throws `PASSPORT_ALREADY_REVOKED` for any
attempted transition out of a terminal status; a new Passport version, or
a wholly new Passport, must be issued instead
(`AgentPassportStore.appendEvent` also enforces "only one non-terminal
Passport per (organization, agentId)," so issuing a replacement after
revocation is exactly `issuePassport()` again for the same agent).

## Event catalog

Append-only, defined in `contracts.ts`'s `AgentPassportEventType`:

```
AgentPassportCreated
AgentPassportActivated
AgentPassportSuspended
AgentPassportReactivated
AgentPassportRevoked
AgentPassportExpired
AgentPassportRetired

AgentCapabilityReferenced
AgentCapabilityReferenceRemoved
AgentAuthorityReferenced
AgentAuthorityReferenceRemoved
AgentDelegationReferenced
AgentDelegationReferenceRemoved

GovernanceRecordLinked
EvidenceBundleLinked

PassportDisclosureViewGenerated   -- reserved; see below
PassportVerificationCompleted     -- reserved; see below
```

Historical events are never mutated. `lifecycle.ts`'s
`isLifecycleEventType` distinguishes the seven status-transition event
types above from the reference/observability event types, which leave
`status` untouched when folded.

### `PassportDisclosureViewGenerated` / `PassportVerificationCompleted`

These event types are reserved in the taxonomy but **not appended by
default in v1** — `service.ts`'s `buildView()` and `verifyPassport()` are
pure reads over the existing event history; they do not themselves
append an event. This is the deterministic choice mission section 27
calls for documenting: v1 optimizes disclosure/verification as
cheap, side-effect-free reads rather than write-amplifying every view
build or verification call into the Passport's own history. A future
audit-log mode may turn these on explicitly without a model change —
the event types already exist for it.

## Suspension

Input: `{ suspendedBy, reason?, expectedReviewAt?, evidenceBundleId? }`.
Temporary by construction — the only way out of `suspended` besides
`AgentPassportReactivated` is a terminal transition. Reactivation always
requires a new `AgentPassportReactivated` event; there is no implicit
timeout-based un-suspension.

## Expiration

`validFrom`/`validUntil` are carried on `AgentPassportOrganizationBinding`
and reference records, not on the Passport's own lifecycle input.
**v1 does not run a background scheduler.** Expiration
(`AgentPassportExpired`) is explicitly appended when detected — by a
caller-driven check, or by a future scheduled process this PR does not
implement. This is the one deterministic behavior mission section 27
requires be chosen and documented, rather than left ambiguous.

## Revocation

```ts
revokePassport(context, passportId, {
  reasonCode, reason, revokedBy, evidenceBundleId?,
})
```

Always explicit and append-only. Never deletes the Passport or its
history. Never allows ordinary reactivation afterward (see above).

## Issuance flow

```
Validate subject
    ↓
Validate organization binding
    ↓
Check uniqueness (only one non-terminal Passport per org+agentId)
    ↓
Create Passport (AgentPassportCreated)
    ↓
Optionally append Activated event (activateImmediately: true)
    ↓
Optionally append capability/authority/delegation reference events
    (only for references explicitly passed and validated -- never
    auto-granted)
    ↓
Reconstruct
    ↓
Return Passport
```

Idempotent when `idempotencyKey` is supplied: same organization + same
key + same subject (by `computeDigest(subject)`) replays the original
Passport; same key + a different subject fails with
`PASSPORT_IDEMPOTENCY_CONFLICT`. Without a key, a duplicate issuance
attempt for an agent that already has a non-terminal Passport fails with
`PASSPORT_ALREADY_EXISTS` rather than silently replaying.
