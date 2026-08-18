# ADR: Governed encumbrance release and the fifth governed action

- Status: accepted
- Supersedes: `ADR-GOVERNED-AUTHORITY-ENCUMBRANCE.md` §"Production discharge
  remains a gap" (**identified, not built**), and its statement that
  *"until it exists, ending a constraint is an operator act"*
- Related: `ADR-GOVERNED-AUTHORITY-ENCUMBRANCE.md`,
  `ADR-GOVERNED-AUTHORITY-RESERVATION.md`,
  `ADR-GOVERNED-AUTHORITY-TRANSITION.md`,
  `ADR-HOLDER-BOUND-REPRESENTATIVE-AUTHORITY.md`,
  `ADR-NATIVE-DELEGATED-CAPABILITIES.md`, `ADR-COLLATERALIZE-ACTION.md`
- Scope: `@aoc-enterprise/governed-authority`,
  `src/enterprise/authority-governance/`,
  `src/enterprise/encumbrance-release-governance/`
- **A fifth governed action.** Not a lien registry. Not a lending lifecycle. Not
  a partial-discharge model. Not an inter-action conflict policy. Not
  `DELEGATE`. No Protocol change.

## Context: the gap the encumbrance layer left open, deliberately

`ADR-GOVERNED-AUTHORITY-ENCUMBRANCE.md` closed the hole where a persistent
constraint evaporated at execution, and closed it one-way:

> **Status: `NOT PRESENT`.** An authorized discharge — with its own request,
> decision, authority check and evidence — is a separate governed action this
> phase deliberately does not invent. Until it exists, ending a constraint is an
> operator act.

Both halves of that gap were measured before any change in this phase, against
the real Kernel, the real Recognition Runtime, the real Authority Graph, the
real Approval Runtime, the real Governance Store and the real mandate stores.

### Measurement 1 — the caller-facing release surface (no vulnerability)

```
Alice holds 5 000 bp of the economic interest.
COLLATERALIZE 4 000 -> allowed -> executed -> encumbrance ACTIVE 4 000

resolveAvailability                        held 5 000, encumbered 4 000, available 1 000
recordRelease(reportedBy: 'party-alice')   ACCEPTED, recorded as observation evidence
encumbrance status                         'active'
resolveAvailability                        held 5 000, encumbered 4 000, available 1 000
active encumbrance count                   1
```

`recordRelease` is `OBSERVATION_ONLY`. It reaches no authority state at all, so
the pre-change posture is **not** a high-severity vulnerability — it is the
correct refusal, and the collateralization module already declines to let such a
report decrement even its own `committedScope`.

### Measurement 2 — the production path (the actual gap)

```
releaseEncumbrance(TENANT_CONTEXT, { basis: 'administrative' })
  -> refused, GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED
resolveAvailability                        unchanged
```

The single exit from `'active'` required `context.system`, and recorded no
authorization, no mandate, no executor and no evidence. Safe, and unusable by
any deployment whose collateral genuinely gets discharged.

## Decision 1 — release meets the governed-action threshold: **YES**

The threshold the four existing actions meet is a real, durable governed effect
on what future governed actions may do. Release meets it:

```
persistent authority constraint
    -> authorized release
    -> constraint becomes terminal
    -> previously unavailable authority becomes committable
```

Before: 1 000 bp of Alice's authority is committable. After: 5 000 bp is. That
is a change in the *answers* the governance layer gives, not a change in who may
ask — which is why it differs from internal authority configuration. The
existing action set cannot represent it: `COLLATERALIZE` creates such
constraints and must never be able to end them (an arrangement's own action
discharging the constraint it created would make the constraint worth nothing),
`TRANSFER` conserves rather than releases, and `TOKENIZE` and `LICENSE` never
touch the authority store at all.

**`DELEGATE` is unaffected by this and remains `NOT YET`.** Adding a fifth
action says nothing about a sixth. Delegation still changes only who may invoke
an action, not what any invocation may do, and the threshold argument above does
not reach it.

