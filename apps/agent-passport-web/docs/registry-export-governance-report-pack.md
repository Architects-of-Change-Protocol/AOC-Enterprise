# Registry Export + Governance Report Pack

## Purpose

The Registry Export + Governance Report Pack gives Organization Agent Registry buyers exportable governance evidence for their registered AI agents. Buyers can download machine-readable data, spreadsheet inventories, evidence bundles, and buyer-ready governance reports directly from the buyer admin view.

## Scope

- Registry inventory CSV export
- Governance JSON export
- Evidence bundle JSON export
- Governance report markdown export
- Governance report HTML export
- Export artifact persistence
- Export history in buyer admin view
- API routes for generating, listing, and downloading exports
- Access control using registry admin access token

## Non-Goals

- PDF export
- Email delivery
- Scheduled or recurring exports
- External storage (S3, etc.)
- SOC 2 / compliance certification
- Multi-org super admin
- Full auth or user accounts

## Relationship to Organization Agent Registry

The export pack is a buyer-facing layer on top of the Organization Agent Registry tier. Buyers who have purchased the `organization_agent_registry` tier receive a governed registry with an admin access token. That same token gates all export endpoints.

---

## Export Types

```ts
type RegistryExportType =
  | "registry_inventory_csv"
  | "registry_governance_json"
  | "registry_evidence_bundle_json"
  | "registry_governance_report_markdown"
  | "registry_governance_report_html";
```

### 1. Registry Inventory CSV

**Content-Type:** `text/csv`  
**Filename:** `aoc-agent-registry-inventory-{registryId}-{YYYYMMDD}.csv`

Spreadsheet-friendly inventory of all registered agent passports.

Columns:
- Registry ID
- Organization Name
- Agent Name
- Agent Owner
- Passport ID
- Passport Status
- Governance Status
- Runtime Guard Ready
- Issued At
- Public Passport URL
- Public Verification URL

Safe: no admin token, no signing secret.

### 2. Registry Governance JSON

**Content-Type:** `application/json`  
**Filename:** `aoc-agent-registry-governance-{registryId}-{YYYYMMDD}.json`

Machine-readable governance summary including registry summary, governance standing, passport details, and public verification links.

Registry standing values: `good_standing`, `attention_required`, `capacity_exhausted`, `inactive`.

Safe: no admin token, no signing secret, no Stripe secret.

### 3. Registry Evidence Bundle JSON

**Content-Type:** `application/json`  
**Filename:** `aoc-agent-registry-evidence-bundle-{registryId}-{YYYYMMDD}.json`

Richer evidence package including issuer public metadata, entitlement details, runtime guard readiness breakdown, governance status breakdown, and verification link map.

Safe: only public issuer metadata included, no signing secret.

### 4. Registry Governance Report Markdown

**Content-Type:** `text/markdown`  
**Filename:** `aoc-agent-registry-governance-report-{registryId}-{YYYYMMDD}.md`

Buyer-ready report with sections:
- Registry Summary
- Capacity Summary
- Agent Passport Inventory
- Governance Standing
- Runtime Guard Readiness
- Public Verification Coverage
- Leadership Attention
- Evidence Links
- Current MVP Limitations
- Recommended Next Actions
- Report Metadata

Deterministic: no invented narrative, no AI-generated claims, source data only.

### 5. Registry Governance Report HTML

**Content-Type:** `text/html`  
**Filename:** `aoc-agent-registry-governance-report-{registryId}-{YYYYMMDD}.html`

Browser-friendly version of the markdown report. No external scripts or CDN dependencies.

---

## Export Artifact Persistence Model

Artifacts are stored in the `registry_export_artifacts` table:

```sql
create table if not exists registry_export_artifacts (
  id text primary key,
  export_id text not null unique,
  registry_id text not null,
  export_type text not null,
  format text not null,
  filename text not null,
  content_type text not null,
  content_text text not null,
  checksum_sha256 text not null,
  generated_by text not null,
  generated_at text not null,
  created_at text not null
);
```

Content is stored as text (CSV string, JSON string, markdown string, HTML string). Binary artifacts are not stored in this version.

Checksum: SHA-256 of `content_text`, stored in `checksum_sha256`.

---

## API Routes

### POST `/api/organization-registry/[registryId]/exports`

Generate a new export artifact.

