# Soberanía Governed Encumbrance Release

How an **ACTIVE persistent authority constraint stops constraining**, and why it
may do so only because Soberanía can prove a legitimate governed release lifecycle
completed — never because somebody said so.

Companion to `docs/architecture/ADR-GOVERNED-ENCUMBRANCE-RELEASE.md`, which
records why each decision below was made rather than what it is; to
`AOC_GOVERNED_AUTHORITY_ENCUMBRANCE.md`, which accounts for the constraint this
lifecycle ends; and to `AOC_GOVERNED_AUTHORITY.md`, which describes the
authority all of it accounts for.

## The problem

The encumbrance layer closed a real hole and closed it one-way. A persistent
constraint stood until a privileged operator withdrew it, and there was no
production path from `'active'` to `'released'` at all — which is safe, and
unusable by any deployment whose collateral actually gets discharged.

The thing that *looked* like a path was not one. `COLLATERALIZE`'s
`recordRelease` records that an external system **reported** an arrangement as
released: no authority is evaluated, no decision is produced, `reportedBy` is
caller-asserted, and any tenant-scoped caller may call it. Measured directly
against the runtimes, before this phase:

```
Alice holds 5 000 bp of the economic interest.
Executed COLLATERALIZE leaves an ACTIVE 4 000 bp constraint.

resolveAvailability                   held 5 000, encumbered 4 000, available 1 000

recordRelease(reportedBy: Alice)   -> accepted, recorded as evidence
encumbrance status                 -> still 'active'
resolveAvailability                -> held 5 000, encumbered 4 000, available 1 000
```

So the pre-change surface was **not** a vulnerability: caller-asserted release
touches no authority state whatsoever, and the collateralization module already
refuses to let such a report decrement even its own `committedScope`. What it
was is a **functional gap**. The only exit from `'active'` required
`context.system` and recorded no authorization, no mandate, no executor and no
evidence.

Had `recordRelease` reached authority state, the failure would have been total:
any sufficiently positioned caller could assert "released", the constraint would
vanish, and capacity would reopen. That is the inference this whole lifecycle
exists to make impossible.

## The chain

```
ACTIVE ENCUMBRANCE
      │
      ▼
release request                       requestEncumbranceRelease
      │
      ├─ action authority             AuthorityGraph / Recognition, via AocKernel
      ├─ derived authority            delegation lineage, unchanged from Phase 5.3
      ├─ policy                       the deployment's own, through the Kernel
      ├─ approvals                    the ordinary approval machinery
      └─ obligations                  the ordinary obligation machinery
      │
      ▼
RELEASE MANDATE                       constraint still ACTIVE; capacity unchanged
      │
      ▼
trusted executor invocation           EncumbranceReleaseExecutorPort
      │
      ▼
confirmed release evidence            durable, before anything is terminalized
      │
      ▼
ENCUMBRANCE RELEASED                  GovernedAuthorityStore, governed-execution basis
      │
      ▼
capacity restored                     derived from what is still active, never incremented
```

Collapsing any two of those links is the failure mode. The most tempting
collapse is the last but one — *"someone said the collateral was released"*
becoming *"capacity is free"* — and Soberanía never makes it.

## The fifth governed action

`RELEASE_ENCUMBRANCE`, capability id `release-encumbrance`.

```
TOKENIZE             authorize creating token representations of governed rights
COLLATERALIZE        authorize subjecting governed rights to an external collateral arrangement
LICENSE              authorize permitted uses of governed rights
TRANSFER             authorize moving governed rights between holders
RELEASE_ENCUMBRANCE  authorize ending a persistent constraint COLLATERALIZE left behind
```

It meets the same threshold the other four meet: a real, durable governed effect
on what future governed actions may do. Before it, 1 000 bp of Alice's authority
was committable; after it, 5 000 bp is. That is materially unlike internal
authority configuration, which changes who may ask rather than what the answer
is.

The name is `release-encumbrance` rather than `release` or `discharge`, and the
tradeoff is recorded in the ADR: `release` collides with three existing
unrelated meanings in this codebase (`releaseReservation`, `releaseEncumbrance`,
`recordRelease`), and `discharge` carries legal semantics Soberanía must not claim.
The chosen name is precise about both the verb and the governed object, which
is also what keeps it from becoming a universal "release anything" action.

