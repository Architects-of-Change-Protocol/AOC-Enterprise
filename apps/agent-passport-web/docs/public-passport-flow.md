# Soberanía Agent Passport — Public Passport Flow

## Overview

`apps/agent-passport-web` is a Next.js 14 (App Router) web application that exposes the
Soberanía Agent Passport Core (`packages/agent-governance`) as a demoable, product-ready MVP.

---

## Routes

| Route | Purpose |
|---|---|
| `/agent-passport` | Product landing page — hero, explanations, CTAs |
| `/enroll-agent` | Enrollment form — creates and issues an agent passport |
| `/passport/[passportId]` | Public passport page — all passport fields, hashes, badge, runtime guard demo |
| `/verify/[passportId]` | Public verification page — runs `verifyAgentPassport` + `verifyAgentRuntimeSeal` |
| `/sample-passport` | Pre-generated SalesBot CR demo passport |
| `/api/agent-passports` | POST enroll, GET list |
| `/api/agent-passports/[passportId]` | GET public passport payload |
| `/api/agent-passports/[passportId]/verify` | GET verification result |

---

## MVP Storage Limitation

**WARNING: All passport data is held in a module-level in-memory Map.**

- Data is lost on server restart.
- Not suitable for production.
- No external database, no file persistence.
- Replace with a persistent store (Postgres, KV, etc.) before any production use.

The store is located at `src/lib/store.ts`.

---

## Enrollment Flow

1. User fills in the enrollment form at `/enroll-agent`.
2. On submit, `enrollAgentAction` (a Next.js Server Action) calls `enrollAgent()` in the adapter.
3. The adapter builds an `AgentEnrollmentInput` and calls `issueAgentPassport()` from `@aoc-enterprise/agent-governance`.
4. The issued bundle (passport, constitution, policy manifest, runtime seal, events) is stored in the in-memory store.
5. The user is redirected to `/passport/[passportId]`.

**Human approval mapping:**
- If any human approval required actions are listed in the form, `humanOversight.requirement` is set to `'required'`.
- The current `createAgentPolicyManifest` implementation sets `humanApprovalRequiredFor` to all tools when oversight is `required`. Finer-grained per-action control requires a future API extension.

---

## Dev Signer

The app uses `createTestSigner()` from `@aoc-enterprise/agent-governance` via a thin wrapper at `src/lib/dev-signer.ts`.

**This signer is NOT for production.**
In production, replace with a KMS-backed `AgentPassportSignerPort` implementation that holds a real signing key.

The secret can be overridden via `AOC_DEV_SIGNING_SECRET` environment variable (still not for production — just for development team consistency).

---

## Verification

The `/verify/[passportId]` page and `GET /api/agent-passports/[passportId]/verify` endpoint:

1. Load the passport bundle from the in-memory store.
2. Call `verifyAgentPassport(passport, { signer })` — verifies the cryptographic signature and passport state.
3. If a runtime seal exists, call `verifyAgentRuntimeSeal(seal, passport, { signer })`.
4. Return `createAgentPassportPublicVerificationPayload(passport)` — this omits sensitive fields (`signature`, `ownerId`, `metadata`, `qrPayload`).

---

## QR Payload

The QR payload is the verification URL string: `/verify/[passportId]`.

For this MVP:
- The payload is displayed as a string with a copy button.
- A visual placeholder block is shown labeled "QR Payload".
- No QR image is rendered (no QR dependency added).

To add QR rendering: integrate a lightweight library like `qrcode` or `react-qr-code` and render the `passport.qrPayload` string.

---

## Badge Snippet

The badge snippet is plain HTML:

```html
<a href="{verificationUrl}" rel="noopener">Soberanía Governed Agent: {passportId}</a>
```

Shown on the passport page with a copy button. This snippet can be embedded in external sites, documentation, or agent interfaces to link to the public passport.

---

## Runtime Guard Demo

The passport page (`/passport/[passportId]`) includes a live Runtime Guard demo.

Two simulated actions are evaluated:

| Action | Category | Tool | Data | Expected Outcome |
|---|---|---|---|---|
| `create_lead` | `create_record` | `create_lead` | `crm_lead_notes` | Allow or require_human_approval |
| `offer_unapproved_discounts` | `execute_tool` | `offer_unapproved_discounts` | — | Deny |

The demo calls `evaluateAgentRuntimeGuard()` from `@aoc-enterprise/agent-governance` with `allowIssuedPassport: true` (needed since new passports have status `issued`, not `active`).

This proves that the passport is not just a badge — the policy manifest is enforced at runtime.

---

## Production Hardening Checklist

- [ ] Replace in-memory store with persistent database (Postgres + Prisma, or a KV store).
- [ ] Replace `createTestSigner()` with a KMS-backed signer (AWS KMS, GCP KMS, HashiCorp Vault).
- [ ] Add authentication/authorization to the enrollment endpoint.
- [ ] Set `NEXT_PUBLIC_BASE_URL` to the production domain for correct verification URLs.
- [ ] Transition passport status from `issued` → `active` after a governance review step.
- [ ] Add rate limiting to enrollment and verification endpoints.
- [ ] Add QR image rendering.
- [ ] Add audit log persistence (use `bundle.events`).
- [ ] Remove `allowIssuedPassport: true` from the Runtime Guard demo in production.

---

## Suggested Next Sprint

**Option B: Soberanía Agent Passport Marketing Landing + Stripe Checkout**

The demo is now stable. The next step is to start selling the product:
- A public marketing landing page at `aocprotocol.org` or similar.
- Stripe Checkout for paid plan enrollment.
- Email confirmation with passport ID on enrollment.
- Persistent storage so passports survive server restarts.
