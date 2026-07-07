# AOC Evidence / Source / Citation Runtime

Recognition Runtime answers "can this action be recognized?" Authority Graph
answers "where did the authority behind this action come from?" Approval
Runtime answers "who can approve this, and did they?" Action Enforcement
answers "should real execution be blocked?" The Domain Policy Pack Runtime
answers "what does this domain/jurisdiction/customer require?" None of them
answer the question an auditor, a customer, or a regulator asks once all of
those decisions have already been made:

**What evidence supports this action, policy decision, approval decision,
authority claim, external standing claim, or enforcement result -- where did
that evidence come from, who reviewed it, what requirement does it satisfy,
and how can the evidence trail be audited without trusting the UI?**

That is the Evidence / Source / Citation Runtime's job.

## Why AOC needs evidence after policy packs and enforcement wiring

AOC is already recognition-backed, authority-backed, approval-backed,
policy-backed and enforcement-backed. A policy pack can say "invoice
required" or "event record required" (`PolicyEvidenceRequirement`). Approval
Runtime can record `evidenceReviewed` on an `ApprovalDecision`. Action
Enforcement can produce an `evidence_required` decision. But none of those
runtimes are a **first-class evidence system**: they can each say evidence is
*needed*, but none of them owns:

- registering the source a piece of evidence actually came from,
- hashing evidence deterministically so tampering is detectable,
- linking one piece of evidence to the specific requirement it satisfies,
- linking evidence to the recognition/approval/policy/enforcement decision
  that consumed it,
- recording who submitted evidence and who reviewed it,
- producing a citation trail an auditor can walk without trusting the UI,
- producing a deterministic proof that a given evidence state existed.

