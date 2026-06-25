# Organization Registry + Buyer Admin View

## Purpose

Adds a buyer-manageable, organization-level registry to AOC Agent Passport.
Organizations that purchase the `organization_agent_registry` tier get:

- A persistent registry of their governed AI agents
- An admin view to enroll, inspect, and link passports
- Capacity tracking (up to 10 passports per registry)
- Public verification pages for each issued passport
- Secure, token-based admin access (no username/password required)

## Scope

This sprint builds on the production persistence and issuer key management sprint.
It assumes SQLite is initialized at `AGENT_PASSPORT_DB_PATH` and that existing
purchase, passport, and Stripe webhook flows are working.

## Non-Goals

- Full user accounts or login
- Role-based access control or multi-user org permissions
- Billing portal or refund management
- Email notifications
- Admin superuser console
- Public organization directory
- Subscription lifecycle management
- Registry export (planned for next sprint)

---

## Relationship to Agent Passport Tiers

| Tier | Registry | Capacity | Admin View |
|------|----------|----------|------------|
| `agent_passport_single` | None | 1 passport | None |
| `governed_agent` | None | 1 passport | None |
| `organization_agent_registry` | Yes | Up to 10 passports | `/registry/admin` |

---

## Data Models

### organization_registries

One per paid `organization_agent_registry` purchase.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Internal ID |
| registry_id | TEXT UNIQUE | Public-safe registry identifier |
| purchase_id | TEXT | Linked purchase |
| tier | TEXT | Always `organization_agent_registry` |
| organization_name | TEXT | From enrollment or webhook metadata |
| buyer_email | TEXT | From Stripe session |
| registry_status | TEXT | `active` | `pending` | `suspended` | `canceled` |
| governance_level | TEXT | Always `organization` |
| max_passports | INTEGER | Default: 10 |
| issued_passports | INTEGER | Incremented atomically on issuance |
| remaining_passports | INTEGER | Decremented atomically on issuance |
| admin_access_token_hash | TEXT | SHA-256 of plain token |
| admin_access_token_created_at | TEXT | ISO timestamp of token creation |

### organization_registry_entitlements

One per registry. Tracks passport capacity.

| Column | Type | Notes |
|--------|------|-------|
| entitlement_type | TEXT | Always `agent_passport_capacity` |
| max_quantity | INTEGER | 10 |
| used_quantity | INTEGER | Incremented on issuance |
| remaining_quantity | INTEGER | Decremented on issuance |
| status | TEXT | `active` → `exhausted` when remaining hits 0 |

### organization_registry_passports

Association between a registry and each issued passport.

| Column | Type | Notes |
|--------|------|-------|
| registry_id | TEXT | Links to registry |
| passport_id | TEXT | Links to passport |
| agent_name | TEXT | From enrollment form |
| agent_owner | TEXT | From enrollment form |
| status | TEXT | `active` | `revoked` | `expired` |
| governance_status | TEXT | |
| runtime_guard_ready | INTEGER | 0 or 1 |

---

## Admin Access Token

When a registry is created, a 32-byte cryptographically random access token is generated.

- The **plain token** is returned once at registry creation time only.
- The **SHA-256 hash** is stored in the database.
- The plain token is embedded in the admin URL:

```
/registry/admin?registry_id={registry_id}&access_token={token}
```

- On each admin page load, the token is verified server-side with constant-time comparison.
- The token is **never logged, never exposed in API responses** after creation.
- The token **cannot be recovered** after first creation — if lost, a future sprint can provide token regeneration.

### Token helpers (src/lib/registry-access-token.ts)

- `createRegistryAdminAccessToken()` — generates a new token
- `hashRegistryAdminAccessToken(token)` — returns SHA-256 hex hash
- `verifyRegistryAdminAccessToken(token, hash)` — constant-time comparison

---

## Checkout / Session Integration

### Stripe Webhook (`POST /api/stripe/webhook`)

On `checkout.session.completed` for `organization_agent_registry` tier:

1. Marks purchase completed.
2. Calls `ensureOrganizationRegistry()` — idempotent, safe for retries.
3. Creates registry and entitlement if not already existing.
4. Generates and stores hashed admin access token.

### Session Verification (`GET /api/checkout/session/[sessionId]`)

For org tier purchases, returns:

```json
{
  "ok": true,
  "purchase": { "tier": "organization_agent_registry", ... },
  "canEnroll": false,
  "registry": {
    "registryId": "...",
    "organizationName": "...",
    "registryStatus": "active",
    "maxPassports": 10,
    "issuedPassports": 0,
    "remainingPassports": 10,
    "adminAccessAvailable": false,
    "message": "Registry exists. Use the admin URL from your checkout confirmation."
  }
}
```

---

## Enrollment Modes

### Mode 1: Individual Purchase

URL: `/enroll-agent?session_id={stripe_session_id}`

- Validates paid purchase via `getPurchaseByStripeSessionId`
- Checks `canEnrollWithPurchase` (prevents double-issuance)
- Issues passport linked to purchase
- Marks purchase as `passport_issued`

### Mode 2: Organization Registry

URL: `/enroll-agent?registry_id={registry_id}&access_token={token}`