## Who may release

**Whoever holds recognized `release-encumbrance` action authority over the
resource, and nobody else.** Directly, or through a still-live delegation
lineage that cannot broaden the resource, the action, the trust domain, the
validity window or the delegation depth.

Four things that look like authority and are not:

| Role | Grants release authority? |
| --- | --- |
| **Encumbered holder** | **No.** A party who could discharge her own constraint by asking would make persistent encumbrance decorative. She may of course be *granted* release authority, and then she qualifies because of the grant. |
| **`securedPartyRef`** | **No.** The `COLLATERALIZE` contract defines it as *who benefits* — the lender or collateral taker — and says nothing about control. Benefiting from an arrangement is not authority to end it. |
| **Original requester** | **No.** Whoever asked for the collateralization holds no perpetual privilege from having once asked; their authority may since have been revoked, expired, or withdrawn with their role. |
| **Original executor** | **No.** Performing an arrangement is not authority over its governed accounting. |

Each of those is a test in
`src/enterprise/__tests__/governed-encumbrance-release-scenario.test.ts`, not an
assertion in prose.

### Why Action Authority alone, with no release-controller field

The Authority Graph already expresses "X may invoke this action on this
resource, through this lineage, in this trust domain, until this moment", and
already answers revocation, expiry, delegation depth and trust-domain
containment. A second, encumbrance-local authority relation would have to
re-answer all of them, and would answer them differently the first time the two
drifted. So `GovernedAuthorityEncumbrance` gains no `releaseControllerRef`.

A deployment that wants "only the secured party may release" expresses it by
granting the secured party `release-encumbrance` authority scoped to that
resource — a revocable, expiring, auditable grant in the graph that already
governs everything else, rather than an immutable field on a record.

### Why representative authority does not apply

A release draws on nothing of the holder's. It ends a constraint rather than
exercising a fraction of a right, so the request declares no `governedRights`,
the Kernel's governed-authority check is correctly `not_performed`, and there is
no holder's authority being exercised for a representative to be *bound to*.
Forcing holder-bound representation here would have asserted that discharging a
constraint is an exercise of the constrained authority, which is the opposite of
what happens.

That is also why **no `GovernedAuthorityReservation` is acquired** for a release.
A reservation commits a finite quantity so a competitor cannot be promised the
same capacity; a release commits nothing, it *ends* a commitment. There is no
finite resource for two release mandates to race over, and reserving in order to
free would have been incoherent. The only concurrency question this action has —
two live authorizations over one constraint — is answered by the mandate store
refusing the second.

## The mandate authorizes and does not release

State through the lifecycle, for Alice holding 5 000 bp with a 4 000 bp
constraint:

| Moment | Encumbrance | Available |
| --- | --- | --- |
| T0 — constraint stands | `active` | 1 000 |
| T1 — release mandate issued | `active` | 1 000 |
| T2 — execution in flight | `active` | 1 000 |
| T3 — confirmed success, terminalized | `released` | 5 000 |

There is deliberately no moment at which availability reports 5 000 before T3.

Consequently:

- **Revoking a release mandate before execution** leaves the constraint
  standing, and the executor is never called at all.
- **Letting a release mandate expire** is not a release. An authorization that
  ran out authorized nothing further; the arrangement it was going to discharge
  is exactly as it was.
- **Revoking a release mandate after execution** cannot re-activate the
  constraint. `'active' -> 'released'` is monotonic, and a spent authorization
  cannot be withdrawn — withdrawing one would suggest the discharge could be
  undone.

Alice's `GovernedAuthorityPosition` reads 5 000 bp at every row of that table.
Release restores availability; it does not create authority, and the position
never becomes 9 000.

## The executor, and what a confirmation means

`EncumbranceReleaseExecutorPort` is the provider-neutral seam a governed release
crosses on its way to whatever actually ends the arrangement. It answers exactly
one question — **did the release happen?** — and is emphatically not asked, and
must never answer, "should this be released?", which is settled before it is
called.

Three outcomes, and the third is why this is a union rather than a boolean:

| Outcome | Meaning | Effect on the constraint |
| --- | --- | --- |
| `confirmed_success` | the executor reported the release happened | `released` |
| `confirmed_failure` | the executor reported it definitively did not | stays `active` |
| `indeterminate` | the executor could not say; includes timeouts and calls that threw | stays `active` |

An unknown outcome is a first-class answer, not an error. Treating it as failure
would invite a retry that double-releases externally; treating it as success
would free capacity for an arrangement that may still stand. It leaves the
constraint standing — blocking capacity that may in fact be free, which is the
recoverable direction — and is safe to retry under the same idempotency key,
derived from the mandate so a conforming adapter performs at most one external
release however many times Soberanía asks.

**A caller cannot supply an outcome.** There is no parameter through which one
could reach the service, and the only `confirmed_success` Soberanía will act on is one
returned by a port invocation the service made itself. A confirmation naming a
*different* constraint is downgraded to a definitive failure with
`executor_target_mismatch` and terminalizes nothing.

There is no bank API, no registry client, no custodian integration and no chain
adapter in this repository, because inventing one would be inventing a
counterparty. A deployment with a real discharge system implements the port
against it; credentials and endpoints belong to that adapter, never to the
contract.

## The trusted release basis

Terminalization is reachable only through a typed basis on the Governed
Authority Store, never through a status setter:

```ts
{ kind: 'governed-execution', action, mandateRef, executionRef }
{ kind: 'administrative',     assertedBy, reasonCode }
```

