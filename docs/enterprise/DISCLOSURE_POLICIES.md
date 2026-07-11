# Disclosure Policies

The Disclosure Policy is the actual innovation of the Evidence Bundle
(PR-005): a typed, versioned, exhaustively-validated classification of
every field an Evidence Bundle could possibly carry. Defined in
`src/enterprise/evidence/disclosure-policies.ts`.

```ts
interface DisclosurePolicy {
  policyId: string;
  level: DisclosureLevel;      // 'FULL' | 'AUDITOR' | 'PARTNER' | 'CUSTOMER' | 'PUBLIC'
  version: string;
  visibleFields: readonly EvidenceFieldKey[];
  hiddenFields: readonly EvidenceFieldKey[];
  redactedFields: readonly EvidenceFieldKey[];
  requiredFields: readonly EvidenceFieldKey[];
  optionalFields: readonly EvidenceFieldKey[];
}
```

## Invariants (enforced at module load)

- `visibleFields` and `hiddenFields` **exactly partition**
  `EVIDENCE_FIELD_KEYS` -- every field is classified, none is left
  ambiguous, none is double-classified.
- `redactedFields` is a **subset** of `visibleFields` -- a redacted field's
  *name* is disclosed (the consumer knows the field exists), its *value* is
  not.
- `requiredFields` and `optionalFields` exactly partition `visibleFields` --
  every visible field is either mandatory-if-derivable or genuinely
  optional; `verifyEvidenceBundle` checks `requiredFields` for
  completeness.

A malformed policy (mis-partitioned, a redacted field that isn't visible,
etc.) throws at module load, in `validateDisclosurePolicy` -- there is no
way to register a policy whose classification doesn't add up.

## The five levels

| Level | Policy id | Discloses | Hides | Redacts |
|---|---|---|---|---|
| **FULL** | `evidence.disclosure.full.v1` | Everything -- organization id, action taxonomy, description, status, summary, reason codes, trace, events, derived metadata. | Nothing. | Nothing. |
| **AUDITOR** | `evidence.disclosure.auditor.v1` | Everything an external auditor needs to reconstruct and trust the decision: organization id, action taxonomy, status, summary, reason codes, full trace, events. | Internal runtime metadata (`evidence.metadata`). | Nothing. |
| **PARTNER** | `evidence.disclosure.partner.v1` | The decision and its outcome: action taxonomy, description, status, summary, reason codes, events. | Organization id, the internal execution trace, runtime metadata. | Nothing. |
| **CUSTOMER** | `evidence.disclosure.customer.v1` | Only the outcome and why: description, status, summary, reason codes. | Organization id, action taxonomy/resource scope, trace, events, metadata. | Nothing. |
| **PUBLIC** | `evidence.disclosure.public.v1` | The minimal fact that a decision was made, and its outcome: status. | Everything else. | `subject.description` -- the field is present, its content is generic. |

Even FULL is a *projection*, not a copy: the field vocabulary itself
(`EVIDENCE_FIELD_KEYS`) never includes raw request/result payloads, record
ids, digests, or unbounded runtime snapshots -- see
`docs/enterprise/EVIDENCE_PROJECTION_MODEL.md`, "Stage 1."

## Field vocabulary

```
source.organizationId
subject.actionType
subject.resourceScope
subject.description
evidence.status
evidence.summary
evidence.reasonCodes
evidence.trace
evidence.events
evidence.metadata
```

This is the complete, fixed list (`EVIDENCE_FIELD_KEYS`). A `DisclosurePolicy`
can only classify fields from this list -- there is no way for a Bundle to
carry a field nobody classified.

## Choosing/looking up a policy

```ts
import { getDisclosurePolicy } from '../evidence/disclosure-policies.js';

const policy = getDisclosurePolicy('AUDITOR'); // throws EvidenceError('EVIDENCE_DISCLOSURE_POLICY_UNKNOWN') for anything else
```

`getDisclosurePolicy` never defaults an unrecognized level to a more
permissive one -- an unknown level is a hard error, not a fallback to FULL.

## Extending

A sixth level (e.g. `REGULATOR`) is added by defining and validating a new
`DisclosurePolicy` in `disclosure-policies.ts` and registering it in
`DISCLOSURE_POLICIES`; nothing else in the Projector, Verifier, Bundle
Store, or HTTP layer needs to change -- they are all written against
`DisclosurePolicy`, never against a hardcoded level list.
