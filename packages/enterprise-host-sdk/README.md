# @aoc-enterprise/enterprise-host-sdk

Minimal typed HTTP client for the **Soberanía Enterprise Host v1 API**.

Transport only, by design:

- one method per public endpoint (see `docs/enterprise/API_STABILITY_V1.md`)
- zero runtime dependencies (uses the global `fetch` of Node.js >= 18)
- no governance logic, no digest computation, no local decisions, no retries —
  every decision and every verification happens server-side and the caller owns
  its retry policy

## Install / build

The package is part of the Soberanía Enterprise workspace:

```bash
npm run build --workspace @aoc-enterprise/enterprise-host-sdk
npm test --workspace @aoc-enterprise/enterprise-host-sdk
```

## Usage

```ts
import { createEnterpriseHostClient, isEnterpriseHostApiError } from '@aoc-enterprise/enterprise-host-sdk';

const client = createEnterpriseHostClient({
  baseUrl: 'http://127.0.0.1:8080',
  apiKey: process.env.AOC_API_KEY,   // only when the Host runs with AOC_ENTERPRISE_REQUIRE_AUTH=true
  timeoutMs: 10_000,                 // default 30_000
});

// Health
const ready = await client.ready();

// Governance evaluation (idempotent when you pass an Idempotency-Key)
const decision = await client.evaluate(
  {
    actor: { id: 'agent-1', trustDomainId: 'td-acme' },
    action: { type: 'document.draft', resourceScope: 'project.alpha' },
    organization: { id: 'org-acme' },
  },
  { idempotencyKey: 'draft-document-42' },
);

if (decision.status === 'allowed') {
  // The durable record backing this decision:
  const record = await client.getEvaluation(decision.governanceRecord!.evaluationId);
  const verification = await client.verifyEvaluation(decision.governanceRecord!.evaluationId);
}

// Evidence
const bundle = await client.buildEvidence({ evaluationId: 'eval-1', level: 'AUDITOR', createdBy: 'auditor-7' });
const bundleCheck = await client.verifyEvidence('bundle-1');

// Assurance
const assessment = await client.createAssessment({
  subject: { subjectId: 'org-acme', subjectType: 'organization', organizationId: 'org-acme' },
  frameworkId: 'aoc.saf',
  frameworkVersion: '1.0.0',
  requestedBy: 'compliance-1',
});
await client.evaluateAssessment(assessment.assessmentId as string);
```

## Errors

Every non-2xx response throws:

| Error | Meaning |
|---|---|
| `EnterpriseHostApiError` | The Host answered with an error. `status` (HTTP), `code` (stable machine code, e.g. `INVALID_REQUEST`, `AUTHENTICATION_FAILED`, `GOVERNANCE_RECORD_NOT_FOUND`), `details` (validation messages), `body` (verbatim response). |
| `EnterpriseHostTimeoutError` | `timeoutMs` elapsed before a response. |
| `EnterpriseHostNetworkError` | No HTTP response at all (connection refused, reset, DNS). `cause` carries the underlying error. |

```ts
try {
  await client.getEvaluation('missing');
} catch (error) {
  if (isEnterpriseHostApiError(error) && error.status === 404) {
    // handle not-found
  }
}
```

Two Host endpoints intentionally use non-2xx statuses for *governed* outcomes,
not failures: `verifyPassport` and `verifyAssessment` respond `409` with the
raw verification result when the artifact fails verification, and `evaluate`
responds `422` for a governance **denial**. The SDK surfaces these as
`EnterpriseHostApiError` with the full body in `error.body` — inspect
`error.status` before treating them as infrastructure failures.

## Timeouts

Each request is aborted after `timeoutMs` (default 30 s) via `AbortSignal.timeout`.
Choose budgets per operation class: health checks 1–2 s, reads 5–10 s,
`evaluate`/`evaluateAssessment` 30 s+ (they perform full Kernel evaluation and
durable commits).

## Retries

The SDK never retries. Guidance for callers:

- **Safe to retry always:** all `GET` methods (`getEvaluation`, `getPassport`,
  `getAssessment`, `getContinuousState`, …) and the verify endpoints — they are
  read-only recomputations.
- **`evaluate`:** retry **only** with the same `idempotencyKey`. The Host
  replays the committed decision instead of re-evaluating; a key reused with a
  *different* payload is rejected with `409 GOVERNANCE_IDEMPOTENCY_CONFLICT`.
- **`issuePassport`:** retry only with the same body `idempotencyKey` field.
- **Other writes** (`processSignal`, `recordManualReview`, `appendFindingEvent`,
  `createAssessment`, passport lifecycle actions): not idempotent — do not
  retry blindly after a timeout; read the current state first.
- Retry on `EnterpriseHostNetworkError` and HTTP `503` with exponential backoff
  (e.g. 250 ms, 1 s, 4 s; 3 attempts). Do **not** retry `4xx` other than the
  idempotent replays above.

## Stability

The client tracks the frozen v1 HTTP surface. Additive Host changes (new
response fields) are non-breaking; the SDK types keep open index signatures so
new fields flow through without an SDK upgrade.