The store re-checks, itself, that the named action is classified as *releasing*
(`GOVERNED_AUTHORITY_RELEASING_ACTIONS`, whose only member is
`release-encumbrance` — `collateralize` is emphatically not there, or an
arrangement's own action could discharge the constraint it created), that both
references are present, and that the release execution has not already
terminalized some *other* constraint. That last check is what stops one
confirmed release from discharging a sibling it never covered; in SQLite it is a
partial UNIQUE index, so it holds against a writer the process never sees.

Replaying the *same* terminalization returns the constraint unchanged. Presenting
*different* grounds for an already-released constraint is refused with
`GOVERNED_AUTHORITY_ENCUMBRANCE_RELEASE_CONFLICT`, because two lifecycles both
believing they discharged one record is a fact a caller has to see.

## Capacity is restored, never incremented

There is no `available += releasedAmount` anywhere. Availability is *derived*
from the constraints that are still active, so terminalizing one row is the
whole of the operation and no retry, race or crash can apply it twice. That is
also why exactness falls out rather than being enforced:

```
held 10 000, A = 3 000 ACTIVE, B = 2 000 ACTIVE      available 5 000
release A                                            available 8 000, not 10 000
release B                                            available 10 000, encumbered none
```

A live *reservation* for some other action is equally untouched: releasing a
3 000 constraint while a 2 000 pre-execution commitment stands returns 3 000, not
5 000.

## The crash boundary, and recovery

The two durable steps are ordered evidence-first, terminalization-second, and
the ordering is the safety property:

| State | Reachable? | Safe? |
| --- | --- | --- |
| mandate issued, execution not attempted | yes | yes — capacity stays constrained |
| execution confirmed failure, constraint active | yes | yes |
| execution unknown, constraint active | yes | yes, conservatively |
| external success, local evidence not persisted | yes | conservative — nothing was released as far as Soberanía knows; retry under the same idempotency key |
| evidence persisted `confirmed_success`, constraint still active | yes | conservative — capacity blocked, not freed; recoverable |
| constraint `released`, evidence `confirmed_success` | yes | terminal |

The other ordering's reachable failure would be capacity freed for a discharge
whose evidence never landed, which is the exact failure this phase exists to
prevent.

`recoverEncumbranceRelease` finishes the second-to-last state deterministically:
it acts only where a confirmed successful execution exists and the constraint it
discharged is still active, invokes no executor, creates no evidence, and does
exactly what the interrupted call would have done. It is idempotent, and safe to
run when there is nothing to do.

**Recovery is not required for safety.** Until it runs, the constraint simply
stays standing — blocking too much rather than freeing too much.

## Administrative recovery stays separate

Two paths exist, and disguising one as the other would defeat the point:

```
PRODUCTION   governed action -> mandate -> trusted execution -> release
RECOVERY     explicit system authority -> audited override
```

The administrative path still requires `context.system`, and now also requires
an `assertedBy` actor and a `reasonCode` — an override nobody is named for, for
no recorded reason, cannot be reviewed afterwards. The stored basis kind keeps
the two distinguishable forever: an override never wears a governed discharge's
lineage, and a governed discharge never wears an operator's.

## `recordRelease` after this phase

**Classification: `OBSERVATION_ONLY` — retained, unchanged, and documented as
non-authoritative.**

It stays exactly what it was and does exactly what it did: it records that an
external system reported an arrangement as released, correlated to the
governance aggregate that authorized the arrangement. It touches no authority
state, and

> a caller-recorded observation is not a governed discharge.

It was not migrated into the governed lifecycle, and turning an observational API
into an authoritative one silently would have been the single most dangerous
change available in this phase. A deployment that wants a reported release to
*matter* runs a `RELEASE_ENCUMBRANCE` request; the observation can be cited as
evidence on that request, where a decision can weigh it.

`src/enterprise/__tests__/governed-encumbrance-release-scenario.test.ts` pins
this: `recordRelease` from an ordinary caller leaves the constraint `'active'`
and availability unchanged.

## Historical state is not reinterpreted

No existing encumbrance is marked `'released'` because a historical
caller-asserted release record exists. Those observations were never trusted
enough to free capacity, and retroactively deciding they were would fabricate
release state for arrangements nobody verified. A deployment that believes a
historical arrangement genuinely ended has two honest options: run a governed
release against a real executor, or record an administrative override with an
actor and a reason.

The schema migration is additive in the strong sense — five nullable columns and
one partial index, no rewrite, no re-seal, and a constraint that was never
released projects byte-identically under the new digest.

## Partial release

**Status: `DEFERRED`.**

One mandate discharges one constraint in whole. Nothing in the existing domain
contracts expresses a partial discharge: a `GovernedAuthorityEncumbrance` has a
scope but no notion of a partially-satisfied one, its status vocabulary is
`'active' | 'released'` with no third state a partial would need, and inferring
partial release from the presence of a numeric scope would be exactly the
inference this codebase refuses elsewhere. Supporting it means deciding what a
partly-discharged constraint *is*, which is a substantive design question this
phase does not answer.

## The legal boundary

A Soberanía governed release means:

> this Enterprise deployment has completed its configured governed release
> process, and no longer treats the targeted persistent authority constraint as
> active.

It does **not** mean, and Soberanía never claims, that:

- a legal lien was discharged;
- a security interest was extinguished or a perfection terminated;
- any lien registry, anywhere, was updated;
- a creditor was paid;
- a debt was satisfied.

An executor's `confirmed_success` means the configured execution system reported
a successful release, bounded by that adapter's own contract. Soberanía preserves the
provider's reference and interprets none of it.

## What this lifecycle does not decide

- **Whether a future action may now proceed.** Release restores availability and
  authorizes nothing. A subsequent `TRANSFER`, `COLLATERALIZE`, `TOKENIZE` or
  `LICENSE` needs its own governance, in full.
- **Whether a constraint conflicts with a different action.** Decided since, in
  its own layer: `AOC_GOVERNED_CONSTRAINT_APPLICABILITY.md`. Two things about
  release follow from it and are worth stating plainly.

  First, `RELEASE_ENCUMBRANCE` **terminalizes the constraint its mandate names,
  regardless of ordinary cross-action applicability** — and not through any
  exemption. A releasing action consumes no constraint class and moves no
  authority, so nothing applies to it, which is why an active constraint cannot
  prevent its own governed release. There is no circularity and no general
  bypass: release gets no relief from action authority, representation,
  delegation, approval or policy, and discharges nothing it did not name.

  Second, release is **not** a conflict-resolution mechanism. An action that a
  constraint blocks never triggers a release, and nothing releases a constraint to
  make room. The action is denied, or referred to approval, and a discharge
  remains a separate governed lifecycle with its own request, authority and
  evidence.
- **Whether constraints follow authority on transfer.** Still deferred; the
  structural refusal that keeps a constraint from being stranded is unchanged.
