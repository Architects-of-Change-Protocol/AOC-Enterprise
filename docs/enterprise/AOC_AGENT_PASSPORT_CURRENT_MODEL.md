# AOC Agent Passport — Current Model (Preliminary Analysis, PR-006)

This document is the required preliminary analysis for PR-006 (AOC
Enterprise Agent Passport Runtime v1). It inventories every existing
"Agent Passport" or "passport"-shaped concept in the repository *before*
any new code was written, so the new Passport Runtime reconciles with
what already exists instead of duplicating it. Every numbered item below
answers the corresponding question from the PR-006 mission.

## 1–2. Existing Agent Passport application and issuance flow

`apps/agent-passport-web/` is a commercial Next.js product: agent
enrollment, checkout/billing (Stripe), buyer accounts, organization
registries with team invitations/roles, and Passport issuance/verification
pages (`src/app/agent-passport/page.tsx`, `src/app/passport/[passportId]/
page.tsx`, `src/app/verify/[passportId]/page.tsx`). It does not define its
own Passport model — it wraps the real, generic **Agent Passport Core**
package, `packages/agent-governance/` (see item 14), via
`src/lib/passport-issuer.ts` (issuance), `src/lib/passport-adapter.ts`
(adaptation), and `src/lib/passport-repository.ts` /
`src/lib/persistence/sqlite-passport-repository.ts` (persistence).

## 3. Existing Passport schemas

The canonical schema already in production is
`packages/agent-governance/src/passport/passport-contracts.ts`:

```ts
interface AgentPassport {
  passportId; agentName; ownerId; ownerName; purpose;
  status: AgentPassportStatus; governanceLevel; riskTier; autonomyLevel;
  jurisdiction; constitutionVersion; constitutionHash;
  policyManifestVersion; policyManifestHash; passportHash;
  issuedAt; expiresAt?; lastVerifiedAt?; issuer; signature;
  verificationUrl; qrPayload; metadata?;
}
```

This is a **commercial, signed, QR/verification-URL-bearing credential**
with constitution/policy-manifest hashes — closer to a product artifact
than a governed identity aggregate. It has its own issuance
(`passport-issuance.ts`), verification (`passport-verification.ts`),
status transitions (`passport-status.ts`), events
(`events/passport-events.ts`), and an in-memory store
(`store/store-port.ts`, `createInMemoryAgentPassportStore`).