## Decision 2 — canonical name: `release-encumbrance`

Four candidates were evaluated on semantics rather than English preference.

| Candidate | Verdict |
| --- | --- |
| `release` | **Rejected.** Collides with three existing unrelated meanings in this codebase: `releaseReservation` (ending a pre-execution commitment), `releaseEncumbrance` (the store operation), and `COLLATERALIZE`'s `recordRelease` (an external observation). A capability literally named `release`, sitting in the same vocabulary as `collateralize`, would be ambiguous on its face. |
| `discharge` | **Rejected.** Carries legal semantics AOC must not claim, and imports lending vocabulary this phase explicitly excludes. |
| `release-collateral` | **Rejected.** Names the wrong object. What is governed is a `GovernedAuthorityEncumbrance`; today every one comes from `COLLATERALIZE`, but the action must survive a deployment classifying another action as encumbering. |
| `release-encumbrance` | **Selected.** Precise about both verb and governed object. |

The tradeoff accepted: it is the first multi-word capability id, against four
single verbs. That divergence is real and is the price of not colliding, and it
is also load-bearing — the other four take the *asset* as their object, while
this one takes a constraint, and a name that hid that would invite exactly the
"release anything" generalization §Decision 4 refuses. There is deliberately **no
alias**: one canonical action id, `release-encumbrance`, and no second spelling.

## Decision 3 — release authority is **Action Authority alone**

No `releaseControllerRef`, no `releaseAuthorityRef`, no bespoke relation on the
encumbrance.

The Authority Graph already expresses "X may invoke this action on this
resource, through this lineage, in this trust domain, until this moment", and
already answers revocation, expiry, delegation depth, trust-domain containment
and non-amplification. A second, encumbrance-local authority universe would have
to re-answer every one of those, and would answer them differently the first
time the two drifted. A deployment that wants "only the secured party may
release" says so by granting the secured party `release-encumbrance` authority
scoped to that resource — revocable, expiring and auditable in the graph that
governs everything else — rather than by an immutable field on a record.

Explicit answers to the questions this decision had to settle:

| Question | Answer |
| --- | --- |
| Does the **encumbered holder** hold release authority by being the holder? | **No.** A party who could discharge her own constraint by asking would make persistent encumbrance decorative. |
| Does **`securedPartyRef`** grant release authority? | **No.** `EnterpriseCollateralizationTerms` documents it as *who benefits* (the lender / collateral taker), listed alongside `requestedBy`, `executorRef` and `securedObligationRef` precisely so the four are not conflated. Nothing in the contract makes it a control principal. |
| Does the **original requester** or **executor** retain a privilege? | **No.** Neither holds anything perpetual from having once been involved. |
| Does **Holder-Bound Representative Authority** apply? | **No** — see Decision 5. |

Each is a test, not an assertion in prose.

## Decision 4 — governed resource is the underlying `ResourceRef`; the constraint is named by an Enterprise-local reference

The action's `resourceScope` is the asset's `kind:id`, exactly as the four
existing actions compute it, and the target constraint travels as an
`encumbranceRef` in the request.

The alternative — making the encumbrance itself a governed resource identity —
was rejected because grants would then have to be issued per encumbrance id, and
those ids are derived at *execution* time from an execution reference. Nobody
can grant authority over an identifier that does not exist yet, so every
deployment would end up granting a wildcard and the scoping would be theatre.
Scoping to the asset keeps release authority expressible in advance and keeps
one resource identity universe.

The `encumbranceRef` is Enterprise-local. **No AOC Protocol resource kind is
introduced**, because nothing crosses a deployment boundary here.

## Decision 5 — the target constraint is the source of truth

The request carries the constraint reference and the resource, and nothing else
about the constraint. Holder, right, scope, source action, source mandate and
source execution are all **read from the stored record**, never accepted from
the caller — a caller able to supply them could choose which constraint a
release "really" meant, and could show a policy a smaller quantity than the one
that would actually be freed. The Kernel request's `parameters` therefore carry
the *canonical* facts, so a policy that turns on "how much would this free?"
sees the real number.

