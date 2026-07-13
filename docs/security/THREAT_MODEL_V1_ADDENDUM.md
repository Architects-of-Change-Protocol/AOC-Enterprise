# Threat Model Addendum — Protocol-Specific Attack Classes (PR-RC Objective 6)

Supplement to `THREAT_MODEL_V1.md`, reviewing the digest/canonicalization/versioning attack classes specific to the AOC integrity protocol. For each class: the mechanism that defeats it (with source location), or an explicit gap statement. Verification points refer to code, not documentation.

## 1. Digest attacks

### 1.1 Digest downgrade — **covered**
There is no weaker algorithm to downgrade to: `computeDigest` (`governance-store/digest.ts`) hard-codes SHA-256, rejects any canonicalization version other than `aoc.canonical-json.v1`, and every integrity block stamps `algorithm: 'sha256'`. Digest shape is validated against `^sha256:[0-9a-f]{64}$` (`DIGEST_PATTERN`); a digest labeled with any other algorithm is malformed and fails well-formedness checks (e.g. passport chain verification rejects on `isWellFormedDigest` before comparing). A future v2 algorithm would require a new canonicalization/algorithm version — the version guard makes silent substitution impossible.

### 1.2 Digest substitution (transplanting a valid digest onto other content) — **covered**
Digest inputs bind identity and context, not just content: assurance section digests are computed over `{ section identity + content }` and sealed by a top-level `assessmentDigest`; evidence `verificationDigest` binds `bundleDigest` + `recordDigest` + policy; passport event digests bind `passportId`, `sequence`, and `previousEventDigest`. Verification always **recomputes from stored content** and compares — a transplanted digest fails recomputation because the surrounding content is part of the input.

### 1.3 Digest replay (presenting an old-but-valid digest as current) — **covered**
Governance records chain (`chain_position UNIQUE` + `previous_aggregate_digest`): replacing a record with an older valid one breaks linkage at the successor. Passport chains likewise (contiguous `sequence` + `previousEventDigest`). Assurance supersession keeps old assessments verifiable but marked `superseded` in the store overlay; continuous state derives from the *latest completed* assessment plus signals, so serving a stale assessment as current is detectable via `supersededByAssessmentId` and the store's ordering, not just the digest.

### 1.4 Cross-tenant digest reuse — **covered**
Digest inputs include tenant-bearing content (`organizationId` is part of the digested record/assessment/passport subject), so an org-A artifact's digest cannot validate org-B content. Additionally, assurance verification checks evidence tenant binding explicitly (`verification.ts` evidence-tenant check), and store reads are tenant-scoped before any digest is even returned (load-test correctness phase proves 0 cross-tenant leaks under concurrency).

## 2. Canonicalization attacks

### 2.1 Canonical JSON mismatch / ambiguity — **covered**
Exactly one canonicalizer exists (`canonical-json.ts`), imported by every digesting domain — verified by grep during PR-008 audit; no second implementation to diverge from. It is total and deterministic over accepted inputs: key sorting by UTF-16 code units, `-0 → 0`, `undefined`-keys omitted, arrays order-preserving, and it **rejects** everything representationally ambiguous (non-finite numbers, `bigint`, functions/symbols, circular references, non-plain prototypes, invalid dates) with `CanonicalSerializationError`. Version pinning (`aoc.canonical-json.v1`, enforced in `computeDigest`) prevents a different canonicalization from ever being silently accepted.

### 2.2 JSON normalization attacks (duplicate keys, `__proto__`, number forms, Unicode) — **covered with one documented residual**
Inbound JSON passes through `JSON.parse` (last-duplicate-key-wins, no prototype execution) and then through shape validators; what is digested is the *parsed value* re-serialized canonically, so wire-format tricks (duplicate keys, whitespace, exponent notation) cannot produce two different digests for one stored value or one digest for two values. Prototype pollution via `__proto__` keys: `JSON.parse` creates own-properties only, and `canonicalSerialize` reads own enumerable keys — no merge/assign of untrusted objects into shared state exists on the digest path.
**Residual (accepted, documented in THREAT_MODEL §8.6):** no Unicode normalization — canonically-equivalent but differently-encoded strings digest differently. Deterministic and consistent; normalizing post-hoc would break every existing digest. Consumers comparing digests across systems must compare code points, not glyphs.

## 3. Framework attacks

### 3.1 Framework poisoning — **covered**
Frameworks are code registered at composition time, structurally validated (`framework-validation.ts`: weight sums, criteria bounds, no orphan controls), register-once, and the registry **freezes** before traffic. No HTTP path writes frameworks; the store's `saveFramework` requires a system context and is immutable per `(frameworkId, frameworkVersion)` (PK + explicit "already persisted; framework versions are immutable" error).

