# Agent Passport issuer key management

AOC Agent Passport now has an issuer key registry and server-side signer boundary for issuer metadata and production-hardening.

## Concepts

- **Issuer ID** identifies the passport issuing authority.
- **Key ID** identifies the issuer key used for a passport signature.
- **Active keys** may be used for new issuance.
- **Retired keys** remain available for historical verification context.
- **Revoked keys** remain visible for history but should not be used for new issuance.

The `issuer_keys` table stores public issuer key metadata and lifecycle state. It does not store production private keys.

## Environment variables

Production signer configuration is supplied server-side through environment variables:

```text
AOC_ISSUER_ID
AOC_ISSUER_KEY_ID
AOC_ISSUER_PRIVATE_KEY_PEM
AOC_ISSUER_PUBLIC_KEY_PEM
AOC_ALLOW_DEV_SIGNER
```

If `NODE_ENV=production`, the app fails safely unless all production signer variables are configured. In non-production, the dev signer fallback may be used. `AOC_ALLOW_DEV_SIGNER=true` explicitly allows that fallback outside production.

## Private key handling

Private key material is read only by the server-side signer factory. It is not persisted in the issuer key registry and is not included in public verification payloads.

The current core signer abstraction remains compatible with the existing development HMAC signer. The new boundary is intentionally ready for a future KMS/HSM-backed implementation, but external KMS/HSM integration is not implemented in this sprint.

## Rotation limitations

When a configured issuer/key pair is first seen, it is registered as active. Existing keys are not automatically deleted. Explicit repository operations can retire or revoke keys. Automated rotation workflows and managed external key vault integration remain future work.