**Request body:**
```json
{
  "access_token": "...",
  "export_type": "registry_inventory_csv"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "exportId": "...",
    "exportType": "...",
    "filename": "...",
    "contentType": "...",
    "checksumSha256": "...",
    "generatedAt": "...",
    "downloadUrl": "/api/organization-registry/{registryId}/exports/{exportId}?access_token=..."
  }
}
```

Error codes: `REGISTRY_EXPORT_ACCESS_DENIED`, `REGISTRY_EXPORT_INVALID_TYPE`, `REGISTRY_EXPORT_GENERATION_FAILED`, `REGISTRY_NOT_FOUND`.

### GET `/api/organization-registry/[registryId]/exports`

List export history. Returns metadata only (no `content_text`).

**Query params:** `access_token`, `limit` (default 50, max 100)

### GET `/api/organization-registry/[registryId]/exports/[exportId]`

Download a specific export artifact.

**Query params:** `access_token`

**Response headers:**
- `Content-Type`
- `Content-Disposition: attachment; filename="..."`
- `X-AOC-Export-Id`
- `X-AOC-Checksum-SHA256`

---

## Buyer Admin UI

The buyer admin view (`/registry/admin`) includes a **Governance Exports** section with:

- 4 export action cards (CSV, Governance JSON, Evidence Bundle, Governance Report)
- Export history table (export type, filename, generated at, truncated checksum, download link)
- Empty state: "No registry exports have been generated yet."

Export action cards use `<a href>` links pointing to the generate endpoint. The admin page is a server component that pre-loads the export history on render.

---

## Access Control Model

Every export endpoint requires a valid registry admin access token. Access is validated via `verifyRegistryAccess` before any export is generated, listed, or downloaded.

- Token is hashed with SHA-256 and stored in `organization_registries.admin_access_token_hash`.
- Constant-time comparison prevents timing attacks.
- Token is never stored in export content.
- Download URL includes the access token as a query param (same security boundary as the rest of the admin flow).

---

## Public Link Generation

Public passport and verification URLs are built using `NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL`.

Fallback:
- Development: `http://localhost:3000`
- Production: empty string (relative URLs)

---

## Checksum Behavior

Every artifact stores a SHA-256 checksum of `content_text` in `checksum_sha256`. The download response echoes this in `X-AOC-Checksum-SHA256`. Buyers can verify artifact integrity by computing `sha256sum` on the downloaded file and comparing to the checksum.

---

## Security Notes

- Admin access token never appears in export content.
- Token hash never appears in export content.
- Signing secret never included.
- Stripe secrets never included.
- Stripe webhook secret never included.
- Only public issuer metadata is included in evidence bundle.
- Download endpoint verifies token before returning content.
- Export artifact must belong to the requested registry (cross-registry access blocked).
- CSV values are properly escaped (commas, quotes, newlines).
- JSON exports do not include functions or raw errors.
- Reports do not claim legal compliance or certification.

---

## Current MVP Limitations

- Admin access token cannot be regenerated if lost.
- Organization name defaults to "My Organization" if not collected during checkout.
- Runtime Guard readiness is self-reported at enrollment time.
- No automated recurring report generation.
- No email delivery of exports.
- No S3 or external storage.
- No PDF export.
- Download URL includes access token as query param (no short-lived token yet).

---

## Local Testing Guide

```bash
cd apps/agent-passport-web

# Install dependencies (from workspace root)
cd ../../ && npm install && cd apps/agent-passport-web

# Run tests
npx tsc -p tsconfig.test.json && node --test 'dist-test/__tests__/**/*.test.js'

# Run dev server
npm run dev

# Generate an export (with a real registry_id and access_token from checkout)
curl -X POST http://localhost:3000/api/organization-registry/{registryId}/exports \
  -H 'Content-Type: application/json' \
  -d '{"access_token":"...","export_type":"registry_inventory_csv"}'

# List exports
curl "http://localhost:3000/api/organization-registry/{registryId}/exports?access_token=..."

# Download export
curl "http://localhost:3000/api/organization-registry/{registryId}/exports/{exportId}?access_token=..." -O
```

---

## Deployment Notes

Set `NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL` to the production base URL so public links in exports are correct.

Example: `NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL=https://yourapp.example.com`

---

## Suggested Next Sprint

**Admin Access Recovery + Organization Profile Capture**

Once buyers can export governance evidence, the next operational weakness is that the admin access token cannot be regenerated if lost, and the organization name defaults to "My Organization" when not collected during checkout. The next sprint should add organization profile capture, admin access recovery, and safer buyer contact handling without building full auth yet.
