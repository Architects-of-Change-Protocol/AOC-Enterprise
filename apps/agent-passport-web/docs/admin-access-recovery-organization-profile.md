# Admin Access Recovery + Organization Profile Capture

## Purpose

This sprint makes the Organization Agent Registry safer and more usable for real buyers by addressing two operational gaps:

1. If a buyer loses their admin access token, they now have a recovery mechanism.
2. Organization profile data is now captured intentionally before checkout and persisted with the registry.

This is not a general authentication system. It is a pragmatic MVP recovery layer tied to verified paid purchases.

---

## Scope

- Organization profile capture before Stripe checkout
- Organization profile persistence in the registry
- Buyer contact metadata
- Recovery code generation (hashed, single-use)
- Admin access token rotation
- Admin access recovery page and API
- DB-backed admin sessions (httpOnly cookie)
- Buyer Admin profile and recovery UI sections
- Reduced token exposure via session cookies

## Non-Goals

- Full auth/accounts
- Password login
- Multi-user roles
- Magic email login
- Email delivery
- Customer portal
- Full RBAC

---

## Organization Profile Capture Flow

Buyers purchasing the Organization Agent Registry tier are now directed to `/organization-registry/start` before checkout.

**Required fields:**
- Organization Name
- Buyer Contact Email

**Optional fields:**
- Buyer Contact Name / Role
- Organization Website / Country / Industry / Size
- Primary AI Agent Use Case

**CTA:** "Continue to Checkout" → POSTs to `/api/checkout/session` with `organization_profile`.

The profile is validated server-side, stored in purchase metadata, and passed to Stripe session metadata (safe fields only).

---

## Checkout Integration

`POST /api/checkout/session` for `organization_agent_registry` tier:

- Requires `organization_profile` object in request body
- Validates organization name (required, max 120 chars) and buyer contact email (required, valid format)
- Returns `ORGANIZATION_PROFILE_REQUIRED` if missing for org tier
- Stores sanitized profile in purchase metadata (JSON in `purchases.metadata`)
- Sends safe fields to Stripe session metadata:
  - organization_name, buyer_contact_email, buyer_contact_name, buyer_contact_role
  - organization_country, organization_industry, organization_size, organization_use_case
- Does not include: admin token, recovery code, signing secrets, Stripe secrets

Individual tiers ($99/$299) are not affected and do not require profile capture.

---

## Registry Creation / Profile Persistence

When a paid org registry checkout completes (via webhook or session GET):

1. Reads `organization_profile` from purchase metadata
2. Uses `organizationName` from profile (not "My Organization" default)
3. Persists all profile fields to `organization_registries`
4. Sets `profile_completed_at` if name + email present
5. Generates admin access token (stored as SHA-256 hash)
6. Generates recovery code (stored as SHA-256 hash)
7. Returns plain-text token and recovery code **once only** on first creation

Older purchases without profile: `organizationName` defaults to "My Organization", `profile_completed_at` is null, Buyer Admin shows "Profile incomplete" warning.

---

## Admin Access Token Model

- Generated: `randomBytes(32).toString('hex')`
- Stored: SHA-256 hash only — raw token never persisted
- Verified: constant-time compare via `timingSafeEqual`
- Exposed: once at registry creation and once after rotation
- Rotation: via current token or recovery code

---

## Recovery Code Model

Format: `AOC-RECOVERY-XXXX-XXXX-XXXX-XXXX` (8 crypto-random bytes, hex, uppercase)

- Stored: SHA-256 hash only — raw code never persisted
- Single-use: `recovery_code_used_at` is set after use
- After use: a new recovery code is generated and stored
- Old recovery code becomes invalid after rotation

---

## Token Rotation Behavior

`POST /api/organization-registry/[registryId]/admin-access/rotate`

Accepts:
```json
{ "access_token": "...", "reason": "buyer_requested_rotation" }
```
or:
```json
{ "recovery_code": "AOC-RECOVERY-...", "buyer_contact_email": "...", "reason": "..." }
```

On success:
- New admin access token generated
- New recovery code generated  
- Old token hash replaced
- Old recovery code marked used + new hash stored
- All admin sessions for the registry revoked
- Returns `newAccessToken`, `newRecoveryCode`, `adminUrl`, `rotatedAt`

The old token stops working immediately after rotation.

---

## Recovery API

`POST /api/organization-registry/recover`