### 3.2 Framework version substitution — **covered**
Assessments freeze `frameworkId@frameworkVersion` in their scope at creation; verification re-resolves the framework by that exact pair and fails on identity mismatch (`verifyAssuranceAssessment` framework identity check). The persisted framework definition is stored verbatim at registration, so a differing definition under the same version is rejected by the immutability constraint, and the release manifest records the SAF v1 definition digest for out-of-band comparison.

### 3.3 Version poisoning (store/schema/runtime version spoofing) — **covered**
All three SQLite stores refuse to open a database whose recorded schema version differs from the runtime's (fail closed; PR-008 H-3, regression-tested). Records stamp kernel/enterprise/runtime versions into provenance at write time; the canonicalization version is enforced on every digest computation; the release manifest pins runtime/schema/framework versions with artifact checksums.

## 4. Artifact substitution & replay

### 4.1 Evidence Bundle substitution — **covered**
A bundle binds to its governance record twice: `recordDigest` (carried from the record's `aggregateDigest`) and `verificationDigest` (computed over bundle + record + policy binding). `verifyEvidenceBundle` recomputes both and optionally re-checks against the live record; a bundle re-pointed at different record content fails. Disclosure-policy substitution (presenting a PUBLIC projection as AUDITOR) fails the policy-match check against the registered policy.

### 4.2 Passport replay — **covered**
Issuance replay is idempotency-key + subject-digest bound (same key, different subject → conflict). Event replay/duplication is structurally unappendable: `UNIQUE(passport_id, sequence)` + contiguous-sequence enforcement + `previousEventDigest` linkage; the load-test race probe demonstrates exactly-one-winner semantics under 32-way contention.

### 4.3 Passport reference substitution — **covered**
Linking a governance record or evidence bundle to a passport verifies the referenced artifact's digest at link time (`service.ts`: `aggregateDigest`/`bundleDigest` comparison against the live store) and stores the digest in the reference; `verifyAgentPassport` in `REFERENTIAL`/`FULL_INTERNAL` modes re-checks reference existence and digest well-formedness. A reference re-pointed after linking fails verification.

### 4.4 Governance Record replay — **covered**
Idempotency scope is tenant-qualified; same key + same payload digest → recorded replay (explicitly marked as replayed); same key + different payload → `409 GOVERNANCE_IDEMPOTENCY_CONFLICT`. Whole-record replay into the chain is blocked by `request_id UNIQUE`, `evaluation_id/decision_id UNIQUE`, and the chain-position ordering.

### 4.5 Assessment replay — **covered**
Assessment ids are store-unique; completed assessments are immutable (`ASSURANCE_ASSESSMENT_IMMUTABLE`); re-running produces a *new* assessment linked via `previousAssessmentId`/`supersedesAssessmentId`, never a rewrite. A replayed old assessment presented as current is distinguishable by the supersession overlay and continuous-state derivation (§1.3).

## 5. Projection & report attacks

### 5.1 Projection tampering — **covered**
Projections (passport projection rows, assurance projection tables, evidence bundles, reports, disclosure views) are explicitly derived caches; source of truth is the event log / canonical JSON, and every verification path recomputes from source, never from the projection. A tampered projection row changes reads but cannot survive `verify`.

### 5.2 Report forgery assumptions — **covered as documented assumption**
Reports carry `reportDigest` over their content + generation context, so post-generation tampering is detectable *given the digest*. What v1 deliberately does **not** provide is non-repudiation: digests are integrity checks, not signatures (`digest.ts` states this; THREAT_MODEL §8.2 accepts it). A forger who fabricates an entire report *and* its digest produces an internally consistent artifact that fails only when checked against the issuing store (whose assessment digests it cannot match without the store's content). Verification against the issuing Host is therefore the trust anchor; offline third-party verification without store access is a documented v1 limitation (post-v1: signature layer).

## 6. Signal & review abuse (protocol view)

### 6.1 Continuous signal abuse — **covered**
Signals are typed (closed enum), deterministically mapped to severities/outcomes, digest-sealed, append-only, attributable, and can never rewrite a completed assessment — worst case they mark state stale and recommend reassessment. Flood-rate limiting is a reverse-proxy control (accepted risk §8.4).

### 6.2 Manual review abuse — **covered**
Attributable reviewer + rationale mandatory; role gating where the control demands it; evidence references required where the control demands them (enforced — the benchmark had to supply them); reviews are digest-sealed and append-only; completion with pending reviews is refused unless the framework policy is explicitly `provisional`.

## 7. Gaps identified by this review

1. **No signature layer / offline non-repudiation** (§5.2) — accepted for v1, constitutionally constrained; the highest-value post-v1 security addition.
2. **Unicode normalization residual** (§2.2) — deterministic, documented; revisit only with a v2 canonicalization version.
3. **Reads don't re-verify** — verification is explicit and scheduled (runbooks); unchanged from THREAT_MODEL §8.5.
4. **No new uncovered attack classes were found in this review.** All nineteen classes in the PR-RC objective map to a concrete mechanism or an explicitly accepted, documented risk above.
