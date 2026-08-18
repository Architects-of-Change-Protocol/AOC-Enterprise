# @aoc-enterprise/governed-authority

The action-neutral vocabulary of **governed authority state**: what AOC
Enterprise currently recognizes an actor as controlling, why, and how a
completed governed action changes it.

Pure data. No store, no resolver implementation, no persistence, no policy
engine, no orchestration, no service, no API. The runtime that holds this state
lives in `src/enterprise/authority-governance/`; the decision engine that
consumes it remains `AocKernel`.

## Why this is a separate package from `governed-authorization`

They answer different questions and change for different reasons.

```
@aoc-enterprise/governed-authorization   immutable authorization vocabulary
  GovernedRightType                        which right an action concerns
  GovernedRightsScope                      how much of it, exactly
  GovernedAuthorizationArtifact            what was authorized, once, forever

@aoc-enterprise/governed-authority       mutable authority state vocabulary
  GovernedAuthorityPosition                what an actor controls now
  GovernedAuthorityBasis                   why it controls it
  GovernedAuthorityTransition              how that changed
  GovernedAuthorityQuery / Coverage        the enforcement question
```

`governed-authorization` is deliberately about things that never change after
they are written. Folding a mutable balance into it would break that property
for every action package that depends on it. So this package depends on that
one — for `GovernedRightType` and `GovernedRightsScope`, which are reused
verbatim and never re-invented — and nothing depends on this one in the reverse
direction.

## Dependency direction

```
governed-authorization
        ^                    ^
        |                    |
governed-authority     tokenization/collateralization/license/transfer-mandate
        ^
        |
src/enterprise/authority-governance   (store + resolver)
        ^
        |
src/kernel                            (optional provider port)
        ^
        |
src/enterprise/*-governance           (the four governed action services)
```

No cycle exists and none is possible: the four frozen action-contract packages
do not import this package, and this package imports no runtime.

## The bounded proposition

A position asserts:

> According to the governance state and evidence this deployment recognizes,
> Actor A has authority to exercise Scope S of Right R over Resource X.

It does not assert legal title, statutory ownership, registry truth, or
recognition by anyone outside this deployment. There is no `OwnershipLedger`,
`LegalOwner` or `TitleRegistry` here, and their absence is the design.

## What moves authority

Only accepted evidence that a governed external effect happened, or a
privileged administrative/evidence-based issuance. Not a mandate (permission
that is never exercised must move nothing), and not a later external report (an
observation must not silently rewrite authority).

See `docs/enterprise/AOC_GOVERNED_AUTHORITY.md` and
`docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`.
