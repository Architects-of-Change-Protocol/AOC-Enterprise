# AOC Agent Passport — Marketing & Stripe Checkout

Sprint documentation for the marketing landing page and Stripe Checkout integration.

## Product Tiers

Three commercial tiers are defined in `src/lib/pricing.ts`.

| Key | Name | Price | Billing |
|-----|------|-------|---------|
| `agent_passport_single` | Agent Passport | $99 | one-time |
| `governed_agent` | Governed Agent | $299 | one-time |
| `organization_agent_registry` | Organization Agent Registry | $999 | per month |

### Agent Passport ($99 one-time)

For founders, builders, and teams that need a verifiable identity and public governance page for one AI agent.

Includes: Passport ID, Agent Constitution, Policy Manifest, Runtime Seal, public verification page, QR payload, badge snippet, Runtime Guard demo, basic governance evidence.

### Governed Agent ($299 one-time)

For teams deploying agents that need stronger declared governance, runtime guard readiness, and richer policy documentation.

Includes everything in Agent Passport plus: enhanced policy manifest, Runtime Guard readiness report, human oversight mapping, prohibited action review, governance summary, Runtime Guard simulation.

### Organization Agent Registry ($999/month)

For organizations registering multiple AI agents under a shared governance framework.

Includes: up to 10 agent passports, organization-level registry, shared owner profile, governance consistency review, Runtime Guard readiness across agents, public verification pages, badge snippets, monthly governance export, priority implementation support.

---

## Environment Variables

Set these before running in production:

```
# Stripe keys
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Stripe price IDs (created in Stripe dashboard)
STRIPE_PRICE_AGENT_PASSPORT_SINGLE=price_...
STRIPE_PRICE_GOVERNED_AGENT=price_...
STRIPE_PRICE_ORG_AGENT_REGISTRY=price_...

# Base URL for Stripe redirect URLs
NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL=https://your-domain.com
```

See `.env.local.example` for a local development template.

---

## Stripe Setup

### 1. Create a Stripe account

Go to [stripe.com](https://stripe.com) and create an account.

### 2. Create products and prices

In the Stripe dashboard, create three products:

- **Agent Passport** — $99 one-time payment
- **Governed Agent** — $299 one-time payment
- **Organization Agent Registry** — $999/month recurring

Copy each price ID (`price_...`) into the corresponding env var.

### 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the values.

### 4. Test with Stripe test keys

Use `sk_test_...` and `pk_test_...` keys during development. Use Stripe's test card `4242 4242 4242 4242` to simulate successful payments.

---

## Checkout Flow

1. User clicks a **Get Agent Passport** / **Get Governed Agent** / **Start Organization Registry** button on `/agent-passport` or `/pricing`.
2. The `CheckoutButton` component POSTs to `POST /api/checkout/session` with `{ tier }`.
3. The API route validates the tier, resolves the Stripe price ID from env, creates a Stripe Checkout Session, and returns `{ url, sessionId }`.
4. The browser redirects to the Stripe-hosted checkout page.
5. On successful payment, Stripe redirects to `/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier={tier}`.
6. On cancellation, Stripe redirects to `/checkout/cancel?tier={tier}`.

### API route: `POST /api/checkout/session`

**Input:**
```json
{ "tier": "agent_passport_single" }
```

**Valid tier values:** `agent_passport_single`, `governed_agent`, `organization_agent_registry`

**Success response:**
```json
{ "url": "https://checkout.stripe.com/...", "sessionId": "cs_..." }
```

**Error responses:**
- `400` — invalid or missing tier
- `503` — Stripe not configured (missing env vars)
- `500` — Stripe API error

**Organization registry mode:** Created as `subscription` mode; other tiers use `payment` mode.

---

## Success Flow (`/checkout/success`)

After Stripe redirects back, the success page:
- Reads `session_id` and `tier` from query params
- Shows confirmation state
- Links to `/enroll-agent?tier={tier}&checkout=success&session_id={session_id}`
- Shows the Stripe session ID for reference

---

## Cancel Flow (`/checkout/cancel`)

After cancellation, the cancel page:
- Shows a cancellation message
- Links back to `/pricing`
- Links to `/sample-passport`
- States clearly that no payment was completed

---

## MVP Payment Gating

Enrollment at `/enroll-agent` is gated behind a payment marker.

### How it works

If the query param `checkout=success` is **not** present, `/enroll-agent` shows a "Payment required" state with a link to `/pricing`.

If `checkout=success` is present (set by the success redirect URL), the enrollment form is shown.

**After payment, the link to enroll is:**
```
/enroll-agent?tier={tier}&checkout=success&session_id={session_id}
```

### In-memory purchase tracking (`src/lib/purchase-store.ts`)

Four functions for MVP purchase session tracking:

```typescript
createPendingPurchase(tier)       // Create a pending session
markPurchaseComplete(sessionId, tier)  // Mark as paid
getPurchase(sessionId)            // Retrieve purchase record
canEnrollWithPurchase(sessionId)  // Check if enrollment is allowed
```

**Note:** Purchase records are stored in-memory and are lost on server restart. Production requires persistent storage.

---

## Current Limitations

1. **In-memory storage** — Passports and purchase records are lost on server restart.
2. **Dev signer only** — Passports are signed with a test HMAC key, not a production issuer key.
3. **No webhook processing** — Payment confirmation relies on the Stripe redirect URL, not webhooks. A user who closes the browser before redirect would not be confirmed.
4. **No auth** — There is no user account system. Anyone with the enrollment URL can enroll.
5. **No customer portal** — No way to view past purchases or manage subscriptions.
6. **MVP gating is URL-based** — The `checkout=success` query param is not cryptographically verified.

---

## Future Production Requirements

1. **Persistent storage** — Database for passports and purchase records.
2. **Production issuer key management** — HSM or secrets manager for signing keys; rotate dev key.
3. **Stripe webhooks** — `POST /api/stripe/webhook` to handle `checkout.session.completed` events for reliable payment confirmation.
4. **Auth** — User accounts to associate passports with buyers.
5. **Customer portal** — Stripe Customer Portal for subscription management.
6. **Rate limiting** — Protect enrollment and checkout endpoints.
7. **Audit logging** — Record all enrollment and payment events.

---

## Suggested Next Sprint

**Production Persistence + Passport Issuer Key Management**

Once checkout exists, the biggest risk is selling passports that disappear after server restart or are signed with a development/test signer. Production persistence (database) and issuer key management (production signing key) are the next required hardening layers.

## Update: Server-Side Enrollment Verification (Production Persistence Sprint)

The enrollment gating has been updated from client-side URL parameter trust to server-side purchase verification:

- **Old:** `/enroll-agent?checkout=success` — any user could bypass by adding the query param
- **New:** `/enroll-agent?session_id=<stripeSessionId>` — server looks up the purchase record in SQLite and verifies `status=completed` before allowing enrollment

The checkout success page now redirects to `/enroll-agent?session_id={CHECKOUT_SESSION_ID}` instead of `/enroll-agent?checkout=success`.

See `docs/production-persistence-issuer-keys.md` for full details.

## Organization Registry Update (Sprint 3)

Buyers purchasing the `organization_agent_registry` tier now receive a buyer admin registry view instead of a single enrollment flow. The checkout success page shows an 'Open Organization Registry' button when `registry_id` and `access_token` are present in the URL. Organization registry buyers can enroll up to 10 governed agent passports from the admin view at `/registry/admin`.

See `docs/organization-registry-buyer-admin.md` for full details.
