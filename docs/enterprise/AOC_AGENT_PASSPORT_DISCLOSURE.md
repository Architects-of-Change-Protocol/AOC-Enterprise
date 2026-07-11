# AOC Agent Passport Disclosure Views (PR-006)

Implementation: `src/enterprise/passport/disclosure.ts`. The full
Passport must not always be exposed — a view is a derived, pure
projection; building one never mutates the Passport, mirroring the
Evidence Bundle's `Truth ≠ Disclosure` principle. Passport views classify
Passport fields on their own terms — the field set is **not** assumed
identical to Evidence Bundle disclosure policies, even where the level
names coincide.

## View types

```ts
type AgentPassportViewType = 'INTERNAL' | 'AUDITOR' | 'PARTNER' | 'CUSTOMER' | 'PUBLIC';
```

| View | Subject fields | Claims | Evidence References |
|---|---|---|---|
| `INTERNAL` | Full: agentId, agentType, displayName, description, modelProvider, modelFamily, systemOwnerId, operationalOwnerId, organizationId, workspaceId, departmentId | All | All |
| `AUDITOR` | agentId, agentType, displayName, organizationId | All | All |
| `PARTNER` | agentId, agentType, displayName, organizationId | `passport.active`, `passport.not-revoked`, `organization.bound`, `capability.referenced` | None |
| `CUSTOMER` | agentType, displayName | `passport.active`, `passport.not-revoked` | None |
| `PUBLIC` | passportId only | `passport.not-revoked` | None |

`AUDITOR` additionally corresponds to "identity, status, authority
references, evidence references, lifecycle and integrity" per the
mission's description — the full reconstructed `status` and
`AgentPassportIntegrity`-backed digests are always present on the view
envelope itself (`view.status`, `view.integrity`), regardless of view
type; the table above lists what is added to the `subject`/`claims`/
`evidenceReferences` sections specifically.

`PARTNER` corresponds to "minimal agent identity, organization, current
status and approved capability claims"; `CUSTOMER` to "only information
needed to understand the agent interacting with the customer"; `PUBLIC`
to "minimal identity and current verification state."

An unknown view type raises `PASSPORT_VALIDATION_ERROR` — there is no
implicit fallback to a broader view.

## View model

```ts
interface AgentPassportView {
  viewId; passportId; viewType: AgentPassportViewType;
  generatedAt; generatedBy;
  subject: Record<string, unknown>;
  status: string;
  claims: readonly AgentPassportClaim[];
  evidenceReferences: readonly PassportEvidenceReference[];
  provenance: AgentPassportViewProvenance;
  integrity: AgentPassportViewIntegrity;
}
```

`status` is always the Passport's real current status (including
`revoked`) — a view discloses less detail, it never lies about lifecycle
state. A revoked Passport's `PUBLIC` view still reports
`status: 'revoked'` and `passport.not-revoked: false`.

## Three distinct digests

```
Passport Event Chain Digest   (events.ts's per-event eventDigest / chain)
        ≠
Passport State Digest          (view.provenance.passportStateDigest)
        ≠
Passport View Digest           (view.integrity.viewDigest)
```

`passportStateDigest` is computed over a bounded summary of the
reconstructed Passport (`passportId`, `status`,
`updatedThroughEventId`, `integrity`) and is identical across every view
built from the same Passport state — proving all views describe the same
underlying Passport without requiring the recipient to see the full
Passport. `viewDigest` additionally covers the view's own `viewType`,
`subject`, `claims`, and `evidenceReferences`, so it differs across view
types by construction (different disclosure ⇒ different digest) even
though `passportStateDigest` stays constant.

Both digests are SHA-256 over `aoc.canonical-json.v1`, reusing
`computeDigest`/`AOC_CANONICALIZATION_VERSION` from the Governance
Store — never a new canonicalizer.

## What a view never leaks

- Raw event fields (`eventId`, `eventDigest`, `previousEventDigest`,
  event `payload`) — a view is built from the *reconstructed* Passport,
  never from iterating its events directly.
- The full Governance Record or Evidence Bundle content behind a
  reference — only the bounded `PassportGovernanceReference`/
  `PassportEvidenceReference` shape (and only on `INTERNAL`/`AUDITOR`).
- Authority/delegation scope details beyond what `INTERNAL`/`AUDITOR`
  expose in the reconstructed Passport itself (views below `AUDITOR`
  surface no authority/delegation data at all).

## Building a view

```ts
service.buildView(context, passportId, viewType, generatedBy)
```

Reconstructs the current Passport (tenant-scoped via `context`), then
calls `buildAgentPassportView` (`disclosure.ts`) — the service never
assembles a view's field set by hand; `disclosure.ts` is the single
place that decides what each view type discloses. See the "Passport
disclosure views are built only through the shared projector" structural
boundary test.
