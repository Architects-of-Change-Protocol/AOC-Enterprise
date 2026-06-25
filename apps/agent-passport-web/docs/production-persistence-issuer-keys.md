# Production Persistence + Passport Issuer Key Management

This document describes the architecture and operational guide for the production persistence and issuer key management sprint.

## Overview

This sprint converts the MVP in-memory stores to SQLite-backed persistence, adds environment-driven issuer key management, secures enrollment gating via server-side purchase verification, and implements Stripe webhook handling.

## Architecture

### SQLite Database (`src/lib/db.ts`)

- Opens at `AGENT_PASSPORT_DB_PATH` (default: `.data/agent-passport.sqlite`)
- Creates `.data/` directory automatically on first run
- WAL journal mode for concurrent reads
- Foreign key enforcement enabled
- Three tables: `purchases`, `passports`, `stripe_webhook_events`

### Issuer Key Management (`src/lib/issuer-config.ts`)

| Environment | Behavior |
|-------------|----------|
| `NODE_ENV !== 'production'` | Safe dev fallback (issuerId=`dev-issuer`, keyId=`dev-hmac-key`) |
| `NODE_ENV === 'production'` | Throws if any required env var is missing |

Required production env vars:
- `PASSPORT_ISSUER_ID`
- `PASSPORT_ISSUER_NAME`
- `PASSPORT_ISSUER_KEY_ID`
- `PASSPORT_SIGNING_SECRET` (min 32 chars, high entropy)

### Passport Signing (`src/lib/passport-issuer.ts`)

HMAC-SHA256 signatures over canonical JSON (keys sorted, `signature` field excluded before signing). Constant-time comparison for verification to prevent timing attacks.

### Purchase Repository (`src/lib/purchase-repository.ts`)

Purchase lifecycle:

```
pending → completed → [enrollment: not_started → started → passport_issued]
        ↘ expired
        ↘ failed
```

Key functions:
- `createPurchaseRecord(tier)` — called at checkout session creation
- `markPurchaseCompleted(id, { buyerEmail, stripePaymentIntent })` — called by webhook
- `canEnrollWithPurchase(id)` — true only if `status=completed && enrollmentStatus!=passport_issued`
- `markPurchasePassportIssued(id, passportId)` — prevents double issuance

### Stripe Webhook (`src/app/api/stripe/webhook/route.ts`)

- Verifies `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET`
- Deduplicates events by `stripe_event_id` (idempotent)
- Persists all events to `stripe_webhook_events` for audit
- Handles: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `checkout.session.async_payment_succeeded`

### Enrollment Gating

The enroll-agent page now requires `?session_id=<stripeSessionId>` in the URL. The server action verifies the purchase server-side before issuing a passport.

**Old flow (insecure):** `?checkout=success` in URL — trusted without verification  
**New flow (secure):** `?session_id=<id>` → server looks up purchase in DB → validates status=completed

## Running Locally

1. Copy `.env.example` to `.env.local` and fill in values
2. Run `npm run dev` — the SQLite DB is created automatically at `.data/agent-passport.sqlite`
3. For Stripe webhooks in dev, use the Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
4. Set `STRIPE_WEBHOOK_SECRET` to the value from the Stripe CLI

## Database Migrations

No migration tool is used currently. The schema is applied with `CREATE TABLE IF NOT EXISTS` on every startup. New columns must be added with `ALTER TABLE` migrations for existing deployments.

## Security Notes

- `PASSPORT_SIGNING_SECRET` must be high-entropy (min 32 chars); rotate via key ID versioning
- `.data/` directory is gitignored — never commit the SQLite file
- The webhook endpoint returns HTTP 200 even on business logic failures (to prevent Stripe retry storms); internal errors are logged and recorded in `stripe_webhook_events`
- Passport issuance is idempotent-protected: a purchase can only issue one passport (`canEnrollWithPurchase` returns false after `passport_issued`)