- Validates registry access token server-side
- Checks registry is `active`
- Checks entitlement has remaining capacity
- Issues passport linked to registry
- Creates `organization_registry_passports` association
- Atomically decrements capacity in both registry and entitlement tables
- Blocks over-issuance at DB transaction level

---

## Registry Passport Issuance Flow

1. Client POSTs to `/api/agent-passports` with `registry_id` + `access_token` + agent data.
2. Server verifies registry access token.
3. Server verifies registry is `active`.
4. Server checks entitlement has `remaining_quantity > 0`.
5. Passport is issued via `enrollAgent`.
6. Passport record is persisted (`purchase_id = null`, `registry_id = {id}`).
7. `addPassportToRegistry` runs in a SQLite transaction:
   - Inserts `organization_registry_passports` row
   - Increments `issued_passports`, decrements `remaining_passports` on registry
   - Increments `used_quantity`, decrements `remaining_quantity` on entitlement
   - If `remaining_quantity` reaches 0, sets entitlement `status = exhausted`
8. If any step fails, passport issuance is rejected.

---

## Capacity Management

- Default max: **10 passports per registry**
- Enforced via SQLite transaction — concurrent issuance cannot over-issue
- Entitlement `status` transitions: `active` → `exhausted` (irreversible in MVP)
- Registry `remaining_passports` mirrors entitlement `remaining_quantity`
- Neither counter can go below 0

---

## Buyer Admin UI (`/registry/admin`)

Query params required: `registry_id` + `access_token`

Sections:
- **Registry Details** — org name, registry ID, status, governance level, buyer email, created at
- **Capacity Cards** — max/issued/remaining passports, active agents, runtime guard ready, entitlement status
- **Governance Summary** — plain-language summary of agent status
- **Passport Inventory** — table of all issued passports with links to `/passport/[id]` and `/verify/[id]`
- **Enroll Another Agent** — CTA button if capacity remains; message if exhausted
- **MVP Note** — explains that full accounts and exports are planned

Access is denied (no redirect loop) if `registry_id` or `access_token` is missing or invalid.

---

## API Routes

### GET /api/organization-registry/[registryId]

Returns registry summary, entitlement, and passport count. Requires `access_token` query param.

### GET /api/organization-registry/[registryId]/passports

Returns all passports linked to the registry. Requires `access_token` query param.

### POST /api/organization-registry/[registryId]/enrollment-access

Verifies capacity and returns an enrollment URL. Does **not** consume capacity.
Requires `access_token` in request body or query param.

---

## Public Verification

`/passport/[passportId]` and `/verify/[passportId]` are unchanged for individual passports.
For registry-issued passports, the passport payload includes the registry context embedded at issuance time.

Admin access tokens are **never** included in public pages or verification payloads.

---

## Security Notes

- Admin access token is stored as SHA-256 hash only.
- Token verification uses constant-time comparison.
- Tier is never trusted from the client — it comes from the verified purchase or is hardcoded for registry issuance.
- Registry creation requires a verified paid purchase of `organization_agent_registry` tier.
- Individual tier purchases never trigger registry creation.
- Capacity decrement is atomic via SQLite transaction.
- Over-issuance is blocked server-side regardless of concurrent requests.
- Buyer email is not exposed on public verification pages.

---

## Current MVP Limitations

- Admin access token cannot be regenerated (if lost, registry is inaccessible until this is added).
- No multi-user or team access — one token per registry.
- No registry export (CSV/JSON) — planned for next sprint.
- No subscription lifecycle management (pause, cancel, upgrade).
- Organization name defaults to "My Organization" if not provided at webhook time.
- Runtime Guard readiness is set to `false` at enrollment — no automated detection yet.

---

## Local Testing Guide

1. Build governance package:
   ```bash
   cd packages/agent-governance && npm run build
   ```

2. Run app tests:
   ```bash
   cd apps/agent-passport-web && npm test
   ```

3. Start dev server:
   ```bash
   cd apps/agent-passport-web && npm run dev
   ```

4. To simulate a registry purchase, use the Stripe test mode checkout with the `organization_agent_registry` price. After the webhook fires, the registry is created and the admin URL is embedded in the session.

5. For testing without Stripe, you can call `ensureOrganizationRegistry` directly in a test script with a fake `purchaseId` and `organizationName`.

6. Use `:memory:` for isolated test DB:
   ```bash
   AGENT_PASSPORT_DB_PATH=:memory: npm test
   ```

---

## Deployment Notes

- No new environment variables required beyond what the persistence sprint added.
- New SQLite tables are created automatically on startup via `CREATE TABLE IF NOT EXISTS`.
- Existing data is not affected — new tables are additive.
- The `passports` table now allows `purchase_id = NULL` for registry passports (schema update is in `db.ts`).

---

## Suggested Next Sprint: Registry Export + Governance Report Pack

Once buyers can manage a registry, the next commercial value is exportable governance evidence:
- CSV inventory export (agent name, passport ID, status, issued at)
- JSON governance export (full passport data per agent)
- Buyer-ready governance report pack for internal audits, procurement, and compliance reviews
- Optional: signed export with AOC issuer metadata for external verification