A second, much narrower Passport type already lives inside the Enterprise
Kernel's own dependency tree: `src/features/recognition-runtime/domain/
passport.ts`:

```ts
type PassportType = 'human_passport' | 'organization_passport' | 'agent_passport' | 'system_passport';
type PassportStatus = 'valid' | 'expired' | 'suspended' | 'revoked';
interface Passport {
  id; type: PassportType; subjectActorId; issuerActorId; trustDomainId;
  jurisdiction?; status: PassportStatus; issuedAt; expiresAt?;
  claims: Record<string, string>; proof?: RecognitionProof;
}
```

This is a lightweight "recognition credential" the Kernel's Recognition
Runtime consults as an authorization precondition
(`policies/valid-passport-policy.ts`); the Kernel's own reason-code
taxonomy (`src/kernel/reason-codes/reason-codes.ts`) includes
`RECOGNITION_PASSPORT_INVALID`, mapped from this runtime's `invalid_passport`
outcome. It has no constitution/policy-manifest/signature/QR fields.

## 4. Existing Passport APIs

`apps/agent-passport-web/src/app/api/agent-passports/route.ts`,
`.../[passportId]/route.ts`, `.../[passportId]/verify/route.ts`
(commercial product API, Next.js route handlers, not part of AOC
Enterprise's `src/enterprise/` HTTP surface).

## 5. Existing database tables

`apps/agent-passport-web/src/lib/db.ts` — its own SQLite database
(`better-sqlite3`, path via `AOC_AGENT_PASSPORT_DB_PATH`), schema created
inline (`CREATE TABLE IF NOT EXISTS` + `ensureColumn` ALTER-if-missing, no
migration files). Relevant table: `passports (id, purchase_id, registry_id,
passport_data JSON, status, issued_at, updated_at, revoked_at,
revoke_reason)` plus `purchases`, `stripe_webhook_events`,
`organization_registries`, `organization_registry_entitlements`, and
billing/team tables. This schema is entirely commercial-app-owned and
unrelated to `src/enterprise/`.

## 6. Existing organization relationships

`organization_registries` / `organization_registry_entitlements` in the
SaaS app model a commercial "who bought/administers this registry"
relationship — billing-shaped, not a governed trust-domain binding.
`recognition-runtime`'s `Passport.trustDomainId` is the closest existing
analogue to "organization recognizes this actor," and is what PR-006's
`AgentPassportOrganizationBinding.organizationId` is conceptually
continuous with (though the new model is Enterprise/Governance-Store
integrated, the old one is not).

## 7. Existing agent identity models

`packages/identity/` is an **empty scaffold** (`src/.gitkeep` only, a
`package.json` with no buildable code) — no identity descriptors exist
there today. `packages/agent-governance`'s `AgentPassport.agentName` /
`ownerId` / `ownerName` is the closest existing "who is this agent, who
owns it" model, but it is product-shaped (a display name and an owner id,
no `agentType`/`modelProvider` taxonomy).

## 8. Existing authority references

`src/features/authority-graph/domain/` defines `AuthorityNode`,
`AuthorityEdge`, `AuthorityChain`, `AuthorityGrant`, `DelegationGrant`,
`RoleAssignment`. `AuthorityEdgeType` already includes `'issues_passport'`
and `'issues_capability'` — the Authority Graph already models "an
authority issued a passport" as an edge type, but there is no
`AgentAuthorityReference`-shaped read model anywhere designed for
embedding inside a Passport aggregate.

## 9. Existing capability models

No `AgentCapabilityReference`-shaped type exists anywhere in the repo
today. `packages/capability-tokens/` has its own capability-token domain,
unrelated to any Passport.

## 10. Existing delegation models

`src/features/authority-graph/domain/delegation-grant.ts` and
`services/delegation-service.ts` model delegation as part of the Authority
Graph, not as a Passport-attached reference list.

## 11. Existing recognition models

`src/features/recognition-runtime/services/passport-service.ts`
(`PassportService` class) is a full in-memory
`issuePassport`/`getPassport`/`verifyPassport`/`suspendPassport`/
`revokePassport` surface with reason codes (`PASSPORT_NOT_FOUND`,
`PASSPORT_REVOKED`, `PASSPORT_EXPIRED`) — a genuine prior art for lifecycle
verbs, narrower in scope (no capability/authority/evidence references, no
event sourcing, no Enterprise Store integration) than PR-006's Passport
Runtime.

## 12. Existing status fields

Three independent status vocabularies already exist and do **not**
align 1:1:

| Source | Values |
|---|---|
| `recognition-runtime` `PassportStatus` | `valid`, `expired`, `suspended`, `revoked` |
| `agent-governance` `AgentPassportStatus` | see `passport-status.ts` (product-specific transition guards) |
| `pmfreak-agent-passport-foundation` `PMFreakPassportValidationStatus` | a 15-value trust lattice, demo-scoped |

PR-006 defines its own `AgentPassportStatus` (`draft`/`active`/`suspended`/
`revoked`/`expired`/`retired`) deliberately distinct from all three — see
"What must remain external," below.

## 13. Existing revocation behavior

`recognition-runtime`'s `PassportService.revokePassport` and
`agent-governance`'s `passport-status.ts` both already enforce
"revoked is terminal" as a guard. No prior art anywhere event-sources
revocation (both are direct field mutations on a stored row).

## 14. Existing Evidence references

None of the existing Passport implementations reference the AOC
Enterprise Governance Store or Evidence Bundle (PR-004/PR-005 did not
exist when they were built). `packages/agent-governance`'s
`passport-events.ts` and `pmfreak-agent-passport-foundation`'s
`pmfreak-evidence-requirement-mirror.ts` are structurally adjacent but
reference nothing from `src/enterprise/`.

## 15. Existing billing-specific Passport concepts

`apps/agent-passport-web`'s `purchases`, Stripe webhook handling, pricing
(`src/lib/pricing.ts`), and registry entitlements are entirely commercial
and explicitly **out of scope** for the Enterprise Passport Runtime — see
`AGENT_PASSPORT_MIGRATION_V1.md`.

## 16. Existing duplicated Passport implementations

At least four independent "Passport" concepts coexist today:
`recognition-runtime.Passport`, `agent-governance.AgentPassport`,
`pmfreak-agent-passport-foundation` (a demo-role wrapper over
`agent-governance`), and the fully-disclaimed, non-production
`src/features/aoc-enterprise-demo/pmfreak-agent-passport/` mock (superseded
by the foundation package). PR-006 adds a fifth, Enterprise-Governance-
integrated concept — deliberately, since none of the first four satisfy
this PR's requirements (event-sourced, org-bound, Governance/Evidence
referencing, minimal-disclosure views).

## 17. Existing UI-only fields

`agent-governance.AgentPassport.qrPayload` and `verificationUrl` are
UI/product-presentation fields with no analogue in, and no reason to
exist in, the Enterprise Passport Runtime's canonical model.

## 18. Existing production consumers

`apps/agent-passport-web` (commercial SaaS) and
`packages/pmfreak-agent-passport-foundation` (PMFreak demo, itself
consumed by `src/features/aoc-enterprise-demo/`) are the only real
consumers of `packages/agent-governance`. `src/features/
external-agent-handshake` consumes `recognition-runtime`'s `Passport`
concept (presentation/handshake, not issuance). Neither consumer touches
`src/enterprise/` today.

## 19. Existing tests

`apps/agent-passport-web/__tests__/*.test.ts` (12 files: issuance,
persistence, adapter, registry, billing, admin-access-recovery, etc.);
`packages/pmfreak-agent-passport-foundation/__tests__/*.test.ts` (6 files).
Both suites are green today and are **not modified** by this PR (see
item 21).

## 20. Existing compatibility risks

The only real risk is namespace/vocabulary collision: this PR introduces
its own `AgentPassport`, `AgentPassportStatus`, `AgentPassportEvent`, etc.,
under `src/enterprise/passport/`. These names are deliberately **not**
exported from the same module as `packages/agent-governance`'s
`AgentPassport` and are never imported by it or by
`apps/agent-passport-web` — see the Structural Boundaries tests added in
this PR (`src/enterprise/__tests__/structural-boundaries.test.ts`).

## 21. Existing tenant isolation

`recognition-runtime`'s `Passport.trustDomainId` and `agent-governance`'s
issuance flow are both single-tenant in practice (no
`GovernanceStoreAccessContext`-style enforced scoping). PR-006's
`PassportAccessContext` enforcement (mirroring the Governance Store and
Evidence Bundle Store exactly) is new.

## 22. Existing data integrity

`agent-governance`'s `passport-hash-core.ts` computes a `passportHash`
over the issued Passport — a single-hash integrity mechanism, not an
append-only event chain. Neither existing implementation has anything
resembling PR-006's per-Passport hash chain.

## 23. Existing mutation methods

Both `recognition-runtime.PassportService` and `agent-governance`'s
store mutate a Passport row directly (`suspendPassport`,
`revokePassport`, etc., as field updates) — there is no existing
append-only/event-sourced Passport anywhere in the repository. PR-006's
"append an event, reconstruct the state" discipline is new.

## 24. Existing Passport exports

`packages/agent-governance/src/index.ts` publicly exports its
`AgentPassport` model; `src/features/recognition-runtime/index.ts`
exports its own `Passport`. Neither is re-exported from
`src/enterprise/index.ts` prior to this PR.

## 25. Existing documentation claims

`packages/agent-governance/docs/agent-passport-core.md` and
`docs/runtime-guard-lite.md` document the commercial Passport Core and its
Runtime Guard Lite; they make no claims about Governance Store/Evidence
Bundle integration, event sourcing, or disclosure views — none of PR-006's
claims conflict with them.

## 26–27. What is real vs. scaffolding

**Real, in production**: `packages/agent-governance` (issuance,
verification, signing, store) and `apps/agent-passport-web` (the
commercial product built on it). **Real, in the Kernel's own request
path**: `recognition-runtime.Passport` and its policy check. **Scaffolding
only**: `packages/identity` (empty), the disclaimed
`aoc-enterprise-demo/pmfreak-agent-passport` mock (explicitly non-
production), and `GovernanceReferenceRecord.referenceType: 'passport_event'`
/ `EvidenceReferenceType: 'passport'` (PR-004/PR-005 reserved forward
references — structure only, nothing consumes them until this PR).

## 28. What must be reused

- `../governance-store/canonical-json.js` (`canonicalSerialize`,
  `AOC_CANONICALIZATION_VERSION`) and `../governance-store/digest.js`
  (`computeDigest`, `isWellFormedDigest`) — imported directly, not
  reimplemented (mission section 37).
- The module lifecycle contract (`EnterpriseModule`,
  `EnterpriseModuleDescriptor`) and registry
  (`createEnterpriseModuleRegistry`) from PR-003.
- The `GovernanceStoreAccessContext`-shaped tenant-scoping pattern
  (`system`/`organizationId`/`actorId`), reused verbatim as
  `PassportAccessContext`.
- `GovernanceReferenceRecord.referenceType: 'passport_event'` and
  `EvidenceReferenceType: 'passport'` — the forward references PR-004/
  PR-005 already reserved are exactly what PR-006's
  `PassportGovernanceReference`/`PassportEvidenceReference` fulfil.

## 29. What must remain external

`packages/agent-governance`, `apps/agent-passport-web`,
`packages/pmfreak-agent-passport-foundation`, and
`src/features/recognition-runtime` are all **untouched** by this PR. The
new `src/enterprise/passport/` Runtime is additive and structurally
independent — see `AGENT_PASSPORT_MIGRATION_V1.md` for how the two
worlds relate going forward.

## 30. Files expected to change

New: `src/enterprise/passport/**`, `src/enterprise/modules/passport-module.ts`,
`src/enterprise/api/passport-contract.ts`,
`src/enterprise/__tests__/passport-*.test.ts`, this document, and the
other PR-006 docs. Modified: `src/enterprise/composition/composition-root.ts`
(wires the Passport Store/Service), `src/enterprise/adapters/
node-http-adapter.ts` (routes), `src/enterprise/api/enterprise-http-errors.ts`
(error taxonomy), `src/enterprise/configuration/enterprise-configuration.ts`
(passport config), `src/enterprise/telemetry/enterprise-telemetry.ts`
(passport counters), `src/enterprise/index.ts` (public exports),
`src/enterprise/__tests__/module-lifecycle-integration.test.ts` and
`src/enterprise/__tests__/structural-boundaries.test.ts` (updated/extended
for the new module). **Not changed**: `src/kernel/**`,
`src/enterprise/governance-store/**`, `src/enterprise/evidence/**`,
`packages/agent-governance/**`, `apps/agent-passport-web/**`.
