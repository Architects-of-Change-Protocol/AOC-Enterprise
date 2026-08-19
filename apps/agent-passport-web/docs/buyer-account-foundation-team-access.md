# Buyer Account Foundation + Team Access

## Purpose

Move Soberanía Agent Passport from token-based registry administration toward account-based buyer access.

This sprint adds named buyer accounts, account sessions, registry ownership claiming, team membership model, role-based access, and team invitations. Legacy token and session access is preserved as fallback throughout.

---

## Scope

This sprint adds:

- Buyer account model (email, password, display name)
- Account session model (DB-backed opaque sessions, 30-day expiry)
- Registry membership model (roles: owner/admin/member/viewer/auditor)
- Role-based permission policy
- Team invitation model (token hash stored, raw token shown once)
- Registry claiming flow (via legacy admin token)
- Account signup/login/logout flows
- Buyer dashboard (/account/dashboard)
- Team management APIs
- Invitation acceptance flow
- Account-aware registry access helper
- Legacy token/session fallback preserved
- Team Access section in Buyer Admin View

---

## Non-Goals

- Enterprise SSO, OAuth, social login
- Email delivery (invitations shared via URL only)
- Password reset
- Customer/billing portal
- Stripe subscription management
- Audit logs
- MFA, SCIM, device management
- Multi-org super admin

---

## Account Model

Table: `buyer_accounts`

Fields: `id`, `account_id`, `email`, `display_name`, `password_hash`, `status`, `created_at`, `updated_at`, `last_login_at`

Statuses: `active`, `disabled`, `deleted`

---

## Session Model

Table: `buyer_account_sessions`

Cookie: `aoc_buyer_account_session` (HttpOnly, SameSite=Lax, Secure in production)

Expiry: 30 days

Token handling: raw random token (32 bytes hex) set in cookie; only SHA-256 hash stored in DB.

---

## Password Hashing Model

Algorithm: Node crypto `scrypt`

Format: `scrypt$N$r$p$salt$hash`

Parameters: N=16384, r=8, p=1, keylen=64

Rules:
- Minimum 10 characters
- Random per-user salt
- Timing-safe compare on verification
- Password never logged or returned to client

---

## Registry Membership Model

Table: `registry_account_memberships`

Roles: `owner`, `admin`, `member`, `viewer`, `auditor`

Statuses: `active`, `pending`, `removed`

Unique constraint: `(registry_id, account_id)`

---

## Role Permission Matrix

| Permission                  | owner | admin | member | viewer | auditor |
|-----------------------------|:-----:|:-----:|:------:|:------:|:-------:|
| registry:view               | ✓     | ✓     | ✓      | ✓      | ✓       |
| registry:update_profile     | ✓     | ✓     |        |        |         |
| registry:manage_team        | ✓     | ✓     |        |        |         |
| registry:invite_team        | ✓     | ✓     |        |        |         |
| registry:enroll_agent       | ✓     | ✓     | ✓      |        |         |
| registry:generate_exports   | ✓     | ✓     | ✓      |        | ✓       |
| registry:download_exports   | ✓     | ✓     | ✓      | ✓      | ✓       |
| registry:rotate_admin_access| ✓     |       |        |        |         |
| registry:recover_access     | ✓     |       |        |        |         |

Only owner can assign owner role or remove the last owner.

---

## Team Invitation Model

Table: `registry_team_invitations`

Statuses: `pending`, `accepted`, `revoked`, `expired`

Expiry: 14 days

Token behavior:
- Raw token returned once in invite URL (`/account/invitations/accept?invitation_id=...&token=...`)
- Only SHA-256 hash stored in DB
- Acceptance requires logged-in account whose email matches `invited_email`

---

## Registry Claim Flow

Page: `/account/claim-registry`

API: `POST /api/account/claim-registry`

Supported methods:
- `registry_id` + `access_token` (legacy admin token)

Behavior:
- Verifies legacy access token
- Creates owner membership for authenticated buyer account
- Idempotent: returns existing membership if account already claimed

---

## Account Dashboard

Page: `/account/dashboard`

