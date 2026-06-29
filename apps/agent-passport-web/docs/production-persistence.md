# Agent Passport production persistence

AOC Agent Passport now persists issued passport bundles and related governance records in SQLite as a production-hardening step beyond the earlier in-memory MVP store.

## What is persisted

- Complete issued passport bundles for recovery after process restart.
- Denormalized passport fields for listing and administration workflows.
- Passport status and revocation state.
- Passport lifecycle/status events.
- Passport verification events.
- Runtime Guard MVP audit events emitted through the persistent event sink.
- Issuer public key metadata through the issuer key registry.

## Database location

Set `AOC_AGENT_PASSPORT_DB_PATH` to choose the SQLite file path. The local default is:

```text
.data/agent-passport.sqlite
```

The application creates the parent directory if it is missing. `.data/` is ignored by git and SQLite files should not be committed.

The legacy `AGENT_PASSPORT_DB_PATH` is still accepted as a fallback for existing local setups, but new deployments should use `AOC_AGENT_PASSPORT_DB_PATH`.

## What survives restart

Issued passport bundles, revocation/status updates, issuer key metadata, verification events, and persistent Runtime Guard event-sink records survive app or repository recreation when the same SQLite file is reused.

## MVP limitations

SQLite filesystem persistence is suitable for local development, demos, and single-node MVP deployments. Serverless, multi-node, or horizontally scaled production deployments should replace it with managed persistent storage and a migration process.

Runtime Guard audit events are persistent MVP records. They are not append-only/WORM audit infrastructure, do not provide tamper-proof guarantees, and are not a substitute for enterprise compliance logging.

Runtime Guard controls governed execution decisions at integration points. It does not control internal model reasoning. Hard enforcement still requires runtime/tool gateway integration.
