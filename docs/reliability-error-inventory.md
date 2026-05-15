# Reliability Error Inventory (Prompt 12)

## Coverage audited
- `/api/v1/*` and `/api/sdk/*` route handlers
- capability + policy + agent/trust flows
- audit timeline and playground
- onboarding/projects/auth routes
- server actions and SDK client

## Classification summary
- **validation_error**: missing workspaceId/query/input schema violations.
- **authentication error**: unauthenticated API/SDK requests.
- **authorization error**: role checks, policy/capability denials.
- **tenant/workspace context error**: no workspace membership/context.
- **not found/inaccessible**: hidden as resource_not_found.
- **rate limit/quota/billing**: existing 402/429 patterns; mapped for standard envelopes.
- **upstream AI error**: `/api/ai/*` provider failures.
- **database error**: Supabase query failures, now normalized in SDK routes touched.
- **transient/network error**: SDK retry for safe GETs (408/429/5xx).
- **unexpected internal**: normalized to internal_error.

## Partial failure risks reviewed
- capability approval + grant creation + audit insert can partially fail.
- policy creation + audit insert can partially fail.
- agent registration + audit insert can partially fail.
- onboarding and playground multi-step actions can partially fail.

Current mitigation in this PR: standardized error reporting + server-side reliability logs to make partial failures visible and recoverable.
