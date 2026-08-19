# Billing Portal & Subscription Lifecycle

## Overview

This document covers how the Soberanía Agent Passport web app handles Stripe subscriptions, billing status, and the Customer Portal for organization registries.

---

## Architecture

### Billing Status Flow

Stripe subscription events arrive via webhook and are mapped to an internal `RegistryBillingStatus`:

| Stripe Status         | Internal Billing Status |
|-----------------------|------------------------|
| `active`              | `active`               |
| `trialing`            | `trialing`             |
| `past_due`            | `past_due`             |
| `unpaid`              | `suspended`            |
| `canceled`            | `canceled`             |
| `incomplete`          | `pending`              |
| `incomplete_expired`  | `suspended`            |
| `paused`              | `suspended`            |

The billing status maps to an `RegistryOperationalState` for enforcement:

| Billing Status       | Operational State |
|----------------------|-------------------|
| `active`, `trialing` | `operational`     |
| `past_due`           | `warning`         |
| `pending`, `unknown` | `restricted`      |
| `suspended`          | `suspended`       |
| `canceled`           | `suspended`       |

### Grace Period

When a subscription becomes `past_due`, a 7-day grace period is applied. During grace, enrollment and export generation remain available. On recovery to `active` or `trialing`, the grace period is cleared.

---

## Database Schema

### New columns on `organization_registries`

| Column | Type | Description |
|---|---|---|
| `billing_status` | TEXT | Internal billing status |
| `billing_status_updated_at` | TEXT | When billing status last changed |
| `subscription_status` | TEXT | Raw Stripe subscription status |
| `subscription_current_period_start` | TEXT | ISO timestamp |
| `subscription_current_period_end` | TEXT | ISO timestamp |
| `subscription_cancel_at_period_end` | INTEGER | Boolean flag |
| `subscription_canceled_at` | TEXT | ISO timestamp |
| `subscription_trial_end` | TEXT | ISO timestamp |
| `billing_grace_period_ends_at` | TEXT | ISO timestamp |
| `billing_last_event_id` | TEXT | Last processed Stripe event ID |

### New columns on `buyer_accounts`

| Column | Type | Description |
|---|---|---|
| `stripe_customer_id` | TEXT | Linked Stripe customer |
| `billing_email` | TEXT | Billing contact email |

### New tables

- **`registry_billing_events`** — Immutable audit log of billing lifecycle events. One row per Stripe event, keyed by `event_id` (UNIQUE) for idempotency.
- **`billing_portal_sessions`** — Short-lived Customer Portal sessions (for audit trail).

---

## Webhook Handling

The Stripe webhook route (`POST /api/stripe/webhook`) handles:

| Event | Action |
|---|---|
| `checkout.session.completed` (org tier) | Links Stripe customer + subscription to registry; links buyer account to Stripe customer; initializes billing profile |
| `customer.subscription.created` | Updates billing status and period info |
| `customer.subscription.updated` | Updates billing status, period info, and cancel flags |
| `customer.subscription.deleted` | Sets billing status to `canceled` |
| `invoice.payment_failed` | Sets billing status to `past_due`; sets grace period if not already set |
| `invoice.payment_succeeded` | Recovers billing status to `active`/`trialing`; clears grace period |

All events are recorded in `registry_billing_events` with idempotency — duplicate Stripe event IDs are silently ignored.

---

## API Endpoints

### `GET /api/organization-registry/[registryId]/billing`

Returns the billing profile for a registry. Requires `registry:view_billing` permission.

**Response:**
```json
{
  "ok": true,
  "data": {
    "registryId": "reg_...",
    "billingStatus": "active",
    "operationalState": "operational",
    "subscriptionStatus": "active",
    "subscriptionCurrentPeriodEnd": "2025-08-01T00:00:00Z",
    "gracePeriodEndsAt": null,
    "cancelAtPeriodEnd": false,
    "permissions": {
      "canManageBilling": true
    }
  }
}
```

### `POST /api/organization-registry/[registryId]/billing/portal`

Creates a Stripe Customer Portal session. Requires `registry:manage_billing` permission (owner or admin).

**Request:** `{}` (empty body, uses existing registry billing profile)

**Response:**
```json
{
  "ok": true,
  "data": {
    "url": "https://billing.stripe.com/session/..."
  }
}
```

**Errors:**
- `403 BILLING_PORTAL_ACCESS_DENIED` — insufficient permissions
- `503 BILLING_PORTAL_NOT_CONFIGURED` — `STRIPE_SECRET_KEY` not set or Stripe not configured
- `422 BILLING_PORTAL_NO_CUSTOMER` — registry has no linked Stripe customer yet

### `GET /api/account/billing`

Returns billing summaries for all registries the authenticated buyer account is a member of. Requires an active buyer account session.

**Response:**
```json
{
  "ok": true,
  "data": {
    "registries": [
      {
        "registryId": "reg_...",
        "organizationName": "Acme Corp",
        "role": "owner",
        "billingStatus": "active",
        "operationalState": "operational",
        "subscriptionCurrentPeriodEnd": "2025-08-01T00:00:00Z",
        "gracePeriodEndsAt": null,
        "canManageBilling": true
      }
    ]
  }
}
```

---

## Role Permissions

Two new permissions have been added to the existing `RegistryPermission` union:

| Permission | owner | admin | member | viewer | auditor |
|---|---|---|---|---|---|
| `registry:view_billing` | ✓ | ✓ | — | — | — |
| `registry:manage_billing` | ✓ | ✓ | — | — | — |

---

## Entitlement Enforcement

Registry actions are gated on billing state via `registry-billing-enforcement.ts`:

| Action | Allowed states |
|---|---|
| `view_registry` | Always |
| `manage_billing` | Always |
| `download_export` | Always (public access preserved even when suspended) |
| `enroll_agent`, `issue_passport`, `generate_export` | `active`, `trialing`, or `past_due` within grace period |
| `manage_team`, `update_profile` | `active`, `trialing`, `past_due` |

When blocked, the API returns `403` with code `REGISTRY_BILLING_SUSPENDED`.

---

## Export Metadata

Governance exports now include billing context (where available):

- **`registry_governance_json`** — `registry.billingStatus`, `registry.operationalState`
- **`registry_evidence_bundle_json`** — `registry.billingStatus`, `registry.operationalState`, `registry.subscriptionCurrentPeriodEnd`
- **`registry_governance_report_markdown`** — "Billing & Operational State" section

Stripe customer IDs, subscription IDs, and payment method details are **never** included in exports.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes (production) | Stripe secret key — never expose to client |
| `STRIPE_WEBHOOK_SECRET` | Yes (production) | Webhook signing secret from Stripe Dashboard |
| `STRIPE_BILLING_PORTAL_RETURN_URL` | For portal feature | URL to redirect to after Customer Portal |

Configure the Customer Portal appearance and allowed actions at: https://dashboard.stripe.com/test/settings/billing/portal

---

## Security Notes

- Stripe secret keys are never exposed to the browser or included in API responses.
- Webhook payloads are verified via `stripe.webhooks.constructEvent()` before processing.
- Raw Stripe event payloads are not stored. Only safe summaries are recorded in `registry_billing_events`.
- Billing status is always derived from Stripe — never from buyer-supplied input.
- Public passport and verification pages remain accessible regardless of billing state.
- The `registry:manage_billing` permission is required to create Customer Portal sessions — viewer, member, and auditor roles cannot access billing management.