**Mode: recovery_code**
```json
{
  "mode": "recovery_code",
  "registry_id": "registry_...",
  "buyer_contact_email": "buyer@example.com",
  "recovery_code": "AOC-RECOVERY-..."
}
```
Verifies registry, email match, recovery code → rotates access.

**Mode: checkout_session** (requires Stripe)
```json
{
  "mode": "checkout_session",
  "session_id": "cs_...",
  "buyer_contact_email": "buyer@example.com"
}
```
Verifies paid org registry session, email match → rotates access.

Response includes `newAccessToken` and `newRecoveryCode` — shown once only.

If buyer has lost both admin link and recovery code: no automated recovery. Show "Contact Soberanía support."

---

## Admin Session Behavior

`POST /api/organization-registry/[registryId]/admin-session`

- Accepts: valid `access_token` in request body
- Creates: opaque 30-day session (stored as SHA-256 hash in `registry_admin_sessions`)
- Sets: `aoc_registry_admin_session` httpOnly cookie (SameSite=Lax, Secure in production)
- Sessions are revoked when admin access token is rotated

`DELETE /api/organization-registry/[registryId]/admin-session`
- Revokes all sessions for registry
- Clears cookie

Admin API routes (exports, profile) accept either:
- `access_token` query param / request body
- `aoc_registry_admin_session` cookie

---

## Buyer Admin UI Changes

`/registry/admin` now includes:

**Organization Profile section:**
- Shows all profile fields (name, website, country, industry, size, contact info, use case)
- Warns "Profile incomplete" if `profile_completed_at` is null
- Shows profile completion and update timestamps

**Admin Access & Recovery section:**
- Shows token status, recovery code status
- Shows rotation timestamp, recovery code timestamps
- "Rotate Admin Access Token" button (calls rotate API with current token)
- "Recover Lost Access" link to `/registry/recover`
- Shows new admin URL and recovery code in confirmation after rotation

`/registry/recover` page:
- Mode 1: Registry ID + buyer contact email + recovery code
- Mode 2: Stripe checkout session ID + buyer contact email
- Shows new admin URL and recovery code after successful recovery

---

## Security Notes

- Admin access tokens are never stored raw
- Recovery codes are never stored raw
- Token and recovery code hashes are never exposed in API responses
- Admin session tokens are never stored raw (only hash)
- Recovery codes are single-use
- Old sessions are revoked on token rotation
- Buyer email is required for recovery-code mode (email mismatch rejected)
- Registry ID alone is not sufficient for any privileged operation
- Export artifacts never include token/recovery/session data
- Public passport and verification pages are unaffected

---

## Current MVP Limitations

- Recovery page does not send email — buyer must know their recovery code or session ID
- If buyer has lost both admin link and recovery code, manual support is required
- Organization profile cannot be updated via UI (only via PATCH profile API)
- Admin session cookie reduces but does not eliminate token exposure (first load still uses URL token)
- No rate limiting on recovery endpoint
- No audit log export
- Admin session expiry is 30 days (fixed, not configurable)

---

## Local Testing Guide

```bash
cd apps/agent-passport-web
npm test          # 165/165 tests
npm run typecheck # clean

# Start dev server
npm run dev

# Test org profile capture
curl -X POST http://localhost:3000/api/checkout/session \
  -H 'Content-Type: application/json' \
  -d '{"tier":"organization_agent_registry"}' 
# → 400 ORGANIZATION_PROFILE_REQUIRED

curl -X POST http://localhost:3000/api/checkout/session \
  -H 'Content-Type: application/json' \
  -d '{"tier":"organization_agent_registry","organization_profile":{"organizationName":"Test Org","buyerContactEmail":"a@b.com"}}'
# → Stripe redirect URL (if STRIPE_SECRET_KEY set)
```

---

## Deployment Checklist

- [ ] Set `AGENT_PASSPORT_DB_PATH` to a persistent volume path
- [ ] Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Stripe price env vars
- [ ] Set `NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL` to your production domain
- [ ] Set `AOC_ISSUER_PRIVATE_KEY_BASE64` and related issuer vars
- [ ] Existing DBs will auto-migrate (ensureColumn adds new columns safely)
- [ ] No new required secrets for DB-backed sessions (optional: AOC_REGISTRY_ADMIN_SESSION_SECRET)

---

## Suggested Next Sprint

**Buyer Account Foundation + Team Access**

Once organization profiles and recovery flows exist, replace token-based registry access with real buyer accounts:
- Buyer account model with registry ownership
- Team member invitations
- Role model (owner / admin / viewer)
- Login / auth integration
- Safer export download sessions
- Registry-level permission checks