Shows:
- Account email, display name, status
- All registries with active membership
- Role and permissions per registry
- Links to Open Registry, Enroll Agent, Exports (by permission)
- Empty state with Claim Registry CTA

---

## Buyer Admin Team Section

Location: `/registry/admin` page, Team Access section

Shows:
- Current access mode (legacy admin token)
- CTA to claim registry with buyer account
- Link to `/account/claim-registry?registry_id=...`
- Team members and invitations visible after claiming

---

## Access Helper Behavior

File: `src/lib/registry-account-access.ts`

Resolution order:
1. Buyer account session cookie → check active registry membership → enforce permission
2. Registry admin session cookie (legacy) → owner-equivalent access
3. Registry access token in query/body (legacy) → owner-equivalent access

Legacy access grants all owner-equivalent permissions during MVP.

Disabled or removed memberships are rejected.

---

## Legacy Token/Session Fallback

Legacy admin token and admin session access remains fully valid. All existing registry APIs continue to work with token-based access. No existing access is broken.

---

## API Routes Added

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/account/signup | Create buyer account + optional registry claim |
| POST | /api/account/login | Sign in, create session |
| POST | /api/account/logout | Revoke session |
| GET | /api/account/me | Get current account |
| GET | /api/account/registries | List registries for account |
| POST | /api/account/claim-registry | Claim registry with legacy token |
| GET | /api/organization-registry/[id]/team | List team members and invitations |
| POST | /api/organization-registry/[id]/team/invitations | Create invitation |
| POST | /api/organization-registry/[id]/team/invitations/[id]/revoke | Revoke invitation |
| POST | /api/organization-registry/[id]/team/members/[id]/role | Update member role |
| DELETE | /api/organization-registry/[id]/team/members/[id] | Remove member |
| POST | /api/team-invitations/accept | Accept invitation |
| GET | /api/team-invitations/[id]?token=... | Preview invitation |

---

## Security Notes

- Passwords are hashed with scrypt before storage
- Password hashes are never returned to clients
- Session tokens are stored only as SHA-256 hashes
- Invitation tokens are stored only as SHA-256 hashes
- Invite URL shows raw token only at creation time
- Invitation acceptance requires matching email
- Non-owner cannot assign owner role
- Last owner cannot be removed
- Admin access tokens never returned in account/team APIs
- Recovery codes never returned in account/team APIs
- Account email alone cannot grant access
- Client-provided roles are never trusted

---

## Current MVP Limitations

- No email delivery (invite links must be shared manually)
- No password reset (requires future email delivery sprint)
- Legacy token access still grants owner-equivalent access
- No full RBAC audit logs
- No team-visible billing status
- No Stripe customer linkage
- Admin page team section is minimal (shows claim CTA, full team table after claiming)

---

## Local Testing Guide

```bash
# Start dev server
cd apps/agent-passport-web
npm run dev

# Create account
curl -X POST http://localhost:3000/api/account/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"strongpassword1","display_name":"Test User"}'

# Sign in
curl -X POST http://localhost:3000/api/account/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"strongpassword1"}'

# Claim registry (replace with real registry_id and access_token)
curl -X POST http://localhost:3000/api/account/claim-registry \
  -H 'Content-Type: application/json' \
  -b 'aoc_buyer_account_session=<token>' \
  -d '{"registry_id":"reg_xxx","access_token":"xxx"}'
```

---

## Deployment Checklist

- [ ] Existing SQLite DB will auto-migrate (new tables created on first start)
- [ ] No new required environment variables
- [ ] Review cookie Secure flag (auto-enabled when NODE_ENV=production)
- [ ] Rotate admin tokens and recovery codes are unaffected
- [ ] All existing API routes unaffected

---

## Suggested Next Sprint

**Billing Portal + Subscription Lifecycle Foundation**

Once buyer accounts exist, link them to Stripe customers and add subscription lifecycle management:
- Stripe customer association to buyer accounts
- Subscription status visibility in Buyer Dashboard
- Customer portal link
- Registry suspension for unpaid/canceled subscriptions
- Billing status section with owner/admin permissions
- Subscription lifecycle webhook handling