Correspondence is checked before any governance evaluation exists:

- tenant must match `encumbrance.tenantId` — a cross-tenant reference reads as
  *absent*, not as *denied*, so identifiers cannot be probed;
- resource must match the constraint's resource — **refused, never coerced**;
- status must be `'active'`.

The request declares **no `governedRights`**, so the Kernel's governed-authority
check is correctly `not_performed`. That is the honest modelling: a release
exercises no fraction of the holder's right. It follows that no holder-coverage
requirement applies (there is no quantity being drawn on to cover), and that
holder-bound representation has no principal to bind to.

## Decision 6 — no reservation for a release

**`RELEASE_ENCUMBRANCE` reservation applicability: NO.**

A reservation commits a finite quantity so a competing authorization cannot be
promised the same capacity. A release commits nothing — it *ends* a commitment —
so there is no finite resource for two release mandates to race over, and
acquiring a reservation would have constrained authority in order to free it.
The only concurrency question this action actually has is *two live
authorizations over one constraint*, and that is answered directly: the mandate
store refuses the second, durably, via a partial UNIQUE index on
`(organization_id, encumbrance_ref) WHERE status = 'active'`.

## Decision 7 — the executor port is the trust boundary

`EncumbranceReleaseExecutorPort` answers exactly one question — *did the release
happen?* — and never *should this be released?*, which is settled before it is
called. Three outcomes, and the third is the reason it is a union:

```
confirmed_success   the executor reported the release happened
confirmed_failure   the executor reported it definitively did not
indeterminate       the executor could not say; timeouts, ambiguous replies,
                    and calls that threw
```

Only `confirmed_success` may terminalize. A call that threw is `indeterminate`
rather than failed, because it may still have reached the provider.

**A caller cannot supply an outcome.** There is no parameter through which one
reaches the service, and the only confirmation AOC acts on is one returned by a
port invocation the service made itself. A confirmation naming a different
constraint is downgraded to `confirmed_failure` with
`executor_target_mismatch`.

No production provider adapter ships here, because inventing one would be
inventing a counterparty. The deterministic in-memory, failing, indeterminate and
unavailable adapters are what the suite runs against, and swapping them is what
demonstrates the property that matters: **the service cannot decide a release
happened.**

## Decision 8 — a typed release basis, persisted additively

`GovernedAuthorityEncumbranceReleaseBasis` becomes a discriminated union,
matching `GovernedAuthorityBasis`'s existing shape:

```ts
{ kind: 'governed-execution', action, mandateRef, executionRef }
{ kind: 'administrative',     assertedBy, reasonCode }
```

The store re-checks the action against `GOVERNED_AUTHORITY_RELEASING_ACTIONS`
(sole member `release-encumbrance`; `collateralize` deliberately absent), that
both references are present, and that the release execution has not already
terminalized a *different* constraint.

Persisted **additively**: `release_basis` keeps its column and its
`'administrative'` value, and five nullable columns carry the lineage
(`release_action`, `release_mandate_ref`, `release_execution_ref`,
`released_by`, `release_reason_code`). Every one is conditional in the digest
projection, so a constraint that was never released projects byte-identically
under v4 — which is what lets the `v3 -> v4` migration be `ALTER TABLE ADD
COLUMN` with no rebuild, no re-seal, and no historical release reinterpreted.

The alternative — persisting the union as a structured value — was rejected
precisely because it would have changed the projection for existing released
rows, forcing either a digest re-seal of history or a synthesized
`assertedBy`/`reasonCode` that nobody actually asserted.

`'governed-execution'` deliberately does **not** require `context.system`. What
makes it trustworthy is the execution reference, which only the release service
can mint; requiring a privileged context for it would have forced the production
discharge path to run as an administrator, which is the opposite of governing
it. `'administrative'` still requires `context.system`, and now also requires an
actor and a reason code — an override nobody is named for cannot be reviewed.

## Decision 9 — ordering, crash matrix and recovery

