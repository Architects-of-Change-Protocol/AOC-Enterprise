# @aoc-enterprise/commercial-demo

**AOC Architectural Consolidation Program, Sequence R006.A — Commercial Reference Demo.**

An executable proof that the frozen Access Governance lifecycle
(`docs/architecture/ADR-ACCESS-LIFECYCLE.md`, R005.0) — `EnterpriseResourceEnvelope`
→ `EnterpriseAccessDecision` → `EnterpriseAccessObligation` → `EnterpriseAccessGrant`
→ Provider Translation → the Pinata Provider Adapter → `EnterpriseUsageEvent`
→ `EnterpriseEvidenceCorrelation` — is not just architecturally sound, but
solves a real commercial problem end to end.

**This package changes nothing upstream.** It imports the seven frozen
Access Governance contracts, `@aoc-enterprise/provider-adapter`,
`@aoc-enterprise/provider-translation`, and `@aoc-enterprise/pinata-adapter`
exactly as shipped, and composes them. No Enterprise contract, adapter,
translation model, or conformance suite is modified.

## The business scenario

**Meridian Diligence** is an enterprise data-room platform used by law
firms and corporate development teams to run M&A due-diligence document
exchanges. During a live acquisition, a target company's most sensitive
records — financial models, cap tables, IP schedules — must be shared with
a narrow, constantly-changing set of counterparties (outside counsel,
lenders, auditors) while the deal is still confidential and can still fall
through.

A signed URL cannot do this job:

- It is a bearer secret. Anyone holding it has access, and it cannot be
  selectively revoked without rotating every other counterparty's link too.
- It carries no record of which policy allowed it, who approved it, or what
  conditions (watermarking, read-only, a time limit) were supposed to apply.
- It leaves no correlated evidence trail. When a deal leaks, there is no way
  to reconstruct who requested access, who approved it, and who actually
  opened the file — only that a link existed.

The reference asset is **`Project Solstice — Confidential M&A Target
Report.pdf`**, registered as an `EnterpriseResourceEnvelope` whose
`location.system` is `'pinata'`.

## What this package demonstrates

Run with `npm run demo` (see below). One happy path, four canonical
failures, and an audit reconstruction:

1. **Happy path** — outside counsel is granted conditional access, three
   obligations are attached (`read-only`, `time-limit`, `watermark-content`
   — the last one flagged as unsupported by Pinata's own capability
   declaration, a governance gap surfaced *before* the grant is used), a
   grant is issued, translated, and executed against a mock Pinata client,
   exercised three times without ever triggering a `ContentDownloaded`
   event, then administratively revoked when the deal ends.
2. **Denied access** — an unverified external contact is refused outright;
   nothing downstream of the decision is ever created.
3. **Expired grant** — a grant from a prior diligence round has already
   lapsed; translation is refused with `failureReason: 'grant-expired'`
   before any provider call is made.
4. **Unsupported capability** — a policy obligation asks the provider to
   self-report usage (`RegisterUsage`); Pinata's own declared capabilities
   don't include that, so the translation is refused with
   `failureReason: 'capability-unsupported'`, never silently ignored.
5. **Provider failure** — Pinata is unreachable; the adapter normalizes the
   outage into `failureReason: 'provider-unavailable'` and Enterprise
   records an `AccessFailed` usage event. The grant itself is untouched.
6. **Audit reconstruction** — starting from nothing but the happy path's
   final `EnterpriseEvidenceCorrelation` id, `LifecycleRecordStore.reconstructAccessHistory`
   dereferences every reference the correlation graph carries and answers:
   who requested, who approved, when granted, when used, when revoked.

Pinata is only ever reached through `@aoc-enterprise/pinata-adapter`'s own
`PinataProviderClient` interface — this package never imports the `pinata`
SDK, and never needs a real Pinata account, JWT, or network call (see
`src/mock-pinata-client.ts`).

## Running the demo

```sh
npm run demo
```

This builds the package, prints the full business-readable transcript to
the console, and writes the same content as a self-contained HTML report
and a Markdown report under `demo-output/`.

From the repository root:

```sh
npm run demo:commercial
```

## Architecture validation

This package is itself a validation exercise, in the same spirit as
`@aoc-enterprise/pinata-adapter`'s own README ("if implementing a provider
had required changing any Enterprise concept, this sequence would have
stopped"): if wiring a complete, realistic commercial scenario through the
frozen lifecycle had required a new field, a new obligation type, a new
usage-event category, or a change to any of the seven contracts, the
Provider Adapter, or the Provider Translation model, this sequence would
have stopped and reported architectural drift instead of proceeding. It
did not. Every artifact this package produces is a real, independently
valid instance of an already-frozen contract — see `__tests__/run-demo.test.ts`,
which asserts every constructed record against its own package's
`validate*` function, and `__tests__/conformance.test.ts`, which wraps this
package's own Pinata usage in an `EnterpriseProviderConformanceHarness`
(`@aoc-enterprise/provider-conformance-suite`, R005.D) and asserts it
certifies clean.

## What this package is not

- Not a new architecture, database, queue, or distributed system.
- Not a production authentication mechanism — `mock-pinata-client.ts` is
  explicitly a demo/test fixture, mirroring the same dependency-injection
  seam `packages/pinata-adapter/__tests__` already uses.
- Not a dashboard — the HTML/Markdown reports are this demo's own output,
  not a new UI surface.