This runtime is that missing layer. It does not replace or re-decide
anything the other runtimes already decided -- see
[Never overriding other runtimes' decisions](#never-overriding-other-runtimes-decisions-non-negotiable).

## What this runtime is not

- **Not a document-management system.** It never stores binary file content
  -- only metadata, hashes, and a caller-supplied reference (URI/system/id).
- **Not a legal-conclusion engine.** It never parses contracts, invoices,
  policies, or event records, and it never uses an LLM to interpret them.
  See [Legal / compliance disclaimer](#legal--compliance-disclaimer).
- **Not an OCR or binary-parsing pipeline.** Citation anchors (page,
  section, clause, ...) are always caller-declared, never extracted.
- **Not a replacement for Recognition Runtime, Approval Runtime, Domain
  Policy Pack Runtime, or Action Enforcement.** It represents and validates
  *evidence completeness* only; it never issues a recognition, approval,
  policy, or enforcement decision itself.

## Concepts

- **SourceDocument** -- the origin a piece of evidence claims to come from
  (an invoice PDF, a purchase order, a customer policy document, an event
  record, a system log, ...). Metadata, hashes and a reference only -- never
  binary content. Carries `legalCompleteness`, a caller-asserted label this
  runtime never upgrades on its own (see below).
- **EvidenceArtifact** -- a specific piece of evidence *presented* to satisfy
  a requirement or support a decision. May reference a `SourceDocument` via
  `sourceDocumentId`, but is itself the unit that gets submitted, accepted,
  or rejected.
- **EvidenceRequirement** -- a requirement that some evidence be presented.
  Either created locally (`source: 'manual'`) or structurally mapped in from
  another runtime's own requirement shape (`policy_pack`, `approval`,
  `recognition`, `action_enforcement`, `authority`, `external_handshake`) --
  `sourceRequirementId`/`sourceRuleId`/`policyDecisionId`/... always trace
  back to that origin.
- **EvidenceSatisfaction** -- the record of one or more `EvidenceArtifact`s
  being applied against one `EvidenceRequirement`, and the resulting status
  (`satisfied`, `partially_satisfied`, `rejected`, ...) computed purely from
  the referenced artifacts' own status -- never inferred.
- **EvidenceReview** -- a human or system review of an artifact, requirement,
  or satisfaction. Applies a real status effect (accept/reject/needs more
  evidence) but is never itself a legal-sufficiency conclusion.
- **Citation** -- links a `SourceDocument` and/or `EvidenceArtifact` to a
  decision or proof another AOC runtime produced (a `policy_decision`, an
  `approval_proof`, an `enforcement_decision`, ...), with a deterministic,
  caller-reason-driven `citationText`.
- **EvidenceLink** -- a lighter-weight connection between an
  `EvidenceArtifact` and a runtime entity (`supports`, `satisfies`,
  `reviewed_for`, `referenced_by`, `supersedes`, `rejects`, `waives`) that
  doesn't need a citation narrative.
- **EvidenceProof** -- a deterministic, hash-chained proof that a specific
  set of source documents, evidence artifacts, requirements, satisfactions,
  reviews, citations and links existed in a specific state.
- **EvidenceEvent** -- an append-only, hash-chained ledger entry for every
  mutation this runtime makes.

## How source documents are registered

`SourceDocumentRegistry.register()` (or `EvidenceRuntime.registerSourceDocument()`)
takes a type, title, authority, and `legalCompleteness` label, computes a
deterministic `metadataHash` over the document's own fields, and returns an
`active` `SourceDocument`. IDs must be caller-supplied and unique --
duplicate registration throws `SourceDocumentDuplicateIdError`. Documents can
later be `update()`d, `revoke()`d, `supersede()`d, or `markExpired()`d; every
mutation is recorded to the `EvidenceLedger`.

## How evidence artifacts are submitted

`EvidenceArtifactRegistry.submit()` (or `EvidenceRuntime.submitEvidenceArtifact()`)
creates a `submitted` `EvidenceArtifact`, optionally linked to a
`SourceDocument` (validated to actually exist -- this registry never
fabricates a source link). A reviewer then `accept()`s, `reject()`s,
`revoke()`s, `supersede()`s, or `markExpired()`s it, or a full review is
recorded via `EvidenceReviewService`/`EvidenceRuntime.reviewEvidence()`.

## How requirements are created from policy packs, approvals, recognition and enforcement

`EvidenceRequirementService` exposes one generic `create()` plus four
convenience methods that all funnel into it with the right `source` and
cross-reference field set:

- `fromPolicyPackRequirement()` -- `source: 'policy_pack'`, tags
  `sourceRequirementId`, `sourceRuleId`, `policyPackVersionId`,
  `policyDecisionId`.
- `fromApprovalRequirement()` -- `source: 'approval'`, tags
  `approvalRequestId`.
- `fromRecognitionRequirement()` -- `source: 'recognition'`, tags
  `recognitionDecisionId`.
- `fromEnforcementRequirement()` -- `source: 'action_enforcement'`, tags
  `enforcementDecisionId`.

None of these re-evaluate the originating runtime's rules -- they only
*represent* a requirement that runtime already decided exists.

## How evidence satisfies requirements

`EvidenceSatisfactionService.satisfy()` (or
`EvidenceRuntime.satisfyEvidenceRequirement()`) takes a requirement id and
one or more evidence artifact ids, validates every artifact actually exists,
and derives the satisfaction's status **purely from the artifacts' own
status**:

- any artifact `rejected`, `revoked`, or `expired` &rarr; satisfaction is
  `rejected`, and the requirement is left untouched (still `open`);
- otherwise, `partial: true` &rarr; `partially_satisfied`;
- otherwise &rarr; `satisfied`, and the requirement is marked `satisfied`.

A `satisfies` (or `rejects`, on the rejected path) `EvidenceLink` is created
automatically when the requirement carries a traceable target
(`policyDecisionId`/`approvalRequestId`/`recognitionDecisionId`/`enforcementDecisionId`),
and a proof can optionally be created in the same call via `createProof: true`.

## How evidence review works

`EvidenceReviewService.recordReview()` (or `EvidenceRuntime.reviewEvidence()`)
records an `EvidenceReview` and applies its real effect: `accepted` accepts
the artifact, `rejected` rejects it, `needs_more_evidence` marks it
`needs_review`, and `waived` (when a `requirementId` is given) waives the
requirement. A review is a record of what the reviewer decided -- it is
**never** read as a legal-sufficiency conclusion unless the caller's own
metadata says so (e.g. `metadata: { reviewedByCounsel: true }`).

## How citations work

`CitationService.createCitation()` links a `SourceDocument` and/or
`EvidenceArtifact` to any `CitationTargetType` (a policy decision, an
approval proof, an enforcement decision, a demo scenario, an export
package, ...). `citationText` is generated deterministically from the
citation's own fields unless the caller supplies one. `CitationAnchor`s are
always caller-declared (`createAnchor()`); this runtime never extracts a
page/section/clause from document content.

## How evidence links work

`EvidenceLinkService.createLink()` creates a lighter-weight `EvidenceLink`
(`supports`, `satisfies`, `reviewed_for`, `referenced_by`, `supersedes`,
`rejects`, `waives`) between an artifact and a runtime entity, validating the
artifact exists and the target id is non-empty. Links can be queried by
artifact (`listByArtifact`) or by target (`listByTarget`).

## How EvidenceProof is generated

`EvidenceProofService.createProof()` takes lists of ids (source documents,
evidence artifacts, requirements, satisfactions, reviews, citations, links),
resolves each id to its **current, full record**, and hashes each slice
independently (`sourceHash`, `evidenceHash`, `requirementHash`,
`satisfactionHash`, `reviewHash`, `citationHash`, `linkHash`). `proofHash`
chains all seven together with `previousHash` (the prior proof's hash),
mirroring `PolicyPackProof`/`EnforcementProof`/`ApprovalProof`. Because each
hash is computed from the record's *current* state, calling `createProof()`
again after any referenced record changed produces a different hash --
evidence proofs are tamper-evident by construction, not by convention.
`verifyProof()` deterministically re-derives `proofHash` from a proof's own
recorded hashes and compares it.

## How EvidenceLedger works

Every mutation (`source_document_registered`, `evidence_artifact_submitted`,
`evidence_requirement_satisfied`, `citation_created`, `evidence_proof_created`,
...) is recorded as an `EvidenceEvent` with a deterministic `eventHash` that
chains to the previous event's hash via `previousHash`. `EvidenceLedger`
exposes trail queries by source document, artifact, requirement, proof,
target, or trust domain, and `verifyChain()` recomputes every hash in order
to confirm the chain was never tampered with.

## How EvidenceRuntime integrates with Domain Policy Pack Runtime

`integrations/policy-pack-evidence-integration.ts` structurally mirrors
`PolicyEvidenceRequirement` (never imports it directly) and:

1. idempotently maps each requirement onto an `EvidenceRequirement`
   (`mapPolicyEvidenceRequirements`), keyed by `sourceRequirementId` +
   `policyDecisionId` so calling it twice for the same decision never
   creates duplicates;
2. checks supplied evidence artifact ids against those requirements by type
   and status, recording a real `EvidenceSatisfaction` for any type match
   (`validatePolicyEvidenceSatisfaction`).

It never re-evaluates a policy pack's own rules and never claims legal
sufficiency -- it only represents and validates evidence completeness.

## How EvidenceRuntime integrates with Approval Runtime

`integrations/approval-evidence-integration.ts` structurally mirrors
`ApprovalEvidenceRequirement`/`ApprovalEvidenceArtifact`. It can map
approval evidence requirements, link evidence an approver reviewed to an
approval decision (`reviewed_for`), create citations targeting
`approval_request`/`approval_decision`/`approval_proof`, and create an
`EvidenceProof` for an approval decision. Linking evidence to a decision
never fabricates the approver's review -- recording that the approver
*accepted* a given artifact still requires an explicit
`EvidenceReview` via `runtime.reviewEvidence()`.

## How EvidenceRuntime integrates with Recognition Runtime

`integrations/recognition-evidence-integration.ts` maps
`RecognitionDecision.requiredEvidence` (a plain array of description
strings -- Recognition Runtime has no typed evidence-requirement shape of
its own) onto `EvidenceRequirement`s, links evidence to a
`recognition_decision`, creates citations, and only creates a proof once
every referenced artifact is actually `accepted`. It never overrides or
re-derives a `RecognitionDecision`.

## How EvidenceRuntime integrates with Action Enforcement

`integrations/action-enforcement-evidence-integration.ts` maps an
`evidence_required` `EnforcementDecision` onto an `EvidenceRequirement`, and
`checkEvidenceForEnforcementRequest()` attaches any type-matching supplied
evidence and reports `evidence_satisfied` / `evidence_missing` /
`evidence_rejected` / `evidence_expired`. **This check is purely advisory.**
It never blocks or allows execution by itself -- Action Enforcement's own
default-deny chain always owns the actual `EnforcementDecision`, and a host
must rerun enforcement to act on the result. Evidence satisfaction can
support a retry; it can never retroactively flip a decision Action
Enforcement already made.

## How Control Plane can consume evidence rows later

`integrations/control-plane-evidence-adapter.ts` builds a read-model-only
`EvidenceControlPlaneViewModel` (`SourceDocumentRow`, `EvidenceArtifactRow`,
`EvidenceRequirementRow`, `EvidenceSatisfactionRow`, `EvidenceReviewRow`,
`CitationRow`, `CitationAnchorRow`, `EvidenceLinkRow`, `EvidenceProofRow`,
`EvidenceEventRow`) directly from a live `EvidenceRuntime`, mirroring the
pattern in `domain-policy-pack-runtime/integrations/control-plane-policy-pack-adapter.ts`.
It never mutates the runtime and never synthesizes a row the runtime did not
itself produce. Wiring these rows into `aoc-control-plane`'s UI components is
left for a future sprint -- the adapter and its tests are the MVP surface.

## How Enterprise Demo can use evidence metadata later

`integrations/enterprise-demo-evidence-adapter.ts` derives demo-facing
scenario metadata, a proof-chain reference, and a JSON export snippet
directly from a real `EvidenceProof` -- nothing is invented. `aoc-enterprise-demo`
can compose this with existing policy-pack/approval/enforcement demo
scenarios once it is ready to show evidence-backed outcomes end-to-end; see
`fixtures/policy-pack-evidence-demo.fixture.ts`,
`fixtures/approval-evidence-demo.fixture.ts`, and
`fixtures/enforcement-evidence-demo.fixture.ts` for composable examples.

## Legal / compliance disclaimer

- Evidence records produced by this runtime are **not legal advice**.
- The presence of accepted evidence for a requirement (`valid: true` from
  `validateEvidenceForTarget`) is a **completeness** signal only -- it never
  proves legal compliance, contractual sufficiency, or regulatory adequacy.
- `SourceDocument.legalCompleteness` and `EvidenceReview` decisions are
  always **caller-asserted** labels. This runtime never inspects document
  content, never uses an LLM to interpret a contract/invoice/policy/event
  record, and never itself promotes a document to `verified_by_customer` or
  `verified_by_counsel` -- only a caller with actual, out-of-band
  confirmation of that fact may set those values.
- Legal sufficiency claims require explicit customer or counsel validation
  outside this runtime.

## Determinism

- Time and IDs are always injected via `EvidenceRuntimeContext`
  (`EvidenceRuntimeClock`, `EvidenceRuntimeIdGenerator`) -- never
  `Date.now()`, never `Math.random()`, never a UUID library.
- Every hash (`metadataHash`, `*Hash` fields on `EvidenceProof`,
  `eventHash`) is computed by the same `createDigest`/`stableStringify`
  pair used by every other AOC proof (`domain/evidence-proof.ts`), which
  recursively sorts object keys before hashing so ordering never affects
  the result.
- No LLM evaluates evidence or interprets a law, contract, policy, invoice,
  or event record anywhere in this runtime.
- No network calls anywhere in this runtime.
- No binary file parsing, no OCR -- source documents and evidence artifacts
  carry metadata, hashes and references only.

## Never overriding other runtimes' decisions (non-negotiable)

This runtime can *report* that evidence is satisfied, missing, rejected, or
expired. It can never, by itself:

- override a Recognition Runtime denial or `require_more_evidence` decision,
- override an Approval Runtime rejection,
- override a Domain Policy Pack Runtime `denied`/`requires_*` decision,
- override an Action Enforcement `execution_blocked`/`evidence_required`
  decision.

A host consuming this runtime's validation result must always rerun the
owning runtime's own decision path to act on newly-satisfied evidence.

## How to add a new evidence type

1. Add the new literal to `EvidenceRequirementType` (`domain/evidence-requirement.ts`)
   and `EvidenceArtifactType` (`domain/evidence-artifact.ts`) -- and to
   `SourceDocumentType` (`domain/source-document.ts`) if the new evidence
   has its own kind of source.
2. If a policy pack integration needs to map this type in from
   `PolicyEvidenceRequirementType`, extend the type-matching logic in
   `integrations/policy-pack-evidence-integration.ts`.
3. Add a fixture/scenario demonstrating the new type end-to-end (register
   source &rarr; submit artifact &rarr; create requirement &rarr; satisfy &rarr; proof).

## How to add a new citation target

1. Add the new literal to `CitationTargetType` (`domain/citation.ts`).
2. If the new target is owned by another AOC runtime, add a thin
   structural helper in the relevant `integrations/*.ts` file (mirroring
   `createCitationForApprovalTarget`/`createCitationForRecognitionDecision`)
   rather than importing that runtime's types directly.

## How to run tests

```
npm run build && node --test src/features/evidence-source-runtime
```

or run the full repository suite with `npm test`.