Evidence first, terminalization second.

| State | Reachable | Posture |
| --- | --- | --- |
| A — mandate issued, execution not attempted | yes | safe; capacity constrained |
| B — confirmed failure, constraint active | yes | safe |
| C — indeterminate, constraint active | yes | safe, conservative |
| D — external success, local evidence not persisted | yes | conservative; retry under the same idempotency key |
| E — evidence `confirmed_success`, constraint still active | yes | conservative; capacity blocked, recoverable |
| F — constraint `released`, evidence `confirmed_success` | yes | terminal |

State E is the price of this ordering, and it is the right price: the other
ordering's reachable failure is capacity freed for a discharge whose evidence
never landed. `recoverEncumbranceRelease` finishes E deterministically and
idempotently — it acts only where a confirmed success exists and the constraint
is still active, invokes no executor and creates no evidence.
`getEncumbranceByReleaseExecutionRef` is what makes that decidable rather than
guessed, playing the role `listTransitionsByExecutionRef` already plays for a
movement across two stores.

**Recovery is not required for safety.** Until it runs, the constraint stays
standing — blocking too much, never freeing too much.

## Decision 10 — `recordRelease` disposition: `OBSERVATION_ONLY`, retained

Unchanged, and documented as non-authoritative:

> a caller-recorded observation is not a governed discharge.

It was not migrated, not deprecated and not removed. Silently turning an
observational API into an authoritative one would have been the single most
dangerous change available in this phase, and removing it would have broken
consumers of a legitimate evidence surface. A deployment that wants a reported
release to *matter* runs a `RELEASE_ENCUMBRANCE` request and cites the
observation as evidence on it, where a decision can weigh it.

**No historical migration.** No existing encumbrance is marked `'released'`
because a historical caller-asserted release record exists. Those observations
were never trusted enough to free capacity; retroactively deciding they were
would fabricate release state for arrangements nobody verified.

## Decision 11 — partial release: `DEFERRED`

Nothing in the existing contracts expresses a partial discharge. A
`GovernedAuthorityEncumbrance` has a scope but no notion of a partially-satisfied
one, its status vocabulary is `'active' | 'released'` with no third state, and
inferring partial release from the presence of a numeric scope is exactly the
inference this codebase refuses elsewhere. Supporting it means deciding what a
partly-discharged constraint *is* — a substantive design question, not a coding
one.

## Decision 12 — Protocol boundary: **no change**

Release is mutable Enterprise governance state and Enterprise action execution.
Nothing crosses a deployment boundary, no portable proof is emitted, and no
Protocol contract is consumed or shadowed. `check:protocol-consumption`,
`check:protocol-contract-adoption` and `check:protocol-compatibility-lock` all
pass unchanged.

The only future Protocol question — an independent deployment verifying a
portable discharge proof across a trust boundary — is out of scope and not
implemented.

## Consequences

**Gained.** A production path from `'active'` to `'released'` that no caller can
assert their way through; release authority that is explicit, revocable and
delegable through the machinery that already governs everything else; a fifth
governed action with the same authority, policy, approval, obligation, mandate,
evidence and audit shape as the other four; a crash boundary that fails closed
and recovers deterministically.

**Accepted costs.** A fifth action to maintain, and a fifth mandate store. The
first multi-word capability id. A schema version bump on the Governed Authority
Store (`v3 -> v4`). One more seam between two durable stores, ordered so its
reachable failure is the conservative one.

**Explicitly not done.** Partial release. A production provider adapter.
Inter-action conflict policy. Constraint migration on transfer. Cross-deployment
discharge proof. `DELEGATE`. Any lending, valuation, priority or foreclosure
concept.

## Legal boundary

An AOC governed release means this deployment completed its configured governed
release process and no longer treats the constraint as active. It does not mean
a lien was discharged, a security interest extinguished, a registry updated, a
creditor paid or a debt satisfied. An executor's confirmation is bounded by that
adapter's own contract, and AOC preserves the provider's reference without
interpreting it.
